// 5개 Edge Function(notify-project-created/updated, notify-schedule-created/updated,
// send-client-email)에서 거의 100% 동일하게 복제되어 있던 denomailer 인코딩 버그 우회
// 로직과 공유 시크릿 검증, Gmail SMTP 클라이언트 구성/발송 로직을 한 곳으로 모은 공유
// 모듈. Supabase Edge Functions(Deno Deploy)는 함수별 디렉토리 밖의 `_shared/` 상대경로
// import를 공식 지원하며, 각 함수 배포 시 이 파일도 함께 번들링된다.
//
// 배경: _review/secretary_test-20260723/01_architecture.md 발견 #1 — denomailer 인코딩
// 버그 우회 로직처럼 미묘한 버그 픽스가 앞으로 하나의 파일에만 반영되고 나머지에 누락될
// 위험이 실제로 있어(5개 파일, 총 ~1500줄 중 상당 부분이 중복) 공통 모듈로 추출했다.

import { SMTPClient } from 'https://deno.land/x/denomailer@1.6.0/mod.ts';

// denomailer@1.6.0은 제목에 비ASCII(한글 등) 문자가 일정 길이를 넘으면 RFC 2047
// encoded-word를 올바르게 folding하지 않고 중간에서 그냥 잘라버리는 버그가 있다
// (https://github.com/EC-Nordbund/denomailer/issues/90, 미해결). 그 결과 헤더가
// 깨지면서 수신 메일 클라이언트에 제목이 인코딩 원문 그대로 노출되고, 본문도
// raw MIME 소스가 그대로 보이는 문제가 발생한다. 라이브러리가 제공하는
// client.preprocessors 훅으로 제목만 RFC 2047 규격대로 직접 인코딩해 덮어써서 우회한다.
export function encodeRfc2047Subject(text: string): string {
  // 보안 재감사(_review/secretary_test-20260723/02_security.md 발견 #4) CRLF 헤더 인젝션 방지.
  // 비ASCII 체크보다 먼저 개행 문자를 공백으로 치환해, 순수 ASCII 문자열에 CR/LF가 섞여 있어도
  // 인코딩 없이 그대로 mail.subject에 들어가지 않도록 한다.
  text = text.replace(/[\r\n]+/g, ' ');
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
export function encodeBodyBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  const b64 = btoa(binary);
  const lines: string[] = [];
  for (let i = 0; i < b64.length; i += 76) lines.push(b64.slice(i, i + 76));
  return lines.join('\r\n');
}

// DB 트리거가 --no-verify-jwt로 배포된 함수(notify-project-created/updated,
// notify-schedule-created/updated)를 호출할 때의 유일한 인증 수단. WEBHOOK_SECRET 자체가
// 설정되지 않은 경우 fail-open으로 검증을 건너뛰면 무방비 공개 엔드포인트가 되므로, 반드시
// fail-closed로 즉시 차단한다. 문제가 있으면 그대로 반환할 Response를, 문제 없으면 null을
// 반환한다 — 호출부에서 `const res = verifyWebhookSecret(...); if (res) return res;` 형태로 사용.
export function verifyWebhookSecret(req: Request, webhookSecret: string | undefined, logPrefix: string): Response | null {
  if (!webhookSecret) {
    console.error(`${logPrefix} WEBHOOK_SECRET 환경변수가 설정되지 않았습니다.`);
    return new Response(JSON.stringify({ error: 'Server misconfigured: WEBHOOK_SECRET not set' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  const incomingSecret = req.headers.get('x-webhook-secret');
  if (incomingSecret !== webhookSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized: invalid webhook secret' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    });
  }
  return null;
}

export interface GmailCredentials {
  gmailUser: string;
  gmailAppPassword: string;
}

// denomailer 내부의 버그 있는 제목/본문 인코딩 결과를, 위 encodeRfc2047Subject/
// encodeBodyBase64로 직접 만든 안전한 인코딩 결과로 교체한 SMTPClient를 만든다.
export function createGmailSmtpClient(
  { gmailUser, gmailAppPassword }: GmailCredentials,
  subject: string,
  textBody: string,
  htmlBody: string,
): SMTPClient {
  return new SMTPClient({
    connection: {
      hostname: 'smtp.gmail.com',
      port: 465,
      tls: true,
      auth: { username: gmailUser, password: gmailAppPassword },
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
}

// smtpClient.send()를 시도하고, 성공/실패와 무관하게 항상 close()한 뒤, 실패 시 5개 함수가
// 공통으로 쓰던 에러 메시지 형식("Gmail SMTP 발송 실패: ...")으로 다시 throw한다.
export async function sendAndCloseSmtp(
  smtpClient: SMTPClient,
  mail: { from: string; to: string[]; subject: string; content: string; html: string },
): Promise<void> {
  try {
    await smtpClient.send(mail);
  } catch (smtpErr) {
    throw new Error(`Gmail SMTP 발송 실패: ${smtpErr instanceof Error ? smtpErr.message : String(smtpErr)}`);
  } finally {
    await smtpClient.close();
  }
}
