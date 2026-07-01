# 엔드포인트 분석: secretary_test 서비스 레이어
분석일: 2026-06-30
분석 파일: storage.js (51개), claude.js (9개), groqStt.js (5개)
총 함수 수: 65개

---

## storage.js

> 모든 데이터 함수(get/save/add/update/delete 계열)는 `userKey()` 내부 헬퍼를 통해 **현재 로그인 사용자 ID별로 격리**됩니다 (`키_${user.id}` 형태).  
> API 키, AI 공급자, Pyannote URL, 작업 주제는 사용자 무관 전역 키에 저장됩니다.

---

### 인증/계정

#### `login(email, password)` → Promise\<User\>
- **파라미터**: `email` (string, 필수), `password` (string, 필수)
- **반환**: `{id, email, name, role, team}`
- **에러**: 일치 계정 없으면 `Error('이메일 또는 비밀번호가 올바르지 않습니다.')`
- **의존**: `AsyncStorage.setItem`
- **역할**: 하드코딩된 테스트 계정 목록에서 이메일·비밀번호 검증 후 로그인 상태 저장

#### `logout()` → Promise\<void\>
- **파라미터**: 없음
- **반환**: `Promise<void>`
- **에러**: 없음
- **의존**: `AsyncStorage.removeItem`
- **역할**: `current_user_v1` 키 삭제로 로그아웃 처리

#### `getTestAccounts()` → Array\<User\>
- **파라미터**: 없음
- **반환**: `Array<{id, email, name, role, team}>` (비밀번호 제외)
- **에러**: 없음
- **의존**: 없음 (동기)
- **역할**: 전체 테스트 계정 목록 반환 (설정 탭 계정 전환용)

#### `switchAccount(accountId)` → Promise\<User\>
- **파라미터**: `accountId` (string, 필수)
- **반환**: `{id, email, name, role, team}`
- **에러**: 존재하지 않는 ID면 `Error('계정을 찾을 수 없습니다.')`
- **의존**: `AsyncStorage.setItem`
- **역할**: 계정 ID로 직접 전환 (비밀번호 없이)

#### `getCurrentUser()` → Promise\<User | null\>
- **파라미터**: 없음
- **반환**: `{id, email, name, role, team}` 또는 `null` (미로그인)
- **에러**: 없음
- **의존**: `AsyncStorage.getItem`
- **역할**: 현재 로그인 사용자 조회

---

### API 키/설정

#### `getApiKey()` → Promise\<string | null\>
- **파라미터**: 없음
- **반환**: Groq API 키 문자열 또는 `null`
- **에러**: 없음
- **의존**: `AsyncStorage.getItem`, `process.env.EXPO_PUBLIC_GROQ_API_KEY`
- **역할**: 저장된 Groq API 키 조회 (없으면 환경변수 폴백)

#### `setApiKey(key)` → Promise\<void\>
- **파라미터**: `key` (string, 필수)
- **반환**: `Promise<void>`
- **에러**: 없음
- **의존**: `AsyncStorage.setItem`
- **역할**: Groq API 키 저장

#### `getGrokApiKey()` → Promise\<string | null\>
- **파라미터**: 없음
- **반환**: Grok API 키 문자열 또는 `null`
- **에러**: 없음
- **의존**: `AsyncStorage.getItem`, `process.env.EXPO_PUBLIC_GROK_API_KEY`
- **역할**: 저장된 Grok(xAI) API 키 조회 (없으면 환경변수 폴백)

#### `setGrokApiKey(key)` → Promise\<void\>
- **파라미터**: `key` (string, 필수)
- **반환**: `Promise<void>`
- **에러**: 없음
- **의존**: `AsyncStorage.setItem`
- **역할**: Grok(xAI) API 키 저장

#### `getAiProvider()` → Promise\<string\>
- **파라미터**: 없음
- **반환**: `'groq'` 또는 `'grok'` (기본값 `'groq'`)
- **에러**: 없음
- **의존**: `AsyncStorage.getItem`
- **역할**: 현재 AI 공급자 설정 조회

