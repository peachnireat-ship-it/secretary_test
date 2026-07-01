# 아키텍처 감사 리포트

대상: `C:\Users\user\secretary_test`
날짜: 2026-07-01
점수: 52 / 100

---

## 요약

Expo(React Native) 모바일 앱으로 Screens → Services → Storage 2계층 구조는 방향이 올바르다. 순환 의존성은 없으며 screens 에서 AsyncStorage 직접 접근도 없다. 핵심 문제는 MeetingScreen.js(2232줄) God Object, `useSwipeClose`·색상 유틸 함수의 다중 복제, 회의 AI 시스템 프롬프트 2개가 서비스 레이어 대신 화면 안에 직접 작성된 계층 위반이다.

---

## 구조 개요 (의존성 맵)

```
App.js
  └── screens/HomeScreen.js      → services/storage.js, services/location.js
  └── screens/ScheduleScreen.js  → services/storage.js, services/claude.js
  └── screens/ClientScreen.js    → services/storage.js, services/claude.js
  └── screens/ProjectScreen.js   → services/storage.js, services/claude.js
  └── screens/MeetingScreen.js   → services/storage.js, services/claude.js, services/groqStt.js
  └── screens/MessageScreen.js   → services/storage.js
  └── screens/SettingsScreen.js  → services/storage.js
  └── screens/LoginScreen.js     → services/storage.js

services/claude.js   → services/storage.js (getApiKey, getGrokApiKey, getAiProvider)
services/groqStt.js  → services/storage.js, services/claude.js
services/location.js → expo-location (외부만)
services/storage.js  → @react-native-async-storage (외부만)
```

순환 의존 없음. 의존 방향: 항상 screens → services → 외부.

---

## 발견 사항

### [심각도: HIGH] MeetingScreen.js God Object — 2232줄, 6개 이상 책임 혼재

- 위치: `src/screens/MeetingScreen.js` (전체)
- 설명: 단일 파일이 (1) 녹음 타이머·제어, (2) 파일 피킹·변환, (3) Whisper STT 오케스트레이션, (4) 화자 분리 워크플로우 (LLM + Pyannote), (5) AI 요약 생성, (6) 태스크 추출·관리, (7) 회의록 CRUD, (8) 업무 주제 분석을 모두 담당한다. useState 선언만 30개 이상, 비동기 함수 12개 이상이 하나의 컴포넌트에 혼재한다.
- 권고: 녹음 로직 → `useAudioRecording` 훅, STT+화자분리 파이프라인 → `useDiarization` 훅, 태스크 추출 로직 → `useTaskExtraction` 훅으로 분리. 목표 파일 크기 600줄 이하.

### [심각도: HIGH] `useSwipeClose` 훅 3중 복제

- 위치: `src/screens/ScheduleScreen.js:40`, `src/screens/ClientScreen.js:14`, `src/screens/ProjectScreen.js:14`
- 설명: 동일한 `PanResponder` 기반 드래그 닫기 훅이 3개 파일에 완전히 동일한 코드로 복사되어 있다 (각 20줄). 하나를 수정할 때 나머지도 수동으로 맞춰야 하는 구조.
- 권고: `src/hooks/useSwipeClose.js`로 추출하고 3곳에서 import 교체.

### [심각도: HIGH] AI 시스템 프롬프트 2개가 Presentation 레이어에 정의됨

- 위치: `src/screens/MeetingScreen.js:332~350` (회의 요약 프롬프트), `src/screens/MeetingScreen.js:768~782` (업무 주제 분석 프롬프트)
- 설명: 회의 요약 시스템 프롬프트와 업무 주제 분석 프롬프트가 화면 컴포넌트 내부 핸들러 함수에 인라인으로 작성되어 있다. 반면 `ScheduleScreen`, `ClientScreen`, `ProjectScreen`은 `buildScheduleSystem()`, `buildClientSystem()`, `buildProjectDelaySystem()`을 claude.js에서 올바르게 import한다. 같은 앱 내에서도 계층 원칙이 일관되지 않다.
- 권고: `buildMeetingSummarySystem()`, `buildWorkTopicsSystem()` 함수를 `services/claude.js`에 추가하고 MeetingScreen에서 import.

### [심각도: MED] 색상 유틸 함수 4~5중 복제

- 위치:
  - `statusColor()`: HomeScreen.js:29, MeetingScreen.js:1947, MessageScreen.js:22, ProjectScreen.js:171, ScheduleScreen.js:1280 (5곳)
  - `priorityColor()`: MeetingScreen.js:1957, MessageScreen.js:18, ProjectScreen.js:182, ScheduleScreen.js:1271, ClientScreen.js:1052 (5곳)
  - `tagColor()`: HomeScreen.js:34, ScheduleScreen.js:1275 (2곳)
- 설명: 동일한 색상 매핑 함수들이 각 스크린 파일마다 독립적으로 정의되어 있다. 색상 로직 변경 시 5개 파일을 동시에 수정해야 한다.
- 권고: `src/utils/colors.js` 또는 `src/theme.js`에 통합 후 각 스크린에서 import.

