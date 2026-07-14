// notify-project-created
//
// projects 테이블에 새 프로젝트가 INSERT되면 DB 트리거(patch_project_notify_trigger.sql)가
// 이 Edge Function을 호출한다. "등록자"(project.user_id의 profiles.email)와
// "관련 인물"(project.client_ids로 연결된 clients들의 email)에게 Resend API로 알림 메일을 보낸다.
//
// 배포: supabase functions deploy notify-project-created --no-verify-jwt
// (--no-verify-jwt 사용 시 Supabase 표준 JWT 인증이 스킵되므로, 대신 x-webhook-secret 헤더로
//  간단한 공유 시크릿을 검증한다. 자세한 배포 절차는 supabase/README_notify_project_created.md 참고)
//
// 필요 환경변수:
// - SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: Supabase Edge Function 배포 시 자동 주입됨
// - RESEND_API_KEY: Resend 대시보드에서 발급한 API 키
// - WEBHOOK_SECRET: DB 트리거가 보내는 x-webhook-secret 헤더와 비교할 공유 시크릿
//   (Supabase SQL Editor에서 `select vault.create_secret('...', 'notify_project_created_webhook_secret');`로
//    Vault에 저장한 값과 동일해야 함. 자세한 내용은 supabase/patch_project_notify_trigger.sql 참고)

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');
const WEBHOOK_SECRET = Deno.env.get('WEBHOOK_SECRET');

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
        .select('email, name')
        .in('id', clientIds);

      if (clientsError) {
        throw new Error(`관련 거래처 조회 실패(client_ids=${JSON.stringify(clientIds)}): ${clientsError.message}`);
      }
      relatedClients = clients || [];
    }

    // ── 5) 수신자 목록 구성 (중복 제거, 빈 이메일 제외) ──
    const recipientSet = new Set();
    if (registrant?.email) recipientSet.add(registrant.email);
    for (const client of relatedClients) {
      if (client.email) recipientSet.add(client.email);
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

    if (!RESEND_API_KEY) {
      throw new Error('RESEND_API_KEY 환경변수가 설정되지 않았습니다.');
    }

    // ── 7) Resend API로 이메일 발송 ──
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

    const resendResponse = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        // 도메인 미인증 상태의 Resend 테스트 모드 발신 주소.
        // 이 상태에서는 수신자도 Resend 가입 이메일로만 발송 가능(다른 주소는 Resend가 거부함).
        // 본인 도메인을 인증하면 그 도메인의 임의 주소(예: notifications@yourdomain.com)로 교체할 것.
        from: 'onboarding@resend.dev',
        to: recipients,
        subject,
        text: textBody,
        html: htmlBody,
      }),
    });

    if (!resendResponse.ok) {
      const errText = await resendResponse.text();
      throw new Error(`Resend API 호출 실패(status=${resendResponse.status}): ${errText}`);
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
