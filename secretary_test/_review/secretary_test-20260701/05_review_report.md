# secretary_test 종합 코드 리뷰 리포트
감사일: 2026-07-01

---

## 종합 점수

| 영역 | 점수 | Critical | Major | Minor | 등급 |
|------|------|---------|-------|-------|------|
| 아키텍처 | 52/100 | 0 | 3 | 6 | D |
| 보안 | 30/100 | 2 | 3 | 5 | F |
| 성능 | 44/100 | 0 | 6 | 7 | F |
| 코드 스타일 | 63/100 | 0 | 3 | 9 | D |
| **종합** | **44/100** | **2** | **15** | **27** | **F** |

> 종합 점수 = (52 × 0.25) + (30 × 0.35) + (44 × 0.25) + (63 × 0.15) = 13.0 + 10.5 + 11.0 + 9.45 = **43.95 → 44/100**

---

## Executive Summary

2개 CRITICAL 보안 취약점(실제 API 키 번들 포함 위험, 평문 비밀번호 하드코딩)이 즉각적 위험을 초래하며 현재 상태로 배포 시 무제한 API 비용 청구 및 계정 탈취가 가능합니다. `storage.js` 파일이 보안·성능·아키텍처·스타일 4개 영역 모두에서 결함이 집중된 최고위험 핫스팟으로, 이 파일 하나의 리팩터링이 앱 전반의 품질을 가장 빠르게 끌어올립니다. `ScheduleScreen`·`ClientScreen` 두 화면은 성능 병목과 코드 복잡도가 겹쳐 있어 분리·최적화 작업이 시급합니다.

---

## 핫스팟 파일 TOP 5

| 순위 | 파일 | 감사 영역 수 | 이슈 건수 | 주요 문제 |
|------|------|------------|---------|---------|
| 1 | `src/services/storage.js` | 4개 전부 | 10건 | 평문 비밀번호 하드코딩(Critical), getCurrentUser() 과호출(High), login/switchAccount 중복 구조(High) |
| 2 | `src/screens/ClientScreen.js` | 3개 (아키텍처·성능·스타일) | 8건 | 1182줄 다중 책임, O(n×m) 렌더링(High), AI 요약 캐시 없음(Med) |
| 3 | `src/screens/ScheduleScreen.js` | 3개 (아키텍처·성능·스타일) | 7건 | 달력 O(셀×항목) 재계산(High), load() 이중 실행(High), urgencyAnim 누수(High) |
| 4 | `src/services/groqStt.js` | 3개 (보안·성능·스타일) | 4건 | HTTP 음성 전송(Med), buildTranscript O(n×m)(Low), countHint 중복(Med) |
| 5 | `src/screens/MeetingScreen.js` | 1개 (아키텍처, 최고 심각도) | 3건 | 2232줄 God Object(High), AI 시스템 프롬프트 계층 위반 2건(High) |

---

## 교차 분석 — 연관 패턴

### 패턴 A: storage.js — 구조 문제가 보안 + 성능 취약점을 동시에 생성

- **아키텍처**: `addMessageForUser`가 `userKey()` 추상을 우회하는 불일관성
- **보안**: 평문 비밀번호 하드코딩(CRITICAL) + API 키 AsyncStorage 평문 저장(HIGH) + 계정 전환 무인증(HIGH)
- **성능**: 모든 CRUD에서 `getCurrentUser()` AsyncStorage 중복 호출(HIGH)
- **스타일**: `login()`과 `switchAccount()` 동일 로직 2중 반복(HIGH)

`login`과 `switchAccount`의 코드 중복이 보안 취약점의 구조적 원인이다. `saveAndReturnUser()` 헬퍼로 통합할 때 비밀번호 해시 비교와 계정 전환 재인증을 반드시 함께 구현해야 한다.

---

### 패턴 B: useSwipeClose 복제 — 아키텍처(HIGH) + 스타일(HIGH) 동시 지적

- 아키텍처(HIGH): 3곳 중복 — `ScheduleScreen.js:40`, `ClientScreen.js:14`, `ProjectScreen.js:14`
- 스타일(HIGH): 2곳 중복 — `ScheduleScreen.js:40-62`, `ClientScreen.js:14-36`

