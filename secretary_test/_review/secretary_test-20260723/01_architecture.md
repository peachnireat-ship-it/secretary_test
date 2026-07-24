# 아키텍처 감사

대상: `C:\Users\user\secretary_test` (신규: CompanyScreen/storage.js 회사 관리자 기능, LoginScreen 회원가입 RPC, supabase/functions/ Edge Functions)
날짜: 2026-07-23
점수: 62 / 100

이전 감사(`_review/archive/secretary_test-20260701/01_architecture.md`, 52/100) 대비 비교 리포트 — 해당 리포트의 9개 항목은 전량 조치 완료가 확인되었다(아래 "이전 발견 사항 재검증" 참고). 이번 감사는 07-01 이후 신규 추가된 회사/부서 통합 화면, 회원가입 계정유형 선택, 알림 메일 Edge Functions를 중심으로 진행했다.

---

## 구조 개요

```
[Presentation]                  [Service]                    [Data / Infra]
screens/LoginScreen.js    ──▶  services/storage.js
  (mode: login|signup)          ├─ login()/signup()          ──▶ supabase.auth (Supabase Auth)
                                 ├─ getCompanyList()          ──▶ companies 테이블 (RLS: 공개 select)
                                 └─ hydrateUserFromSession()
                                      └─ profiles 행 최초 생성 시
                                         accountType에 따라 RPC 호출
                                         ├─ signup_create_company_as_admin(text)      ──▶ Postgres RPC
                                         └─ signup_join_company_as_employee(text,text) ──▶ (SECURITY DEFINER)

screens/CompanyScreen.js  ──▶  services/storage.js
  (회사 관리자 전용 탭,            ├─ getCompanyProjects()       ──▶ projects + profiles + departments 조인
   App.js에서 isCompanyAdmin      │   (부서별 그룹핑은 서비스 레이어에서 수행)
   조건부 렌더링)                 ├─ updateProjectAsCompanyAdmin() ──▶ RLS: projects_update_company_admin
                                 └─ deleteProjectAsCompanyAdmin() ──▶ RLS: projects_delete_company_admin

screens/ProjectScreen.js  ──▶  hooks/useProjectForm.js  ──▶  services/storage.js ──▶ Supabase
screens/ScheduleScreen.js ──▶  (전용 훅 없음, 폼 상태·검증·공유 로직이 화면 파일 내부에 직접 존재)
                                                              services/storage.js ──▶ Supabase

projects/schedules INSERT/UPDATE
  └─▶ DB 트리거(patch_*_notify_trigger.sql, WHEN notify_email=true)
        └─▶ pg_net.http_post (Vault의 공유 webhook secret 첨부)
              └─▶ supabase/functions/notify-project-created/index.ts   (Deno, --no-verify-jwt)
                  supabase/functions/notify-project-updated/index.ts
                  supabase/functions/notify-schedule-created/index.ts
                  supabase/functions/notify-schedule-updated/index.ts
                    └─▶ Gmail SMTP (denomailer)
                    (4개 파일 모두 encodeRfc2047Subject/encodeBodyBase64/시크릿 검증 로직을
                     독립적으로 각자 보유 — 공유 모듈 없음)

screens/ClientScreen.js(AI 메일 초안) ──▶ supabase/functions/send-client-email/index.ts (JWT 인증, --verify-jwt)
                                            └─▶ service-role로 clients 조회 후 user_id 일치 검증(소유권 강제) ──▶ Gmail SMTP
```

의존 방향은 항상 `screens → hooks/services → Supabase(Auth/DB/RPC) / Edge Functions` 이며, 이번 감사에서도 화면 레이어의 `AsyncStorage`·`SecureStore`·`supabase.from/rpc/auth` 직접 호출은 발견되지 않았다(grep 전수 검사, 0건). 순환 의존 없음.

권한(Authorization)의 실질적 강제 지점이 JS 서비스 레이어가 아니라 **Postgres RLS 정책 + SECURITY DEFINER 함수**에 있다는 점이 이번 신규 코드의 특징이다(`getCompanyProjects`가 `company_id`로 재필터링하지 않고 RLS가 이미 필터링했음을 전제하는 주석, `updateProjectAsCompanyAdmin`이 `.eq('user_id', ...)` 없이 RLS만으로 방어하는 구조). 의도적 설계이며 문서화도 잘 되어 있으나, "누가 무엇을 할 수 있는가"를 알려면 JS 코드가 아니라 `supabase/patch_*.sql`을 함께 읽어야 하는 이원화된 권한 소스라는 점은 유지보수 시 유의가 필요하다(아래 발견 사항 참고).