#### `setAiProvider(provider)` → Promise\<void\>
- **파라미터**: `provider` (string, 필수 — `'groq'` 또는 `'grok'`)
- **반환**: `Promise<void>`
- **에러**: 없음
- **의존**: `AsyncStorage.setItem`
- **역할**: AI 공급자 설정 저장

#### `getPyannoteUrl()` → Promise\<string | null\>
- **파라미터**: 없음
- **반환**: Pyannote 서버 URL 문자열 또는 `null`
- **에러**: 없음
- **의존**: `AsyncStorage.getItem`
- **역할**: 화자 분리 서버 URL 조회

#### `setPyannoteUrl(url)` → Promise\<void\>
- **파라미터**: `url` (string, 필수)
- **반환**: `Promise<void>`
- **에러**: 없음
- **의존**: `AsyncStorage.setItem`
- **역할**: 화자 분리 서버 URL 저장

---

### 일정

#### `getSchedules()` → Promise\<Schedule[]\>
- **파라미터**: 없음
- **반환**: `Schedule[]` (없으면 샘플 데이터 초기화 후 반환)
- **에러**: 없음
- **의존**: `userKey`, `AsyncStorage.getItem/setItem`
- **역할**: 현재 사용자의 일정 목록 전체 조회

#### `saveSchedules(schedules)` → Promise\<void\>
- **파라미터**: `schedules` (Schedule[], 필수)
- **반환**: `Promise<void>`
- **에러**: 없음
- **의존**: `userKey`, `AsyncStorage.setItem`
- **역할**: 일정 목록 전체 덮어쓰기 저장

#### `addSchedule(schedule)` → Promise\<Schedule[]\>
- **파라미터**: `schedule` (object, 필수 — `{date, time, title, tag, notes, ...}`)
- **반환**: 업데이트된 `Schedule[]` (신규 항목이 앞에 추가됨)
- **에러**: 없음
- **의존**: `getSchedules`, `saveSchedules`
- **역할**: 새 일정 추가 (id·createdAt 자동 생성)

#### `deleteSchedule(id)` → Promise\<Schedule[]\>
- **파라미터**: `id` (string, 필수)
- **반환**: 삭제 후 `Schedule[]`
- **에러**: 없음
- **의존**: `getSchedules`, `saveSchedules`
- **역할**: 지정 ID 일정 삭제

#### `updateSchedule(id, fields)` → Promise\<Schedule[]\>
- **파라미터**: `id` (string, 필수), `fields` (object, 필수 — 변경할 필드만)
- **반환**: 업데이트된 `Schedule[]`
- **에러**: 없음
- **의존**: `getSchedules`, `saveSchedules`
- **역할**: 지정 ID 일정의 특정 필드 업데이트

---

### 거래처

#### `getClients()` → Promise\<Client[]\>
- **파라미터**: 없음
- **반환**: `Client[]` (없으면 샘플 데이터 초기화 후 반환)
- **에러**: 없음
- **의존**: `userKey`, `AsyncStorage.getItem/setItem`
- **역할**: 현재 사용자의 거래처 목록 전체 조회

#### `saveClients(clients)` → Promise\<void\>
- **파라미터**: `clients` (Client[], 필수)
- **반환**: `Promise<void>`
- **에러**: 없음
- **의존**: `userKey`, `AsyncStorage.setItem`
- **역할**: 거래처 목록 전체 덮어쓰기 저장

#### `addClient(client)` → Promise\<Client[]\>
- **파라미터**: `client` (object, 필수 — `{name, company, role, contact, ...}`)
- **반환**: 업데이트된 `Client[]`
- **에러**: 없음
- **의존**: `getClients`, `saveClients`
- **역할**: 새 거래처 추가 (id·createdAt 자동 생성)

#### `updateClient(id, fields)` → Promise\<Client[]\>
- **파라미터**: `id` (string, 필수), `fields` (object, 필수 — 변경할 필드만)
- **반환**: 업데이트된 `Client[]`
- **에러**: 없음
- **의존**: `getClients`, `saveClients`
- **역할**: 지정 ID 거래처의 특정 필드 업데이트