`src/hooks/useSwipeClose.js`로 추출하면 3곳 모두 해소된다.

---

### 패턴 C: API 키 관리 3계층 동시 취약

- 보안(CRITICAL): `.env`의 실제 Groq/Gemini 키가 `EXPO_PUBLIC_` 접두사로 앱 번들에 포함됨
- 보안(HIGH): 사용자 입력 키가 AsyncStorage 평문 저장 (`storage.js:64-75`)
- 성능(MED): `askClaude()` 호출마다 `getApiKey()` + `getAiProvider()` AsyncStorage 재조회

`.env` 키 폐기 → SecureStore 마이그레이션 → 인메모리 캐싱을 순서대로 적용해야 한다.

---

### 패턴 D: ScheduleScreen — 성능(HIGH×4) + 스타일(MED) + 아키텍처(HIGH) 3중 부담

- 성능(HIGH): `load()` 이중 실행 (`ScheduleScreen.js:178, 196`)
- 성능(HIGH): `urgencyAnim` Animated.loop 정리 누락 → 배터리 소모
- 성능(HIGH): 달력 그리드 useMemo 없이 O(셀×항목) 매 렌더 재계산
- 아키텍처(HIGH): `useSwipeClose` 중복 (`ScheduleScreen.js:40`)

---

### 패턴 E: AI 시스템 프롬프트 계층 위반 → 보안 감사 사각지대

- 아키텍처(HIGH): `MeetingScreen.js:332-350`, `768-782` — 화면 컴포넌트 내부에 AI 프롬프트 인라인 정의
- 보안(MED): `claude.js:buildClientSystem()` — 거래처 연락처·히스토리 민감 데이터 3rd party AI 전송

`buildMeetingSummarySystem()`, `buildWorkTopicsSystem()`을 `claude.js`로 이동하면 아키텍처 일관성과 보안 감사 가시성이 동시에 확보된다.

---

## 🔴 즉시 조치 (Critical/High — 이번 스프린트)

| # | 우선순위 | 영역 | 파일:라인 | 문제 | 수정 방법 |
|---|---------|------|---------|-----|---------|
| 1 | Critical | 보안 | `.env:1-2` | 실제 API 키 EXPO_PUBLIC_ 접두사로 번들 포함 위험 | **즉시 두 키 폐기·재발급**, `.env`에서 실제 키 제거 |
| 2 | Critical | 보안 | `storage.js:20-27` | 비밀번호 평문 하드코딩 + 해시 없는 문자열 비교 | bcrypt/Argon2 해시 교체, `__DEV__` 가드 추가 |
| 3 | High | 보안 | `LoginScreen.js:87-98` | 자격증명(admin1234 등) UI 직접 노출 | `if (__DEV__)` 조건으로 감싸거나 완전 제거 |
| 4 | High | 보안 | `storage.js:45-51` | `switchAccount()` 재인증 없이 즉시 전환 가능 | 전환 전 현재 비밀번호 확인 모달 추가 |
| 5 | High | 보안 | `storage.js:64-75` | API 키 AsyncStorage 평문 저장 | `expo-secure-store` SecureStore로 교체 |
| 6 | High | 성능+보안 | `storage.js:89-92` | `getCurrentUser()` 모든 CRUD 중복 호출 | `_cachedUser` 인메모리 캐싱 도입 |
| 7 | High | 성능+스타일 | `ScheduleScreen.js:178` | `useEffect` + `useFocusEffect` load() 이중 실행 | `useEffect` 쪽 `load()` 호출 제거 |
| 8 | High | 성능 | `ScheduleScreen.js:181-187` | `Animated.loop` cleanup 누락 → 배터리 누수 | `return () => animation.stop()` 추가 |
| 9 | High | 아키텍처+스타일 | `ScheduleScreen.js:40` `ClientScreen.js:14` `ProjectScreen.js:14` | `useSwipeClose` 3중 복제 | `src/hooks/useSwipeClose.js` 추출 |
| 10 | High | 아키텍처+보안 | `MeetingScreen.js:332-350` `768-782` | AI 프롬프트 Presentation 레이어 인라인 정의 | `buildMeetingSummarySystem()` → `claude.js`로 이동 |
| 11 | High | 성능 | `ClientScreen.js:386-389` | 거래처 목록 O(n×m) 렌더링 | `historiesByClient` Map 사전 인덱싱 (useMemo) |
| 12 | High | 성능 | `ScheduleScreen.js:313` `ClientScreen.js:269` | AI 채팅 `history.indexOf(m)` O(n²) 패턴 | `.slice(1)`로 대체 |

