# notify-project-created 배포 가이드

프로젝트(project)가 `projects` 테이블에 등록되면, DB 트리거가 Edge Function을 호출해 등록자와 관련 거래처에게 Resend API로 이메일 알림을 보낸다. 아래 순서대로 수동 설정한다.

## 1. Resend 계정 준비
1. https://resend.com 에서 계정 생성
2. API 키 발급 (Dashboard > API Keys)
3. (선택, 권장) 실제 발신 도메인을 Resend에 등록·인증. 인증 전에는 `supabase/functions/notify-project-created/index.ts`의 `from: 'notifications@example.com'` 플레이스홀더를 실제 인증된 도메인 주소로 반드시 교체해야 발송이 성공한다.

## 2. Edge Function 배포
```bash
supabase functions deploy notify-project-created --no-verify-jwt
```
- `--no-verify-jwt`를 사용하므로 Supabase 표준 JWT 인증이 스킵된다. 대신 아래 3번에서 설정하는 `WEBHOOK_SECRET`을 통한 커스텀 검증으로 대체한다.

## 3. Edge Function 환경변수 설정
Supabase 대시보드 > Edge Functions > notify-project-created > Settings 에서 아래 값을 설정:

| 환경변수 | 값 | 비고 |
|---|---|---|
| `RESEND_API_KEY` | Resend에서 발급한 API 키 | 필수 |
| `WEBHOOK_SECRET` | 임의의 랜덤 문자열 | 아래 5번의 `app.settings.webhook_secret` 값과 반드시 동일해야 함 |
| `SUPABASE_URL` | (자동 주입) | 별도 설정 불필요 |
| `SUPABASE_SERVICE_ROLE_KEY` | (자동 주입) | 별도 설정 불필요 |

## 4. `patch_clients_email.sql` 실행
Supabase 대시보드 > SQL Editor에서 `supabase/patch_clients_email.sql` 내용을 붙여넣고 실행. `clients` 테이블에 `email` 컬럼을 추가한다(관련 인물 알림 수신자 식별용).

## 5. `patch_project_notify_trigger.sql` 실행
1. `supabase/functions/notify-project-created/index.ts` 배포가 완료된 상태여야 한다 (2번 단계 완료 후).
2. `patch_project_notify_trigger.sql` 상단의 `<PROJECT_REF>` 플레이스홀더를 실제 프로젝트 ref로 교체 (Project Settings > API에서 Project URL 확인).
3. SQL Editor에서 아래를 먼저 실행해 webhook secret을 설정 (3번에서 설정한 `WEBHOOK_SECRET`과 동일한 값):
   ```sql
   alter database postgres set app.settings.webhook_secret = '3번에서-설정한-값과-동일한-문자열';
   ```
4. 그 다음 `patch_project_notify_trigger.sql` 파일 전체를 SQL Editor에 붙여넣고 실행.

## 6. 동작 확인
새 프로젝트를 앱에서 등록한 후, Supabase 대시보드 > Edge Functions > notify-project-created > Logs에서 호출 로그와 발송 결과를 확인한다. 등록자 이메일(`profiles.email`) 및 관련 거래처 이메일(`clients.email`, 빈 값 제외)로 메일이 발송되었는지 Resend 대시보드에서도 확인 가능.
