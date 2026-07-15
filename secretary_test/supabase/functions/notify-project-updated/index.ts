// notify-project-updated
//
// projects 테이블의 기존 행이 UPDATE되면 DB 트리거(patch_project_update_notify_trigger.sql)가
// 이 Edge Function을 호출한다. 트리거는 실제로 의미 있는 필드(title/status/priority/progress/
// start_date/deadline/notes/client_ids)가 하나라도 바뀐 UPDATE에 대해서만(WHEN 절) 변경 전(old)/
// 후(new) 값을 body에 함께 담아 보내므로, 이 함수는 projects 테이블을 다시 조회하지 않고 바로
// body의 old/new를 비교해 무엇이 바뀌었는지 파악한 뒤 "등록자"(profiles.email)와
// "관련 인물"(clients, linked_profile_id 우선 profiles.email 대체)에게 Gmail SMTP로
// "프로젝트 내용이 수정되었습니다" 알림 메일을 보낸다.
//
// 배포: supabase functions deploy notify-project-updated --no-verify-jwt
// (--no-verify-jwt 사용 시 Supabase 표준 JWT 인증이 스킵되므로, 대신 x-webhook-secret 헤더로
//  간단한 공유 시크릿을 검증한다. 자세한 배포 절차는 supabase/README_notify_project_created.md 참고)
//
// 필요 환경변수 (notify-project-created와 별개로 이 함수에도 개별 설정 필요 — Supabase Edge
// Function 환경변수는 함수별로 독립적으로 관리된다):
// - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: Supabase Edge Function 배포 시 자동 주입됨
// - GMAIL_USER: 발신용 Gmail 주소
// - GMAIL_APP_PASSWORD: Gmail 앱 비밀번호(일반 로그인 비밀번호 아님, 2단계 인증 후 발급)
// - WEBHOOK_SECRET: DB 트리거가 보내는 x-webhook-secret 헤더와 비교할 공유 시크릿
//   (notify-project-created와 동일한 Vault 시크릿(notify_project_created_webhook_secret)을
//    재사용하므로, 이 환경변수 값도 notify-project-created의 WEBHOOK_SECRET과 동일해야 한다.
//    자세한 내용은 supabase/patch_project_update_notify_trigger.sql, README_notify_project_created.md 참고)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const GMAIL_USER = Deno.env.get('GMAIL_USER');
const GMAIL_APP_PASSWORD = Deno.env.get('GMAIL_APP_PASSWORD');
const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET');

// denomailer@1.6.0은 제목에 비ASCII(한글 등) 문자가 일정 길이를 넘으면 RFC 2047
// encoded-word를 올바르게 folding하지 않고 중간에서 그냥 잘라버리는 버그가 있다
// (https://github.com/EC-Nordbund/denomailer/issues/90, 미해결). 그 결과 헤더가
// 깨지면서 수신 메일 클라이언트에 제목이 인코딩 원문 그대로 노출되고, 본문도
// raw MIME 소스가 그대로 보이는 문제가 발생한다. 라이브러리가 제공하는
// client.preprocessors 훅으로 제목만 RFC 2047 규격대로 직접 인코딩해 덮어써서 우회한다.
// (notify-project-created/index.ts와 동일한 함수를 그대로 복사— 한글 제목이 포함된
//  모든 발신 메일에 공통으로 필요하다)
function encodeRfc2047Subject(text: string): string {
  // deno-lint-ignore no-control-regex
  if (!/[^\x00-\x7f]/.test(text)) return text; // ASCII만 있으면 인코딩 불필요

  const CHARSET = 'utf-8';
  const PREFIX = `=?${CHARSET}?Q?`;
  const SUFFIX = '?=';
  const MAX_PAYLOAD_LEN = 75 - PREFIX.length - SUFFIX.length; // encoded-word 전체 75자 제한
  const SAFE_CHAR = /^[A-Za-z0-9!*+\-/]$/;
  const encoder = new TextEncoder();

  // 문자(코드포인트) 단위로 토큰화 — 멀티바이트 문자가 encoded-word 경계에서
  // 잘리지 않도록 반드시 문자 단위로만 줄바꿈한다(RFC 2047 §5 규칙 3).
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

  // encoded-word 사이는 RFC 5322 folding 규칙에 따라 CRLF + 공백(WSP)으로 연결한다.
  return words.map((w) => `${PREFIX}${w}${SUFFIX}`).join('\r\n ');
}