---

## 🟠 단기 개선 (Medium — 다음 스프린트)

| # | 영역 | 파일:라인 | 문제 | 수정 방법 |
|---|------|---------|-----|---------|
| 13 | 성능 | `ScheduleScreen.js:384-466` | 달력 그리드 useMemo 없이 매 렌더 재계산 | `buildMonthGrid` + Map 인덱싱 useMemo |
| 14 | 성능 | `ScheduleScreen.js:201-223` | `daySchedules`, `dayProjects` 메모이제이션 누락 | `useMemo([schedules, selectedDate])` |
| 15 | 성능 | `ClientScreen.js:311-315` | AI 요약 캐시 없음 — 모달 열 때마다 API 재호출 | `useRef({})` 캐시 도입 |
| 16 | 성능 | `ClientScreen.js:320-321` | `fetchHistorySummary()` 이미 state에 있는 데이터 재조회 | state 변수 직접 참조 |
| 17 | 성능 | `HomeScreen.js:13-20` | 1초 인터벌로 HomeScreen 전체 재렌더 | `ClockDisplay` 별도 컴포넌트 분리 |
| 18 | 성능 | `claude.js:67-79` | `askClaude()` 매 호출마다 AsyncStorage 재조회 | 앱 시작 시 인메모리 캐싱 |
| 19 | 아키텍처 | `MeetingScreen.js` | 2232줄 God Object | `useAudioRecording`, `useDiarization` 훅 분리 |
| 20 | 아키텍처 | `ProjectScreen.js` | 1754줄 복잡도 | `useProjectAI`, `useProjectForm` 훅 분리 |
| 21 | 아키텍처 | `ClientScreen.js` | 1182줄 | 히스토리 CRUD 서브컴포넌트화 |
| 22 | 아키텍처+스타일 | 5개 화면 | `statusColor`, `priorityColor`, `tagColor` 4~5중 복제 | `src/utils/colors.js` 신설 |
| 23 | 스타일 | `SettingsScreen.js:39-102` | Groq/Grok 핸들러 2중 반복 | `maskApiKey()`, `createApiKeyHandlers()` 추출 |
| 24 | 스타일 | `storage.js:29-51` | `login`/`switchAccount` 동일 로직 (보안 수정과 병행 필수) | `saveAndReturnUser()` 내부 함수 추출 |
| 25 | 보안 | `groqStt.js:113, 150` | Pyannote URL HTTP 허용 — 음성 데이터 평문 전송 | URL 저장 전 `https://` 검증 추가 |
| 26 | 보안 | `storage.js:29-35` | 로그인 시도 횟수 제한 없음 | 연속 실패 5회 → 30초 잠금 |

---

## 🟡 장기 개선 (Low — 기술 부채 백로그)

