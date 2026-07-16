// notify-schedule-updated
//
// schedules 테이블의 기존 행이 UPDATE되면 DB 트리거(patch_schedule_notify_trigger.sql)가
// 이 Edge Function을 호출한다. 트리거는 실제로 의미 있는 필드(title/date/time/tag/notes/
// client_ids/start_date/end_date)가 하나라도 바뀐 UPDATE에 대해서만(WHEN 절) 변경 전(old)/
// 후(new) 값을 body에 함께 담아 보내므로, 이 함수는 schedules 테이블을 다시 조회하지 않고 바로
// body의 old/new를 비교해 무엇이 바뀌었는지 파악한 뒤 "등록자"(profiles.email)와
// "관련 인물"(clients, linked_profile_id 우선 profiles.email 대체)에게 Gmail SMTP로
// "일정 내용이 수정되었습니다" 알림 메일을 보낸다.
//
// notify-project-updated와 완전히 동일한 구조(비교 로직, 메일 인코딩 우회, 수신자 산출 방식)를
// 그대로 따르되 대상 테이블/필드만 schedules에 맞게 바꾼 함수다.
//
// 배포: supabase functions deploy notify-schedule-updated --no-verify-jwt
// (--no-verify-jwt 사용 시 Supabase 표준 JWT 인증이 스킵되므로, 대신 x-webhook-secret 헤더로
//  간단한 공유 시크릿을 검증한다.)
//
// 필요 환경변수 (notify-project-created/updated와 동일한 프로젝트 전역 시크릿을 그대로 공유하므로
// 이미 설정돼 있다면 추가 설정 불필요 — 자세한 배포 절차는 supabase/README_notify_schedule_updated.md 참고):
// - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: Edge Function 배포 시 자동 주입됨
// - GMAIL_USER: 발신용 Gmail 주소
// - GMAIL_APP_PASSWORD: Gmail 앱 비밀번호
// - WEBHOOK_SECRET: DB 트리거가 보내는 x-webhook-secret 헤더와 비교할 공유 시크릿

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const GMAIL_USER = Deno.env.get('GMAIL_USER');
const GMAIL_APP_PASSWORD = Deno.env.get('GMAIL_APP_PASSWORD');
const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET');

// denomailer@1.6.0 제목 인코딩 버그 우회 (notify-project-created/updated와 동일한 함수)
function encodeRfc2047Subject(text: string): string {
  // deno-lint-ignore no-control-regex
  if (!/[^\x00-\x7f]/.test(text)) return text;

  const CHARSET = 'utf-8';
  const PREFIX = `=?${CHARSET}?Q?`;
  const SUFFIX = '?=';
  const MAX_PAYLOAD_LEN = 75 - PREFIX.length - SUFFIX.length;
  const SAFE_CHAR = /^[A-Za-z0-9!*+\-/]$/;
  const encoder = new TextEncoder();

  const charTokens: string[] = [];
  for (const ch of text) {
    if (ch === ' ') {
      charTokens.push('_');
    } else if (SAFE_CHAR.test(ch)) {
      charTokens.push(ch);
    } else {
      let enc = '';
      for (const byte of encoder.encode(ch)) {
        enc += '=' + byte.toString(16).toUpperCase().padStart(2, '0');
      }
      charTokens.push(enc);
    }
  }

  const words: string[] = [];
  let current = '';
  for (const token of charTokens) {
    if (current.length + token.length > MAX_PAYLOAD_LEN) {
      words.push(current);
      current = '';
    }
    current += token;
  }
  if (current) words.push(current);

  return words.map((w) => `${PREFIX}${w}${SUFFIX}`).join('\r\n ');
}

// denomailer 본문 quoted-printable 인코더 버그 우회 (notify-project-created/updated와 동일한 함수)
function encodeBodyBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  const b64 = btoa(binary);
  const lines: string[] = [];
  for (let i = 0; i < b64.length; i += 76) lines.push(b64.slice(i, i + 76));
  return lines.join('\r\n');
}