---

### 히스토리

#### `getHistories()` → Promise\<History[]\>
- **파라미터**: 없음
- **반환**: `History[]` (없으면 샘플 데이터 초기화 후 반환)
- **에러**: 없음
- **의존**: `userKey`, `AsyncStorage.getItem/setItem`
- **역할**: 현재 사용자의 거래처 히스토리 전체 조회

#### `saveHistories(histories)` → Promise\<void\>
- **파라미터**: `histories` (History[], 필수)
- **반환**: `Promise<void>`
- **에러**: 없음
- **의존**: `userKey`, `AsyncStorage.setItem`
- **역할**: 히스토리 목록 전체 덮어쓰기 저장

#### `addHistory(history)` → Promise\<History[]\>
- **파라미터**: `history` (object, 필수 — `{clientId, date, type, title, content, result}`)
- **반환**: 업데이트된 `History[]`
- **에러**: 없음
- **의존**: `getHistories`, `saveHistories`
- **역할**: 새 거래처 히스토리 추가 (id·createdAt 자동 생성)

#### `updateHistory(id, changes)` → Promise\<History[]\>
- **파라미터**: `id` (string, 필수), `changes` (object, 필수 — 변경할 필드만)
- **반환**: 업데이트된 `History[]`
- **에러**: 없음
- **의존**: `getHistories`, `saveHistories`
- **역할**: 지정 ID 히스토리의 특정 필드 업데이트

#### `deleteHistory(id)` → Promise\<History[]\>
- **파라미터**: `id` (string, 필수)
- **반환**: 삭제 후 `History[]`
- **에러**: 없음
- **의존**: `getHistories`, `saveHistories`
- **역할**: 지정 ID 히스토리 삭제

#### `getHistoriesByClient(clientId)` → Promise\<History[]\>
- **파라미터**: `clientId` (string, 필수)
- **반환**: 해당 거래처의 `History[]` (최신순 정렬)
- **에러**: 없음
- **의존**: `getHistories`
- **역할**: 특정 거래처 ID에 해당하는 히스토리만 필터링하여 최신순 반환

---

### 프로젝트

#### `getProjects()` → Promise\<Project[]\>
- **파라미터**: 없음
- **반환**: `Project[]` (없으면 샘플 데이터 초기화 후 반환)
- **에러**: 없음
- **의존**: `userKey`, `AsyncStorage.getItem/setItem`
- **역할**: 현재 사용자의 프로젝트 목록 전체 조회

#### `saveProjects(projects)` → Promise\<void\>
- **파라미터**: `projects` (Project[], 필수)
- **반환**: `Promise<void>`
- **에러**: 없음
- **의존**: `userKey`, `AsyncStorage.setItem`
- **역할**: 프로젝트 목록 전체 덮어쓰기 저장

#### `addProject(project)` → Promise\<Project[]\>
- **파라미터**: `project` (object, 필수 — `{title, deadline, status, progress, priority, notes, ...}`)
- **반환**: 업데이트된 `Project[]`
- **에러**: 없음
- **의존**: `getProjects`, `saveProjects`
- **역할**: 새 프로젝트 추가 (id·createdAt 자동 생성)

#### `updateProject(id, changes)` → Promise\<Project[]\>
- **파라미터**: `id` (string, 필수), `changes` (object, 필수 — 변경할 필드만)
- **반환**: 업데이트된 `Project[]`
- **에러**: 없음
- **의존**: `getProjects`, `saveProjects`
- **역할**: 지정 ID 프로젝트의 특정 필드 업데이트 (`updatedAt` 자동 갱신)

#### `deleteProject(id)` → Promise\<Project[]\>
- **파라미터**: `id` (string, 필수)
- **반환**: 삭제 후 `Project[]`
- **에러**: 없음
- **의존**: `getProjects`, `saveProjects`
- **역할**: 지정 ID 프로젝트 삭제

---

### 메세지