| # | 영역 | 파일:라인 | 내용 |
|---|------|---------|-----|
| 27 | 보안 | `storage.js:33, 53-55` | 세션 만료 메커니즘 추가 |
| 28 | 보안 | `storage.js` 다수 | `JSON.parse` try/catch 누락 → `safeParseJSON()` 헬퍼 |
| 29 | 보안 | `claude.js:206-236` | 3rd party AI 전송 전 PII 토큰화 레이어 |
| 30 | 아키텍처 | `App.js:59` + 각 스크린 | `user` prop 드릴링 vs `getCurrentUser()` 혼용 → `UserContext` 단일화 |
| 31 | 아키텍처 | `src/` 전체 | `src/hooks/`, `src/utils/` 디렉토리 체계 신설 |
| 32 | 스타일 | `ClientScreen.js:100` | `[c, h, m, p, favs, me]` → 의미 있는 이름으로 교체 |
| 33 | 스타일 | `HomeScreen.js:39-42` `storage.js:378` | `todayStr()` 중복 → `src/utils/dateUtils.js` |
| 34 | 스타일 | `groqStt.js:55-57` `86-88` | `countHint` 생성 코드 중복 → `buildCountHint()` 추출 |
| 35 | 스타일 | 여러 파일 | 매직 넘버 상수화 (`ONE_DAY_MS`, `SWIPE_CLOSE_THRESHOLD`) |
| 36 | 성능 | `App.js:6-16` | 탭 스크린 eager import → `lazy: true` 지연 로딩 |

---

## TOP 10 액션 아이템

| 순위 | 항목 | 파일 | 예상 공수 |
|------|------|------|---------|
| 1 | 실제 API 키 즉시 폐기 및 재발급 | `.env` | 10분 (즉시) |
| 2 | `storage.js` 비밀번호 bcrypt 해시 교체 + `__DEV__` 가드 | `storage.js:20-27` | 2시간 |
| 3 | `LoginScreen` 자격증명 UI `__DEV__` 조건 추가 | `LoginScreen.js:87-98` | 30분 |
| 4 | `getCurrentUser()` 인메모리 캐싱 도입 | `storage.js:89-92` | 1시간 |
| 5 | `expo-secure-store` API 키 저장 마이그레이션 | `storage.js:64-75` | 3시간 |
| 6 | `useSwipeClose` `src/hooks/` 추출 (3곳) | `ScheduleScreen`, `ClientScreen`, `ProjectScreen` | 1시간 |
| 7 | `ScheduleScreen` `useEffect load()` 제거 + `Animated.loop` cleanup | `ScheduleScreen.js:178, 181` | 30분 |
| 8 | `MeetingScreen` AI 프롬프트 `claude.js`로 이동 | `MeetingScreen.js`, `claude.js` | 1시간 |
| 9 | `ClientScreen` `historiesByClient` Map + `history.indexOf()` slice 교체 | `ClientScreen.js:269, 386` | 2시간 |
| 10 | `switchAccount()` 재인증 모달 추가 | `storage.js:45-51` | 3시간 |

---

## 영역별 강점

**아키텍처**: Storage 완전 캡슐화, `askClaude()` Groq/Grok 전환 캡슐화, 순환 의존성 없는 단방향 의존성.

**보안**: SQL Injection/XSS/CSRF 구조적으로 불가능(AsyncStorage 전용, DOM 없음), API 키 UI 마스킹 구현, `_${user.id}` 접미사 계정별 데이터 논리 격리.

**스타일**: `KEYS` 상수 중앙화, `showAdd`·`aiLoading`·`grokMasked` 불리언 변수 명명 우수, `getX`/`addX`/`updateX`/`deleteX` CRUD 패턴 전체 균일.

---

## 수정 로드맵

**Week 1 — 보안 위기 대응**: API 키 폐기·재발급 → `storage.js` 비밀번호 bcrypt + `switchAccount` 재인증 → `expo-secure-store` 마이그레이션

**Week 2-3 — 성능·구조 핵심 개선**: `getCurrentUser()` 캐싱 → `useSwipeClose` 훅 추출 + `ScheduleScreen` 이중 load 제거 + Animated 정리 → `ClientScreen` Map 인덱싱 + slice 교체 → `MeetingScreen` AI 프롬프트 이동

**Week 4-6 — 대형 리팩터링**: `MeetingScreen.js` 2232줄 훅 분리 → `ScheduleScreen` useMemo 일괄 적용 → `ClientScreen` AI 요약 캐시 → `src/utils/colors.js` 신설

**장기 (3개월+)**: `UserContext` 도입 → `ProjectScreen.js` 훅 분리 → PII 익명화 레이어 → `src/hooks/`, `src/utils/` 디렉토리 체계 완성
