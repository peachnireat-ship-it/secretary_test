# 종합 코드 리뷰 리포트

대상: `C:\Users\user\secretary_test` (신규: 회사/부서 통합 화면, 회원가입 회사선택, 알림 메일 파이프라인 — "데이터 보안강화" 목적 전체 재감사)
날짜: 2026-07-23
종합 점수: **53/100**   등급: **F**

> 종합 점수 = (아키텍처 62 × 0.25) + (보안 40 × 0.35) + (성능 57 × 0.25) + (스타일 61 × 0.15)
> = 15.5 + 14.0 + 14.25 + 9.15 = **52.9 → 53/100**
>
> 보안 점수(40/100)는 원본 보안 감사에 명시적 총점이 없어, 이번 통합 과정에서 심각도 가중 방식(CRITICAL 1건 = 이 리뷰 4개 영역 전체를 통틀어 유일한 Critical, HIGH 2건, MEDIUM 3건, LOW 2건 + 검증된 안전 항목 7건에 대한 가산)으로 산정했다. 다른 3개 영역이 60점 전후(D~F 경계)인 것과 비교해 보안만 40점대인 이유는, 이번에 발견된 CRITICAL 1건이 "인증된 사용자라면 누구나 다른 계정의 거래처 이메일을 알아내고 임의 내용으로 스팸을 발송할 수 있다"는, RLS 기반 계정 격리라는 이 프로젝트의 핵심 방어선을 정면으로 우회하는 실사용 가능한 취약점이기 때문이다.

---

## Executive Summary

1. **CRITICAL 보안 취약점 1건** — 알림 메일 파이프라인이 일정/프로젝트의 `client_ids` 소유권을 전혀 검증하지 않아, 인증된 사용자 누구나 다른 계정 거래처의 이메일을 알아내고 임의 내용의 메일을 대신 발송할 수 있다. **이번 스프린트가 아니라 즉시(이번 주 내) 조치가 필요**하다.
2. `src/services/storage.js`와 `supabase/schema.sql`+patch 파일군이 아키텍처·보안·성능 **3개 영역 모두**에서 겹쳐 지적된 최우선 핫스팟이며, `src/screens/LoginScreen.js`도 보안·성능·스타일 3개 영역에서 함께 지적됐다 — 이 세 지점을 우선 정리하는 것이 전체 등급을 가장 빠르게 끌어올리는 지렛대다.
3. "알림 메일 발송 체크박스" 회귀는 아키텍처와 스타일 두 감사가 서로 다른 방법론으로 **독립적으로 동일한 결론**(신규 등록 폼에 자동 해제 로직 누락)에 도달해 교차검증됐다 — 실사용자에게 노출된 기능 버그이므로 이번 스프린트 내 수정을 권고한다.

---

## 영역별 점수

| 영역 | 점수 | Critical | Major | Minor |
|------|------|---------|-------|-------|
| 아키텍처 | 62/100 | 0 | 5 | 3 |
| 보안 | 40/100 | 1 | 5 | 2 |
| 성능 | 57/100 | 0 | 4 | 1 |
| 스타일 | 61/100 | 0 | 3 | 3 |
| **종합** | **53/100** | **1** | **17** | **9** |

(보안 표의 Major 열은 원 보고서의 HIGH 2건 + MEDIUM 3건, Minor 열은 LOW 2건을 합산한 값이다.)

---

## 핫스팟 파일

### 🔥 최우선 핫스팟 (3개 이상 영역에서 겹침)

