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

const FIELD_LABELS: Record<string, string> = {
  title: '제목',
  status: '상태',
  priority: '우선순위',
  progress: '진행률',
  start_date: '시작일',
  deadline: '마감일',
  notes: '메모',
  client_ids: '관련 인물(ID)',
};

// 값 비교용 정규화: null/undefined/빈 문자열은 "값 없음"으로 동일 취급하고, 배열(client_ids)은
// 정렬 후 문자열화해서 순서만 바뀐 경우를 실제 변경으로 오탐하지 않도록 한다.
// (요구사항: 과도하게 복잡한 diff 로직은 지양 — 단순 값 비교 수준으로만 정규화)
function normalizeForCompare(value: unknown): string | number | null {
  if (value === undefined || value === null || value === '') return null;
  if (Array.isArray(value)) return JSON.stringify([...value].sort());
  return value as string | number;
}

// 메일 본문에 표시할 사람이 읽기 좋은 값 포맷
function formatFieldValue(field: string, value: unknown): string {
  if (value === undefined || value === null || value === '') return '(없음)';
  if (field === 'progress') return `${value}%`;
  if (field === 'client_ids') {
    return Array.isArray(value) && value.length > 0 ? value.join(', ') : '(없음)';
  }
  return String(value);
}

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
    const changes = COMPARE_FIELDS
      .map((field) => ({
        field,
        label: FIELD_LABELS[field],
        oldVal: oldData[field],
        newVal: newData[field],
      }))
      .filter((c) => normalizeForCompare(c.oldVal) !== normalizeForCompare(c.newVal))
      .map((c) => ({
        ...c,
        oldText: formatFieldValue(c.field, c.oldVal),
        newText: formatFieldValue(c.field, c.newVal),
      }));

    // DB 트리거의 WHEN 절이 이미 "의미 있는 필드가 하나도 안 바뀐 UPDATE"는 걸러내지만,
    // 이 함수를 다른 경로로 직접 호출하는 경우까지 대비해 방어적으로 한 번 더 스킵 처리한다.
    if (changes.length === 0) {
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

    // ── 4) clients 테이블에서 관련 인물 조회 (수정 후 현재 client_ids 기준) ──
    const clientIds = Array.isArray(newData.client_ids) ? newData.client_ids : [];
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
    const projectTitle = newData.title || oldData.title || '(제목 없음)';
    const subject = `[secretary_test] 프로젝트 내용 수정: ${projectTitle}`;
    const organizerText = registrant?.name || '알 수 없음';
    const relatedPeopleNames = relatedClients.map((c) => c.name).filter(Boolean);
    const relatedPeopleText = relatedPeopleNames.length > 0 ? relatedPeopleNames.join(', ') : '없음';

    const changeLines = changes.map((c) => `${c.label}: ${c.oldText} → ${c.newText}`);

    const textLines = [
      '프로젝트 내용이 수정되었습니다.',
      '',
      `제목: ${projectTitle}`,
      `주최자: ${organizerText}`,
      `관련 인물: ${relatedPeopleText}`,
      '',
      '변경 사항:',
      ...changeLines.map((line) => `- ${line}`),
    ];
    const textBody = textLines.join('\n');

    const changeListHtml = changes
      .map((c) => `<li><strong>${c.label}:</strong> ${c.oldText} → ${c.newText}</li>`)
      .join('');
    const htmlBody = [
      '<p>프로젝트 내용이 수정되었습니다.</p>',
      '<ul>',
      `<li><strong>제목:</strong> ${projectTitle}</li>`,
      `<li><strong>주최자:</strong> ${organizerText}</li>`,
      `<li><strong>관련 인물:</strong> ${relatedPeopleText}</li>`,
      '</ul>',
      '<p><strong>변경 사항</strong></p>',
      `<ul>${changeListHtml}</ul>`,
    ].join('');

    const smtpClient = new SMTPClient({
      connection: {
        hostname: 'smtp.gmail.com',
        port: 465,
        tls: true,
        auth: { username: GMAIL_USER, password: GMAIL_APP_PASSWORD },
      },
      client: {
        // denomailer 내부의 버그 있는 제목 인코딩 결과를 우리가 직접 만든
        // 올바른 RFC 2047 인코딩 결과로 교체한다(위 encodeRfc2047Subject 참고).
        preprocessors: [(mail) => {
          mail.subject = encodeRfc2047Subject(subject);
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

    console.log(`[notify-project-updated] project_id=${projectId}: ${recipients.length}명에게 메일 발송 완료(변경 필드 ${changes.length}개).`);
    return new Response(JSON.stringify({ ok: true, skipped: false, recipients, changedFields: changes.map((c) => c.field) }), {
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
