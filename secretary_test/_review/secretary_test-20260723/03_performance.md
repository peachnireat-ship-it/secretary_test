# 성능 병목 감사
대상: `C:\Users\user\secretary_test` (신규: CompanyScreen.js / LoginScreen.js 회사 선택 / storage.js getCompanyProjects·getCompanyList)
날짜: 2026-07-23
점수: 57/100

---

## 요약

2026-07-01 종합 리뷰에서 지적된 항목(중복 `getCurrentUser()` 호출, ScheduleScreen 이중 load, useMemo 미적용 등)은 모두 조치 완료된 상태로 재확인했고, 이번 감사에서 회귀는 발견되지 않았다(`for...of`/`forEach`/`.map` 내부 `await` 패턴 grep 결과 0건 — N+1 쿼리 없음).

반면 신규 추가된 **회사/부서 통합 화면(CompanyScreen)** 과 **회원가입 회사 선택(LoginScreen)** 기능은 "회사 규모가 커질수록 먼저 무너지는" 전형적인 멀티테넌트 확장성 문제를 안고 있다. N+1이나 O(n²) 같은 즉각적 Critical 패턴은 없지만(오히려 `getCompanyProjects`는 JOIN 1회로 그룹핑해 N+1을 잘 피했다), 다음 4가지가 구조적으로 반복된다:

1. `projects.user_id`, `profiles.company_id`, `profiles.department_id`, `departments.company_id` — 신규 기능이 의존하는 RLS 정책·조인 컬럼에 **인덱스가 하나도 없다**. 현재는 회사당 프로젝트 몇 건 수준이라 안 보이지만, 회사 수·부서 인원이 늘면 `getCompanyProjects()`의 `ORDER BY created_at` 정렬을 위해 (인덱스가 없는) 전체 `projects` 테이블 시퀀셜 스캔이 필요해진다.
2. `getCompanyProjects()`/`getCompanyList()` 둘 다 **LIMIT/페이지네이션이 없고 캐시도 없다** — 화면 포커스·계정유형 토글마다 전체 목록을 무제한으로 다시 가져온다.
3. `getCompanyProjects()`는 리스트 렌더링에 쓰이지도 않는 `notes`/`client_ids`/`meeting_record_ids`까지 `select('*')`로 통째로 가져온다.
4. `CompanyScreen`은 상세 모달 `TextInput` 한 글자를 칠 때마다 부서별 그룹·소속 인원 Set·마감일 계산을 포함한 전체 프로젝트 목록을 다시 렌더링한다 — 같은 리포지토리의 `ClientScreen`/`ScheduleScreen`이 이미 `useMemo`로 해결해 놓은 패턴을 신규 화면에서 놓쳤다.

지금 당장(테스트 계정 6개, 회사 소수) 체감되는 지연은 없으나, 회사 관리자 기능이 실사용자용으로 확장되는 시점에 가장 먼저 느려질 지점이 바로 이 화면들이다.

---

## 발견된 병목

