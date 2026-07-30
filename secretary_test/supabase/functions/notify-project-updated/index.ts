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
import { createGmailSmtpClient, sendAndCloseSmtp, verifyWebhookSecret } from '../_shared/mail.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const GMAIL_USER = Deno.env.get('GMAIL_USER');
const GMAIL_APP_PASSWORD = Deno.env.get('GMAIL_APP_PASSWORD');
const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET');

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
    const secretError = verifyWebhookSecret(req, WEBHOOK_SECRET, '[notify-project-updated]');
    if (secretError) return secretError;

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('SUPABASE_URL 또는 SUPABASE_SERVICE_ROLE_KEY 환경변수가 설정되지 않았습니다.');
    }

    // ── 1) 요청 body 파싱: project_id, user_id, old, new, is_recent_creation ──
    // (트리거가 old/new 전체를 함께 보내주므로 projects 테이블을 다시 조회할 필요가 없다)
    let projectId, userId, oldData, newData, isRecentCreation;
    try {
      const body = await req.json();
      projectId = body?.project_id;
      userId = body?.user_id;
      oldData = body?.old || {};
      newData = body?.new || {};
      isRecentCreation = !!body?.is_recent_creation;
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
      // 방어적 이중 필터: DB 트리거(validate_client_ids_ownership)가 client_ids의 소유권을
      // 이미 강제하지만, 그 트리거를 어떤 경로로든 우회하더라도 여기서 다른 사용자의 clients가
      // 절대 조회되지 않도록 userId(프로젝트 소유자)로 한 번 더 필터링한다.
      const { data: clients, error: clientsError } = await supabase
        .from('clients')
        .select('id, email, name, linked_profile_id')
        .eq('user_id', userId)
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

    // 이 UPDATE가 프로젝트 생성 직후(트리거의 is_recent_creation, 15초 이내) 발생한 경우 —
    // 예: ProjectScreen.js load()의 startDate 백필, syncProjectMirrors 등 생성 흐름의 연장으로
    // 보이는 UPDATE — notify-project-created 쪽 SMTP 발송이 먼저 끝날 시간을 벌어주기 위해
    // 발송 직전에 짧게 대기한다. INSERT가 UPDATE보다 먼저 커밋되므로 notify-project-created의
    // net.http_post도 이 함수보다 먼저 큐잉되지만, 두 Edge Function 호출은 완전히 독립적인
    // 비동기 실행이라 그 자체만으로는 도착 순서가 보장되지 않는다("새 프로젝트 등록" 메일보다
    // "프로젝트 내용 수정" 메일이 먼저 도착하는 순서 역전이 실제로 관찰됨).
    if (isRecentCreation) {
      await new Promise((resolve) => setTimeout(resolve, 4000));
    }

    const smtpClient = createGmailSmtpClient({ gmailUser: GMAIL_USER, gmailAppPassword: GMAIL_APP_PASSWORD }, subject, textBody, htmlBody);
    await sendAndCloseSmtp(smtpClient, { from: GMAIL_USER, to: recipients, subject, content: textBody, html: htmlBody });

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