### [심각도: MED] ProjectScreen.js 1754줄 — 과도한 복잡도

- 위치: `src/screens/ProjectScreen.js` (전체)
- 설명: 프로젝트 CRUD, AI 지연 분석, 달력 바 표시, 복수 모달 상태 관리가 단일 파일에 혼재. MeetingScreen만큼 극단적이지 않지만 500줄 임계를 크게 초과한다.
- 권고: AI 분석 관련 훅(`useProjectAI`), 프로젝트 폼 상태(`useProjectForm`)로 분리 검토.

### [심각도: MED] ClientScreen.js 1182줄 — 다중 책임

- 위치: `src/screens/ClientScreen.js` (전체)
- 설명: 거래처 CRUD, 히스토리 관리, AI 관계 요약, 즐겨찾기, 연락처 앱 연동이 단일 파일에 혼재.
- 권고: 히스토리 CRUD와 AI 요약을 별도 서브컴포넌트 또는 훅으로 분리.

### [심각도: LOW] `addMessageForUser` / `updateMessageForUser`가 `userKey()` 추상을 우회

- 위치: `src/services/storage.js:258~282`
- 설명: 대부분의 storage 함수는 `userKey()` 헬퍼로 현재 사용자 ID를 자동 조회한다. 그러나 `addMessageForUser(userId, ...)` 와 `updateMessageForUser(userId, ...)` 는 userId를 파라미터로 받아 직접 키를 구성 (`${KEYS.messages}_${userId}`)한다. 동일 레이어 내에서도 추상화 일관성이 깨진다.
- 권고: 두 함수도 `userKey()` 패턴으로 통일하거나, 명시적 userId 파라미터를 받는 low-level 버전임을 주석으로 명확화.

### [심각도: LOW] `user` prop 드릴링과 `getCurrentUser()` 직접 호출 공존

- 위치: `App.js:59`, 각 스크린
- 설명: `user` 객체가 `App.js → TabNavigator → HomeScreen, MessageScreen, SettingsScreen`으로 prop으로 전달된다. 그러나 `ScheduleScreen`, `ClientScreen`, `ProjectScreen`, `MeetingScreen`은 `getCurrentUser()`를 storage에서 직접 호출하는 혼용 패턴이다. 두 가지 사용자 컨텍스트 접근 방식이 병존한다.
- 권고: React Context (`UserContext`) 도입으로 단일 소스화, 또는 모든 스크린을 storage 직접 호출로 통일.

### [심각도: LOW] `src/hooks/`, `src/utils/` 디렉토리 부재

- 위치: `src/` (전체 구조)
- 설명: 재사용 가능한 훅(`useSwipeClose`, `useNow`)과 유틸리티(`statusColor`, `priorityColor`, `tagColor`)를 담을 디렉토리가 없어 스크린 내부에 중복 정의가 계속 쌓이고 있다.
- 권고: `src/hooks/`, `src/utils/` 디렉토리 신설.

---

## 잘 설계된 부분

1. **Storage 추상화 완전성**: 모든 스크린에서 `AsyncStorage` 직접 접근이 없다. storage.js가 AsyncStorage를 완전히 캡슐화하며, `userKey()` 헬퍼로 사용자별 데이터 격리를 일관되게 처리한다.

2. **AI 공급자 추상화**: `askClaude()` 함수 하나로 Groq/Grok 전환을 완전히 캡슐화한다. 스크린은 어떤 공급자가 사용 중인지 알 필요가 없다. provider 전환 로직이 단일 서비스 파일에만 존재한다.

3. **단방향 의존성 흐름 준수**: 순환 의존성이 없다. services는 screens를 import하지 않는다. location.js가 외부 라이브러리만 의존하는 등 하위 계층이 상위 계층을 역참조하는 케이스가 없다.

---

## 개선 로드맵

### 즉시 수정 (HIGH)

1. `src/hooks/useSwipeClose.js` 추출 → ScheduleScreen, ClientScreen, ProjectScreen의 중복 제거
2. `buildMeetingSummarySystem()`, `buildWorkTopicsSystem()` 함수를 `services/claude.js`로 이동, MeetingScreen 인라인 프롬프트 교체
3. MeetingScreen.js 분해 시작: `useAudioRecording` 훅 우선 추출 (녹음 관련 state 8개 + 핸들러)

### 다음 스프린트 (MED)

4. `src/utils/colors.js` 신설 — `statusColor`, `priorityColor`, `tagColor` 통합
5. ProjectScreen.js 분해: AI 분석 훅 분리
6. ClientScreen.js 분해: 히스토리 섹션 서브컴포넌트화

### 기술 부채 등록 (LOW)

7. `UserContext` 도입으로 user prop 드릴링 / getCurrentUser() 직접 호출 혼용 해소
8. `addMessageForUser` / `updateMessageForUser` 패턴 일관성 정리
9. `src/hooks/`, `src/utils/` 디렉토리 체계 수립