| 번호 | 유형 | 파일:라인 | 문제 설명 | 심각도 | 예상 영향 | 수정 방법 |
|------|------|---------|---------|-------|---------|---------|
| 1 | SELECT * | `src/services/storage.js:565-569` (`getCompanyProjects`) | `supabase.from('projects').select('*, profiles!inner(name, team, department_id, departments(name))')` — 리스트 화면(`CompanyScreen`)에서 쓰지도 않는 `notes`, `client_ids`, `meeting_record_ids`(jsonb) 등을 매 조회마다 전체 다운로드. `notes`는 상세 모달을 열 때만 필요한데 목록 로딩 시점에 전부 가져옴. | 🟡 Major | 부서/회사 규모가 커질수록 `CompanyScreen` 최초 로딩 페이로드가 선형으로 비대해짐. 회의록 연결이 많은 프로젝트일수록 `meeting_record_ids` jsonb 배열도 함께 커져 낭비 가중 | 리스트 전용 컬럼만 명시 선택(`id, title, deadline, status, progress, priority, created_at, user_id, profiles!inner(name, team, departments(name))`), `notes` 등은 상세 모달 오픈 시 `getProjectById`류로 지연 로딩 |
| 2 | 인덱스 누락 | `supabase/schema.sql:86-100`(projects), `:16-21`(departments), `:23-39`(profiles) + RLS `:303-322` | `projects.user_id`, `profiles.company_id`, `profiles.department_id`, `departments.company_id` 전부 FK만 있고 인덱스가 없음(Postgres는 FK에 인덱스를 자동 생성하지 않음). `getCompanyProjects()`의 `order('created_at', ...)` 조건과 `projects_select_company_admin` RLS(`exists (... p.company_id = my_company_id())`)가 매 행마다 이 컬럼들을 참조하는데도 인덱스가 전혀 없어, `projects` 테이블 전체(플랫폼 전체 회사 합산)를 시퀀셜 스캔 후 필터링하는 구조 | 🟡 Major | 현재는 프로젝트 총량이 적어 안 드러나지만, 회사 수·직원 수가 늘어날수록(플랫폼 전체 `projects` 행 수 기준) 회사 관리자가 "회사" 탭을 열 때마다 걸리는 시간이 선형으로 증가 — 가장 먼저 무너질 지점 | `create index projects_user_id_idx on projects(user_id, created_at desc);`, `create index profiles_company_idx on profiles(company_id);`, `create index profiles_department_idx on profiles(department_id);`, `create index departments_company_idx on departments(company_id);` 추가 |
| 3 | 캐시 전략 없음 (무제한 재조회) | `src/services/storage.js:565-583`(`getCompanyProjects`) + `src/screens/CompanyScreen.js:48`(`useFocusEffect(... load())`) | 회사 탭에 포커스될 때마다(다른 탭 갔다 돌아오기만 해도) 페이지네이션·캐시 없이 회사 전체 부서의 전체 프로젝트를 매번 다시 조회. 결과도 컴포넌트 로컬 state에만 있어 화면을 벗어나면 소실 | 🟡 Major | 부서/직원이 많은 회사일수록 탭 전환마다 반복되는 풀스캔 조회 비용이 누적. 저사양 기기·모바일 네트워크에서 탭 전환 지연 체감 가능 | 최소 조회 결과를 짧은 TTL(예: 30~60초) 인메모리 캐시로 보관해 연속 포커스 시 재사용, 서버 측은 `LIMIT`+커서 기반 페이지네이션 도입 |
| 4 | 캐시 전략 없음 (무제한 재조회) | `src/services/storage.js:204-208`(`getCompanyList`) + `src/screens/LoginScreen.js:31-34`(`useEffect`) | `select('id, name').order('name')`에 `LIMIT` 없이 회사 전체 목록을 매번 조회. 게다가 `accountType`을 `employee`↔`admin`으로 토글할 때마다(가입 폼 중 흔한 조작) 캐시 없이 매번 재요청. RLS도 `companies_select_public: using (true)`라 인증 없이도 전체 회사 테이블이 그대로 노출·조회 가능(스키마 `:179-180`) | 🟡 Major | 회사 수가 늘어날수록(플랫폼 전체 가입 회사 수 기준) 회원가입 화면 진입 시 다운로드/렌더링할 칩 개수가 무제한으로 증가. `LoginScreen.js:159-172`의 `companyChipRow`는 `FlatList` windowing 없는 `View`+`flexWrap`이라 수천 건이면 동시에 전부 마운트됨 | `getCompanyList()`에 `.limit(50)` 등 상한 추가(+검색어 기반 서버 필터링으로 전환 고려), `accountType` 토글 시 이미 불러온 목록은 재조회하지 않도록 1회만 fetch, 칩 목록이 커질 가능성을 고려해 자동완성/검색 UI로 대체 검토 |
| 5 | 불필요한 리렌더링 | `src/screens/CompanyScreen.js:101, 118-160` | `totalProjectCount`(reduce), `memberCount`(부서별 `new Set(...)`), `daysUntil()`, `statusColor()`/`priorityColor()` 호출이 전부 `useMemo` 없이 JSX 렌더 본문에 직접 있음. 상세 모달의 `editTitle`/`editNotes` 등 `TextInput.onChangeText`가 컴포넌트 최상위 state라서, 모달에서 한 글자 입력할 때마다 리렌더 전체가 다시 실행되며 위 목록 전체(부서 수 × 프로젝트 수)가 다시 계산됨. 동일 리포지토리의 `ClientScreen.js:105`(`historiesByClient` useMemo), `ScheduleScreen.js:226,241,256,259`(다수 useMemo)는 이미 이 패턴을 적용해 놓은 상태라, 신규 화면만 놓친 회귀성 누락 | 🟢 Minor | 부서·프로젝트 수가 많은 회사일수록 상세 모달에서 메모 필드에 타이핑할 때 입력 지연(버벅임) 체감 가능. 목록이 작을 때는 무해 | 그룹핑·`memberCount`·`totalProjectCount` 계산을 `useMemo(() => ..., [groups])`로 분리하거나, 모달 편집 state를 별도 하위 컴포넌트로 분리해 상위 리스트 리렌더와 격리 |