#### `getMessages()` → Promise\<Message[]\>
- **파라미터**: 없음
- **반환**: `Message[]` (없으면 샘플 데이터 초기화 후 반환)
- **에러**: 없음
- **의존**: `userKey`, `AsyncStorage.getItem/setItem`
- **역할**: 현재 사용자의 메세지 목록 전체 조회

#### `saveMessages(messages)` → Promise\<void\>
- **파라미터**: `messages` (Message[], 필수)
- **반환**: `Promise<void>`
- **에러**: 없음
- **의존**: `userKey`, `AsyncStorage.setItem`
- **역할**: 메세지 목록 전체 덮어쓰기 저장

#### `addMessage(message)` → Promise\<Message[]\>
- **파라미터**: `message` (object, 필수 — `{direction, fromId, toId, sender, company, subject, content, priority, status}`)
- **반환**: 업데이트된 `Message[]`
- **에러**: 없음
- **의존**: `getMessages`, `saveMessages`
- **역할**: 현재 사용자의 메세지함에 새 메세지 추가 (id·createdAt 자동 생성)

#### `addMessageForUser(userId, message)` → Promise\<Message[]\>
- **파라미터**: `userId` (string, 필수), `message` (object, 필수)
- **반환**: 업데이트된 `Message[]`
- **에러**: 없음
- **의존**: `AsyncStorage.getItem/setItem`
- **역할**: 특정 사용자 ID의 메세지함에 직접 메세지 추가 (계정 간 메세지 전송 시뮬레이션)

#### `updateMessage(id, changes)` → Promise\<Message[]\>
- **파라미터**: `id` (string, 필수), `changes` (object, 필수 — 변경할 필드만)
- **반환**: 업데이트된 `Message[]`
- **에러**: 없음
- **의존**: `getMessages`, `saveMessages`
- **역할**: 현재 사용자 메세지함의 지정 ID 메세지 업데이트 (`updatedAt` 자동 갱신)

#### `updateMessageForUser(userId, id, changes)` → Promise\<void\>
- **파라미터**: `userId` (string, 필수), `id` (string, 필수), `changes` (object, 필수)
- **반환**: `Promise<void>` (raw 없으면 조기 return)
- **에러**: 없음
- **의존**: `AsyncStorage.getItem/setItem`
- **역할**: 특정 사용자 ID의 메세지함에서 지정 메세지 업데이트 (`updatedAt` 자동 갱신)

#### `deleteMessage(id)` → Promise\<Message[]\>
- **파라미터**: `id` (string, 필수)
- **반환**: 삭제 후 `Message[]`
- **에러**: 없음
- **의존**: `getMessages`, `saveMessages`
- **역할**: 지정 ID 메세지 삭제

---

### 회의록

#### `getMeetingRecords()` → Promise\<MeetingRecord[]\>
- **파라미터**: 없음
- **반환**: `MeetingRecord[]` (없으면 빈 배열 `[]`)
- **에러**: 없음
- **의존**: `userKey`, `AsyncStorage.getItem`
- **역할**: 현재 사용자의 회의록 목록 전체 조회

#### `saveMeetingRecords(records)` → Promise\<void\>
- **파라미터**: `records` (MeetingRecord[], 필수)
- **반환**: `Promise<void>`
- **에러**: 없음
- **의존**: `userKey`, `AsyncStorage.setItem`
- **역할**: 회의록 목록 전체 덮어쓰기 저장

#### `addMeetingRecord(record)` → Promise\<MeetingRecord[]\>
- **파라미터**: `record` (object, 필수 — `{title, transcript, summary, source, clientIds, projectId, tasks}`)
- **반환**: 업데이트된 `MeetingRecord[]`
- **에러**: 없음
- **의존**: `getMeetingRecords`, `saveMeetingRecords`
- **역할**: 새 회의록 추가 (id·createdAt 자동 생성)

#### `updateMeetingRecord(id, changes)` → Promise\<MeetingRecord[]\>
- **파라미터**: `id` (string, 필수), `changes` (object, 필수 — 변경할 필드만)
- **반환**: 업데이트된 `MeetingRecord[]`
- **에러**: 없음
- **의존**: `getMeetingRecords`, `saveMeetingRecords`
- **역할**: 지정 ID 회의록의 특정 필드 업데이트

