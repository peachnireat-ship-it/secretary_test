# notify-project-created 배포 가이드

프로젝트(project)가 `projects` 테이블에 등록되면, DB 트리거가 Edge Function을 호출해 등록자와 관련 거래처에게 Gmail SMTP로 이메일 알림을 보낸다. 아래 순서대로 수동 설정한다.

> 이 문서는 신규 등록(INSERT) 알림(`notify-project-created`, 1~6번)과 수정(UPDATE) 알림(`notify-project-updated`, 7~10번) 두 Edge Function의 배포 절차를 함께 다룬다. **환경변수(`GMAIL_USER`, `GMAIL_APP_PASSWORD`, `WEBHOOK_SECRET`)는 Supabase 프로젝트 전체에 공유되는 시크릿이라 한 번만 설정하면 같은 프로젝트의 모든 Edge Function(두 함수 모두)이 자동으로 동일한 값을 사용한다** — `supabase secrets set` 또는 대시보드 > Edge Functions > Secrets(프로젝트 전역 설정)에서 한 번만 등록하면 되며, 함수별로 따로 등록할 필요는 없다.

## 1. Gmail 앱 비밀번호 준비
1. 발신용 Gmail 계정에서 2단계 인증 활성화 (https://myaccount.google.com/security)
2. https://myaccount.google.com/apppasswords 에서 앱 비밀번호 발급 (일반 로그인 비밀번호와 다름)
3. 발급된 16자리 앱 비밀번호를 아래 3번 단계의 `GMAIL_APP_PASSWORD`에 사용. 도메인 인증이 필요 없어 임의의 수신자에게 바로 발송 가능하다(Gmail 하루 500통 한도).

## 2. Edge Function 배포
```bash
supabase functions deploy notify-project-created --no-verify-jwt
```
- `--no-verify-jwt`를 사용하므로 Supabase 표준 JWT 인증이 스킵된다. 대신 아래 3번에서 설정하는 `WEBHOOK_SECRET`을 통한 커스텀 검증으로 대체한다.

## 3. Edge Function 환경변수 설정
Supabase 대시보드 > Edge Functions > notify-project-created > Settings 에서 아래 값을 설정:

| 환경변수 | 값 | 비고 |
|---|---|---|
| `GMAIL_USER` | 발신용 Gmail 주소 | 필수 |
| `GMAIL_APP_PASSWORD` | 1번에서 발급한 앱 비밀번호 | 필수, 일반 로그인 비밀번호 아님 |
| `WEBHOOK_SECRET` | 임의의 랜덤 문자열 | 아래 5번의 `app.settings.webhook_secret` 값과 반드시 동일해야 함 |
| `SUPABASE_URL` | (자동 주입) | 별도 설정 불필요 |
| `SUPABASE_SERVICE_ROLE_KEY` | (자동 주입) | 별도 설정 불필요 |

## 4. `patch_clients_email.sql` 실행
Supabase 대시보드 > SQL Editor에서 `supabase/patch_clients_email.sql` 내용을 붙여넣고 실행. `clients` 테이블에 `email` 컬럼을 추가한다(관련 인물 알림 수신자 식별용).

## 4-1. (선택) `patch_clients_linked_profile.sql` 실행
`clients` row가 실제 로그인 가능한 ROSTER 계정(=profiles row)과 동일 인물인 경우를 위한 것. 같은 사람을 여러 사용자가 각자 자기 `clients` row로 중복 등록하고 있어(예: 최수아가 가진 박지훈, 이서연이 가진 박지훈) 이메일을 매번 여러 row에 따로 갱신해야 하는 문제를 줄이기 위해, `clients.linked_profile_id`(→`profiles.id`) 컬럼을 추가하고 name+company 기준으로 기존 데이터를 백필한다. `linked_profile_id`가 채워진 row는 Edge Function이 `clients.email` 대신 `profiles.email`을 우선 사용한다. Supabase 대시보드 > SQL Editor에서 `supabase/patch_clients_linked_profile.sql` 내용을 붙여넣고 실행.

## 5. `patch_project_notify_trigger.sql` 실행
1. `supabase/functions/notify-project-created/index.ts` 배포가 완료된 상태여야 한다 (2번 단계 완료 후).
2. `patch_project_notify_trigger.sql` 상단의 `<PROJECT_REF>` 플레이스홀더를 실제 프로젝트 ref로 교체 (Project Settings > API에서 Project URL 확인).
3. SQL Editor에서 아래를 먼저 실행해 webhook secret을 Vault에 저장 (3번에서 설정한 `WEBHOOK_SECRET`과 동일한 값). `alter database ... set`은 호스팅 환경에서 슈퍼유저 권한이 없어 `permission denied`가 발생하므로, Supabase의 암호화된 시크릿 저장소인 Vault를 대신 사용한다:
   ```sql
   select vault.create_secret('3번에서-설정한-값과-동일한-문자열', 'notify_project_created_webhook_secret');
   ```
   (값을 나중에 바꾸고 싶으면: `select vault.update_secret(id, '새-값') from vault.secrets where name = 'notify_project_created_webhook_secret';`)
4. 그 다음 `patch_project_notify_trigger.sql` 파일 전체를 SQL Editor에 붙여넣고 실행.

## 6. 동작 확인
새 프로젝트를 앱에서 등록한 후, Supabase 대시보드 > Edge Functions > notify-project-created > Logs에서 호출 로그와 발송 결과를 확인한다. 등록자 이메일(`profiles.email`) 및 관련 거래처 이메일(`clients.email`, 빈 값 제외)로 메일이 발송되었는지는 발신용 Gmail 계정의 "보낸편지함"에서도 확인 가능.

---

## 7. notify-project-updated 배포 (프로젝트 수정 알림)

`projects` 테이블 기존 행이 UPDATE되면(프로젝트 상세 수정), 관련자들에게 "프로젝트 내용이 수정되었습니다" 알림 메일을 보낸다. DB 트리거가 변경 전(old)/후(new) 값을 함께 넘겨주므로 Edge Function은 어떤 필드(제목/상태/우선순위/진행률/시작일/마감일/메모/관련 인물)가 바뀌었는지 비교해 메일 본문에 "상태: 진행중 → 위험" 형태로 표시한다. `updated_at`만 갱신되거나 값이 동일한 단순 재저장 UPDATE에는 메일이 발송되지 않는다(트리거의 `WHEN` 절에서 필터링).

```bash
supabase functions deploy notify-project-updated --no-verify-jwt
```
- `notify-project-created`와 마찬가지로 `--no-verify-jwt`를 사용하므로 `x-webhook-secret` 헤더 검증으로 인증을 대체한다.

## 8. notify-project-updated Edge Function 환경변수 설정

**3번 단계에서 이미 설정했다면 이 단계는 할 일이 없다.** Supabase Edge Function 시크릿(`GMAIL_USER`, `GMAIL_APP_PASSWORD`, `WEBHOOK_SECRET`)은 함수별이 아니라 **프로젝트 전체에 공유**되는 값이다(`supabase secrets list`로 확인 가능). 3번에서 `notify-project-created`용으로 등록한 값을 `notify-project-updated`도 자동으로 그대로 사용하므로 다시 입력할 필요가 없다.

아직 한 번도 설정한 적이 없다면 CLI로 한 번에 등록 가능:
```bash
supabase secrets set GMAIL_USER=발신용Gmail주소 GMAIL_APP_PASSWORD=앱비밀번호 WEBHOOK_SECRET=임의의랜덤문자열
```
(`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`는 모든 Edge Function에 자동 주입되므로 별도 설정 불필요)

## 9. `patch_project_update_notify_trigger.sql` 실행

1. `supabase/functions/notify-project-updated/index.ts` 배포가 완료된 상태여야 한다 (7번 단계 완료 후).
2. webhook secret은 **새로 만들지 않고** notify-project-created가 이미 Vault에 저장해 둔 `notify_project_created_webhook_secret`을 그대로 재사용한다(운영 부담 최소화를 위한 선택). 5번 단계에서 이미 생성했다면 이 단계는 건너뛴다. 아직 생성한 적이 없다면 SQL Editor에서:
   ```sql
   select vault.create_secret('8번에서-설정한-값과-동일한-문자열', 'notify_project_created_webhook_secret');
   ```
3. 그 다음 `patch_project_update_notify_trigger.sql` 파일 전체를 SQL Editor에 붙여넣고 실행한다. 내부적으로 `title/status/priority/progress/start_date/deadline/notes/client_ids` 중 하나라도 바뀐 UPDATE에서만 발동하는 `WHEN` 절이 포함되어 있다.

## 10. 동작 확인

기존 프로젝트를 앱에서 수정(제목/상태/우선순위/진행률/일정/메모/관련 인물 등)한 후, Supabase 대시보드 > Edge Functions > notify-project-updated > Logs에서 호출 로그와 `changedFields`(응답 body)를 확인한다. 반대로 아무 값도 바꾸지 않고 저장만 다시 누른 경우에는 트리거 자체가 발동하지 않아야 하며(로그 없음), 이는 `WHEN` 절이 올바르게 동작하는지 확인하는 가장 쉬운 방법이다.