---

## 발견 사항

| 번호 | 위치 | 문제 | 심각도 | 수정 방법 |
|------|------|-----|-------|---------|
| 1 | `supabase/functions/notify-project-created/index.ts`, `notify-project-updated`, `notify-schedule-created`, `notify-schedule-updated` (4개 파일, 각 270~365줄) | `encodeRfc2047Subject()`, `encodeBodyBase64()`(각 ~35줄), 웹훅 시크릿 검증 블록(~15줄), SMTP 클라이언트 구성 블록이 4개 파일에 거의 100% 동일하게 복제되어 있다(`send-client-email`까지 포함하면 5개 파일, 총 ~1500줄 중 상당 부분이 중복). denomailer 인코딩 버그 우회 로직처럼 미묘한 버그 픽스가 앞으로 하나의 파일에만 반영되고 나머지에 누락될 위험이 실제로 존재한다 — 07-01 리뷰에서 지적된 `statusColor`/`useSwipeClose` 5중 복제와 동일한 패턴이 새 레이어(Edge Functions)에서 재발했다. | 🟡 Major | `supabase/functions/_shared/mail.ts`에 `encodeRfc2047Subject`, `encodeBodyBase64`, `verifyWebhookSecret()`, `buildSmtpClient()`를 추출하고 5개 함수에서 상대경로 import(Deno Deploy/Supabase Edge Functions는 `_shared/` 관례를 공식 지원). |
| 2 | `src/screens/ProjectScreen.js:755-771`(edit), `:930-941`(new), `src/screens/ScheduleScreen.js:883-894`(new), `:1135-1151`(edit) | "관련 인물에게 알림 메일 발송" 체크박스 UI(진입 조건 `Alert.alert('안내', '선택된 관련 인물이 없습니다.')` 포함)가 4곳에 거의 동일하게 복제되어 있다. 자동 설정 로직(`선택된 관련 인물이 0명이면 자동으로 체크 해제`)은 `useProjectForm.js`의 `useEffect`(268-271줄, `editClientIds`에만 반응)와 `ScheduleScreen.js` 내부에 독립적으로 존재하는 동일한 `useEffect`(213-217줄)로 **두 곳에서 따로 구현**되어 있다. 그 결과 **"신규 생성" 모달에는 이 자동 설정 로직 자체가 없다**(`newClientIds`를 감시하는 effect가 어느 파일에도 없음) — 회의록 화면과 달리 프로젝트/일정 신규 등록 시에는 관련 인물 없이도 체크박스가 계속 켜진 채로 남는 기능적 불일치가 구조적 원인(로직 미추출)에서 비롯됐다. | 🟡 Major | `useNotifyEmailField(clientIds)` 공통 훅으로 추출(자동 설정 useEffect + 토글 핸들러 + 안내 Alert 포함), new/edit 양쪽 모달에 동일하게 적용해 신규 등록 시 누락도 함께 해소. |
| 3 | `src/screens/ProjectScreen.js:266-289` (`handleShare`), `src/screens/ScheduleScreen.js:394-417` (`handleShare`) | "웹이면 클립보드 복사 폴백, 네이티브면 `Share.share()`" 패턴이 두 파일에 동일 구조로 복제되어 있다(차이는 요약 텍스트 필드뿐). | 🟡 Major | `src/utils/share.js`에 `shareOrCopy(text, { copiedMessage })` 공통 함수 추출, 각 화면은 요약 텍스트만 조립해 전달. |
| 4 | `src/services/storage.js` (914줄) | 인증/세션(`login`/`signup`/`switchAccount`/로그인 시도 제한), API 키 3종(Groq/Grok/Provider), 회사 목록 조회, 7개 도메인 엔티티(schedules/clients/histories/projects/messages/meetingRecords/workTopics) CRUD, 회사 관리자 전용 프로젝트 조회·수정·삭제, 클라이언트 즐겨찾기, 프로필, Pyannote URL, 레거시 마이그레이션까지 단일 파일에 집중되어 있다. 07-01 리뷰 당시에는 강점("Storage 추상화 완전성")으로 평가됐던 지점이나, 회사/부서 기능 추가로 책임 영역이 한 번 더 넓어지며 500줄 임계를 거의 2배 초과했다. 아직 함수 단위 캡슐화는 잘 되어 있어 즉각적인 버그 위험은 낮지만, 다음 기능 추가 시 God File화가 가속될 구조다. | 🟡 Major | 도메인별 파일 분리 검토: `services/authService.js`(로그인/회원가입/세션/계정전환), `services/companyService.js`(회사 목록·회사 관리자 CRUD), 나머지는 기존 `storage.js` 유지 또는 엔티티별 분리. `toRow`/`fromRow`/`KEYMAP`류 공통 헬퍼는 `services/storageCore.js`로 분리해 순환 의존 없이 재사용. |
| 5 | `src/screens/ProjectScreen.js`(1975줄), `src/screens/MeetingScreen.js`(1989줄) | 07-01 리뷰에서 각각 훅 분리(`useProjectAI`/`useProjectForm`, `useAudioRecording`/`useDiarization`) 조치를 받았음에도, 이후 공유 기능·알림 메일·태스크 관리 등이 화면 파일에 계속 누적되며 재차 500줄 임계를 크게 초과했다(ProjectScreen은 07-01 대비 +221줄). 추출된 훅은 폼 상태·AI 호출만 담당하고, 렌더링·공유·복사·달력 바 표시 로직은 여전히 화면 파일 하나에 남아있어 God Object 경향이 재발하고 있다. | 🟡 Major | 렌더링을 기능 단위 서브컴포넌트(`ProjectCard`, `ProjectDetailModal` 등)로 분리하는 2단계 리팩터 필요 — 훅 추출만으로는 화면 파일 크기 억제에 한계가 있음을 이번 리뷰가 재확인. |
| 6 | `supabase/*.sql` (schema.sql 1개 + patch_*.sql 15개) | 스키마 변경이 버전 관리되는 migrations 디렉토리(`supabase migration new` 등 Supabase CLI 관례) 없이, 커밋 시점마다 새 `patch_*.sql` 파일을 추가하고 Supabase SQL Editor에서 수동 실행하는 방식으로 운영된다. 이번 신규 기능만도 `patch_company_department.sql`→`patch_signup_company_role.sql`처럼 실행 순서 의존성이 파일 주석으로만 관리된다. 파일 수가 늘수록 "현재 실제 DB 스키마가 무엇인지"를 코드에서 확정할 수 없는 상태(schema.sql이 최신을 반영하지 않음)가 심화된다. | 🟢 Minor | 최소한 `supabase/schema.sql`을 patch 적용 후 최신 스키마로 동기화하거나, 여유가 되면 Supabase CLI의 `migrations/` 디렉토리 체계로 전환. |
| 7 | `src/screens/CompanyScreen.js:18-19`, `src/screens/ProjectScreen.js:70-71` | `const STATUSES = ['진행중', '위험', '지연', '완료', '취소']`, `const PRIORITIES = ['높음', '보통', '낮음']`가 두 파일에 완전히 동일하게 하드코딩되어 있다. | 🟢 Minor | `src/utils/constants.js` 또는 `theme.js`에 `PROJECT_STATUSES`/`PROJECT_PRIORITIES`로 추출. |
| 8 | `supabase/patch_project_notify_trigger.sql:29`, `patch_schedule_notify_created_trigger.sql:28`, `patch_project_update_notify_trigger.sql:37`, `patch_schedule_notify_trigger.sql:38` | Edge Function URL(`https://peodtjwyajgratgshluy.supabase.co/functions/v1/...`)이 프로젝트 ref가 그대로 박힌 채 4개 트리거 SQL 파일에 각각 하드코딩되어 있다. 스테이징 프로젝트를 새로 파거나 프로젝트를 이전하면 4곳을 일일이 찾아 고쳐야 한다. | 🟢 Minor | Postgres 설정(`current_setting('app.settings.project_url', true)`) 또는 최소한 파일 상단에 공통 상수 주석으로 명시해 누락 방지. |