#### `deleteMeetingRecord(id)` → Promise\<MeetingRecord[]\>
- **파라미터**: `id` (string, 필수)
- **반환**: 삭제 후 `MeetingRecord[]`
- **에러**: 없음
- **의존**: `getMeetingRecords`, `saveMeetingRecords`
- **역할**: 지정 ID 회의록 삭제

---

### 기타

#### `getWorkTopics()` → Promise\<string\>
- **파라미터**: 없음
- **반환**: 작업 주제 텍스트 문자열 (없으면 `''`)
- **에러**: 없음
- **의존**: `AsyncStorage.getItem`
- **역할**: 업무 주제 분석 결과 텍스트 조회 (사용자 무관 전역 키)

#### `saveWorkTopics(text)` → Promise\<void\>
- **파라미터**: `text` (string, 필수)
- **반환**: `Promise<void>`
- **에러**: 없음
- **의존**: `AsyncStorage.setItem`
- **역할**: 업무 주제 분석 결과 텍스트 저장 (사용자 무관 전역 키)

#### `getClientFavorites()` → Promise\<string[]\>
- **파라미터**: 없음
- **반환**: 즐겨찾기 거래처 ID 배열 (없으면 `[]`)
- **에러**: 없음
- **의존**: `userKey`, `AsyncStorage.getItem`
- **역할**: 현재 사용자의 거래처 즐겨찾기 ID 목록 조회

#### `toggleClientFavorite(clientId)` → Promise\<string[]\>
- **파라미터**: `clientId` (string, 필수)
- **반환**: 업데이트된 즐겨찾기 ID 배열
- **에러**: 없음
- **의존**: `userKey`, `getClientFavorites`, `AsyncStorage.setItem`
- **역할**: 거래처 즐겨찾기 토글 (이미 있으면 제거, 없으면 추가)

#### `getUserProfile()` → Promise\<UserProfile | null\>
- **파라미터**: 없음
- **반환**: `{contact, notes, ...User}` 병합 객체 또는 `null` (미로그인)
- **에러**: 없음
- **의존**: `getCurrentUser`, `AsyncStorage.getItem`
- **역할**: 현재 사용자의 확장 프로필 조회 (기본 User 필드 + 추가 필드 병합)

#### `saveUserProfile(fields)` → Promise\<void\>
- **파라미터**: `fields` (object, 필수 — 저장할 확장 프로필 필드)
- **반환**: `Promise<void>` (미로그인 시 조기 return)
- **에러**: 없음
- **의존**: `getCurrentUser`, `AsyncStorage.getItem/setItem`
- **역할**: 현재 사용자의 확장 프로필 부분 업데이트 (기존 데이터와 병합)

---

## claude.js

> `callGroq`, `callGrok`, `fmtDate`는 내부 헬퍼로 export 없음 — 제외.

---

### 한국어 유틸리티

#### `josa과와(word)` → string
- **파라미터**: `word` (string, 필수)
- **반환**: `'과'` 또는 `'와'`
- **에러**: 없음
- **의존**: 없음 (동기)
- **역할**: 한국어 단어의 마지막 음절 받침 유무에 따라 조사 `과/와` 반환

#### `stripNonKorean(text)` → string
- **파라미터**: `text` (string, 필수)
- **반환**: 한국어·공백·숫자·기본 문장부호(`.?!,:\[\]`)만 남긴 문자열
- **에러**: 없음
- **의존**: 없음 (동기)
- **역할**: AI 응답에서 한국어 외 문자 제거 (기본 필터)

#### `normalizeAIDates(text)` → string | undefined
- **파라미터**: `text` (string | null | undefined, 필수)
- **반환**: 날짜 형식이 한국어로 변환된 문자열, 또는 falsy 입력 그대로 반환
- **에러**: 없음
- **의존**: 없음 (동기)
- **역할**: AI 응답의 `YYYY-MM-DD`, `YYYY.MM.DD`, `YYYY/MM/DD` 형식을 `yyyy년 mm월 dd일`로 변환

