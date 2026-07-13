@AGENTS.md

## 🚀 프로젝트 플러그인 설치 안내

이 프로젝트에서는 `harness` 플러그인을 사용합니다. Claude Code를 켜신 후 아래 명령어를 입력해 주세요.

```bash
/plugin install harness@harness-marketplace --scope project
/reload-plugins
```

---

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
- 상태 색상: 진행중=accentBlue, 위험=red, 지연=gold, 완료=accentTeal, 취소=textDim

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
  diarizeSource: 'pyannote'|'ai'|null,  // 화자 분리 방식(선택). 과거 데이터/미해당 시 null — 배지 미표시
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

## 하네스: secretary_test 개발 자동화

**목표:** 기능 구현·버그 수정·스타일 정리·QA 검증을 developer/style-guard/qa 에이전트 팀이 자동 처리

**트리거:** secretary_test 개발 작업(기능 추가, 버그 수정, 스타일 정리, 검증) 요청 시 `secretary-orchestrator` 스킬을 사용하라. 단순 질문은 직접 응답 가능.

**변경 이력:**
| 날짜 | 변경 내용 | 대상 | 사유 |
|------|----------|------|------|
| 2026-06-29 | 초기 구성 | 전체 | - |
| 2026-06-29 | 드라이런 수정: raw:true 가이드 추가, qa 루프 경로 명시, developer 통신 경로 명확화 | feature-dev, qa 스킬, developer.md, orchestrator | 드라이런 테스트 이슈 #1~#4 수정 |
| 2026-06-30 | 모델 opus→sonnet 변경, qa subagent_type:general-purpose+Bash 추가, 오케스트레이터 Agent 호출 절차 명시 | developer.md, style-guard.md, qa.md, secretary-orchestrator | 하네스 감사 drift 수정 |
| 2026-06-30 | developer·style-guard subagent_type:general-purpose 추가, 오케스트레이터 Agent 호출 형식에 subagent_type 추가 | developer.md, style-guard.md, secretary-orchestrator | 드라이런 이슈 #1~#2 수정 |
| 2026-06-30 | 실행 모드 표기 수정(에이전트 팀→서브 에이전트), SendMessage 데드 링크 제거, 통신 프로토콜 반환값 기반으로 정정 | secretary-orchestrator, qa/SKILL.md, developer.md, style-guard.md, qa.md | 드라이런 이슈 #1~#3 수정 |

---

## 세션 작업 이력

### 2026-07-14

#### 영문 혼용 회사명 AI 요약 손상 데이터 복구 (`supabase/fix_client_ai_summary.js`)

**배경**: 과거 `stripNonKorean()`이 영문 알파벳을 낱개로 지워버리던 버그(현재는 `81dc55f`/`7335cbb`/`bacf176`/`dffd485`로 이미 수정됨)로 인해, "SK텔레콤"·"LG전자"·"HNIX" 등 영문이 섞인 회사명을 가진 거래처의 `clients.ai_summary`가 Supabase에 깨진 채로 남아있었음. 재발 방지 코드(`raw:true` + `fixForeignWordsInText`)는 이미 배포됐지만, 이미 저장된 과거 데이터는 복구되지 않은 상태로 방치되어 있었음(1회성 복구 스크립트는 작성돼 있었으나 미실행·미커밋 상태로 발견됨).

