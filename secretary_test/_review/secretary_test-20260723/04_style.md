# 코드 스타일 감사

대상: `C:\Users\user\secretary_test` (신규: `src/screens/CompanyScreen.js`, `src/screens/LoginScreen.js` / 회귀 스캔: `ProjectScreen.js`, `ScheduleScreen.js`, `storage.js`, `useProjectForm.js`)
날짜: 2026-07-23
점수: 61/100

---

## 요약

`CompanyScreen.js`·`LoginScreen.js` 자체는 매우 깨끗하다 — `npx eslint`로 두 파일을 직접 실행한 결과 0 errors / 0 warnings이며, `style={{`로 시작하는 인라인 스타일도 전무해 `css-guide.md` 규칙을 완전히 준수한다. `daysUntil`/`daysLabel`/`formatDeadline` 등 기존 유틸을 재사용하는 점, `getCompanyProjects()`의 RLS 관련 보안 의도 주석 등도 우수하다.

다만 신규 코드 두 곳에서 문제가 발견됐다. 첫째, `LoginScreen.js`의 `handleSignup`이 30줄·순환복잡도 약 11로 경고 구간에 들어간다(가드절 스타일이라 가독성 자체는 낮지 않으나 기준선은 넘는다). 둘째, 최근 3개 커밋(`38fac61`, `ee36681`, `9c94ba8`)으로 `ProjectScreen.js`/`ScheduleScreen.js`에 추가된 "알림 메일 발송 체크박스" 기능이 두 파일에 걸쳐 JSX·스타일·`useEffect` 로직이 그대로 복사되어 있고, 그마저도 "새 항목 추가" 폼과 "편집" 폼 사이에 가드 로직이 서로 달라 동작이 어긋난다. 회귀 스캔 중 `ProjectScreen.js`(1975줄)·`ScheduleScreen.js`(1717줄)가 2026-07-01 리뷰 시점 추정치(500줄+)보다 3배 가까이 커진 것도 확인했다 — 이 규모가 방금 언급한 중복을 눈에 띄지 않게 만든 주된 원인으로 보인다.

---

## 발견 사항

