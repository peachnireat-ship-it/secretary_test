# services/ 작업 가이드

이 디렉토리에는 데이터·AI·STT 서비스 레이어가 있습니다. 수정 전 반드시 이 파일을 읽으세요.

---

## 파일 목록

| 파일 | 역할 |
|------|------|
| `storage.js` | AsyncStorage CRUD + 샘플 데이터 초기화 |
| `claude.js` | AI 호출 추상화 (Groq/Grok), 시스템 프롬프트 빌더 |
| `groqStt.js` | Whisper STT, AI 화자 분리, Pyannote 연동 |

---

## storage.js

### AsyncStorage 키 규칙

```
{종류}_v{버전}_${userId}    ← 사용자별 격리
{종류}                       ← 전역 (계정 무관)
```

| 키 | 타입 | 설명 |
|----|------|------|
| `schedules_v1_${userId}` | Schedule[] | 일정 |
| `clients_v1_${userId}` | Client[] | 거래처 |
| `histories_v1_${userId}` | History[] | 거래처 히스토리 |
| `projects_v1_${userId}` | Project[] | 프로젝트 |
| `messages_v3_${userId}` | Message[] | 메세지 |
| `meeting_records_v1_${userId}` | MeetingRecord[] | 회의록 |
| `client_favorites_v1_${userId}` | string[] | 즐겨찾기 ID |
| `current_user_v1` | User | 로그인 유저 |
| `claude_api_key` | string | Groq API 키 |
| `grok_api_key` | string | Grok API 키 |
| `ai_provider` | 'groq'\|'grok' | AI 공급자 |
| `pyannote_url` | string | Pyannote 서버 URL |
| `work_topics_v1` | string | 업무 주제 분석 결과 |

### 주의사항

- 버전 번호(`_v1`, `_v3`)는 마이그레이션 흔적 — 임의로 올리지 말 것
- 새 필드 추가 시 기존 데이터와 하위 호환 유지 (`?? defaultValue`)
- CRUD 함수는 항상 **전체 배열 교체** 방식 (`JSON.stringify` 저장)

---

## claude.js

### 공급자 추상화

```js
askClaude(messages, systemPrompt, { raw: false })
// ai_provider 키 확인 → Groq 또는 Grok API 자동 분기
// raw: true → 원시 텍스트 반환, false → JSON 파싱 시도
```

### 시스템 프롬프트 빌더

| 함수 | 대상 탭 |
|------|---------|
| `buildScheduleSystem(schedules)` | 일정 |
| `buildClientSystem(clients, histories)` | 거래처 |
| `buildProjectDelaySystem(projects)` | 프로젝트 |
| `buildTaskExtractionSystem()` | 회의록 태스크 추출 |

### AI 액션 JSON 형식

일정 자동 생성:
```json
{"action":"create_schedule","data":{"date":"YYYY-MM-DD","time":"HH:MM","title":"...","tag":"...","notes":"..."}}
```

프로젝트 상태 업데이트:
```json
{"action":"update_project","id":"...","changes":{"status":"...","progress":0}}
```

### 유틸 함수

| 함수 | 역할 |
|------|------|
| `normalizeAIDates(text)` | AI 응답 날짜를 한국어 형식으로 변환 |
| `fixForeignWordsInText(text)` | STT 결과 외국어 보정 |
| `stripNonKorean(text)` | 한국어·숫자·기본 부호만 남김 |
| `josa과와(word)` | 한국어 조사 선택 (과/와) |

### 주의사항

- API 키가 없으면 AI 호출 전 사용자에게 안내 (에러 throw 금지)
- 응답 파싱 실패 시 원본 텍스트 반환 (조용히 실패)

---

## groqStt.js

### 주요 함수

| 함수 | 역할 |
|------|------|
| `transcribeAudio(uri)` | Groq Whisper → 텍스트 + 세그먼트 반환 |
| `diarizeSegments(segments)` | AI로 세그먼트별 화자 구분 (`[화자 N]` 태그) |
| `diarizeWithPyannote(uri, url)` | Pyannote 서버로 화자 분리 |
| `convertToMonoViaServer(uri, url)` | Pyannote 서버로 모노 변환 |

### 트랜스크립트 형식

```
[화자 1]
발화 내용

[화자 2]
발화 내용
```

또는 수동 매핑 후 이름으로 대체:
```
[김민준]
발화 내용
```

### 주의사항

- Pyannote는 선택 기능 — URL 없으면 AI 화자 분리로 폴백
- Whisper 모델: `whisper-large-v3` (고정)
- 파일 크기 제한 주의 (Groq API 제한)