**실행**: Groq API 키를 `.env`에 저장하지 않고 PowerShell 세션에만 `$env:EXPO_PUBLIC_GROQ_API_KEY`로 임시 설정 후 스크립트 실행(실행 후 `Remove-Item Env:`로 정리) — 보안 리뷰(#1 `.env` 실키 제거)와 충돌하지 않는 방식으로 진행.

**결과**: 대상 4건(SK텔레콤 최수아, LG전자 박지훈×2, HNIX test1) 전부 성공. 복구 전 텍스트에서 "텔레콤의"(SK 잘림), "전자"(LG 잘림), "의 1 과장"(HNIX/test 잘림)처럼 실제로 손상돼 있던 것을 확인, 복구 후 회사명·이름이 정상 표기되고 문장도 자연스럽게 재생성됨. 스크립트는 `supabase/` 아래 커밋해 향후 동일 유형 데이터 손상 재발 시 참고용으로 보존.

---

### 2026-07-13

#### Pyannote 화자 분리 엔진 트러블슈팅 → sherpa-onnx로 전면 교체

**배경**: Render 무료 티어(512MB)에서 `pyannote.audio`(PyTorch) 파이프라인이 반복적으로 OOM. 07-10부터 이어진 문제를 하루 동안 순차적으로 파고들다 근본 해결로 전환.

1. `53b5915` — OOM(502): `diarize()` 추론을 `torch.inference_mode()`로 감싸 autograd 그래프 추적 제거, `torch.set_num_threads(1)` + `OMP_NUM_THREADS`/`MKL_NUM_THREADS=1`로 스레드풀 메모리 축소, `requirements.txt`에 `pyannote.audio<4.0` 상한 추가
2. `0762d0b` — `torchaudio.list_audio_backends` 제거로 인한 500: `get_pipeline()`에 `['soundfile']` 반환 shim 주입해 우회
3. `81b9c0e` — `pyannote.audio==3.4.0`으로 정확히 버전 고정, 인증 파라미터명을 `use_auth_token`으로 일치
4. `d19f886` — `huggingface_hub`의 `hf_hub_download`가 `use_auth_token`→`token`으로 개명된 것 대응: `inspect.signature` 기반 방어적 shim 추가
5. `aab1cb9` — `torchaudio.AudioMetaData` 누락으로 `pyannote.audio` import 자체가 실패 → 빈 stub 클래스 주입
6. `524b496` — `hf_hub_download` shim이 `core/pipeline.py`에만 적용되어 있어 `core/model.py`·`speaker_verification.py`에서 재발 → `_patch_hf_hub_download_compat()` 헬퍼로 일반화해 3개 모듈 전부 적용
7. `5b0330b` — PyTorch 2.6부터 `torch.load()`의 `weights_only` 기본값이 `True`로 바뀌어 pyannote 사전학습 체크포인트 로딩 실패 → `weights_only=False` 강제 shim
8. `353b10c` — 위 shim이 `weights_only=None`으로 명시 호출되는 경우 `setdefault`가 무효화됨을 발견 → 값 자체를 확인해 `None`도 `False`로 보정
9. `bdd7698` — `torch.load(mmap=True)`로 체크포인트 로딩 피크 메모리 절감 시도 — **OOM 근본 해결 안 됨**
10. **`8e7dc4e`(핵심 결정)** — PyTorch 계열 의존성(torch/torchaudio/pyannote.audio/lightning/huggingface_hub)을 전부 제거하고 **ONNX Runtime 기반 sherpa-onnx로 엔진 교체**. segmentation은 기존과 동일한 모델의 ONNX 변환판(6.6MB), embedding은 CAM++ voxceleb 영어 모델(28MB)로 대체. 두 모델 모두 HF 게이트 인증 불필요. 로컬 실측: 초기화 0.56초, 처리 3.6초, 다중 화자 세그먼트 정상 반환 확인
11. `9994ada` — 실제 6분 오디오로 측정한 처리 시간이 실시간의 약 1.26배(7.5분)로 확인되어, pyannote 서버 경로 사용 시에만 "오디오가 길면 실시간보다 오래 걸릴 수 있어요" 안내 문구 추가(AI 폴백 경로는 기존 메시지 유지)

**진단 방법 메모**: 이번 세션도 07-10과 동일하게 `/health`로는 안 드러나는 `get_pipeline()` 내부 에러를 실제 오디오 curl 업로드로 재현하며 단계별로 확인. 매 단계 라이브러리 내부 소스(PyPI)를 직접 확인해 정확한 원인(파라미터명 변경, 기본값 변경, shim 무효화 조건)을 특정한 뒤 수정.

---

#### 거래처 연락처 등록 모바일 모달 버그 수정 및 웹 대안 기능 추가 (`7f6bc5b`)

- 안드로이드에서 Modal→Modal 전환(연락처 가져오기 / 직접 입력) 시 두 번째 모달이 렌더링되지 않는 레이스 컨디션을 `setTimeout`으로 회피
- `expo-contacts`가 웹에서는 항상 권한 거부를 반환해 접근 불가능 → 웹 전용 "텍스트 붙여넣기로 가져오기" 기능 추가, 플랫폼별로 연락처 소스 옵션 분리 노출
- 회의록 요약에 외국어 교정(`fixForeignWordsInText`) 적용 및 에러 처리 개선 포함

---

### 2026-07-10

#### pyannote-server `/health` 엔드포인트 추가 및 Render 배포 트러블슈팅

**배경**: `SettingsScreen.js`의 "연결 확인" 버튼(`handleTestPyannote`)이 저장된 pyannote 서버 URL로 `GET ${url}/health`를 호출하도록 되어 있었으나(7/8 Supabase 마이그레이션 커밋 `9c2d6f8`에 포함), `pyannote-server/app.py`에는 해당 라우트가 없어 항상 실패하던 상태로 방치되어 있었음.

**서버 코드 수정**
- `1dd91f1` — `pyannote-server/app.py`에 `/health` GET 라우트 추가. 화자 분리 파이프라인 로드 없이 즉시 `{"status":"ok"}` 반환
- `08b326f` — 모듈 최상단에서 무조건 실행되던 `from pyannote.audio import Pipeline`을 `get_pipeline()` 내부로 지연 로딩. torch/pytorch_lightning 등 무거운 의존성 로드가 Flask 기동(포트 바인딩)을 막고 있었기 때문

**Render 배포 트러블슈팅 (시행착오 순서대로)**
1. **Build 실패**: `Could not open requirements file: ... requirements.txt`
   - 원인: Render에 연결된 GitHub 저장소(`secretary_test`)가 로컬 모노레포(`C:\Users\user`) 전체를 그대로 미러링하고 있어, 실제 경로가 `secretary_test/pyannote-server/requirements.txt`인데 Root Directory가 `pyannote-server`로만 설정됨
   - 조치: Root Directory를 `secretary_test/pyannote-server`로 수정
2. **Start 실패**: `Running 'uvicorn main:app ...'` → `uvicorn: command not found`
   - 원인: FastAPI/ASGI용 기본 템플릿 Start Command가 남아있었음(이 프로젝트는 Flask, 파일명도 `main.py`가 아닌 `app.py`)
   - 조치: Start Command를 `python app.py`로 수정
3. **포트 바인딩 타임아웃**: `No open ports detected` 반복 → `Port scan timeout reached ... Deploy cancelled`
   - 1차 원인 추정(메모리 부족)은 Metrics 확인 결과 배제됨
   - 실제 원인: Python 표준출력 버퍼링으로 인해 Flask 기동 로그/에러가 전혀 안 보여 진단 불가 상태였음
   - 조치: Start Command를 `python -u app.py`로 변경(버퍼링 비활성화) → Flask 정상 기동 로그 확인됨 → 이후 `/health` 200 OK 확인 완료

**최종 확인**: `curl https://secretary-test.onrender.com/health` → `200 {"status":"ok"}` (CORS 헤더 부재로 웹에서 "연결 실패" 재발 → `d075d7b`에서 `after_request` 훅으로 `Access-Control-Allow-*` 헤더 추가 후 웹 "연결 확인" 성공 확인)

**후속 조치**: `requirements.txt`의 `torch`가 버전/빌드 제한 없이 설치되어 CUDA(GPU)용 풀빌드(nvidia-cu* 패키지 다수 포함, 2GB+)가 깔리던 문제를 `d9cd189`에서 해결. `--extra-index-url https://download.pytorch.org/whl/cpu` 추가로 `torch-X.X.X+cpu` CPU 전용 빌드가 선택되도록 수정(로컬 `pip install --dry-run`으로 확인 완료). Render 무료 플랜(GPU 없음)에서 불필요한 설치 용량·임포트 부담 제거.

---

#### pyannote-server 공유 무료 티어 보호 안전장치 추가

**배경**: pyannote-server가 Render 무료 티어(단일 워커, 512MB)에서 전체 앱 사용자가 공유하는 구조인데, 인증·동시성 제한·용량 제한이 전혀 없어 남용/과부하에 취약했음.

**조치 (`037eeeb`)**
- `check_api_key()` — `PYANNOTE_API_KEY` 환경변수가 설정된 경우에만 `/mono`, `/diarize`에서 `X-API-Key` 헤더 검증(401). 미설정 시 기존처럼 통과(무중단 롤아웃)
- `_busy_lock`(`threading.Lock`, non-blocking) — 동시 요청 1건만 처리, 나머지는 429
- `app.config['MAX_CONTENT_LENGTH'] = 50MB`, `MAX_AUDIO_DURATION_SEC = 600`(10분, `ffprobe`로 측정 후 초과 시 400)
- `check_and_bump_quota()` — `X-User-Id`(Supabase user id)별 일일 화자 분리 20회 제한, 서버 메모리 저장(재배포/슬립 시 초기화됨, 영속 아님)
- 클라이언트(`groqStt.js`)는 `getCurrentUser()`의 user id를 `X-User-Id`로, `EXPO_PUBLIC_PYANNOTE_API_KEY`를 `X-API-Key`로 전송하도록 수정

**환경변수 설정 트러블슈팅**: Render에 `PYANNOTE_API_KEY`를 여러 차례 추가해도 반영 안 되는 문제 발생 → `055b44d`에서 시작 시 `설정 여부/길이`만 로그로 남기는 디버그 라인 추가해 원인 진단 → 실제 원인은 **Key 이름 오타**(`PYANNOTE_API` — `_KEY` 누락). 이름 수정 후 정상 작동 확인(`401`/`400` 응답 curl로 검증).

---

#### 화자 분리 방식(pyannote/AI) 배지 추가

**배경**: `diarizeWithPyannote()` 실패 시 AI(LLM) 방식으로 조용히 폴백하는 구조라, 사용자가 실제로 어떤 방식으로 화자 분리가 됐는지 화면에서 알 수 없었음.

**1차 구현 (`caef0f6`)**: `groqStt.js`의 `diarizeWithPyannote()`에 성공/실패 사유별 `console.log`/`console.warn` 추가(URL 미설정 / 서버 응답 실패 / 빈 세그먼트 / 요청 실패 4가지 분기).

**2차 구현 — UI 배지 (`secretary-orchestrator` 파이프라인, developer→style-guard→qa)**
- `useDiarization.js`: `diarizeSource` state(`'pyannote'|'ai'|null`) 추가, `diarize()` 호출 시 결과에 따라 설정, `resetDiarization()`에서 초기화
- `MeetingScreen.js`: 저장 전 미리보기 TRANSCRIPT 헤더에 "Pyannote 서버"(accentTeal)/"AI 방식"(textSecondary) 배지 렌더링
- **버그**: 최초 구현 시 배지 조건이 `!!rawTranscript && !!diarizeSource`였는데, `rawTranscript`는 화자 태그 정규식(`[화자 N]`) 매치 여부에 따라서만 채워지는 별도 state라 실제로는 배지가 안 보이는 경우가 있었음(사용자가 실기기 테스트로 발견, qa는 코드 레벨 검증만 해서 놓침) → `!!diarizeSource` 단독 조건으로 수정

**3차 구현 — 기록 탭까지 확장 (`66344fe`)**: 저장 시(`confirmSave`) `diarizeSource`를 `addMeetingRecord()`에 포함해 영속화. 기록(저장된 회의록) 탭 TRANSCRIPT 헤더에도 동일 배지 추가(`item.diarizeSource` 기반, 과거 데이터는 필드 없어 미표시). 재분리(`confirmRediarize`) 완료 시 항상 `diarizeSource: 'ai'`로 갱신(재분리는 LLM 전용이므로).
- **Supabase 스키마 변경 필요**: `storage.js`가 AsyncStorage가 아니라 실제로는 **Supabase**를 쓰고 있음(이 문서의 "저장소: AsyncStorage" 표기는 구식 정보 — 하단 데이터 모델 절 참고). `MEETING_KEYMAP`에 `diarizeSource: 'diarize_source'` 매핑 추가만으로는 부족하고, 실제 Supabase DB에 컬럼이 있어야 함. `supabase/patch_meeting_records_diarize_source.sql` 신규 작성(`alter table meeting_records add column if not exists diarize_source text;`) → 사용자가 Supabase SQL Editor에서 직접 실행 완료.

---

#### pyannote 실제 화자 분리(`/diarize`) 미작동 트러블슈팅

**배경**: `/health` 연결 확인은 성공하는데, 실제 오디오 분석 시 계속 AI(LLM) 방식으로만 폴백되는 문제 발생. `/diarize`에 실제 오디오 파일로 직접 curl 호출하여 단계별로 원인을 재현·확인.

1. **`HF_TOKEN 환경변수가 설정되지 않았습니다`(500)**: `/health`는 이 토큰을 쓰지 않아 계속 정상으로 보였지만, `get_pipeline()`은 `HF_TOKEN` 없이는 항상 실패. Render에 `HF_TOKEN` 미설정 상태였음(설정했다고 착각했거나 실제로 저장 안 된 상태) → 사용자가 HuggingFace 토큰 발급 후 Render 환경변수에 추가. `c973b1e`에서 시작 시 설정 여부 로그 추가해 `True (len=37)` 확인.
2. **`Pipeline.from_pretrained() got an unexpected keyword argument 'use_auth_token'`(500)**: 최신 `pyannote.audio`가 `use_auth_token` 대신 `token` 키워드를 요구하도록 변경됨(라이브러리 버전업으로 인한 API 변경, `requirements.txt`에 `pyannote.audio>=3.1`로 버전 미고정이라 최신판이 설치됨). `1ada151`에서 `use_auth_token=HF_TOKEN` → `token=HF_TOKEN`으로 수정.
3. **`403 Cannot access gated repo ... pyannote/speaker-diarization-community-1`**: `pyannote/speaker-diarization-3.1` 파이프라인이 내부적으로 별도의 gated 모델(`pyannote/speaker-diarization-community-1`)도 참조함. 기존에 `speaker-diarization-3.1`/`segmentation-3.0`에만 접근 동의했었고 이 모델엔 동의 안 한 상태였음 → HuggingFace에서 해당 모델 페이지 접근 동의 완료(동의는 즉시 적용, 재배포 불필요).

**진단 방법 메모**: `curl -X POST -H "X-API-Key: ..." -H "X-User-Id: ..." -F "file=@테스트.wav" https://secretary-test.onrender.com/diarize` 로 실제 오디오 업로드를 재현하면 `/health`로는 드러나지 않는 `get_pipeline()` 내부 에러(HF_TOKEN, 파라미터명, gated 모델 접근권한)를 그대로 확인할 수 있음. 로컬에서 `ffmpeg -f lavfi -i "sine=frequency=440:duration=3"`로 테스트용 짧은 wav 생성 가능. Render 무료 티어 콜드스타트 시 첫 요청은 최대 ~100초 소요됨.

---

### 2026-07-01 ~ 2026-07-03

#### 종합 코드 리뷰 리포트 36개 항목 전량 조치 완료

**리뷰 실행 (2026-07-01)**
- `code-review-orchestrator` 하네스로 아키텍처·보안·성능·스타일 4개 영역 병렬 감사 실행
- 결과: 종합 44/100(F등급), Critical 2 / High 10 / Medium 14 / Low 10, 총 36개 액션 아이템
- 리포트 원본: `_review/archive/secretary_test-20260701/` (조치 완료 후 아카이브로 이동, `01_architecture.md`~`05_review_report.md`)

**조치 내역 (커밋 순서대로, `#`는 리포트 항목 번호)**
1. `f85d193` — **Critical 보안 3건**: 비밀번호 bcrypt 해싱 + 로그인 시도 제한(#2, #26), `expo-secure-store` API 키 마이그레이션(#5), Pyannote HTTPS 강제(#25), LoginScreen 자격증명 UI `__DEV__` 가드(#3), `.env` 실키 제거(#1)
2. `a1a4c3d` — 성능·아키텍처(#7~12): `ScheduleScreen` 이중 load 제거, `Animated.loop` cleanup, `useSwipeClose` 훅 추출, `MeetingScreen` AI 프롬프트를 `claude.js`로 이동, `ClientScreen` Map 인덱싱
3. `4bb0e4d` — 성능(#13~18): 달력/일정 `useMemo`, AI 요약 캐시, `ClockDisplay` 분리, API 키·공급자 인메모리 캐싱
4. `5092772`·`81db1d6`·`b64c187` — 아키텍처(#19~21): `MeetingScreen`→`useAudioRecording`/`useDiarization`, `ProjectScreen`→`useProjectAI`/`useProjectForm`, `ClientScreen`→`ClientHistorySection` 컴포넌트 분리
5. `6c2efcb` — 스타일(#22~24): `src/utils/colors.js` 색상 함수 통합, `SettingsScreen` API 키 핸들러 팩토리화, `storage.js` `saveAndReturnUser()` 통합
6. `49e2959` — 보안(#4): `switchAccount()` 전환 전 현재 비밀번호 재인증 추가
7. `ace1e1b`~`a89290f` — 아키텍처·스타일·성능(#31~36): `src/hooks/`·`src/utils/` 디렉토리 체계 완성, `ClientScreen` 변수명 개선, `todayStr()`/`countHint()` 중복 제거, 매직 넘버 상수화(`ONE_DAY_MS` 등), `App.js` 탭 lazy loading
8. `b35c0a8`·`8387906`·`56ba632`·`ada28f8` — Low 백로그(#27~30): `storage.js` 세션 만료(24시간, `_sessionStart`), `safeParseJSON()` 헬퍼로 전체 `JSON.parse` 안전화, `buildClientSystem()` 거래처 연락처 PII 토큰화, `src/context/UserContext.js` 신설로 `user` prop 드릴링/`getCurrentUser()` 직접 호출 혼용 해소

**검증 방식**: 각 커밋마다 `npx eslint` 0 errors + `npx expo export --platform android` 번들 컴파일 성공을 확인 후 커밋. 최종적으로 36/36 항목이 실제 코드에 반영되어 있음을 직접 grep 재검증 완료.

### 2026-07-03

#### 프로젝트·일정 폼 입력 검증 버그 수정

- `eef6e6f` — `useProjectForm.js`: `handleAdd()`/`handleEditSave()`에서 제목·마감일시 미입력 시 저장 버튼을 눌러도 조용히 무시되던 문제 수정, Alert로 필수 입력 항목 안내
- `7d78ad6` — `useProjectForm.js`: 시작일시가 입력된 경우 마감일시 날짜가 시작일시보다 이전이면 저장 차단 + Alert 안내
- `7b86e08` — `ScheduleScreen.js`: 기간 일정도 동일하게 시작일시·마감일시가 모두 완전한 날짜로 입력된 경우 마감일시가 시작일시보다 이전이면 저장 차단(ProjectScreen과 동일 검증 적용)

### 2026-06-29

#### ADR 5개 작성 (`docs/adr/`)

- `0001-asyncstorage-not-sqlite.md` — SQLite 대신 AsyncStorage 선택 근거
- `0002-groq-grok-switchable-ai.md` — Groq/Grok 전환 가능한 AI 공급자 추상화
- `0003-expo-managed-no-custom-native.md` — Expo 관리형 워크플로우, 네이티브 모듈 없음
- `0004-asyncstorage-key-versioning.md` — `{type}_v{n}_${userId}` 키 버전 패턴
- `0005-hardcoded-local-accounts.md` — 하드코딩된 로컬 테스트 계정 (인증 서버 없음)

---

#### 회의록 화자 구분 심화 (`MeetingScreen.js`, `groqStt.js`)

**참석자 수 힌트 (녹음 탭)**
- 변환 전 화면에 참석자 수 +/− 컨트롤 추가 (자동 / 2~10명)
- 설정 시 `diarizeSegments()` 프롬프트에 `"※ 총 N명. 반드시 N명으로만 구분"` 힌트 전달

**화자 재분리 (기록 탭)**
- 각 회의록 버튼 행에 "화자 재분리" 버튼 추가
- 클릭 → 참석자 수 입력 모달 → 확인 시 `rediarizeTranscript()` 호출
- `groqStt.rediarizeTranscript(transcriptText, speakerCount)`: `[화자 N]` 라벨 제거 후 LLM 재분석
- 재분리 완료 후 SUMMARY 자동 재생성 (2 API 호출)
- 재분리 진행 중 외국어 수정 · 삭제 버튼 비활성화

---

### 2026-06-24 (2차)

#### 홈 화면 오늘 일정 기간 일정 포함 (`HomeScreen.js`)

**변경 내용**
- `load()` 내 `todaySchedules` 필터 수정
  - 기존: `s.date === today` (시작일이 오늘인 일정만)
  - 변경: `startDate`/`endDate`가 있는 기간 일정은 `start <= today <= end` 범위로 판단
  - 단일 날짜 일정은 기존대로 `s.date === today`

---

#### 홈 화면 ACTIVE PROJECTS 섹션 추가 (`HomeScreen.js`)

**변경 내용**
- `statusColor(status)` 헬퍼 함수 추가 (CLAUDE.md 상태 색상 매핑 일치)
- `activeProjects` state 추가 — 기존 `activeProjectCount`(숫자)와 별개로 실제 배열 저장
- `load()` 에서 `setActiveProjects(active)` 추가
- TODAY'S AGENDA 아래, QUICK ACTIONS 위에 ACTIVE PROJECTS 섹션 삽입
  - 완료·취소 제외 프로젝트 최대 3건 표시
  - 각 행: 상태 점(색상) + 제목 + 진행률 바(3px) + 상태 텍스트 + 마감일
  - 3건 초과 시 "+N건 더 보기" → 프로젝트 탭 이동
  - 0건: "진행중인 프로젝트가 없습니다" 빈 상태 텍스트
- 신규 스타일 9종 추가: `projectRow`, `projectStatusDot`, `projectMiddle`, `projectTitle`, `progressBarBg`, `progressBarFill`, `projectRight`, `projectStatus`, `projectDeadline`

---

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

#### 저장된 기록 탭 태스크 목록 전체 선택 버튼 (`MeetingScreen.js`)

**변경 내용**
- 기록 탭 TASKS 섹션 헤더에 **전체 선택 / 전체 해제** 토글 버튼 추가
  - 기존 `<Text style={s.historySectionLabel}>TASKS</Text>` →  `historySectionHeader` View로 감싸고 우측에 버튼 추가
  - 전부 선택된 상태(`selected.size === item.tasks.length`) → "전체 해제", 누르면 `new Set()`으로 초기화
  - 일부/미선택 상태 → "전체 선택", 누르면 `item.tasks.map((_, i) => i)` 전체 인덱스 선택
  - `historySelectedTasks` state 함수형 업데이트로 처리 (각 회의록 ID별 독립 Set)
- `historySectionHeader` (기존 스타일, flexRow + space-between), `taskSelectAllText` (기존 스타일, accentTeal 12px) 재사용 — 신규 스타일 추가 없음

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

---

#### CSS 스타일 정리 2차 (`MeetingScreen.js`, `MessageScreen.js`, `ProjectScreen.js`, `ScheduleScreen.js`, `SettingsScreen.js`)

**변경 내용** (`css-guide.md` 규칙 적용)
- **인라인 스타일 → StyleSheet 이관**: 5개 파일 합산 약 91개 인라인 스타일 제거
- **미사용 스타일 제거**: 13개
  - MeetingScreen: `extractTasksBtn`, `extractTasksBtnText`, `taskPriorityDot`, `taskAddBtn`, `personSection`
  - ProjectScreen: `detailTitle`, `detailBadgeRow`, `detailSection`, `detailSectionLabel`, `detailValue`
  - ScheduleScreen: `dotActive`, `scheduleTime`, `scheduleDateSmall`
- **공통 패턴으로 추가된 스타일** (각 파일별):
  - `flex1`, `opacity40`, `speakerInputFixed`, `speakerLabel`, `gap12`, `mb0`~`mb48`, `mt6`~`mt20`, `ml8`/`ml12`, `spacerH20`/`H16`/`H8`, `maxH80pct`~`maxH90pct`, `h64`~`h88pct` 등
- **동적 스타일 유지** (인라인 그대로): `statusColor()`, `priorityColor()`, `tagColor()` 런타임 색상, `insets.top/bottom` 기반 패딩, `Animated.Value` 트랜스폼, 색상 알파 블렌딩(`+'22'/'55'`) 등