| 번호 | 유형 | 파일:라인 | 문제 | 심각도 | 수정 방법 |
|------|------|---------|-----|-------|---------|
| 1 | DRY 위반 + 일관성 | `ProjectScreen.js:756-771,930-940` / `ScheduleScreen.js:883-893,1136-1151,213-217` / `useProjectForm.js:267-271` | "알림 메일 발송" 체크박스의 JSX(`TouchableOpacity`+체크박스+라벨), 스타일 5종(`notifyEmailRow` 등, 두 파일에 거의 동일하게 재정의), `useEffect(() => setEditNotifyEmail(editClientIds.length > 0))` 로직이 2개 파일에 사실상 그대로 복제됨. 게다가 "새 항목 추가" 폼(`ProjectScreen.js:930-940`, `ScheduleScreen.js:883-893`)에는 관련 인물 0명일 때 안내하는 가드(`if (...length === 0) Alert...`)와 자동 체크 해제 `useEffect`가 아예 없어, 동일 기능이 편집 화면과 다르게 동작함(신규 항목은 관련 인물 없이도 체크박스가 항상 켜진 채 저장 가능) | 🟡 Major | 체크박스 UI를 `src/components/NotifyEmailCheckbox.js`로, 자동 설정 로직을 `useNotifyEmailSync(clientIds, enabled)` 훅으로 추출해 4곳 모두(신규 폼 2곳 포함)에서 재사용한다. `useSwipeClose`/`commonStyles` 추출 선례와 동일한 패턴으로 진행 가능 |
| 2 | 함수 길이·복잡도 | `LoginScreen.js:66-95` (`handleSignup`) | 30줄, 순환복잡도 약 11(가드절 7개 + `&&` 3회 + try/catch 분기). 가드절 스타일이라 당장 가독성 문제는 적지만 권장 기준(20줄/복잡도10)을 초과 | 🟡 Major | 검증 부분(이메일·비밀번호·전화번호·계정유형·회사명·부서명 체크)을 `validateSignupForm(fields)` 순수 함수로 분리해 `handleSignup`은 "검증 호출 → API 호출 → 후처리"만 담당하게 축소 |
| 3 | 파일 크기 | `ProjectScreen.js` 1975줄, `ScheduleScreen.js` 1717줄 | 2026-07-01 리뷰 당시 "ScheduleScreen.js 추정 500+" 대비 대폭 증가, 권장치(300줄) 대비 6배 수준. 항목 1의 중복이 발견되지 않고 넘어간 배경이기도 함 | 🟡 Major | `NotifyEmailSection`, 모달별 폼 섹션 등 반복되는 JSX 블록을 컴포넌트로 추출해 파일당 500줄 이하로 축소하는 리팩터를 별도 작업으로 계획 |
| 4 | 명명 규칙 재발 | `LoginScreen.js:51-52,67-68,72` (`handleLogin`/`handleSignup`) | `const e = email.trim(); const p = password.trim();`, `const ph = phone.trim();` — 2026-07-01 리뷰에서 `ClientScreen.js`의 단일 문자 구조분해(`c,h,m,p,favs,me`)를 지적하며 "의도를 표현하는 이름으로 교체" 권고를 했던 것과 동일한 패턴이 신규 코드에 재발. 스코프가 짧아 즉각적 혼란은 적지만 팀 컨벤션상 재발 방지가 필요 | 🟢 Minor | `trimmedEmail`, `trimmedPassword`, `trimmedPhone`으로 변경 |
| 5 | DRY(경미) | `LoginScreen.js:142,152,165,176,188,200,212,224,238` | `onChangeText={(v) => { setX(v); setError(''); }}` 형태의 "입력값 반영 + 에러 초기화" 래핑이 8개 `TextInput`에서 반복 | 🟢 Minor | `const withReset = (setter) => (v) => { setter(v); setError(''); };`로 헬퍼를 만들고 `onChangeText={withReset(setEmail)}` 형태로 통일 |
| 6 | 기존 ESLint 경고(회귀 스캔) | `ProjectScreen.js:181,186,197,204,206,210,214,217,1154` / `ScheduleScreen.js:121,131,204,211,1469,1517` | 신규 코드는 아니나 회귀 확인 중 `npx eslint`로 재검증한 결과 두 파일 합산 15개 warning 확인: `react-hooks/exhaustive-deps` 6건, `Unused eslint-disable directive` 4건, 미사용 변수(`newTime`,`newAmPm`,`displayTime`,`projDayLabel`) 4건, `no-unused-expressions`(삼항연산자를 statement로 사용) 1건(`ProjectScreen.js:1154`). 0 errors이므로 빌드는 막지 않지만 방치되면 계속 누적됨 | 🟢 Minor | 미사용 변수·무효 eslint-disable는 즉시 제거, `no-unused-expressions`는 `if (next.has(speaker)) next.delete(speaker); else next.add(speaker);`로 교체 |

---

## 코드 메트릭 요약

| 지표 | 측정값 | 권장값 |
|------|--------|--------|
| 평균 함수 길이 (CompanyScreen+LoginScreen 핸들러 8개) | 15.1줄 | <20줄 |
| 최대 함수 길이 | `handleSignup` (LoginScreen.js) 30줄 | <20줄 |
| 최대 중첩 깊이 (신규 파일) | 2단계 (가드절 위주, 양호) | <4단계 |
| 최고 복잡도 함수 | `handleSignup` (추정 11) | <10 |
| 신규 파일 인라인 스타일 위반 | 0건 (`CompanyScreen.js`/`LoginScreen.js`) | 0건 |
| 신규 파일 ESLint | 0 errors / 0 warnings | 0 |
| 알림 메일 체크박스 중복 개소 | JSX 4곳 + 스타일 2세트 + useEffect 2곳 | 0 (단일 출처) |
| 파일별 최대 줄 수 (회귀 스캔) | `ProjectScreen.js` 1975줄 | <300줄 |