// denomailer의 본문 quoted-printable 인코더(quotedPrintableEncode)에도 subject와 같은 계열의
// 버그가 있다: 74자 줄바꿈 지점을 정할 때 "=XX" 이스케이프 3바이트 경계를 잘못 계산해, 한글 등
// 멀티바이트 문자의 이스케이프 시퀀스가 중간에서 깨진 채로 줄이 나뉘는 경우가 있다(예: "관련
// 인물(ID): (없음)"의 "음"이 "ec�Œ" 형태로 깨져 수신됨 — 실제 보고된 버그). base64는 4문자
// 단위로만 줄을 나누므로 이런 바이트 경계 문제 자체가 없어, 본문은 quoted-printable 대신
// base64로 직접 인코딩해 우회한다.
function encodeBodyBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  const b64 = btoa(binary);
  const lines: string[] = [];
  for (let i = 0; i < b64.length; i += 76) lines.push(b64.slice(i, i + 76));
  return lines.join('\r\n');
}

// ── 변경 전/후 비교 대상 필드 (요구사항: 이 8개 중 실제로 값이 달라진 것만 표시) ──
const COMPARE_FIELDS = [
  'title',
  'status',
  'priority',
  'progress',
  'start_date',
  'deadline',
  'notes',
  'client_ids',
];

// 값 비교용 정규화: null/undefined/빈 문자열은 "값 없음"으로 동일 취급하고, 배열(client_ids)은
// 정렬 후 문자열화해서 순서만 바뀐 경우를 실제 변경으로 오탐하지 않도록 한다.
// (요구사항: 과도하게 복잡한 diff 로직은 지양 — 단순 값 비교 수준으로만 정규화)
function normalizeForCompare(value: unknown): string | number | null {
  if (value === undefined || value === null || value === '') return null;
  if (Array.isArray(value)) return JSON.stringify([...value].sort());
  return value as string | number;
}

// 메일 본문에 표시할 사람이 읽기 좋은 값 포맷 — notify-project-created(새 프로젝트 등록 메일)와
// 동일한 표기 규칙을 따른다: 날짜 없음="미정", 관련 인물 없음="없음"이고 client_ids는 raw id가
// 아니라 이름으로 표시한다(clientNameById에 없는 id는 이름을 못 찾은 경우이므로 id 그대로 표시).
function formatDisplayValue(field: string, value: unknown, clientNameById: Record<string, string>): string {
  if (field === 'progress') return `${(value as number) ?? 0}%`;
  if (field === 'start_date' || field === 'deadline') return (value as string) || '미정';
  if (field === 'client_ids') {
    const ids = Array.isArray(value) ? (value as string[]) : [];
    const names = ids.map((id) => clientNameById[id] || id).filter(Boolean);
    return names.length > 0 ? names.join(', ') : '없음';
  }
  return (value as string) || '';
}

// src/theme.js의 C.accentBlue(일정 탭 색상)와 동일한 파란색 — 변경된 값 강조용.
const CHANGED_VALUE_COLOR = '#5B7FC4';