| 파일 | 관련 감사 | 주요 문제 |
|------|---------|---------|
| `src/services/storage.js` | 아키텍처 + 보안(CRITICAL) + 성능 | God File(914줄, 아키텍처#4)이면서, 바로 이 파일의 `addSchedule/addProject/updateSchedule/updateProject`에 `client_ids` 소유권 검증이 빠져 있어 CRITICAL 취약점의 진원지(보안#1)이고, `getCompanyProjects`/`getCompanyList`의 `select('*')`·무캐시(성능#1,#3,#4)도 이 파일 소관 |
| `supabase/schema.sql` + `patch_*.sql`(15개) | 아키텍처 + 보안 + 성능 | 버전관리 없는 patch 방식(아키텍처#6)이 `companies.name` unique 누락(보안#2), `client_ids` FK/소유권 부재(보안#1), `profiles_select_same_company` 과다 컬럼 노출(보안#3), rate limit 부재(보안#6)를 지금까지 가려온 배경이며, `projects.user_id`/`profiles.company_id` 등 인덱스 부재(성능#2)도 동일 스키마의 문제 |
| `src/screens/LoginScreen.js` | 보안(HIGH) + 성능 + 스타일 | 회사명 유일성 미검증으로 회사 사칭 가능(보안#2), `getCompanyList()` 무제한 재조회 + FlatList 미사용 칩 렌더링(성능#4), `handleSignup` 복잡도 초과 + 단일문자 변수명 + `onChangeText` 반복(스타일#2,#4,#5) |
| `supabase/functions/notify-*.ts`(4개) + `send-client-email` | 아키텍처 + 보안 | 5개 파일에 인코딩/시크릿 검증 로직이 그대로 복제(아키텍처#1)되어 있는 바로 그 파일들에 CRITICAL(보안#1)·CRLF 인젝션(보안#4)·HTML 인젝션(보안#5)·타이밍 공격(보안#7)까지 4건의 보안 결함이 몰려 있음. 형식상 2개 영역이지만 보안 단독으로 CRITICAL+3건이 집중돼 있어 예외적으로 🔥 등급으로 취급 |

### ⚠️ 주의 파일 (2개 영역에서 겹침)

| 파일 | 관련 감사 | 주요 문제 |
|------|---------|---------|
| `ProjectScreen.js` / `ScheduleScreen.js` / `useProjectForm.js` | 아키텍처 + 스타일 | "알림 메일 발송 체크박스" 로직이 4곳에 복제되고 신규/편집 폼 간 동작이 어긋남 — **교차검증된 회귀**(아래 특별 강조 참고) |
| `src/screens/CompanyScreen.js` | 아키텍처 + 성능 | `STATUSES`/`PRIORITIES` 상수 중복(아키텍처#7, Minor), 그룹핑/집계 로직 `useMemo` 누락으로 모달 타이핑 시 리렌더 과다(성능#5) |

---

## 교차 분석 — 연관 패턴

### 1. 아키텍처 위반 → 보안 취약점 (구조 문제가 보안 구멍을 만든 사례)

- **storage.js God File → 소유권 검증 누락**: 인증/세션/회사관리자/7개 도메인 CRUD가 914줄 한 파일에 몰려 있는 구조(아키텍처#4)에서, 바로 그 CRUD 함수들(`addSchedule`/`addProject`/`updateSchedule`/`updateProject`) 중 하나에 `client_ids` 소유권 검증이 빠진 것이 이번 감사 최대 CRITICAL(보안#1)이다. 책임이 과도하게 뭉쳐 있으면 "이 함수가 소유권을 검증해야 하는가"를 개별적으로 판단하기 어려워지고, storage.js 분리 없이 보안 패치만 넣으면 다음 신규 CRUD 함수 추가 시 동일 유형의 누락이 재발할 위험이 크다.
- **Edge Functions 5중 복제 → 4건의 보안 결함 집중**: denomailer 인코딩·시크릿 검증 로직이 5개 파일에 독립 복제(아키텍처#1)된 바로 그 지점에 CRITICAL(보안#1)·CRLF 인젝션(보안#4)·HTML 인젝션(보안#5)·타이밍 공격(보안#7)이 몰려 있다. `_shared/mail.ts` 공용 모듈 추출은 단순 리팩터링이 아니라 CRLF/HTML 인젝션 수정을 "한 곳에서 한 번" 반영하게 해주는 보안 조치이기도 하다 — 07-01 리뷰의 `statusColor` 5중 복제 재발 경고가 이번엔 보안 영역에서 실현된 셈이다.
- **무버전 SQL 패치 → 제약 누락이 오래 방치**: `schema.sql`이 최신 상태를 반영하지 않는 관리 방식(아키텍처#6)이, `companies.name` unique 제약 누락(보안#2)과 `client_ids` FK/소유권 제약 부재(보안#1)가 15개 patch 파일 사이에 묻혀 지금까지 발견되지 않은 배경으로 보인다. DB 레벨 제약(unique, trigger) 추가 조치 자체도 어느 patch 파일에 넣어야 할지 판단하기 어려운 구조라 조치 지연 위험이 있다.

### 2. 성능 병목 + 스타일 문제

이번 라운드는 성능 감사 범위가 신규 기능(CompanyScreen/LoginScreen)에 한정되어, 이 패턴이 강하게 나타나지는 않았다. 다만:

- `CompanyScreen.js`는 스타일 감사에서 "0 warning, 매우 깨끗함"으로 평가됐음에도 `useMemo` 누락(성능#5)이 있다 — 즉 "복잡한 코드가 최적화를 어렵게 함"이 아니라 **"깨끗한 신규 코드도 기존 관례(다른 화면의 `useMemo` 패턴)를 놓치면 성능 회귀가 재발한다"**는 반대 방향의 교훈이다.
- 반대로 `ProjectScreen.js`(1975줄)/`ScheduleScreen.js`(1717줄)는 스타일 감사가 "이 크기가 알림 메일 체크박스 중복을 알아채기 어렵게 만든 배경"이라고 명시했다(스타일#3). 이번 성능 감사 범위 밖이었지만, 다음 성능 재감사 시 이 두 파일의 복잡도가 프로파일링·최적화 난이도를 높이는 리스크로 이어질 가능성이 커 **다음 성능 감사 범위에 포함**할 것을 권고한다.

### 3. 보안 취약점 + 성능 문제 (DoS 가능성 상승)

- 보안#6(MEDIUM, `signup_join_company_as_employee`에 rate limit 없음 — 무제한 회사/부서 생성 가능)과 성능#4(`getCompanyList`가 `LIMIT` 없이 회사 전체를 매번 조회하고, `LoginScreen`의 `companyChipRow`가 `FlatList` windowing 없이 `View`+`flexWrap`으로 전량 마운트)가 정확히 맞물린다. 공격자가 보안#6을 악용해 가짜 회사를 대량 생성하면, 그 즉시 모든 사용자의 회원가입 화면에서 성능#4가 실제 장애로 발현된다(수천 개 칩이 windowing 없이 동시 렌더링 → 저사양 기기 프리즈 가능) — **단일 MEDIUM 취약점이 전체 신규가입 플로우에 대한 DoS로 증폭되는 구조**다. 두 항목은 반드시 함께 수정(rate limit + LIMIT/페이지네이션)해야 하며, 하나만 고치면 나머지 경로로 동일 장애가 재현된다.
- 보안#1(CRITICAL `client_ids` 미검증) 역시 `addSchedule`/`addProject` 호출 빈도에 아무 제한이 없어, 스크립트로 반복 호출 시 대량 스팸 메일 발송을 막을 서버 측 쓰로틀이 전무하다. 성능 감사가 지적한 "무제한 재조회/무캐시" 경향이 인증 계층 전반에 걸쳐 있음을 시사하며, #1 수정 시 rate limit 도입도 함께 검토해야 한다.

### 4. 3개 이상 감사에서 겹친 파일

위 "🔥 최우선 핫스팟" 표 참고 — `storage.js`, `schema.sql`+patch군, `LoginScreen.js`가 각각 3개 영역에서 동시에 지적됐다.

### 특별 강조 — 교차검증된 회귀: 알림 메일 발송 체크박스

아키텍처 감사(#2)와 스타일 감사(#1)가 완전히 독립적인 관점(의존성 구조 분석 vs. 정적 코드 중복/DRY 탐지)에서 **정확히 동일한 결론**에 도달했다: `ProjectScreen.js:930-941`/`ScheduleScreen.js:883-894`(신규 등록 폼)에는 관련 인물 0명일 때 체크박스를 자동 해제하는 `useEffect`가 아예 없고, 이 로직은 `useProjectForm.js:267-271`/`ScheduleScreen.js:213-217`(편집 폼)에만 각각 독립적으로 구현되어 있다. 그 결과 **신규 프로젝트/일정 등록 시에는 관련 인물이 없어도 체크박스가 켜진 채로 저장될 수 있다.**

두 감사가 서로 다른 방법론으로 동일 버그·동일 파일·동일 근본원인(공통 훅 미추출)을 지목했다는 것은 이 이슈가 우연한 오탐이 아니라 **실제 사용자 영향 버그**임을 강하게 뒷받침한다. 최근 3개 커밋(`38fac61`, `ee36681`, `9c94ba8`)이 이 기능을 반복적으로 손봐 온 이력과도 일치하며, 두 감사가 독립적으로 `useNotifyEmailField`/`useNotifyEmailSync` 공통 훅 추출이라는 동일한 해법을 권고했다.

---

## 즉시 조치 필요 (Critical / High 보안 최우선)

| 번호 | 영역 | 파일:라인 | 문제 | 수정 방법 |
|------|------|---------|-----|---------|
| 1 | 보안 (CRITICAL) 🔥핫스팟 | `src/services/storage.js:364-370,524-530,379-384,532-538`(addSchedule/addProject/updateSchedule/updateProject), `supabase/functions/notify-{schedule,project}-{created,updated}/index.ts` | 알림 메일 파이프라인이 `client_ids` 소유권을 검증하지 않아, 인증된 사용자 누구나 다른 계정 거래처 ID를 자신의 일정/프로젝트에 끼워 넣어 그 거래처 이메일을 알아내고 임의 내용의 메일을 대신 발송할 수 있음 | (a) `add/updateSchedule/Project`에서 `client_ids` 각 원소가 호출자 소유 `clients`인지 앱 레벨 검증 (b) DB에 BEFORE INSERT/UPDATE 트리거로 소유권 강제 (c) Edge Function `clients` 조회에도 `user_id` 필터 추가(이중 방어) |
| 2 | 보안 (HIGH) 🔥핫스팟 | `supabase/schema.sql:11`, `patch_signup_company_role.sql:45-63`, `src/screens/LoginScreen.js:120-180` | `companies.name`에 unique 제약이 없어 동명의 가짜 회사를 만들어 관리자가 될 수 있음 → 신규 직원이 회사명만 보고 잘못 선택 시 프로젝트 전체 열람/수정/삭제 가능(사회공학적 권한 탈취) | `companies.name` unique 제약 추가 또는 `signup_create_company_as_admin` 내부에서 동일 이름 존재 시 차단. 회사 선택 칩에 생성일/인원 수 등 식별 정보 노출 검토 |
| 3 | 보안+성능 복합 (MEDIUM, DoS 증폭) | `patch_signup_company_role.sql:66-99`(rate limit 없음) + `storage.js:204-208`, `LoginScreen.js:31-34,159-172`(무제한 재조회·미윈도잉) | 회사/부서 무제한 생성(보안#6)이 `getCompanyList()`의 무제한 재조회·`FlatList` 미사용 칩 렌더링(성능#4)과 결합해 회원가입 화면 자체를 마비시킬 수 있는 DoS로 증폭 | RPC에 계정당/시간당 회사 생성 횟수 제한 추가 **+** `getCompanyList()`에 `.limit(50)` 및 검색 UI 전환을 동시에 적용 (하나만 고치면 재발) |
| 4 | 보안 (MEDIUM) 🔥핫스팟 | `supabase/schema.sql:225-226`(`profiles_select_same_company`) | 행 단위 RLS라 컬럼 제한이 불가능 — 같은 회사 소속이면 일반 직원도 동료의 이메일·연락처·개인 메모·업무 메모를 전체 컬럼으로 조회 가능 | `security invoker` 뷰(`profiles_public_same_company`)로 공개 가능 컬럼만 노출하거나 `grant select (컬럼목록)`로 컬럼 단위 권한 제한 |
| 5 | 보안 (MEDIUM) 🔥핫스팟 | `supabase/functions/notify-*.ts` 5개, `encodeRfc2047Subject()` | 비ASCII 문자가 없으면 CR/LF가 그대로 통과 — 순수 ASCII 제목에 개행을 섞으면 SMTP 헤더 인젝션(Bcc 추가 등) 이론적으로 가능 | 비ASCII 여부와 무관하게 항상 `text.replace(/[\r\n]+/g, ' ')` 선행 적용. 아키텍처#1의 `_shared/mail.ts` 통합 작업에 포함해 5곳 동시 수정 |

---

## 이번 스프린트 (Major)

| 번호 | 영역 | 파일:라인 | 문제 | 수정 방법 |
|------|------|---------|-----|---------|
| 6 | 아키텍처+스타일 (교차검증) | `ProjectScreen.js:756-771,930-941`, `ScheduleScreen.js:883-894,1135-1151,213-217`, `useProjectForm.js:267-271` | 알림 메일 체크박스 UI·자동설정 로직이 4곳에 중복되고 신규/편집 폼 동작이 어긋남(신규 등록 시 자동 해제 누락) | `useNotifyEmailField(clientIds)` 공통 훅 + `NotifyEmailCheckbox` 컴포넌트 추출, new/edit 4곳 동일 적용 |
| 7 | 아키텍처 🔥핫스팟 | `supabase/functions/_shared/` (신설) | 인코딩/시크릿 검증 로직 5개 파일 복제 — 버그 픽스 누락 위험 | `_shared/mail.ts`에 `encodeRfc2047Subject`/`encodeBodyBase64`/`verifyWebhookSecret`/`buildSmtpClient` 추출(위 항목 5, 보안#5 HTML escape도 함께 통합) |
| 8 | 아키텍처 🔥핫스팟 | `src/services/storage.js`(914줄) | 인증/세션/회사관리자/7개 도메인 CRUD 단일 파일 집중 — 보안 검증 누락(항목 1)의 구조적 배경 | `authService.js`/`companyService.js` 우선 분리, 공통 헬퍼는 `storageCore.js`로 |
| 9 | 아키텍처 | `ProjectScreen.js:266-289`, `ScheduleScreen.js:394-417` | `handleShare` 공유/복사 폴백 패턴 중복 | `src/utils/share.js`의 `shareOrCopy()` 추출 |
| 10 | 아키텍처 | `ProjectScreen.js`(1975줄), `MeetingScreen.js`(1989줄) | 훅 분리 이후에도 재차 500줄 임계 초과 — God Object 경향 재발 | 카드/모달 단위 서브컴포넌트 분리 2단계 리팩터 |
| 11 | 성능 🔥핫스팟 | `supabase/schema.sql`(projects/profiles/departments) | `projects.user_id`, `profiles.company_id/department_id`, `departments.company_id` 인덱스 전무 — 회사/직원 증가 시 시퀀셜 스캔 | 4개 컬럼에 인덱스 추가(마이그레이션 비용 낮음, 선제 조치 권장) |
| 12 | 성능 🔥핫스팟 | `storage.js:565-569`(`getCompanyProjects`) | 리스트에 불필요한 `notes`/`client_ids`/`meeting_record_ids`까지 `select('*')` | 리스트 전용 컬럼만 명시 선택, `notes`는 상세 모달 오픈 시 지연 로딩 |
| 13 | 성능 🔥핫스팟 | `storage.js:565-583`, `CompanyScreen.js:48` | `getCompanyProjects`/`getCompanyList` 캐시·페이지네이션 없음 | 짧은 TTL(30~60초) 인메모리 캐시 + `LIMIT`/커서 페이지네이션 |
| 14 | 스타일 | `LoginScreen.js:66-95`(`handleSignup`) | 30줄, 순환복잡도 약 11 | 검증 로직을 `validateSignupForm(fields)` 순수 함수로 분리 |
| 15 | 보안 (LOW, 상기 통합 작업에 포함 권장) | `notify-*.ts` 4개 (escapeHtml 누락) | HTML 인젝션(피싱 링크 삽입 가능) | `send-client-email`에 이미 있는 `escapeHtml()`을 나머지 4곳에도 적용 |
| 16 | 보안 (LOW) | `notify-*.ts` 4개 (`x-webhook-secret` 비교) | 문자열 비교(타이밍 사이드채널 이론적 가능, 실전 난이도 매우 높음) | `crypto.subtle.timingSafeEqual` 계열로 교체 |

---

## 기술 부채 등록 (Minor)

| 영역 | 항목 |
|------|------|
| 아키텍처 | `supabase/schema.sql`을 최신 스키마로 동기화하거나 CLI `migrations/` 체계 전환 |
| 아키텍처 | `PROJECT_STATUSES`/`PRIORITIES` 상수 `CompanyScreen.js`/`ProjectScreen.js` 중복 → `constants.js` 통합 |
| 아키텍처 | Edge Function URL 하드코딩 4개 트리거 SQL 파일에 반복 → 공통 설정/상수화 |
| 성능 | `CompanyScreen.js` 그룹핑/집계 로직 `useMemo` 미적용(모달 타이핑 시 리렌더) |
| 스타일 | `LoginScreen.js` 단일문자 변수명(`e`,`p`,`ph`) 재발 — `trimmedEmail` 등으로 변경 |
| 스타일 | `LoginScreen.js` `onChangeText` "값 반영+에러 초기화" 패턴 8회 반복 → `withReset()` 헬퍼 |
| 스타일 | `ProjectScreen.js`/`ScheduleScreen.js` 기존 ESLint 경고 15건(미사용 변수, 무효 eslint-disable, `no-unused-expressions`) |

---

## 긍정 평가

1. **RLS 기반 권한 모델의 방어 심도** — `SECURITY DEFINER` 헬퍼로 RLS 재귀 회피, `prevent_privileged_profile_self_update()` 트리거로 셀프 승격 원천 차단, 세션 로컬 플래그(`app.bypass_privilege_trigger`)로만 우회 가능하게 설계 — 개인 프로젝트 규모 대비 이례적으로 꼼꼼함(아키텍처).
2. **Fail-closed/Fail-safe 원칙의 일관 적용** — 웹훅 시크릿 미설정 시 즉시 차단(fail-closed), 메일 발송 실패는 트랜잭션을 막지 않음(fail-safe)(아키텍처).
3. **소유권 이중 검증** — `send-client-email`은 service-role 클라이언트를 쓰면서도 `.eq('user_id', ...)`로 애플리케이션 레벨 재검증(보안 "검증된 안전 항목").
4. **의심 지점 2건 모두 안전으로 확인** — `app.bypass_privilege_trigger` 클라이언트 직접 조작 불가, `signup_create_company_as_admin`의 기존 회사 탈취 불가 — 이번 감사가 사용자 우려 지점을 정면으로 검증하고 명확히 반증함(보안).
5. **07-01 리뷰 항목 전량 조치 재확인** — 평문 비밀번호, 로그인 시도 제한, PII 3rd-party 전송 등 기존 CRITICAL/HIGH 항목이 이번 재감사에서도 해소 상태 유지 확인(보안 부록, 성능/아키텍처 재검증).
6. **신규 화면의 코드 품질** — `CompanyScreen.js`/`LoginScreen.js`는 ESLint 0 errors/0 warnings, 인라인 스타일 0건, 기존 유틸(`daysUntil`, `statusColor`, `useSwipeClose`, `theme.js` 색상 토큰) 재사용 — 신규 코드에 기존 관례가 실제로 전파되고 있음(스타일, 아키텍처).
7. **`getCompanyProjects()`의 N+1 회피** — 조인 1회 + 인메모리 Map 그룹핑으로 N+1을 정상적으로 피한 패턴(성능).

---

## 수정 로드맵

**Week 1 (이번 주, 보안 CRITICAL/HIGH 최우선)**
- [항목 1] `client_ids` 소유권 검증 추가 (앱 레벨 + Edge Function 방어 필터) — CRITICAL
- [항목 2] `companies.name` unique 제약 + 가입 RPC 중복 차단 — HIGH
- [항목 3] `signup_join_company_as_employee` rate limit + `getCompanyList()` LIMIT 동시 적용 — DoS 증폭 조합
- [항목 4] `profiles_select_same_company` 컬럼 제한 뷰
- [항목 5] CRLF 인젝션 방지 (개행 제거) — `_shared/mail.ts` 착수와 함께

**Week 2-3 (이번 스프린트)**
- [항목 6] `useNotifyEmailField` 공통 훅 — 교차검증된 회귀 해소
- [항목 7] `_shared/mail.ts` 추출 (HTML escape·타이밍세이프 비교 포함)
- [항목 8] `storage.js` 도메인 분리 착수(`authService.js`/`companyService.js`)
- [항목 9, 14] `shareOrCopy()` 추출, `handleSignup` 검증 로직 분리
- [항목 11, 12, 13] 인덱스 추가, `select('*')` 제거, 캐시/페이지네이션

**장기**
- [항목 10] `ProjectScreen.js`/`MeetingScreen.js` 서브컴포넌트 분리 2단계 리팩터
- Supabase 스키마를 `migrations/` 체계로 전환 (patch 파일 무버전 관리 근본 해소)
- 기술 부채 백로그 항목(상수 통합, URL 하드코딩 정리, 명명 규칙, 기존 ESLint 경고) 다음 스타일 정리 작업에서 일괄 처리

---

## 참고: 2026-07-01 종합 리뷰 대비 변화

`_review/archive/secretary_test-20260701/05_review_report.md` 기준 (조치 완료 후 아카이브됨). 이번 감사는 07-01 이후 신규 추가된 기능(회사/부서 화면, 회원가입 회사선택, 알림 메일 파이프라인)에 집중됐고, 기존 코드는 회귀 여부만 재검증한 것이므로 직접적인 점수 비교보다는 **추세 확인** 목적으로 참고.

| 항목 | 07-01 | 07-23 | 상태 |
|------|-------|-------|------|
| 종합 점수 | 44/100 (F) | 53/100 (F) | 소폭 개선, 등급 유지 |
| 아키텍처 | 52 | 62 | 개선 (D→D, 07-01 항목 9건 전량 해결 확인) |
| 보안 | 30 | 40(추정) | 개선하되 신규 CRITICAL 1건 재발 |
| 성능 | 44 | 57 | 개선 (07-01 항목 회귀 없음 확인) |
| 스타일 | 63 | 61 | 소폭 하락 (신규 코드 자체는 개선, 알림메일 중복이 견인) |
| 07-01 CRITICAL 2건(평문 비번, API키 노출) | Critical | - | ✅ 해결 확인 |
| storage.js 핫스팟(4개 영역 전부) | 1위 | 3개 영역(성능 회귀만 없음) | ⚠️ 형태를 바꿔 재발 — 이전엔 인증/성능/스타일 문제, 이번엔 신규 CRITICAL 보안 취약점의 진원지 |
| 알림 메일 체크박스 회귀 | (신규 기능 자체가 07-01 이후 추가) | 아키텍처+스타일 교차검증 | 🆕 신규, 우선 처리 권고 |

**해석**: 07-01의 CRITICAL 2건(평문 비밀번호, API 키 노출)은 완전히 해소됐고 개별 영역 점수는 전반적으로 상승했다. 그러나 신규 기능 3종에서 **새로운 CRITICAL 취약점 1건**이 발생해 종합 등급은 여전히 F에 머문다 — `storage.js`가 다른 문제로 다시 최우선 핫스팟에 오른 것은, 이 파일의 구조적 비대화(God File)를 근본적으로 손보지 않는 한 새 기능이 추가될 때마다 유사한 유형의 결함이 반복될 수 있음을 시사한다.
