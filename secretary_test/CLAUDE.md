@AGENTS.md

# secretary_test 프로젝트 개요

## 앱 개요

**secretary_test**는 Expo(React Native) 기반의 개인 비서 앱입니다. 영업직·구매직 사용자를 위한 일정·거래처·프로젝트·메세지·회의록 통합 관리 앱으로, AI(Groq/Grok) 기반 자연어 비서 기능을 탑재하고 있습니다.

- **플랫폼**: Expo SDK (v53), React Native
- **네비게이션**: `@react-navigation/bottom-tabs`
- **저장소**: AsyncStorage (로컬 전용, 서버 없음)
- **AI**: Groq API (llama-3.3-70b-versatile) 또는 Grok API (grok-3) — 설정에서 전환 가능
- **음성 STT**: Groq Whisper (whisper-large-v3) + Pyannote 화자 분리(선택)

---

## 디렉토리 구조

```
secretary_test/
├── App.js                    # 진입점, BottomTab 네비게이터
├── app.json                  # Expo 설정 (expo-contacts, expo-audio, expo-media-library)
├── src/
│   ├── theme.js              # 전역 색상 팔레트 (C 객체)
│   ├── screens/
│   │   ├── HomeScreen.js     # 대시보드 (오늘 일정, 통계 카드)
│   │   ├── ScheduleScreen.js # 일정 관리 (달력, CRUD, AI 채팅)
│   │   ├── ClientScreen.js   # 거래처 관리 (히스토리, AI 요약)
│   │   ├── ProjectScreen.js  # 프로젝트 관리 (진행률 슬라이더, AI 지연 분석)
│   │   ├── MessageScreen.js  # 메세지함 (받은/보낸, 우선순위·상태 관리)
│   │   ├── MeetingScreen.js  # 회의록 (녹음, STT, 화자 분리, AI 요약)
│   │   ├── SettingsScreen.js # 설정 (API 키, 계정 전환, AI 공급자 선택)
│   │   └── LoginScreen.js    # 로그인
│   └── services/
│       ├── storage.js        # AsyncStorage CRUD + 샘플 데이터
│       ├── claude.js         # AI 호출 (Groq/Grok), 시스템 프롬프트 빌더
│       └── groqStt.js        # Whisper STT, 화자 분리(pyannote)
```

---

## 탭 구성 및 색상

| 탭 이름  | 색상 변수        | 주요 기능 |
|---------|-----------------|----------|
| 홈       | C.gold          | 대시보드, 오늘 일정·통계 |
| 일정     | C.accentBlue    | 월별 달력, 일정 CRUD, AI 일정 비서 |
| 거래처   | C.accentTeal    | 담당자 관리, 히스토리, AI 관계 요약 |
| 프로젝트 | C.red           | 프로젝트 CRUD, AI 지연 분석 |
| 메세지   | C.accentPurple  | 받은/보낸 메세지함 |
| 회의록   | C.accentTeal    | 녹음·파일 업로드, STT, AI 요약·태스크 추출 |
| 설정     | C.textSecondary | API 키, 계정 전환, Pyannote URL |

---

## 테마 색상 팔레트 (src/theme.js)

```js
C.bg           = '#09090E'   // 최하단 배경
C.surface      = '#111118'   // 카드 배경
C.surfaceHigh  = '#18191F'   // 모달 배경
C.border       = '#21222B'
C.borderHigh   = '#2E3040'
C.gold         = '#C4A35A'   // 홈 탭, 경고
C.goldDim      = '#7A6438'
C.textPrimary  = '#ECEAF5'
C.textSecondary= '#7B7D8D'
C.textDim      = '#3E404E'
C.accentBlue   = '#5B7FC4'   // 일정 탭
C.accentTeal   = '#4AADA0'   // 거래처·회의록
C.accentPurple = '#8B6FC4'   // 메세지 탭
C.red          = '#C45B5B'   // 프로젝트, 위험·긴급
```

---

## 데이터 모델 (AsyncStorage)

모든 데이터는 **사용자 ID별로 격리**됩니다 (`키_${user.id}` 형태).

### Schedule (일정)
```js
{
  id: string,           // Date.now().toString()
  date: 'YYYY-MM-DD',   // 대표 날짜 (시작일)
  time: 'HH:MM',        // 24시간 형식
  title: string,
  tag: '회의'|'업무'|'영업'|'개인'|'기타',
  notes: string,
  clientIds: string[],  // 관련 거래처 ID 배열
  startDate: 'YYYY-MM-DD HH:MM',  // 기간 일정 시작 (선택)
  endDate: 'YYYY-MM-DD HH:MM',    // 기간 일정 마감 (선택)
  createdAt: number,    // timestamp
}
```
- **기간 일정**: `startDate`/`endDate`가 있으면 달력에 바(bar)로 표시됨
- 날짜 필터링: `startDate <= selectedDate <= endDate` 범위로 표시