### 회귀 확인 (기존 코드)

- `storage.js` 전역: `for`/`forEach`/`.map(async ...)` 내부 `await` 패턴 검색 결과 0건 — N+1 재발 없음.
- `getCompanyProjects()` 자체는 그룹핑에 조인 1회 + 인메모리 `Map` 사용(`storage.js:572-581`)으로 N+1을 잘 피한 정상 패턴. 성능 문제는 인덱스/캐시/컬럼 선택 쪽이지 알고리즘 복잡도가 아님.
- `ScheduleScreen`/`ClientScreen`의 기존 `useMemo` 적용분(07-01 조치)은 그대로 남아있음 — 회귀 없음.
- `getApiKey()`/`getCurrentUser()` 인메모리 캐싱(`_cachedApiKey`, `_cachedUser`)도 그대로 유지 확인.

---

## 성능 프로파일링 권장

- **Supabase 쿼리 플랜 확인**: SQL Editor에서 `EXPLAIN ANALYZE`로 `getCompanyProjects()`가 실제로 실행하는 쿼리(`select * from projects join profiles ...`)를 회사 소속 프로젝트 200~500건 규모의 시드 데이터로 재현해 시퀀셜 스캔 여부 확인(현재 소량 데이터로는 플래너가 인덱스 없이도 빠르게 나올 수 있어 체감이 안 됨).
- **네트워크 페이로드 측정**: React Native 디버거의 Network 탭 또는 `console.time`으로 `getCompanyProjects()` 응답 바이트 수 측정 — `select('*')` 제거 전/후 비교.
- **재렌더 횟수 측정**: `why-did-you-render` 또는 React DevTools Profiler로 `CompanyScreen` 모달에서 타이핑 시 부모 컴포넌트 리렌더 횟수·소요 시간 측정.
- **범위 밖**: 이번 감사는 Supabase/RN 쪽이며 `pyannote-server`는 대상 아님(별도 이슈로 이미 트래킹 중).

---

## 최적화 우선순위

1. **(즉시 수정 — Major)** `projects.user_id`, `profiles.company_id`, `profiles.department_id`, `departments.company_id`에 인덱스 추가 — 스키마 변경 1회로 향후 회사/직원 증가 시 가장 큰 리스크를 선제 차단 (마이그레이션 비용 낮음, 지금 하는 게 가장 저렴함)
2. **(즉시 수정 — Major)** `getCompanyProjects()`/`getCompanyList()`에 `LIMIT`(또는 커서 페이지네이션) 추가, `select('*')` → 리스트에 필요한 컬럼만 명시
3. **(다음 스프린트 — Major)** `getCompanyProjects()`/`getCompanyList()` 결과 짧은 TTL 캐시 도입 — 탭 재포커스·`accountType` 토글마다 재조회하지 않도록
4. **(다음 스프린트 — Minor)** `CompanyScreen`의 그룹핑/집계 로직을 `useMemo`로 분리해 모달 타이핑 시 불필요한 리렌더 제거 (같은 저장소의 `ClientScreen`/`ScheduleScreen` 패턴 그대로 적용 가능)