// ── 변경 전/후 비교 대상 필드 ──
const COMPARE_FIELDS = ['title', 'date', 'time', 'tag', 'notes', 'client_ids', 'start_date', 'end_date'];

function normalizeForCompare(value: unknown): string | number | null {
  if (value === undefined || value === null || value === '') return null;
  if (Array.isArray(value)) return JSON.stringify([...value].sort());
  return value as string | number;
}

function formatDisplayValue(field: string, value: unknown, clientNameById: Record<string, string>): string {
  if (field === 'client_ids') {
    const ids = Array.isArray(value) ? (value as string[]) : [];
    const names = ids.map((id) => clientNameById[id] || id).filter(Boolean);
    return names.length > 0 ? names.join(', ') : '없음';
  }
  if (field === 'date' || field === 'time' || field === 'start_date' || field === 'end_date') {
    return (value as string) || '미정';
  }
  if (field === 'tag') return (value as string) || '-';
  return (value as string) || '';
}

// src/theme.js의 C.accentBlue(일정 탭 색상)와 동일한 파란색 — 변경된 값 강조용.
const CHANGED_VALUE_COLOR = '#5B7FC4';

Deno.serve(async (req) => {
  try {
    // ── 0) 공유 시크릿 검증 ──
    if (!WEBHOOK_SECRET) {
      console.error('[notify-schedule-updated] WEBHOOK_SECRET 환경변수가 설정되지 않았습니다.');
      return new Response(JSON.stringify({ error: 'Server misconfigured: WEBHOOK_SECRET not set' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const incomingSecret = req.headers.get('x-webhook-secret');
    if (incomingSecret !== WEBHOOK_SECRET) {
      return new Response(JSON.stringify({ error: 'Unauthorized: invalid webhook secret' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 환경변수가 설정되지 않았습니다.');
    }

    // ── 1) 요청 body 파싱: schedule_id, user_id, old, new ──
    let scheduleId, userId, oldData, newData;
    try {
      const body = await req.json();
      scheduleId = body?.schedule_id;
      userId = body?.user_id;
      oldData = body?.old || {};
      newData = body?.new || {};
    } catch {
      throw new Error('요청 body를 JSON으로 파싱할 수 없습니다. { schedule_id, user_id, old, new } 형태여야 합니다.');
    }
    if (!scheduleId) throw new Error('schedule_id가 요청 body에 없습니다.');
    if (!userId) throw new Error('user_id가 요청 body에 없습니다.');

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── 2) old/new 비교로 변경된 필드 목록 산출 ──
    const rawChanges = COMPARE_FIELDS
      .map((field) => ({ field, oldVal: oldData[field], newVal: newData[field] }))
      .filter((c) => normalizeForCompare(c.oldVal) !== normalizeForCompare(c.newVal));

    if (rawChanges.length === 0) {
      console.log(`[notify-schedule-updated] schedule_id=${scheduleId}: 실질적인 변경 사항이 없어 메일 발송을 스킵합니다.`);
      return new Response(JSON.stringify({ ok: true, skipped: true, reason: 'no_changes' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // ── 3) profiles 테이블에서 등록자 조회 ──
    const { data: registrant, error: profileError } = await supabase
      .from('profiles')
      .select('email, name')
      .eq('id', userId)
      .single();

    if (profileError) {
      throw new Error(`등록자 프로필 조회 실패(user_id=${userId}): ${profileError.message}`);
    }

    // ── 4) clients 테이블에서 관련 인물 조회(제거된 사람의 이름도 표시하기 위해 old/new 합집합으로
    // 조회하되, 실제 메일 수신자는 "수정 후 현재" 관련 인물로만 한정한다) ──
    const oldClientIds = Array.isArray(oldData.client_ids) ? oldData.client_ids : [];
    const newClientIds = Array.isArray(newData.client_ids) ? newData.client_ids : [];
    const allClientIds = [...new Set([...oldClientIds, ...newClientIds])];

    let allClients: { id: string; email: string; name: string; linked_profile_id: string | null }[] = [];
    if (allClientIds.length > 0) {
      const { data: clients, error: clientsError } = await supabase
        .from('clients')
        .select('id, email, name, linked_profile_id')
        .in('id', allClientIds);

      if (clientsError) {
        throw new Error(`관련 거래처 조회 실패(client_ids=${JSON.stringify(allClientIds)}): ${clientsError.message}`);
      }
      allClients = clients || [];
    }
    const clientNameById = Object.fromEntries(allClients.map((c) => [c.id, c.name]));
    const relatedClients = allClients.filter((c) => newClientIds.includes(c.id));

    // 임시 디버그 로그 — "삭제된 관련 인물에게도 메일이 간다" 재현 조사용. 원인 확인 후 제거 예정.
    console.log(`[notify-schedule-updated][DEBUG] schedule_id=${scheduleId} oldClientIds=${JSON.stringify(oldClientIds)} newClientIds=${JSON.stringify(newClientIds)} allClients=${JSON.stringify(allClients.map((c) => ({ id: c.id, email: c.email, name: c.name })))} relatedClients=${JSON.stringify(relatedClients.map((c) => ({ id: c.id, email: c.email, name: c.name })))}`);

    const changedFieldSet = new Set(rawChanges.map((c) => c.field));

    // ── 4-1) linked_profile_id가 있는 관련 인물은 clients.email 대신 profiles.email을 우선 사용 ──
    const linkedProfileIds = [...new Set(relatedClients.map((c) => c.linked_profile_id).filter(Boolean))];
    let linkedProfileEmailById: Record<string, string> = {};
    if (linkedProfileIds.length > 0) {
      const { data: linkedProfiles, error: linkedProfilesError } = await supabase
        .from('profiles')
        .select('id, email')
        .in('id', linkedProfileIds);

      if (linkedProfilesError) {
        throw new Error(`연결된 프로필 조회 실패(linked_profile_ids=${JSON.stringify(linkedProfileIds)}): ${linkedProfilesError.message}`);
      }
      linkedProfileEmailById = Object.fromEntries((linkedProfiles || []).map((p) => [p.id, p.email]));
    }

    // ── 5) 수신자 목록 구성 (중복 제거, 빈 이메일 제외) ──
    const recipientSet = new Set<string>();
    if (registrant?.email) recipientSet.add(registrant.email);
    for (const client of relatedClients) {
      const email = (client.linked_profile_id && linkedProfileEmailById[client.linked_profile_id]) || client.email;
      if (email) recipientSet.add(email);
    }
    const recipients = Array.from(recipientSet);
    console.log(`[notify-schedule-updated][DEBUG] schedule_id=${scheduleId} registrant=${registrant?.email} recipients=${JSON.stringify(recipients)}`);

    // ── 6) 수신자가 0명이면 SMTP 호출 스킵, 로그만 남김 ──
    if (recipients.length === 0) {
      console.log(`[notify-schedule-updated] schedule_id=${scheduleId}: 수신자가 없어 메일 발송을 스킵합니다.`);
      return new Response(JSON.stringify({ ok: true, skipped: true, recipients: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
      throw new Error('GMAIL_USER 또는 GMAIL_APP_PASSWORD 환경변수가 설정되지 않았습니다.');
    }

    // ── 7) Gmail SMTP로 이메일 발송 ──
    const scheduleTitle = newData.title || oldData.title || '(제목 없음)';
    const subject = `[secretary_test] 일정 내용 수정: ${scheduleTitle}`;
    const organizerText = registrant?.name || '알 수 없음';

    function buildFieldValueDisplay(field: string, format: 'text' | 'html'): string {
      if (!changedFieldSet.has(field)) return formatDisplayValue(field, newData[field], clientNameById);
      const oldText = formatDisplayValue(field, oldData[field], clientNameById);
      const newText = formatDisplayValue(field, newData[field], clientNameById);
      const newDisplay = format === 'html' ? `<span style="color:${CHANGED_VALUE_COLOR}">${newText}</span>` : newText;
      return `${oldText} → ${newDisplay}`;
    }

    const textLines = [
      '일정 내용이 수정되었습니다.',
      '',
      `제목: ${buildFieldValueDisplay('title', 'text')}`,
      `등록자: ${organizerText}`,
      `날짜: ${buildFieldValueDisplay('date', 'text')}`,
      `시간: ${buildFieldValueDisplay('time', 'text')}`,
      `태그: ${buildFieldValueDisplay('tag', 'text')}`,
      `기간 시작일: ${buildFieldValueDisplay('start_date', 'text')}`,
      `기간 마감일: ${buildFieldValueDisplay('end_date', 'text')}`,
      `관련 인물: ${buildFieldValueDisplay('client_ids', 'text')}`,
    ];
    const notesTextDisplay = buildFieldValueDisplay('notes', 'text');
    if (notesTextDisplay || changedFieldSet.has('notes')) textLines.push(`메모: ${notesTextDisplay}`);
    const textBody = textLines.join('\n');

    const htmlItems = [
      `<li><strong>제목:</strong> ${buildFieldValueDisplay('title', 'html')}</li>`,
      `<li><strong>등록자:</strong> ${organizerText}</li>`,
      `<li><strong>날짜:</strong> ${buildFieldValueDisplay('date', 'html')}</li>`,
      `<li><strong>시간:</strong> ${buildFieldValueDisplay('time', 'html')}</li>`,
      `<li><strong>태그:</strong> ${buildFieldValueDisplay('tag', 'html')}</li>`,
      `<li><strong>기간 시작일:</strong> ${buildFieldValueDisplay('start_date', 'html')}</li>`,
      `<li><strong>기간 마감일:</strong> ${buildFieldValueDisplay('end_date', 'html')}</li>`,
      `<li><strong>관련 인물:</strong> ${buildFieldValueDisplay('client_ids', 'html')}</li>`,
    ];
    const notesHtmlDisplay = buildFieldValueDisplay('notes', 'html');
    if (notesHtmlDisplay || changedFieldSet.has('notes')) htmlItems.push(`<li><strong>메모:</strong> ${notesHtmlDisplay}</li>`);
    const htmlBody = `<p>일정 내용이 수정되었습니다.</p><ul>${htmlItems.join('')}</ul>`;

    const smtpClient = new SMTPClient({
      connection: {
        hostname: 'smtp.gmail.com',
        port: 465,
        tls: true,
        auth: { username: GMAIL_USER, password: GMAIL_APP_PASSWORD },
      },
      client: {
        preprocessors: [(mail) => {
          mail.subject = encodeRfc2047Subject(subject);
          mail.mimeContent = [
            { mimeType: 'text/plain; charset="utf-8"', content: encodeBodyBase64(textBody), transferEncoding: 'base64' },
            { mimeType: 'text/html; charset="utf-8"', content: encodeBodyBase64(htmlBody), transferEncoding: 'base64' },
          ];
          return mail;
        }],
      },
    });

    try {
      await smtpClient.send({
        from: GMAIL_USER,
        to: recipients,
        subject,
        content: textBody,
        html: htmlBody,
      });
    } catch (smtpErr) {
      throw new Error(`Gmail SMTP 발송 실패: ${smtpErr instanceof Error ? smtpErr.message : String(smtpErr)}`);
    } finally {
      await smtpClient.close();
    }

    console.log(`[notify-schedule-updated] schedule_id=${scheduleId}: ${recipients.length}명에게 메일 발송 완료(변경 필드 ${rawChanges.length}개).`);
    return new Response(JSON.stringify({ ok: true, skipped: false, recipients, changedFields: rawChanges.map((c) => c.field) }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[notify-schedule-updated] 에러:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