### Client (거래처)
```js
{
  id: string,
  name: string,         // 담당자 이름 (필수)
  company: string,      // 회사명 (필수)
  role: string,         // 직책
  contact: string,      // 개인 연락처 (필수)
  workContact: string,  // 직장 연락처 (선택)
  notes: string,
  createdAt: number,
}
```
- 즐겨찾기: 별도 키 `client_favorites_v1_${user.id}` 에 ID 배열로 저장
- 로그인한 사용자 본인은 목록에서 필터링됨

### History (거래처 히스토리)
```js
{
  id: string,
  clientId: string,
  date: 'YYYY-MM-DD',
  type: '미팅'|'통화'|'이메일'|'계약'|'기타',
  title: string,
  content: string,
  result: string,       // 결과 또는 다음 액션
  createdAt: number,
}
```

### Project (프로젝트)
```js
{
  id: string,
  title: string,
  deadline: 'YYYY-MM-DD',
  startDate: 'YYYY-MM-DD',  // 선택, 달력 바 표시용
  status: '진행중'|'위험'|'지연'|'완료'|'취소',
  progress: number,          // 0~100
  priority: '높음'|'보통'|'낮음',
  notes: string,
  clientIds: string[],       // 관련 거래처
  meetingRecordIds: string[], // 연결된 회의록
  updatedAt: number,
  createdAt: number,
}
```
- 상태 색상: 진행중=accentBlue, 위험=gold, 지연=red, 완료=accentTeal, 취소=textDim

### Message (메세지)
```js
{
  id: string,
  direction: 'received'|'sent',
  fromId: string,       // 발신자 계정 ID
  toId: string,         // 수신자 계정 ID
  sender: string,       // 표시 이름
  company: string,
  subject: string,
  content: string,
  priority: '긴급'|'일반'|'낮음',
  status: '미확인'|'확인'|'처리중'|'완료',
  createdAt: number,
  updatedAt: number,
}
```

### MeetingRecord (회의록)
```js
{
  id: string,
  title: string,
  transcript: string,   // [화자명]\n내용\n\n[화자명]\n... 형식
  summary: string,      // AI 요약
  source: 'recording'|'file',
  clientIds: string[],
  projectId: string,
  tasks: Array<{assignee, content, deadline, priority}>,
  createdAt: number,
}
```
- 트랜스크립트 화자 형식: `[화자 N]` 또는 수동 입력한 이름

---

## 인증 / 사용자 시스템

- **로컬 테스트 계정** 하드코딩 (서버 없음):
  - test@secretary.app / test1234 (테스트 계정, 개발팀)
  - admin@secretary.app / admin1234 (관리자, 운영팀)
  - kmj@secretary.app / test1234 (김민준, 삼성물산 구매팀장)
  - lsy@secretary.app / test1234 (이서연, 현대건설 기획팀 과장)
  - pjh@secretary.app / test1234 (박지훈, LG전자 영업이사)
  - csa@secretary.app / test1234 (최수아, SK텔레콤 마케팅 팀장)
- 로그인 후 `current_user_v1` 키에 저장, 앱 시작 시 복원
- 설정 탭에서 계정 전환 가능 (다중 계정 테스트용)
- 각 계정은 자신의 이름을 거래처 목록에서 필터링

---

## AI 서비스 (src/services/claude.js)

### AI 공급자 전환
- **Groq** (기본): `llama-3.3-70b-versatile` — Groq API Key 필요
- **Grok**: `grok-3` — xAI API Key 필요
- 설정 탭에서 전환, AsyncStorage `ai_provider` 키에 저장

### 주요 함수
| 함수 | 용도 |
|------|------|
| `askClaude(messages, systemPrompt, {raw})` | AI 호출 진입점 (공급자 자동 선택) |
| `buildScheduleSystem(schedules)` | 일정 AI 시스템 프롬프트 생성 |
| `buildClientSystem(clients, histories)` | 거래처 AI 시스템 프롬프트 생성 |
| `buildProjectDelaySystem(projects)` | 프로젝트 지연 분석 프롬프트 생성 |
| `buildTaskExtractionSystem()` | 회의록 태스크 추출 프롬프트 생성 |
| `fixForeignWordsInText(text)` | STT 결과 외국어 보정 |
| `normalizeAIDates(text)` | AI 응답의 날짜 형식 한국어로 정규화 |
| `stripNonKorean(text)` | 한국어·숫자·기본 부호만 남기고 제거 |
| `josa과와(word)` | 한국어 조사 선택 (과/와) |