---

## 우수 코드 패턴

**1. `css-guide.md` 완전 준수 (`CompanyScreen.js`, `LoginScreen.js`)**
두 파일 모두 `style={{`(raw 인라인 객체) 사용이 전무하다. 동적 색상(`statusColor(item.status) + '66'` 등)만 배열 두 번째 요소로 남기고 나머지는 전부 `StyleSheet.create`로 이관되어 있어, 기존에 여러 차례 반복됐던 "인라인 스타일 정리" 작업 없이도 처음부터 규칙을 지켜 작성됐다.

**2. 기존 유틸 재사용 (`CompanyScreen.js:15-16`)**
새 화면을 만들면서 날짜 계산을 직접 구현하지 않고 `daysUntil`/`daysLabel`(`dateUtils.js`), `formatDeadline`(`useProjectForm.js`)을 그대로 import해 사용한다. `todayStr()` 중복 정의 등 과거에 지적됐던 실수가 반복되지 않았다.

**3. RLS 의도를 설명하는 주석 (`storage.js:547-550, 562-564`)**
`updateProjectAsCompanyAdmin`/`getCompanyProjects` 위에 "왜 `.eq('user_id', ...)` 필터를 걸지 않는지", "왜 RLS만으로 안전한지"를 코드가 아니라 설계 의도(WHY) 중심으로 설명한다. 단순 WHAT 주석이 아니라 다음 개발자가 필터를 실수로 추가하지 않도록 막아주는 정확한 종류의 주석이다.

**4. 가드절(Early Return) 검증 스타일 (`LoginScreen.js:66-78`)**
`handleSignup`이 30줄로 길긴 하지만, 중첩 없이 순서대로 나열된 가드절만으로 구성되어 있어 각 검증 규칙을 한눈에 읽을 수 있다. 길이만 다듬으면(발견 사항 #2) 그대로 모범 사례가 될 구조다.

**5. 색상 토큰 일관성 (`theme.js:16`, `CompanyScreen.js`, `LoginScreen.js`)**
회사 관리자 전용 화면에서 쓰는 색을 `C.companyIndigo`로 `theme.js`에 먼저 정의한 뒤 두 신규 파일에서 하드코딩 없이 동일하게 참조한다. `statusColor`/`priorityColor` 맵 함수 패턴과 마찬가지로 색상 관리 원칙이 신규 코드에도 이어지고 있다.

---

## 종합 평가

**점수: 61/100** (2026-07-01: 63/100)

신규 코드(`CompanyScreen.js`, `LoginScreen.js`) 자체의 스타일 품질은 이전 리뷰 시점보다 명확히 좋아졌다 — ESLint 무결점, 인라인 스타일 무위반, 기존 유틸 재사용까지 챙겼다. 점수가 소폭 하락한 것은 신규 코드 때문이 아니라, 같은 시기에 `ProjectScreen.js`/`ScheduleScreen.js`에 추가된 "알림 메일 발송" 체크박스 기능이 두 파일에 중복 구현되면서 신규 폼과 편집 폼의 동작이 어긋난 것(발견 #1), 그리고 두 파일의 크기가 계속 불어나 이런 중복을 알아채기 더 어려워진 것(발견 #3) 때문이다.

우선순위 개선 순서:
1. `NotifyEmailCheckbox` 컴포넌트 + `useNotifyEmailSync` 훅 추출 → 4곳 중복 해소 및 신규/편집 폼 동작 통일 (발견 #1, 즉시 사용자 영향 있음)
2. `LoginScreen.js` `handleSignup` → `validateSignupForm()` 분리 (발견 #2)
3. `ProjectScreen.js`/`ScheduleScreen.js` 섹션 단위 컴포넌트 추출로 파일 크기 축소 계획 수립 (발견 #3)
4. 명명 재발(#4)·`onChangeText` 반복(#5)·기존 ESLint 경고(#6)는 다음 스타일 정리 작업 시 함께 처리
