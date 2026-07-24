// notify-schedule-created
//
// schedules 테이블에 새 일정이 INSERT되면 DB 트리거(patch_schedule_notify_created_trigger.sql)가
// 이 Edge Function을 호출한다. "등록자"(schedule.user_id의 profiles.email)와 "관련 인물"
// (schedule.client_ids로 연결된 clients들의 email, linked_profile_id 우선 profiles.email 대체)에게
// Gmail SMTP로 "새 일정이 등록되었습니다" 알림 메일을 보낸다.
//
// notify-project-created와 완전히 동일한 구조(메일 인코딩 우회, 수신자 산출 방식)를 그대로
// 따르되 대상 테이블/필드만 schedules에 맞게 바꾼 함수다.
//
// 배포: supabase functions deploy notify-schedule-created --no-verify-jwt
// (--no-verify-jwt 사용 시 Supabase 표준 JWT 인증이 스킵되므로, 대신 x-webhook-secret 헤더로
//  간단한 공유 시크릿을 검증한다.)
//
// 필요 환경변수 (notify-project-created/updated, notify-schedule-updated와 동일한 프로젝트
// 전역 시크릿을 그대로 공유하므로 이미 설정돼 있다면 추가 설정 불필요):
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
  // 보안 재감사(_review/secretary_test-20260723/02_security.md 발견 #4) CRLF 헤더 인젝션 방지.
  // 비ASCII 체크보다 먼저 개행 문자를 공백으로 치환해, 순수 ASCII 문자열에 CR/LF가 섞여 있어도
  // 인코딩 없이 그대로 mail.subject에 들어가지 않도록 한다.
  text = text.replace(/[\r\n]+/g, ' ');
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

Deno.serve(async (req) => {
  try {
    // ── 0) 공유 시크릿 검증 ──
    if (!WEBHOOK_SECRET) {
      console.error('[notify-schedule-created] WEBHOOK_SECRET 환경변수가 설정되지 않았습니다.');
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

    // ── 1) 요청 body 파싱 ──
    let scheduleId;
    try {
      const body = await req.json();
      scheduleId = body?.schedule_id;
    } catch {
      throw new Error('요청 body를 JSON으로 파싱할 수 없습니다. { schedule_id } 형태여야 합니다.');
    }
    if (!scheduleId) {
      throw new Error('schedule_id가 요청 body에 없습니다.');
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── 2) schedules 테이블 조회 ──
    const { data: schedule, error: scheduleError } = await supabase
      .from('schedules')
      .select('id, title, user_id, client_ids, date, time, tag, notes, start_date, end_date')
      .eq('id', scheduleId)
      .single();

    if (scheduleError || !schedule) {
      throw new Error(`일정 조회 실패(id=${scheduleId}): ${scheduleError?.message || '데이터 없음'}`);
    }

    // ── 3) profiles 테이블에서 등록자 조회 ──
    const { data: registrant, error: profileError } = await supabase
      .from('profiles')
      .select('email, name')
      .eq('id', schedule.user_id)
      .single();

    if (profileError) {
      throw new Error(`등록자 프로필 조회 실패(user_id=${schedule.user_id}): ${profileError.message}`);
    }

    // ── 4) clients 테이블에서 관련 인물 조회 (client_ids jsonb 배열) ──
    const clientIds = Array.isArray(schedule.client_ids) ? schedule.client_ids : [];
    let relatedClients: { email: string; name: string; linked_profile_id: string | null }[] = [];
    if (clientIds.length > 0) {
      // 방어적 이중 필터: DB 트리거(validate_client_ids_ownership)가 client_ids의 소유권을
      // 이미 강제하지만, 그 트리거를 어떤 경로로든 우회하더라도 여기서 다른 사용자의 clients가
      // 절대 조회되지 않도록 schedule.user_id로 한 번 더 필터링한다.
      const { data: clients, error: clientsError } = await supabase
        .from('clients')
        .select('email, name, linked_profile_id')
        .eq('user_id', schedule.user_id)
        .in('id', clientIds);

      if (clientsError) {
        throw new Error(`관련 거래처 조회 실패(client_ids=${JSON.stringify(clientIds)}): ${clientsError.message}`);
      }
      relatedClients = clients || [];
    }

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

    // ── 6) 수신자가 0명이면 SMTP 호출 스킵, 로그만 남김 ──
    if (recipients.length === 0) {
      console.log(`[notify-schedule-created] schedule_id=${scheduleId}: 수신자가 없어 메일 발송을 스킵합니다.`);
      return new Response(JSON.stringify({ ok: true, skipped: true, recipients: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
      throw new Error('GMAIL_USER 또는 GMAIL_APP_PASSWORD 환경변수가 설정되지 않았습니다.');
    }

    // ── 7) Gmail SMTP로 이메일 발송 ──
    const subject = `[secretary_test] 새 일정 등록: ${schedule.title}`;
    const dateText = schedule.date || '미정';
    const timeText = schedule.time || '미정';
    const tagText = schedule.tag || '-';
    const startDateText = schedule.start_date || '';
    const endDateText = schedule.end_date || '';
    const organizerText = registrant?.name || '알 수 없음';
    const relatedPeopleNames = relatedClients.map((c) => c.name).filter(Boolean);
    const relatedPeopleText = relatedPeopleNames.length > 0 ? relatedPeopleNames.join(', ') : '없음';
    const notesText = schedule.notes || '';

    const textLines = [
      '새 일정이 등록되었습니다.',
      '',
      `제목: ${schedule.title}`,
      `등록자: ${organizerText}`,
      `날짜: ${dateText}`,
      `시간: ${timeText}`,
      `태그: ${tagText}`,
      `관련 인물: ${relatedPeopleText}`,
    ];
    if (startDateText || endDateText) textLines.splice(6, 0, `기간: ${startDateText || '?'} ~ ${endDateText || '?'}`);
    if (notesText) textLines.push(`메모: ${notesText}`);
    const textBody = textLines.join('\n');

    const htmlItems = [
      `<li><strong>제목:</strong> ${schedule.title}</li>`,
      `<li><strong>등록자:</strong> ${organizerText}</li>`,
      `<li><strong>날짜:</strong> ${dateText}</li>`,
      `<li><strong>시간:</strong> ${timeText}</li>`,
      `<li><strong>태그:</strong> ${tagText}</li>`,
    ];
    if (startDateText || endDateText) htmlItems.push(`<li><strong>기간:</strong> ${startDateText || '?'} ~ ${endDateText || '?'}</li>`);
    htmlItems.push(`<li><strong>관련 인물:</strong> ${relatedPeopleText}</li>`);
    if (notesText) htmlItems.push(`<li><strong>메모:</strong> ${notesText}</li>`);
    const htmlBody = `<p>새 일정이 등록되었습니다.</p><ul>${htmlItems.join('')}</ul>`;

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

    console.log(`[notify-schedule-created] schedule_id=${scheduleId}: ${recipients.length}명에게 메일 발송 완료.`);
    return new Response(JSON.stringify({ ok: true, skipped: false, recipients }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[notify-schedule-created] 에러:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