### 일정 AI 동작 (JSON 파싱)
`create_schedule` 액션 JSON이 포함된 AI 응답을 감지하면 자동으로 일정 생성:
```json
{"action":"create_schedule","data":{"date":"YYYY-MM-DD","time":"HH:MM","title":"...","tag":"...","notes":"..."}}
```

### 프로젝트 AI 동작
`update_project` 액션 JSON으로 프로젝트 상태 업데이트 가능:
```json
{"action":"update_project","id":"...","changes":{"status":"...","progress":...}}
```

---

## STT / 화자 분리 (src/services/groqStt.js)

- **transcribeAudio**: Groq Whisper API → 텍스트 + 세그먼트 반환
- **diarizeSegments**: AI로 세그먼트별 화자 구분 (`[화자 N]` 태그 추가)
- **diarizeWithPyannote**: Pyannote 서버로 화자 분리 (선택적, 직접 서버 설정 필요)
- **convertToMonoViaServer**: Pyannote 서버로 모노 변환

Pyannote 서버 URL은 설정 탭에서 입력. `pyannote-server/` 폴더에 서버 코드 존재.

---

## 주요 UI 패턴

### 공통 패턴
- **Bottom Sheet Modal**: 하단에서 올라오는 `animationType="slide"` Modal
- **드래그 닫기(useSwipeClose)**: 모달 핸들을 아래로 드래그하면 닫힘 (`dy > 80` 또는 `vy > 0.8`)
- **달력 좌우 스와이프**: `PanResponder`로 달력 월 이동 (`dx < -60` 우측 → 다음달)
- **FAB(+) 버튼**: 각 탭 우하단, 추가 진입점
- **긴급도 애니메이션**: 마감 임박/초과 항목에 `Animated.loop` 테두리 깜빡임

### 일정 화면 특이사항
- `startDate`/`endDate`가 있는 일정은 달력에 색상 바(bar)로 표시
- 시간 입력: 오전/오후 버튼 + 12시간 형식 입력, 저장 시 24시간으로 변환
- `fmtDate()`, `fmtTime12()` 헬퍼로 숫자 입력 자동 포맷 (`-` 자동 삽입 등)

### 거래처 화면 특이사항
- 연락처 앱에서 직접 불러오기 (`expo-contacts`)
- 거래처 상세에 AI 관계 요약 자동 표시
- 히스토리 추가 시 AI 요약 자동 갱신
- 연결된 프로젝트·회의록 chip으로 표시, 탭하면 상세 모달

### 회의록 화면 특이사항
- `expo-audio`로 실시간 녹음 (`useAudioRecorder`)
- 녹음 또는 파일 업로드 → Whisper STT → AI 화자 분리 → 이름 수동 매핑
- AI 요약, 태스크 추출 JSON 파싱 후 ProjectScreen에 연결 가능
- 트랜스크립트 형식: `[화자명]\n발화 내용`

---

## AsyncStorage 키 목록

| 키 | 설명 |
|----|------|
| `schedules_v1_${userId}` | 일정 배열 |
| `clients_v1_${userId}` | 거래처 배열 |
| `histories_v1_${userId}` | 거래처 히스토리 배열 |
| `projects_v1_${userId}` | 프로젝트 배열 |
| `messages_v3_${userId}` | 메세지 배열 |
| `meeting_records_v1_${userId}` | 회의록 배열 |
| `client_favorites_v1_${userId}` | 즐겨찾기 ID 배열 |
| `user_profile_v1_${userId}` | 확장 프로필 |
| `current_user_v1` | 현재 로그인 유저 (userId 무관) |
| `claude_api_key` | Groq API 키 (userId 무관) |
| `grok_api_key` | Grok API 키 (userId 무관) |
| `ai_provider` | 'groq' \| 'grok' (userId 무관) |
| `pyannote_url` | Pyannote 서버 URL (userId 무관) |
| `work_topics_v1` | 작업 주제 (userId 무관) |

---

## 의존성 핵심 패키지

