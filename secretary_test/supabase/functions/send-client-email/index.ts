// send-client-email
//
// 거래처 관리(ClientScreen)의 "AI 거래처 비서" 채팅에서 AI가 작성한 메일 초안을,
// 사용자가 확인 후 발송 버튼을 누르면 앱이 직접 호출하는 Edge Function.
// DB 트리거로 호출되는 notify-project-created와 달리 로그인한 사용자가 직접 호출하므로,
// 별도 공유 시크릿 없이 Supabase 표준 JWT 인증을 사용한다(--no-verify-jwt 미사용).
//
// 배포: supabase functions deploy send-client-email
// (notify-project-created와 달리 --no-verify-jwt 플래그를 주지 않는다 — 로그인한 사용자만
//  호출 가능해야 하므로 Supabase 게이트웨이의 기본 JWT 검증을 그대로 사용한다.)
//
// 필요 환경변수 (GMAIL_USER/GMAIL_APP_PASSWORD는 notify-project-created와 동일한 프로젝트
// 전역 시크릿을 그대로 재사용하므로 이미 설정돼 있다면 추가 설정 불필요):
// - SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: Edge Function 배포 시 자동 주입됨
// - GMAIL_USER: 발신용 Gmail 주소
// - GMAIL_APP_PASSWORD: Gmail 앱 비밀번호

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { createGmailSmtpClient, sendAndCloseSmtp } from '../_shared/mail.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const GMAIL_USER = Deno.env.get('GMAIL_USER');
const GMAIL_APP_PASSWORD = Deno.env.get('GMAIL_APP_PASSWORD');

// AI 초안이 지나치게 길어지거나 남용되는 것을 막기 위한 상한
const MAX_SUBJECT_LEN = 200;
const MAX_BODY_LEN = 5000;

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// DB 트리거로 서버 대 서버로만 호출되는 notify-project-*와 달리, 이 함수는 앱(웹 포함)이
// 브라우저에서 직접 호출하므로 CORS preflight(OPTIONS)와 응답 헤더 처리가 필요하다.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  try {
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('SUPABASE_URL, SUPABASE_ANON_KEY 또는 SUPABASE_SERVICE_ROLE_KEY 환경변수가 설정되지 않았습니다.');
    }

    // ── 0) 호출자 인증 — 로그인 세션의 JWT를 그대로 전달받아 신원을 확인한다 ──
    const authHeader = req.headers.get('Authorization') || '';
    const authClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await authClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    // ── 1) 요청 body 파싱 ──
    let clientId: string | undefined;
    let subject: string | undefined;
    let body: string | undefined;
    try {
      const parsed = await req.json();
      clientId = parsed?.client_id;
      subject = parsed?.subject;
      body = parsed?.body;
    } catch {
      throw new Error('요청 body를 JSON으로 파싱할 수 없습니다. { client_id, subject, body } 형태여야 합니다.');
    }
    if (!clientId || typeof clientId !== 'string') throw new Error('client_id가 없거나 올바르지 않습니다.');
    if (!subject || typeof subject !== 'string') throw new Error('subject가 없거나 올바르지 않습니다.');
    if (!body || typeof body !== 'string') throw new Error('body가 없거나 올바르지 않습니다.');
    subject = subject.slice(0, MAX_SUBJECT_LEN).trim();
    body = body.slice(0, MAX_BODY_LEN).trim();
    if (!subject || !body) throw new Error('subject 또는 body가 비어 있습니다.');

    // ── 2) 데이터 조회는 service role로 수행하되, user_id 일치 여부로 소유권을 직접 검증한다
    // (linked_profile_id로 연결된 profiles를 읽으려면 RLS를 우회해야 하므로 notify-project-created와
    // 동일하게 service role을 쓰되, 대신 이 조회 자체를 호출자의 user_id로 필터링해 권한을 강제한다) ──
    const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: client, error: clientError } = await admin
      .from('clients')
      .select('email, name, company, linked_profile_id')
      .eq('id', clientId)
      .eq('user_id', user.id)
      .single();

    if (clientError || !client) {
      return new Response(JSON.stringify({ error: '본인 소유의 거래처가 아니거나 존재하지 않습니다.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    // linked_profile_id가 있으면 clients.email 대신 profiles.email을 우선 사용
    // (notify-project-created와 동일한 규칙 — 계정별로 중복 저장된 clients.email이 서로 어긋나는 문제 방지)
    let recipientEmail = client.email;
    if (client.linked_profile_id) {
      const { data: linkedProfile } = await admin
        .from('profiles')
        .select('email')
        .eq('id', client.linked_profile_id)
        .single();
      if (linkedProfile?.email) recipientEmail = linkedProfile.email;
    }

    if (!recipientEmail) {
      return new Response(JSON.stringify({ error: '이 거래처는 이메일이 등록되어 있지 않습니다.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
      });
    }

    if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
      throw new Error('GMAIL_USER 또는 GMAIL_APP_PASSWORD 환경변수가 설정되지 않았습니다.');
    }

    // ── 3) Gmail SMTP로 이메일 발송 ──
    // AI가 작성한 body는 문단 사이 빈 줄(\n\n)과 문단 내 문장별 줄바꿈(\n)을 구분해 담고 있으므로,
    // 문단은 별도 <p>로, 문단 내 줄바꿈은 <br>로 렌더링해 시각적 구조를 그대로 유지한다.
    const htmlBody = body
      .split(/\n{2,}/)
      .map((para) => `<p>${para.split('\n').map(escapeHtml).join('<br>')}</p>`)
      .join('');

    const smtpClient = createGmailSmtpClient({ gmailUser: GMAIL_USER, gmailAppPassword: GMAIL_APP_PASSWORD }, subject, body, htmlBody);
    await sendAndCloseSmtp(smtpClient, { from: GMAIL_USER, to: [recipientEmail], subject, content: body, html: htmlBody });

    console.log(`[send-client-email] user_id=${user.id} client_id=${clientId}: 메일 발송 완료 (${recipientEmail}).`);
    return new Response(JSON.stringify({ ok: true, recipient: recipientEmail }), {
      status: 200,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  } catch (err) {
    console.error('[send-client-email] 에러:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : String(err) }), {
      status: 500,
      headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    });
  }
});
