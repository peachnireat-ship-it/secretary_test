# send-client-email 배포 가이드

거래처 관리 탭의 "AI 거래처 비서" 채팅에서 AI가 메일 초안(제목/본문)을 작성하면, 사용자가 내용을 확인하고 "발송" 버튼을 눌렀을 때 앱이 직접 호출하는 Edge Function이다. `notify-project-created`(DB 트리거 호출)와 달리 로그인한 사용자가 앱에서 직접 호출하므로 별도 공유 시크릿 없이 Supabase 표준 JWT 인증을 사용한다.

## 1. 사전 조건

`GMAIL_USER`, `GMAIL_APP_PASSWORD`는 `notify-project-created` 배포 시 이미 프로젝트 전역 시크릿으로 등록돼 있다면 **추가 설정이 필요 없다**(`supabase secrets list`로 확인 가능). 아직 등록한 적이 없다면 `README_notify_project_created.md`의 1번(Gmail 앱 비밀번호 준비) 및 3번(시크릿 등록)을 먼저 진행한다.

## 2. Edge Function 배포

```bash
supabase functions deploy send-client-email
```

- **`--no-verify-jwt`를 사용하지 않는다.** 로그인한 사용자만 호출 가능해야 하므로 Supabase 게이트웨이의 기본 JWT 검증을 그대로 사용하고, 함수 내부에서도 호출자의 `user_id`와 `clients.user_id`가 일치하는 경우에만 메일을 발송한다(본인 소유 거래처가 아니면 404).
- `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`는 모든 Edge Function에 자동 주입되므로 별도 설정 불필요.

## 3. 동작 확인

거래처 관리 탭 > AI 거래처 비서 채팅에서 "OO 거래처에게 메일 보내줘" 같은 요청을 하면 AI가 메일 초안 카드를 채팅에 표시한다. "발송" 버튼을 누른 뒤 Supabase 대시보드 > Edge Functions > send-client-email > Logs에서 호출 로그와 발송 결과(`recipient`)를 확인한다. 이메일이 등록되지 않은 거래처를 대상으로 시도하면 발송 대신 오류 메시지가 표시되어야 한다.