---

## 이전 발견 사항 재검증 (2026-07-01 리포트 대비)

| 07-01 항목 | 상태 | 확인 내용 |
|---|---|---|
| MeetingScreen God Object | ✅ 부분 해결 / ⚠️ 재비대화 | `useAudioRecording`/`useDiarization` 훅 분리는 유지되고 있으나 화면 파일 자체는 1989줄로 여전히 큼 (위 발견 사항 #5) |
| useSwipeClose 3중 복제 | ✅ 해결 | `src/hooks/useSwipeClose.js`로 통합, CompanyScreen도 동일 훅 재사용 확인 |
| AI 프롬프트 Presentation 레이어 정의 | ✅ 해결 | 전 화면 grep 결과 인라인 시스템 프롬프트 없음, 전부 `services/claude.js`의 `buildXSystem()` 경유 |
| 색상 유틸 4~5중 복제 | ✅ 해결 | `src/utils/colors.js`의 `statusColor`/`priorityColor`를 CompanyScreen 포함 전 화면이 공유 |
| ProjectScreen/ClientScreen 복잡도 | ⚠️ 재발 | ProjectScreen 1975줄(위 #5), ClientScreen은 1497줄로 07-01 이후 컴포넌트 분리(`ClientHistorySection`) 반영되어 상대적으로 안정 |
| user prop 드릴링 / getCurrentUser() 혼용 | ✅ 해결 | `src/context/UserContext.js` 도입 확인 |
| hooks/utils 디렉토리 부재 | ✅ 해결 | `src/hooks/`, `src/utils/` 체계 확립, 이번 신규 기능(useProjectForm)도 정착된 구조를 따름 |

---

## 잘 설계된 부분

1. **RLS 기반 권한 모델의 방어 심도**: 회사 관리자 시나리오(`patch_company_department.sql`)에서 `my_company_id()`/`my_is_company_admin()`을 `SECURITY DEFINER`로 감싸 RLS 재귀를 피하고, `prevent_privileged_profile_self_update()` 트리거로 일반 사용자의 `is_company_admin` 셀프 승격을 원천 차단한 점, 그리고 `signup_create_company_as_admin`/`signup_join_company_as_employee` RPC가 `set_config('app.bypass_privilege_trigger', ...)`라는 일반 클라이언트가 켤 수 없는 세션 로컬 플래그로만 트리거를 우회하도록 설계한 점은 이 규모의 개인 프로젝트치고 이례적으로 꼼꼼한 방어 설계다.
2. **Fail-closed / Fail-safe 원칙의 일관된 적용**: `WEBHOOK_SECRET` 미설정 시 Edge Function이 즉시 500으로 차단(fail-closed)하는 반면, 알림 메일 발송 자체의 실패는 DB 트리거의 `exception when others`로 삼켜 핵심 INSERT/UPDATE 트랜잭션을 절대 막지 않는(fail-safe) 구분이 명확하다.
3. **소유권 검증의 이중화**: `send-client-email`은 RLS를 우회하는 service-role 클라이언트를 쓰면서도 `.eq('user_id', user.id)`로 애플리케이션 레벨에서 소유권을 재차 강제해, "service role이니까 전부 접근 가능"이라는 흔한 함정을 피했다.
4. **레이어 경계 완전 준수**: 이번에 추가된 CompanyScreen/LoginScreen 모두 `services/storage.js`만 경유하며, `supabase.from/rpc/auth` 또는 `AsyncStorage`/`SecureStore` 직접 호출이 화면 레이어에 전혀 없다(전수 grep 확인).
5. **테마·훅 재사용 규율**: CompanyScreen이 신규 화면임에도 `useSwipeClose`, `statusColor`/`priorityColor`, `commonStyles`, `C.companyIndigo`(theme.js 중앙 정의)를 모두 기존 자산에서 재사용했다 — 07-01 리뷰 이후 확립된 관례가 신규 코드에 실제로 전파되고 있음을 보여준다.

---

## 개선 로드맵

### 즉시 수정 (Major)
1. `supabase/functions/_shared/mail.ts` 추출 — 5개 Edge Function의 인코딩/시크릿 검증 로직 통합 (#1)
2. `useNotifyEmailField` 공통 훅 추출 — 체크박스 UI+자동설정 로직을 new/edit 4곳에 동일 적용, 신규 등록 시 자동설정 누락 버그 함께 해소 (#2)
3. `src/utils/share.js`의 `shareOrCopy()` 추출 — ProjectScreen/ScheduleScreen `handleShare` 통합 (#3)

### 다음 스프린트 (Major)
4. `storage.js` 도메인별 분리 검토(`authService.js`/`companyService.js` 우선) (#4)
5. ProjectScreen/MeetingScreen 렌더링 서브컴포넌트 분리 2단계 리팩터 — 훅 추출만으로 불충분함을 확인, 카드/모달 단위 컴포넌트화 필요 (#5)

### 기술 부채 등록 (Minor)
6. Supabase 스키마 변경을 migrations 디렉토리 체계로 전환하거나 최소 schema.sql 동기화 (#6)
7. `PROJECT_STATUSES`/`PROJECT_PRIORITIES` 상수 통합 (#7)
8. Edge Function URL 하드코딩 지점 정리 (#8)