Deno.serve(async (req) => {
  try {
    // ── 0) 공유 시크릿 검증 (--no-verify-jwt 배포이므로 이 검증이 유일한 인증 수단) ──
    // WEBHOOK_SECRET 자체가 설정되지 않은 경우 fail-open으로 검증을 건너뛰면 무방비 공개
    // 엔드포인트가 되므로, 반드시 fail-closed로 즉시 차단한다.
    if (!WEBHOOK_SECRET) {
      console.error('[notify-project-updated] WEBHOOK_SECRET 환경변수가 설정되지 않았습니다.');
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

    // ── 1) 요청 body 파싱: project_id, user_id, old, new ──
    // (트리거가 old/new 전체를 함께 보내주므로 projects 테이블을 다시 조회할 필요가 없다)
    let projectId, userId, oldData, newData;
    try {
      const body = await req.json();
      projectId = body?.project_id;
      userId = body?.user_id;
      oldData = body?.old || {};
      newData = body?.new || {};
    } catch {
      throw new Error('요청 body를 JSON으로 파싱할 수 없습니다. { project_id, user_id, old, new } 형태여야 합니다.');
    }
    if (!projectId) {
      throw new Error('project_id가 요청 body에 없습니다.');
    }
    if (!userId) {
      throw new Error('user_id가 요청 body에 없습니다.');
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── 2) old/new 비교로 변경된 필드 목록 산출 ──
    const rawChanges = COMPARE_FIELDS
      .map((field) => ({ field, oldVal: oldData[field], newVal: newData[field] }))
      .filter((c) => normalizeForCompare(c.oldVal) !== normalizeForCompare(c.newVal));

    // DB 트리거의 WHEN 절이 이미 "의미 있는 필드가 하나도 안 바뀐 UPDATE"는 걸러내지만,
    // 이 함수를 다른 경로로 직접 호출하는 경우까지 대비해 방어적으로 한 번 더 스킵 처리한다.
    if (rawChanges.length === 0) {
      console.log(`[notify-project-updated] project_id=${projectId}: 실질적인 변경 사항이 없어 메일 발송을 스킵합니다.`);
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

    // ── 4) clients 테이블에서 관련 인물 조회. 변경 사항 표시에는 old/new 양쪽에 등장하는
    // client_id 전체(제거된 사람의 이름도 표시하기 위해)가 필요하지만, 실제 메일 수신자는
    // "수정 후 현재" 관련 인물로만 한정한다(제거된 사람에게는 발송하지 않음) ──
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

    const changedFieldSet = new Set(rawChanges.map((c) => c.field));

    // ── 4-1) linked_profile_id가 있는 관련 인물은 clients.email 대신 profiles.email을
    // 단일 소스로 우선 사용한다(계정별로 중복 저장된 clients.email이 서로 어긋나는 문제 방지) ──
    const linkedProfileIds = [...new Set(relatedClients.map((c) => c.linked_profile_id).filter(Boolean))];
    let linkedProfileEmailById = {};
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
    const recipientSet = new Set();
    if (registrant?.email) recipientSet.add(registrant.email);
    for (const client of relatedClients) {
      const email = (client.linked_profile_id && linkedProfileEmailById[client.linked_profile_id]) || client.email;
      if (email) recipientSet.add(email);
    }
    const recipients = Array.from(recipientSet);

    // ── 6) 수신자가 0명이면 SMTP 호출 스킵, 로그만 남김 ──
    if (recipients.length === 0) {
      console.log(`[notify-project-updated] project_id=${projectId}: 수신자가 없어 메일 발송을 스킵합니다.`);
      return new Response(JSON.stringify({ ok: true, skipped: true, recipients: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
      throw new Error('GMAIL_USER 또는 GMAIL_APP_PASSWORD 환경변수가 설정되지 않았습니다.');
    }

    // ── 7) Gmail SMTP로 이메일 발송 ──
    // 양식은 notify-project-created(새 프로젝트 등록 메일)와 동일한 필드 목록/순서를 그대로 쓰되,
    // 값이 바뀐 필드만 "이전 → 새 값" 형태로 표시하고 새 값에 파란색을 입힌다(plain text는
    // 색을 표현할 수 없으므로 화살표 표기까지만 동일하게 유지).
    const projectTitle = newData.title || oldData.title || '(제목 없음)';
    const subject = `[secretary_test] 프로젝트 내용 수정: ${projectTitle}`;
    const organizerText = registrant?.name || '알 수 없음';

    function buildFieldValueDisplay(field: string, format: 'text' | 'html'): string {
      if (!changedFieldSet.has(field)) return formatDisplayValue(field, newData[field], clientNameById);
      const oldText = formatDisplayValue(field, oldData[field], clientNameById);
      const newText = formatDisplayValue(field, newData[field], clientNameById);
      const newDisplay = format === 'html' ? `<span style="color:${CHANGED_VALUE_COLOR}">${newText}</span>` : newText;
      return `${oldText} → ${newDisplay}`;
    }

    const textLines = [
      '프로젝트 내용이 수정되었습니다.',
      '',
      `제목: ${buildFieldValueDisplay('title', 'text')}`,
      `주최자: ${organizerText}`,
      `상태: ${buildFieldValueDisplay('status', 'text')}`,
      `우선순위: ${buildFieldValueDisplay('priority', 'text')}`,
      `진행률: ${buildFieldValueDisplay('progress', 'text')}`,
      `시작일: ${buildFieldValueDisplay('start_date', 'text')}`,
      `마감일: ${buildFieldValueDisplay('deadline', 'text')}`,
      `관련 인물: ${buildFieldValueDisplay('client_ids', 'text')}`,
    ];
    const notesTextDisplay = buildFieldValueDisplay('notes', 'text');
    if (notesTextDisplay || changedFieldSet.has('notes')) textLines.push(`메모: ${notesTextDisplay}`);
    const textBody = textLines.join('\n');

    const htmlItems = [
      `<li><strong>제목:</strong> ${buildFieldValueDisplay('title', 'html')}</li>`,
      `<li><strong>주최자:</strong> ${organizerText}</li>`,
      `<li><strong>상태:</strong> ${buildFieldValueDisplay('status', 'html')}</li>`,
      `<li><strong>우선순위:</strong> ${buildFieldValueDisplay('priority', 'html')}</li>`,
      `<li><strong>진행률:</strong> ${buildFieldValueDisplay('progress', 'html')}</li>`,
      `<li><strong>시작일:</strong> ${buildFieldValueDisplay('start_date', 'html')}</li>`,
      `<li><strong>마감일:</strong> ${buildFieldValueDisplay('deadline', 'html')}</li>`,
      `<li><strong>관련 인물:</strong> ${buildFieldValueDisplay('client_ids', 'html')}</li>`,
    ];
    const notesHtmlDisplay = buildFieldValueDisplay('notes', 'html');
    if (notesHtmlDisplay || changedFieldSet.has('notes')) htmlItems.push(`<li><strong>메모:</strong> ${notesHtmlDisplay}</li>`);
    const htmlBody = `<p>프로젝트 내용이 수정되었습니다.</p><ul>${htmlItems.join('')}</ul>`;

    const smtpClient = new SMTPClient({
      connection: {
        hostname: 'smtp.gmail.com',
        port: 465,
        tls: true,
        auth: { username: GMAIL_USER, password: GMAIL_APP_PASSWORD },
      },
      client: {
        // denomailer 내부의 버그 있는 제목/본문 인코딩 결과를 우리가 직접 만든 안전한
        // 인코딩 결과로 교체한다(위 encodeRfc2047Subject, encodeBodyBase64 참고).
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

    console.log(`[notify-project-updated] project_id=${projectId}: ${recipients.length}명에게 메일 발송 완료(변경 필드 ${rawChanges.length}개).`);
    return new Response(JSON.stringify({ ok: true, skipped: false, recipients, changedFields: rawChanges.map((c) => c.field) }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[notify-project-updated] 에러:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
