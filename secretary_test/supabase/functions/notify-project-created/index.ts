// notify-project-created
//
// projects 테이블에 새 프로젝트가 INSERT되면 DB 트리거(patch_project_notify_trigger.sql)가
// 이 Edge Function을 호출한다. "등록자"(project.user_id의 profiles.email)와
// "관련 인물"(project.client_ids로 연결된 clients들의 email)에게 Gmail SMTP로 알림 메일을 보낸다.
// (Resend onboarding@resend.dev 발신 주소는 도메인 미인증 상태에서 계정 소유 이메일에만 발송
//  가능한 제약이 있어, 도메인 구매 없이 임의 수신자에게 보낼 수 있는 Gmail SMTP로 교체함)
//
// 배포: supabase functions deploy notify-project-created --no-verify-jwt
// (--no-verify-jwt 사용 시 Supabase 표준 JWT 인증이 스킵되므로, 대신 x-webhook-secret 헤더로
//  간단한 공유 시크릿을 검증한다. 자세한 배포 절차는 supabase/README_notify_project_created.md 참고)
//
// 필요 환경변수:
// - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: Supabase Edge Function 배포 시 자동 주입됨
// - GMAIL_USER: 발신용 Gmail 주소
// - GMAIL_APP_PASSWORD: Gmail 앱 비밀번호(일반 로그인 비밀번호 아님, 2단계 인증 후 발급)
// - WEBHOOK_SECRET: DB 트리거가 보내는 x-webhook-secret 헤더와 비교할 공유 시크릿
//   (Supabase SQL Editor에서 `select vault.create_secret('...', 'notify_project_created_webhook_secret');`로
//    Vault에 저장한 값과 동일해야 함. 자세한 내용은 supabase/patch_project_notify_trigger.sql 참고)

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
// 인물(ID): (없음)"의 "음"이 "ec�Œ" 형태로 깨져 수신됨). base64는 4문자 단위로만 줄을
// 나누므로 이런 바이트 경계 문제 자체가 없어, 본문은 quoted-printable 대신 base64로 직접
// 인코딩해 우회한다.
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
    // ── 0) 공유 시크릿 검증 (--no-verify-jwt 배포이므로 이 검증이 유일한 인증 수단) ──
    // WEBHOOK_SECRET 자체가 설정되지 않은 경우 fail-open으로 검증을 건너뛰면 무방비 공개
    // 엔드포인트가 되므로, 반드시 fail-closed로 즉시 차단한다.
    if (!WEBHOOK_SECRET) {
      console.error('[notify-project-created] WEBHOOK_SECRET 환경변수가 설정되지 않았습니다.');
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
    let projectId;
    try {
      const body = await req.json();
      projectId = body?.project_id;
    } catch {
      throw new Error('요청 body를 JSON으로 파싱할 수 없습니다. { project_id } 형태여야 합니다.');
    }
    if (!projectId) {
      throw new Error('project_id가 요청 body에 없습니다.');
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // ── 2) projects 테이블 조회 ──
    const { data: project, error: projectError } = await supabase
      .from('projects')
      .select('id, title, user_id, client_ids, deadline, start_date, status, priority, progress, notes')
      .eq('id', projectId)
      .single();

    if (projectError || !project) {
      throw new Error(`프로젝트 조회 실패(id=${projectId}): ${projectError?.message || '데이터 없음'}`);
    }

    // ── 3) profiles 테이블에서 등록자 조회 ──
    const { data: registrant, error: profileError } = await supabase
      .from('profiles')
      .select('email, name')
      .eq('id', project.user_id)
      .single();

    if (profileError) {
      throw new Error(`등록자 프로필 조회 실패(user_id=${project.user_id}): ${profileError.message}`);
    }

    // ── 4) clients 테이블에서 관련 인물 조회 (client_ids jsonb 배열) ──
    const clientIds = Array.isArray(project.client_ids) ? project.client_ids : [];
    let relatedClients = [];
    if (clientIds.length > 0) {
      const { data: clients, error: clientsError } = await supabase
        .from('clients')
        .select('email, name, linked_profile_id')
        .in('id', clientIds);

      if (clientsError) {
        throw new Error(`관련 거래처 조회 실패(client_ids=${JSON.stringify(clientIds)}): ${clientsError.message}`);
      }
      relatedClients = clients || [];
    }

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

    // ── 6) 수신자가 0명이면 Resend 호출 스킵, 로그만 남김 ──
    if (recipients.length === 0) {
      console.log(`[notify-project-created] project_id=${projectId}: 수신자가 없어 메일 발송을 스킵합니다.`);
      return new Response(JSON.stringify({ ok: true, skipped: true, recipients: [] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
      throw new Error('GMAIL_USER 또는 GMAIL_APP_PASSWORD 환경변수가 설정되지 않았습니다.');
    }

    // ── 7) Gmail SMTP로 이메일 발송 ──
    const subject = `[secretary_test] 새 프로젝트 등록: ${project.title}`;
    const startDateText = project.start_date || '미정';
    const deadlineText = project.deadline || '미정';
    const organizerText = registrant?.name || '알 수 없음';
    const relatedPeopleNames = relatedClients.map((c) => c.name).filter(Boolean);
    const relatedPeopleText = relatedPeopleNames.length > 0 ? relatedPeopleNames.join(', ') : '없음';
    const notesText = project.notes || '';

    const textLines = [
      '새 프로젝트가 등록되었습니다.',
      '',
      `제목: ${project.title}`,
      `주최자: ${organizerText}`,
      `상태: ${project.status}`,
      `우선순위: ${project.priority}`,
      `진행률: ${project.progress}%`,
      `시작일: ${startDateText}`,
      `마감일: ${deadlineText}`,
      `관련 인물: ${relatedPeopleText}`,
    ];
    if (notesText) textLines.push(`메모: ${notesText}`);
    const textBody = textLines.join('\n');

    const htmlItems = [
      `<li><strong>제목:</strong> ${project.title}</li>`,
      `<li><strong>주최자:</strong> ${organizerText}</li>`,
      `<li><strong>상태:</strong> ${project.status}</li>`,
      `<li><strong>우선순위:</strong> ${project.priority}</li>`,
      `<li><strong>진행률:</strong> ${project.progress}%</li>`,
      `<li><strong>시작일:</strong> ${startDateText}</li>`,
      `<li><strong>마감일:</strong> ${deadlineText}</li>`,
      `<li><strong>관련 인물:</strong> ${relatedPeopleText}</li>`,
    ];
    if (notesText) htmlItems.push(`<li><strong>메모:</strong> ${notesText}</li>`);
    const htmlBody = `<p>새 프로젝트가 등록되었습니다.</p><ul>${htmlItems.join('')}</ul>`;

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

    console.log(`[notify-project-created] project_id=${projectId}: ${recipients.length}명에게 메일 발송 완료.`);
    return new Response(JSON.stringify({ ok: true, skipped: false, recipients }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[notify-project-created] 에러:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