```json
{
  "@react-navigation/bottom-tabs": "탭 네비게이터",
  "@react-navigation/native": "네비게이션 컨테이너",
  "@react-native-async-storage/async-storage": "로컬 저장소",
  "@react-native-community/slider": "진행률 슬라이더 (ProjectScreen)",
  "expo-audio": "녹음 기능",
  "expo-contacts": "주소록 가져오기",
  "expo-document-picker": "파일 업로드",
  "expo-file-system": "파일 시스템 접근",
  "expo-media-library": "미디어 접근",
  "react-native-safe-area-context": "SafeArea 처리"
}
```

---

## 작업 이력 요약 (주요 기능 구현)

- 멀티 계정 시스템 (테스트 계정 6개, 계정별 데이터 격리)
- 거래처 수정 모달 (workContact 필드 추가)
- 모달 드래그 닫기 (useSwipeClose 공통 훅)
- AI 날짜 정규화 (normalizeAIDates — 응답 내 날짜를 한국어 형식으로 변환)
- 시간 입력 오전/오후 분리 (12h UI → 24h 저장)
- 달력 좌우 스와이프로 월 이동
- 기간 일정 달력 바 표시 (startDate~endDate 범위)
- 긴급도 Animated 테두리 깜빡임 (마감 3일 이내 = gold, 초과 = red)
- 일정·프로젝트 카드 통합 UI (동일 스타일 itemCard)

---

## 세션 작업 이력

### 2026-06-24

#### 회의록 저장 시 업무 주제 분석 자동 갱신 (`MeetingScreen.js`)

**변경 내용**
- `analyzeWorkTopics(recordsOverride?)` — 파라미터 추가
  - `recordsOverride`가 있으면 해당 목록 사용, 없으면 기존 `meetingRecords` state 사용
  - 신규 저장 직후 stale closure 없이 최신 목록으로 분석 가능
- `confirmSave()` 신규 저장 분기 — 3줄 수정
  - `addMeetingRecord()`의 반환값(업데이트된 전체 목록)을 `updated`로 캡처
  - `setMeetingRecords(updated)` 호출 → 기록 탭 목록 즉시 반영
  - `analyzeWorkTopics(updated)` 자동 호출 → 저장 즉시 업무 주제 재분석

**동작 방식**
1. 녹음/파일 STT 후 요약 생성 → 기록 저장
2. 저장 완료 즉시 백그라운드에서 업무 주제 분석 실행 (API 호출)
3. 저장된 기록 탭으로 이동 시 분석 결과 자동 반영
4. 기존 수동 "업무 주제 분석" 버튼도 그대로 동작

---

#### 태스크 추출 결과 전체 선택 버튼 (`MeetingScreen.js`)

**변경 내용**
- TASKS 섹션 헤더에 **전체 선택 / 전체 해제** 토글 버튼 추가
  - `tasks.length > 0`일 때만 헤더 우측에 표시
  - 전부 선택된 상태(`selectedTaskIndices.size === tasks.length`) → "전체 해제" 표시, 누르면 `new Set()`으로 초기화
  - 일부/미선택 상태 → "전체 선택" 표시, 누르면 `tasks.map((_, i) => i)`로 전체 인덱스 선택
- `taskSelectAllText` 스타일 추가 (`C.accentTeal`, 12px)
- 기존 개별 행 선택(toggle) 동작 변경 없음

---

#### CSS 스타일 정리 1차 (`HomeScreen.js`, `LoginScreen.js`, `ClientScreen.js`)

**변경 내용** (`css-guide.md` 규칙 적용)
- **인라인 스타일 → StyleSheet 이관**: 세 파일 합산 43개 인라인 스타일 제거
- **미사용 스타일 제거**: `clockText` (HomeScreen), `chevron` · `detailContact` · `contactLink` (ClientScreen)
- **주요 추가 스타일**
  - `LoginScreen`: `loginBtnDisabled`
  - `HomeScreen`: `flex1`, `sectionLast`, `aiRowBordered`
  - `ClientScreen`: `flex1`, `spacerH20`, 모달 높이 변형 5종 (`h80pct`~`maxH90pct`), 간격 모디파이어 8종, 레이아웃 행 4종 (`nameStarRow`, `editCloseRow`, `historyActionRow`, `projDeadlineRow`), `borderBottom`, `transcriptSegments`, `speakerLabel`, `opacity40` 등 총 28종
- **`sendBtn`**: 기존 인라인 `backgroundColor: C.accentTeal` → StyleSheet에 통합, 비활성 시 `opacity40` 사용

**공통 스타일 메모** (추후 분리 후보)
- `flex1`, `scrollPB*`, `inputLabelSpacing`, `borderBottom`, 모달 높이 변형 패턴은 나머지 스크린에서도 반복될 예정 → `css-todo.md` 참고