---

### AI 호출

#### `askClaude(messages, systemPrompt, options?)` → Promise\<string\>
- **파라미터**: `messages` (Array\<{role: string, content: string}\>, 필수), `systemPrompt` (string, 필수), `options` (`{raw?: boolean}`, 선택 — 기본 `{}`)
- **반환**: AI 응답 텍스트. `raw=false`(기본)이면 `stripNonKorean()` 필터 적용
- **에러**: `Error('API_KEY_MISSING')` (키 미설정), `Error('API 오류 (status)')` (HTTP 오류)
- **의존**: `getAiProvider`, `getApiKey | getGrokApiKey`, `callGroq | callGrok` (provider에 따라)
- **역할**: AI 공급자(Groq/Grok)를 자동 선택하여 채팅 완성 요청 실행

#### `fixForeignWordsInText(text)` → Promise\<string\>
- **파라미터**: `text` (string, 필수)
- **반환**: 외국어가 한국어로 교체된 문자열
- **에러**: `Error('API_KEY_MISSING')` (키 미설정), `Error('API 오류 (status)')` (HTTP 오류)
- **의존**: `getAiProvider`, `getApiKey | getGrokApiKey`, `callGroq | callGrok`
- **역할**: STT 결과 텍스트의 문맥에 맞지 않는 외국어를 AI로 한국어 교체 (고유명사·표준 외래어 제외)

---

### 시스템 프롬프트 빌더

#### `buildScheduleSystem(schedules)` → string
- **파라미터**: `schedules` (Schedule[], 필수)
- **반환**: 일정 AI 시스템 프롬프트 문자열
- **에러**: 없음
- **의존**: 없음 (동기)
- **역할**: 현재 일정 목록을 포함한 일정 관리 AI 시스템 프롬프트 생성 (일정 조회·생성 JSON 액션 포함)

#### `buildProjectDelaySystem(projects, schedules)` → string
- **파라미터**: `projects` (Project[], 필수), `schedules` (Schedule[], 필수)
- **반환**: 프로젝트 지연 분석 AI 시스템 프롬프트 문자열
- **에러**: 없음
- **의존**: 없음 (동기)
- **역할**: 프로젝트 현황(상태·마감·진행률·위험도)을 포함한 지연 분석 AI 시스템 프롬프트 생성 (update_project JSON 액션 포함)

#### `buildTaskExtractionSystem()` → string
- **파라미터**: 없음
- **반환**: 태스크 추출 AI 시스템 프롬프트 문자열
- **에러**: 없음
- **의존**: 없음 (동기)
- **역할**: 회의 스크립트에서 실행 가능한 태스크를 JSON 배열로 추출하는 AI 시스템 프롬프트 생성

#### `buildClientSystem(clients, histories)` → string
- **파라미터**: `clients` (Client[], 필수), `histories` (History[], 필수)
- **반환**: 거래처 관계 관리 AI 시스템 프롬프트 문자열
- **에러**: 없음
- **의존**: 없음 (동기)
- **역할**: 거래처 목록과 히스토리(마지막 연락일 포함)를 컨텍스트로 포함한 거래처 AI 시스템 프롬프트 생성

---

## groqStt.js

---

### STT (음성 → 텍스트)

#### `transcribeAudio(fileUri, mimeType?)` → Promise\<{text: string, segments: Segment[]}\>
- **파라미터**: `fileUri` (string, 필수 — 로컬 파일 URI), `mimeType` (string, 선택 — 기본 `'audio/m4a'`)
- **반환**: `{text: string, segments: Array<{start, end, text, no_speech_prob, avg_logprob, ...}>}`
- **에러**: `Error('API_KEY_MISSING')` (키 미설정), `Error('API 오류 (status)')` (HTTP 오류)
- **의존**: `getApiKey`, Groq Whisper API (`whisper-large-v3`, 한국어 고정)
- **역할**: 오디오 파일을 Groq Whisper API로 전사하여 전체 텍스트와 타임스탬프 세그먼트 반환

