# notify-schedule-updated / notify-schedule-created 배포 가이드

일정(schedule)이 `schedules` 테이블에서 INSERT(등록)되거나 UPDATE(수정)되면, DB 트리거가 각각 `notify-schedule-created`/`notify-schedule-updated` Edge Function을 호출해 등록자와 관련 거래처에게 Gmail SMTP로 알림 메일을 보낸다.

> `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `WEBHOOK_SECRET`은 `notify-project-created`/`notify-project-updated`와 동일한, Supabase 프로젝트 전체에 공유되는 시크릿이다. 이미 두 함수 중 하나라도 배포해서 이 값들을 설정해 두었다면, 아래 3번 단계는 새로 할 일이 없다(`supabase secrets list`로 확인 가능).

## 1. Edge Function 배포
```bash
supabase functions deploy notify-schedule-updated --no-verify-jwt
supabase functions deploy notify-schedule-created --no-verify-jwt
```
- `--no-verify-jwt`를 사용하므로 Supabase 표준 JWT 인증이 스킵된다. 대신 `x-webhook-secret` 헤더 검증으로 인증을 대체한다(notify-project-created/updated와 동일한 방식).

## 2. Edge Function 환경변수 확인
Supabase Edge Function 시크릿은 프로젝트 전체에 공유되므로, `notify-project-created`/`notify-project-updated`용으로 이미 등록해 두었다면 이 단계는 할 일이 없다. 아직 한 번도 설정한 적이 없다면:
```bash
supabase secrets set GMAIL_USER=발신용Gmail주소 GMAIL_APP_PASSWORD=앱비밀번호 WEBHOOK_SECRET=임의의랜덤문자열
```
(`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`는 모든 Edge Function에 자동 주입되므로 별도 설정 불필요)

## 3. `patch_schedule_notify_trigger.sql` 실행
1. `supabase/functions/notify-schedule-updated/index.ts` 배포가 완료된 상태여야 한다 (1번 단계 완료 후).
2. webhook secret은 **새로 만들지 않고** notify-project-created가 이미 Vault에 저장해 둔 `notify_project_created_webhook_secret`을 그대로 재사용한다. 아직 생성한 적이 없다면 SQL Editor에서:
   ```sql
   select vault.create_secret('2번에서-설정한-값과-동일한-문자열', 'notify_project_created_webhook_secret');
   ```
3. 그 다음 `patch_schedule_notify_trigger.sql` 파일 전체를 SQL Editor에 붙여넣고 실행한다. 이 파일은 `schedules` 테이블에 `notify_email` 컬럼(체크박스 상태 저장용, 기본값 true)을 추가하고, `title/date/time/tag/notes/client_ids/start_date/end_date` 중 하나라도 바뀐 UPDATE에서만(그리고 `notify_email`이 true인 경우에만) 발동하는 트리거를 생성한다.

## 4. `patch_schedule_notify_created_trigger.sql` 실행 (일정 등록 알림)
1. 위 3번 단계(`patch_schedule_notify_trigger.sql`)가 먼저 실행되어 `schedules.notify_email` 컬럼이 있어야 한다.
2. `supabase/functions/notify-schedule-created/index.ts` 배포가 완료된 상태여야 한다 (1번 단계 완료 후).
3. `patch_schedule_notify_created_trigger.sql` 파일 전체를 SQL Editor에 붙여넣고 실행한다. `notify_email`이 true인 INSERT에서만 발동하는 트리거를 생성한다(신규 등록 모달의 체크박스로 제어).

## 5. (선택) 기존 프로젝트 알림에도 같은 체크박스 게이팅 적용
프로젝트 쪽은 이미 라이브로 운영 중인 `notify-project-created`/`notify-project-updated` 트리거에 동일한 "알림 메일 발송 여부" 체크박스를 적용하려면 `patch_projects_notify_email.sql`을 SQL Editor에서 실행한다(Edge Function 재배포 불필요 — 트리거 WHEN 절만 갱신).

## 6. 동작 확인
일정을 앱에서 새로 등록하거나 기존 일정을 수정(제목/날짜/시간/분류/메모/관련 인물 등)한 후, Supabase 대시보드 > Edge Functions > notify-schedule-created / notify-schedule-updated > Logs에서 호출 로그를 확인한다(수정의 경우 응답 body의 `changedFields`도 확인 가능). 등록·수정 모달의 "관련 인물에게 알림 메일 발송" 체크박스를 해제하고 저장하면 트리거 자체가 발동하지 않아야 한다(로그 없음).