---

### 화자 분리 (LLM 기반)

#### `diarizeSegments(segments, speakerCount?)` → Promise\<string\>
- **파라미터**: `segments` (Segment[], 필수 — `transcribeAudio` 반환값의 segments), `speakerCount` (number | null, 선택 — 기본 `null`)
- **반환**: `[화자 N] 내용` 형식의 화자 구분된 텍스트 문자열 (빈 세그먼트면 `''`)
- **에러**: `askClaude` 내부 에러 전파
- **의존**: `askClaude`, `isValidSegment` (내부 필터 — `no_speech_prob < 0.6` & `avg_logprob > -1.0`)
- **역할**: Whisper 세그먼트를 AI로 화자 구분·오타 수정·조사 교정·업무 용어 정규화 처리

#### `rediarizeTranscript(transcriptText, speakerCount?)` → Promise\<string\>
- **파라미터**: `transcriptText` (string, 필수 — 기존 `[화자 N]` 태그 포함 트랜스크립트), `speakerCount` (number | null, 선택 — 기본 `null`)
- **반환**: 재분리된 `[화자 N] 내용` 형식 문자열 (빈 입력이면 원문 그대로 반환)
- **에러**: `askClaude` 내부 에러 전파
- **의존**: `askClaude`
- **역할**: 기존 화자 태그를 제거한 후 AI로 화자를 재구분 (회의록 화자 재분리 기능)

---

### 화자 분리 (Pyannote 서버 기반)

#### `convertToMonoViaServer(fileUri, mimeType)` → Promise\<string | null\>
- **파라미터**: `fileUri` (string, 필수), `mimeType` (string, 필수)
- **반환**: 변환된 모노 WAV 파일의 로컬 캐시 URI, 또는 `null` (URL 미설정·서버 오류)
- **에러**: 없음 — catch 블록에서 `null` 반환 (에러 은닉, 호출자가 null 체크 필요)
- **의존**: `getPyannoteUrl`, Pyannote 서버 `/mono` 엔드포인트, `FileSystem.writeAsStringAsync`
- **역할**: Pyannote 서버로 오디오를 모노 WAV로 변환하여 로컬 캐시에 저장 (서버 미설정 시 `null`)

#### `diarizeWithPyannote(fileUri, mimeType, whisperSegments)` → Promise\<string | null\>
- **파라미터**: `fileUri` (string, 필수), `mimeType` (string, 필수), `whisperSegments` (Segment[], 필수 — `transcribeAudio` 반환값의 segments)
- **반환**: `[화자 N] 내용` 형식 텍스트, 또는 `null` (URL 미설정·서버 오류·세그먼트 없음)
- **에러**: 없음 — catch 블록에서 `null` 반환 (에러 은닉, 호출자가 null 체크 필요)
- **의존**: `getPyannoteUrl`, Pyannote 서버 `/diarize` 엔드포인트, `buildTranscript` (내부), `polishTranscript` (내부 — `askClaude` 호출)
- **역할**: Pyannote 서버 화자 분리 결과와 Whisper 세그먼트를 병합하여 `[화자 N]` 포맷 생성 후 AI 교정 (LLM fallback: `null` 반환 시 호출부에서 `diarizeSegments` 사용)

---

## 함수 간 의존 관계

```
transcribeAudio ──────────────────────────────→ Groq Whisper API
diarizeSegments ──────────────────────────────→ askClaude
rediarizeTranscript ──────────────────────────→ askClaude
diarizeWithPyannote → buildTranscript (내부)
                    → polishTranscript (내부) → askClaude
convertToMonoViaServer → Pyannote /mono

askClaude → getAiProvider
          → getApiKey (groq) | getGrokApiKey (grok)
          → callGroq | callGrok (내부)
          → stripNonKorean (raw=false 시)

fixForeignWordsInText → getAiProvider
                      → getApiKey | getGrokApiKey
                      → callGroq | callGrok (내부)
```
