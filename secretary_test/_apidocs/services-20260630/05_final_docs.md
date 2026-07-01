# secretary_test 서비스 API 문서
버전: 2026-06-30
완성도: 85/100
리뷰: 04_review.md 수정사항 반영 완료

---

## 개요

| 모듈 | 함수 수 | 주요 역할 |
|------|--------|---------|
| storage.js | 51 | AsyncStorage CRUD (사용자별 격리), 인증, 설정 |
| claude.js | 9 | AI 호출, 한국어 유틸리티, 시스템 프롬프트 빌더 |
| groqStt.js | 5 | Whisper STT, LLM/Pyannote 화자 분리 |

---

## 가장 자주 쓰이는 함수 Top 5 (화면 사용 빈도 기반)

| 순위 | 함수 | 파일 | 사용 화면 |
|------|------|------|---------|
| 1 | `askClaude` | claude.js | 일정·거래처·프로젝트·회의록·ScheduleScreen AI 기능 전반 |
| 2 | `getCurrentUser` | storage.js | 전 화면 데이터 로드 시 병렬 호출 |
| 3 | `getSchedules` | storage.js | ScheduleScreen, HomeScreen 일정 데이터 로드 |
| 4 | `transcribeAudio` | groqStt.js | MeetingScreen STT 파이프라인 핵심 |
| 5 | `addMeetingRecord` | storage.js | MeetingScreen 회의록 저장 + 업무 주제 분석 트리거 |

---

## 핵심 주의사항

### 1. raw:true 필수 케이스
JSON 응답이 예상되는 `askClaude()` 호출에는 반드시 `{ raw: true }` 전달. 그렇지 않으면 `stripNonKorean()`이 JSON 구조(따옴표·괄호 등)를 제거해 파싱 실패.

| 케이스 | 응답 타입 | raw:true 필요 |
|--------|---------|-------------|
| `buildTaskExtractionSystem()` 사용 시 | JSON 배열 | 필수 |
| `buildScheduleSystem()` → `create_schedule` 감지 시 | JSON 객체 | 필수 |
| `buildProjectDelaySystem()` → `update_project` 감지 시 | JSON 객체 | 필수 |
| 일반 텍스트 AI 채팅 | 텍스트 | 불필요 |

### 2. 사용자별 키 격리
`get*/add*/update*/delete*` 계열 데이터 함수는 내부 `userKey()` 헬퍼로 `${base}_${user.id}` 형태 키를 사용한다. 미로그인 상태에서 호출하면 `user.id` 없이 베이스 키(`schedules_v1` 등)로 저장된다.

API 키·AI 공급자·Pyannote URL·업무 주제(`getWorkTopics/saveWorkTopics`)는 예외적으로 사용자 무관 전역 키에 저장된다.

### 3. Pyannote null 처리
`diarizeWithPyannote()`와 `convertToMonoViaServer()`는 에러를 던지지 않는다. Pyannote 서버 미설정·서버 오류 시 `null` 반환. 반드시 null 체크 후 `diarizeSegments()`로 fallback해야 한다.

---

## storage.js

AsyncStorage 기반 로컬 CRUD 저장소. 서버 없음. 모든 데이터(get/save/add/update/delete 계열)는 내부 `userKey()` 헬퍼를 통해 **현재 로그인 사용자 ID별로 격리**된다 (`${키}_${user.id}` 패턴). API 키·AI 공급자·Pyannote URL·업무 주제는 예외적으로 사용자 무관 전역 키에 저장된다.

```js
import {
  login, logout, getTestAccounts, switchAccount, getCurrentUser,
  getApiKey, setApiKey, getGrokApiKey, setGrokApiKey,
  getAiProvider, setAiProvider, getPyannoteUrl, setPyannoteUrl,
  getSchedules, saveSchedules, addSchedule, deleteSchedule, updateSchedule,
  getClients, saveClients, addClient, updateClient,
  getHistories, saveHistories, addHistory, updateHistory, deleteHistory, getHistoriesByClient,
  getProjects, saveProjects, addProject, updateProject, deleteProject,
  getMessages, saveMessages, addMessage, addMessageForUser, updateMessage, updateMessageForUser, deleteMessage,
  getMeetingRecords, saveMeetingRecords, addMeetingRecord, updateMeetingRecord, deleteMeetingRecord,
  getWorkTopics, saveWorkTopics,
  getClientFavorites, toggleClientFavorite,
  getUserProfile, saveUserProfile,
} from '../services/storage';
```

---

### 인증 / 계정

---

#### login

```js
login(email: string, password: string): Promise<User>
```

하드코딩된 테스트 계정 목록에서 이메일·비밀번호를 검증하고, 일치하면 사용자 정보를 `current_user_v1` 키에 저장한다.

**파라미터**
| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| email | string | 필수 | 계정 이메일 |
| password | string | 필수 | 비밀번호 |

**반환값**
```js
{ id: string, email: string, name: string, role: string, team: string }
```

**에러**
- 일치 계정 없음: `Error('이메일 또는 비밀번호가 올바르지 않습니다.')`

**주의**
- 서버 인증 없음. 하드코딩된 6개 테스트 계정만 유효하다 (`test`, `admin`, `kmj`, `lsy`, `pjh`, `csa`).
- 로그인 후 `getCurrentUser()`로 세션 복원. `user.id`는 이후 모든 데이터 키 격리에 사용된다.
- 반환 객체에 비밀번호(`password`)는 포함되지 않는다.

**예제**
```js
// LoginScreen.js 패턴 기반
async function handleLogin(email, password) {
  try {
    const user = await login(email, password);
    // user: { id, email, name, role, team }
    onUserChange?.(user);
  } catch (e) {
    Alert.alert('로그인 실패', e.message); // '이메일 또는 비밀번호가 올바르지 않습니다.'
  }
}
```

---

#### logout

```js
logout(): Promise<void>
```

`current_user_v1` 키를 AsyncStorage에서 제거하여 로그아웃 처리한다. 사용자별 데이터 키는 삭제하지 않는다.

**반환값**
`Promise<void>`

**주의**
- 로그아웃 후에도 `schedules_v1_${userId}` 등 사용자 데이터 키는 그대로 남는다. 앱 재시작 후 같은 계정으로 로그인하면 데이터가 복원된다.

**예제**
```js
// SettingsScreen.js 패턴 기반
Alert.alert('로그아웃', '정말 로그아웃하시겠습니까?', [
  { text: '취소', style: 'cancel' },
  {
    text: '로그아웃',
    style: 'destructive',
    onPress: async () => {
      await logout();
      onUserChange?.(null);
    },
  },
]);
```

---

#### getTestAccounts

```js
getTestAccounts(): Array<User>
```

전체 테스트 계정 목록을 동기적으로 반환한다. 설정 탭의 계정 전환 UI에서 사용한다.

**반환값**
```js
Array<{ id: string, email: string, name: string, role: string, team: string }>
```
비밀번호(`password`)는 포함되지 않는다.

**주의**
- 비동기 함수가 아니다. `await` 없이 바로 호출한다.

**예제**
```js
// SettingsScreen.js 패턴 기반
// 동기 함수 — await 없이 호출
const accounts = getTestAccounts();
// accounts: [{ id, email, name, role, team }, ...]
```

---

#### switchAccount

```js
switchAccount(accountId: string): Promise<User>
```

계정 ID로 직접 계정을 전환한다. 비밀번호 확인 없이 `current_user_v1`을 교체한다. 설정 탭의 계정 전환 버튼에서 사용한다.

**파라미터**
| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| accountId | string | 필수 | 전환할 계정 ID (예: `'kmj'`, `'lsy'`) |

**반환값**
```js
{ id: string, email: string, name: string, role: string, team: string }
```

**에러**
- 존재하지 않는 ID: `Error('계정을 찾을 수 없습니다.')`

**주의**
- 계정 전환 후 화면 데이터를 다시 로드해야 한다. 전환만 하고 리로드를 생략하면 이전 사용자 데이터가 화면에 남는다.

**예제**
```js
// SettingsScreen.js 패턴 기반
Alert.alert('계정 전환', `${account.name}(으)로 전환하시겠습니까?`, [
  { text: '취소', style: 'cancel' },
  {
    text: '전환',
    onPress: async () => {
      try {
        const nextUser = await switchAccount(account.id);
        onUserChange?.(nextUser);
        // 계정 전환 후 화면 데이터 다시 로드 필수
        await loadData();
      } catch (e) {
        Alert.alert('오류', e.message);
      }
    },
  },
]);
```

---

#### getCurrentUser

```js
getCurrentUser(): Promise<User | null>
```

현재 로그인된 사용자 정보를 AsyncStorage에서 조회한다. 앱 시작 시 세션 복원에 사용한다.

**반환값**
- 로그인 상태: `{ id: string, email: string, name: string, role: string, team: string }`
- 미로그인: `null`

**주의**
- 사용자별 데이터 함수들이 내부적으로 이 함수를 호출한다. 미로그인 상태에서 `getSchedules()` 등을 호출하면 사용자 ID 없이 베이스 키(`schedules_v1`)로 저장된다.

**예제**
```js
// ScheduleScreen.js 패턴 기반 (useFocusEffect 내 병렬 로드)
const [allSchedules, allProjects, allClients, allRecords, user] = await Promise.all([
  getSchedules(),
  getProjects(),
  getClients(),
  getMeetingRecords(),
  getCurrentUser(),
]);
setCurrentUser(user);
// user가 null이면 미로그인 상태 — LoginScreen으로 이동 처리 필요
```

---

### API 키 / 설정

---

#### getApiKey

```js
getApiKey(): Promise<string | null>
```

저장된 Groq API 키를 조회한다. 없으면 환경변수 `EXPO_PUBLIC_GROQ_API_KEY`를 폴백으로 반환한다.

**반환값**
- 저장된 키 또는 환경변수 값이 있으면 해당 문자열
- 둘 다 없으면 `null`

**주의**
- 환경변수 폴백은 개발 환경에서 `.env` 파일로 주입된다. 프로덕션에서는 `setApiKey()`로 명시적으로 저장해야 한다.

**예제**
```js
// SettingsScreen.js 패턴 기반
// 로드
useEffect(() => {
  getApiKey().then((k) => { if (k) setApiKeyState(k); });
}, []);

// 저장
async function handleSave() {
  const trimmed = apiKey.trim();
  if (!trimmed) { Alert.alert('오류', 'API 키를 입력해주세요.'); return; }
  await setApiKey(trimmed);
}

// 삭제
await setApiKey('');
```

---

#### setApiKey

```js
setApiKey(key: string): Promise<void>
```

Groq API 키를 `claude_api_key` 전역 키에 저장한다. 사용자 무관(전역 저장).

**파라미터**
| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| key | string | 필수 | Groq API 키 문자열 |

**반환값**
`Promise<void>`

---

#### getGrokApiKey

```js
getGrokApiKey(): Promise<string | null>
```

저장된 Grok(xAI) API 키를 조회한다. 없으면 환경변수 `EXPO_PUBLIC_GROK_API_KEY`를 폴백으로 반환한다.

**반환값**
- 저장된 키 또는 환경변수 값이 있으면 해당 문자열
- 둘 다 없으면 `null`

**예제**
```js
// SettingsScreen.js 패턴 기반
useEffect(() => {
  getGrokApiKey().then((k) => { if (k) setGrokApiKeyState(k); });
}, []);

async function handleSaveGrok() {
  const trimmed = grokApiKey.trim();
  if (!trimmed) { Alert.alert('오류', 'API 키를 입력해주세요.'); return; }
  await setGrokApiKey(trimmed);
}
```

---

#### setGrokApiKey

```js
setGrokApiKey(key: string): Promise<void>
```

Grok(xAI) API 키를 `grok_api_key` 전역 키에 저장한다. 사용자 무관(전역 저장).

**파라미터**
| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| key | string | 필수 | Grok API 키 문자열 |

**반환값**
`Promise<void>`

---

#### getAiProvider

```js
getAiProvider(): Promise<string>
```

현재 AI 공급자 설정을 조회한다.

**반환값**
`'groq'` 또는 `'grok'`. 미설정 시 기본값 `'groq'` 반환.

**예제**
```js
// SettingsScreen.js 패턴 기반
// 로드
useEffect(() => {
  getAiProvider().then(setProviderState); // 'groq' 또는 'grok'
}, []);

// 변경 (provider: 'groq' | 'grok')
async function handleProviderChange(provider) {
  setProviderState(provider);
  await setAiProvider(provider);
}
```

---

#### setAiProvider

```js
setAiProvider(provider: string): Promise<void>
```

AI 공급자 설정을 `ai_provider` 전역 키에 저장한다. 사용자 무관(전역 저장).

**파라미터**
| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| provider | string | 필수 | `'groq'` 또는 `'grok'` |

**반환값**
`Promise<void>`

**주의**
- 유효성 검사 없음. `'groq'`·`'grok'` 외의 값을 저장하면 `askClaude()`가 Groq 경로로 fallback하며 오동작할 수 있다.

---

#### getPyannoteUrl

```js
getPyannoteUrl(): Promise<string | null>
```

화자 분리 Pyannote 서버 URL을 조회한다.

**반환값**
- 저장된 URL 문자열
- 미설정 시 `null`

**주의**
- `null` 반환 시 `diarizeWithPyannote()`와 `convertToMonoViaServer()`는 즉시 `null`을 반환한다. 이 경우 호출부에서 LLM 기반 `diarizeSegments()`로 fallback해야 한다.

**예제**
```js
// SettingsScreen.js 패턴 기반
// 로드
useEffect(() => {
  getPyannoteUrl().then((u) => { if (u) setPyannoteUrlState(u); });
}, []);

// 저장
async function handleSavePyannoteUrl() {
  await setPyannoteUrl(pyannoteUrl.trim()); // 예: 'http://192.168.0.10:5000'
}

// 삭제
async function handleClearPyannoteUrl() {
  await setPyannoteUrl('');
  setPyannoteUrlState('');
}
```

---

#### setPyannoteUrl

```js
setPyannoteUrl(url: string): Promise<void>
```

화자 분리 Pyannote 서버 URL을 `pyannote_url` 전역 키에 저장한다. 사용자 무관(전역 저장).

**파라미터**
| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| url | string | 필수 | Pyannote 서버 URL (예: `'http://192.168.0.10:5000'`) |

**반환값**
`Promise<void>`

---

### 일정

---

#### getSchedules

```js
getSchedules(): Promise<Schedule[]>
```

현재 로그인 사용자의 일정 목록 전체를 조회한다. 해당 사용자 키가 없으면 샘플 일정 6건을 자동 초기화한 뒤 반환한다.

**반환값**
`Schedule[]` — 저장된 일정 배열. 빈 배열이 아닌 샘플 데이터로 초기화된다.

**주의**
- 데이터가 현재 로그인 사용자 ID별로 격리된다 (`schedules_v1_${user.id}`).
- 신규 사용자나 계정 전환 직후 첫 호출 시 샘플 일정 6건이 자동으로 생성된다. 테스트 데이터를 원하지 않으면 `saveSchedules([])`로 초기화해야 한다.

---

#### saveSchedules

```js
saveSchedules(schedules: Schedule[]): Promise<void>
```

일정 목록 전체를 현재 사용자 키에 덮어쓰기 저장한다.

**파라미터**
| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| schedules | Schedule[] | 필수 | 저장할 일정 배열 전체 |

**반환값**
`Promise<void>`

**주의**
- 기존 데이터 전체를 교체한다. 단건 수정이라면 `updateSchedule()`을 사용할 것.

**예제**
```js
// 직접 작성 예제
// 전체 목록 초기화 (샘플 데이터 제거 등)
await saveSchedules([]);
// 주의: 기존 데이터 전체가 교체됨 — 단건 수정은 updateSchedule 사용
```

---

#### addSchedule

```js
addSchedule(schedule: object): Promise<Schedule[]>
```

새 일정을 목록 맨 앞에 추가한다. `id`와 `createdAt`은 자동 생성된다.

**파라미터**
| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| schedule | object | 필수 | `{ date, time, title, tag, notes, clientIds?, startDate?, endDate? }` |

**반환값**
신규 항목이 포함된 업데이트된 `Schedule[]`

**주의**
- `id`는 `Date.now().toString()`으로 생성된다. 동시 호출 시 충돌 가능성이 있다.
- 반환된 배열에 신규 항목이 인덱스 0에 위치한다.

**예제**
```js
// ScheduleScreen.js 패턴 기반

// 목록 조회 (사용자별 격리 자동 적용)
const schedules = await getSchedules();

// 일정 추가
const updated = await addSchedule({
  date: '2026-07-10',
  time: '14:00',
  title: '삼성물산 Q3 미팅',
  tag: '영업',
  notes: '3분기 발주 물량 논의',
  clientIds: ['client_id_1'],
  startDate: '',   // 기간 일정 시작 (선택)
  endDate: '',     // 기간 일정 마감 (선택)
});
setSchedules(updated);
```

---

#### deleteSchedule

```js
deleteSchedule(id: string): Promise<Schedule[]>
```

지정 ID의 일정을 삭제한다.

**파라미터**
| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| id | string | 필수 | 삭제할 일정 ID |

**반환값**
삭제 후 `Schedule[]`

**주의**
- 존재하지 않는 ID를 전달해도 에러를 던지지 않는다. 배열을 그대로 반환한다.

**예제**
```js
// 일정 삭제
const updated = await deleteSchedule(scheduleId);
setSchedules(updated);
```

---

#### updateSchedule

```js
updateSchedule(id: string, fields: object): Promise<Schedule[]>
```

지정 ID 일정의 특정 필드를 업데이트한다. 기존 데이터와 병합(`{ ...existing, ...fields }`)한다.

**파라미터**
| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| id | string | 필수 | 수정할 일정 ID |
| fields | object | 필수 | 변경할 필드만 포함 (전체 객체 불필요) |

**반환값**
업데이트된 `Schedule[]`

**예제**
```js
// 일정 수정
const updated = await updateSchedule(scheduleId, {
  title: '미팅 장소 변경',
  time: '15:00',
  notes: '장소: 삼성물산 본사 3F',
});
setSchedules(updated);
```

---

### 거래처

---

#### getClients

```js
getClients(): Promise<Client[]>
```

현재 로그인 사용자의 거래처 목록 전체를 조회한다. 해당 사용자 키가 없으면 샘플 거래처 4건을 자동 초기화한 뒤 반환한다.

**반환값**
`Client[]` — 저장된 거래처 배열.

**주의**
- 데이터가 현재 로그인 사용자 ID별로 격리된다 (`clients_v1_${user.id}`).
- 신규 사용자 첫 호출 시 샘플 거래처 4건이 자동 생성된다.
- 화면 레이어에서 로그인한 사용자 본인(`user.name`)과 동일한 이름을 가진 거래처를 필터링하는 로직은 화면 단에서 처리된다(이 함수 자체는 필터하지 않음).

---

#### saveClients

```js
saveClients(clients: Client[]): Promise<void>
```

거래처 목록 전체를 현재 사용자 키에 덮어쓰기 저장한다.

**파라미터**
| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| clients | Client[] | 필수 | 저장할 거래처 배열 전체 |

**반환값**
`Promise<void>`

**예제 (`deleteClient` 대체 패턴)**
```js
// ClientScreen.js 패턴 기반
// deleteClient 함수가 없으므로 필터링 후 saveClients로 처리
const allClients = await getClients();
await saveClients(allClients.filter((c) => c.id !== targetId));
setClients(await getClients());
```

---

#### addClient

```js
addClient(client: object): Promise<Client[]>
```

새 거래처를 목록 맨 앞에 추가한다. `id`와 `createdAt`은 자동 생성된다.

**파라미터**
| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| client | object | 필수 | `{ name, company, role, contact, workContact?, notes? }` |

**반환값**
신규 항목이 포함된 업데이트된 `Client[]`

**예제**
```js
// ClientScreen.js 패턴 기반

// 목록 조회 (병렬 로드)
const [clients, histories, favorites, me] = await Promise.all([
  getClients(),
  getHistories(),
  getClientFavorites(),
  getCurrentUser(),
]);
// 로그인 사용자 본인은 화면 레이어에서 필터
const filteredClients = clients.filter((c) => c.name !== me?.name);

// 거래처 추가
const updated = await addClient({
  name: '김민준',
  company: '삼성물산',
  role: '구매팀장',
  contact: '010-1234-5678',
  workContact: '02-1234-0000',
  notes: 'Q3 발주 담당자',
});
setClients(updated);
```

---

#### updateClient

```js
updateClient(id: string, fields: object): Promise<Client[]>
```

지정 ID 거래처의 특정 필드를 업데이트한다. 기존 데이터와 병합한다.

**파라미터**
| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| id | string | 필수 | 수정할 거래처 ID |
| fields | object | 필수 | 변경할 필드만 포함 |

**반환값**
업데이트된 `Client[]`

**주의**
- 거래처 삭제 함수(`deleteClient`)는 존재하지 않는다. 삭제가 필요하면 `getClients()`로 가져온 뒤 필터링 후 `saveClients()`로 저장해야 한다.

**예제**
```js
// 거래처 수정
const updated = await updateClient(client.id, {
  role: '구매본부장',
  workContact: '02-9999-0000',
});
setClients(updated);
```

---

### 히스토리

---

#### getHistories

```js
getHistories(): Promise<History[]>
```

현재 로그인 사용자의 거래처 히스토리 전체를 조회한다. 해당 사용자 키가 없으면 샘플 히스토리 7건을 자동 초기화한 뒤 반환한다.

**반환값**
`History[]` — 저장된 히스토리 배열.

**주의**
- 데이터가 현재 로그인 사용자 ID별로 격리된다 (`histories_v1_${user.id}`).
- 특정 거래처 히스토리만 필요하면 `getHistoriesByClient(clientId)`를 사용하라.

---

#### saveHistories

```js
saveHistories(histories: History[]): Promise<void>
```

히스토리 목록 전체를 현재 사용자 키에 덮어쓰기 저장한다.

**파라미터**
| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| histories | History[] | 필수 | 저장할 히스토리 배열 전체 |

**반환값**
`Promise<void>`

---

#### addHistory

```js
addHistory(history: object): Promise<History[]>
```

새 거래처 히스토리를 목록 맨 앞에 추가한다. `id`와 `createdAt`은 자동 생성된다.

**파라미터**
| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| history | object | 필수 | `{ clientId, date, type, title, content, result }` |

**반환값**
신규 항목이 포함된 업데이트된 `History[]`

**예제**
```js
// ClientScreen.js 패턴 기반
const today = new Date().toISOString().slice(0, 10);

// 히스토리 추가
const updated = await addHistory({
  clientId: selectedClient.id,
  date: today,
  type: '미팅',           // '미팅' | '통화' | '이메일' | '계약' | '기타'
  title: 'Q3 발주 논의',
  content: '3분기 물량 300개 확정. 단가 협의 필요.',
  result: '다음 주 견적서 제출 예정',
});
setHistories(updated);
```

---

#### updateHistory

```js
updateHistory(id: string, changes: object): Promise<History[]>
```

지정 ID 히스토리의 특정 필드를 업데이트한다. 기존 데이터와 병합한다.

**파라미터**
| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| id | string | 필수 | 수정할 히스토리 ID |
| changes | object | 필수 | 변경할 필드만 포함 |

**반환값**
업데이트된 `History[]`

**예제**
```js
// 히스토리 수정
const updated = await updateHistory(editingHistory.id, {
  type: '통화',
  title: '견적서 후속 통화',
  content: '견적 조건 수락',
  result: '계약서 작성 진행',
});
setHistories(updated);
```

---

#### deleteHistory

```js
deleteHistory(id: string): Promise<History[]>
```

지정 ID의 히스토리를 삭제한다.

**파라미터**
| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| id | string | 필수 | 삭제할 히스토리 ID |

**반환값**
삭제 후 `History[]`

**예제**
```js
// 히스토리 삭제
const updated = await deleteHistory(historyId);
setHistories(updated);
```

---

#### getHistoriesByClient

```js
getHistoriesByClient(clientId: string): Promise<History[]>
```

특정 거래처 ID에 해당하는 히스토리만 필터링하여 최신순(`createdAt` 내림차순)으로 반환한다.

**파라미터**
| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| clientId | string | 필수 | 조회할 거래처 ID |

**반환값**
해당 거래처의 `History[]` (최신순 정렬). 해당 거래처 히스토리가 없으면 `[]`.

**예제**
```js
// 직접 작성 예제
// 특정 거래처의 히스토리만 최신순으로 조회
const clientHistories = await getHistoriesByClient(selectedClient.id);
// clientHistories: History[] (createdAt 내림차순 정렬)
// 해당 거래처 히스토리가 없으면 []
```

---

### 프로젝트

---

#### getProjects

```js
getProjects(): Promise<Project[]>
```

현재 로그인 사용자의 프로젝트 목록 전체를 조회한다. 해당 사용자 키가 없으면 샘플 프로젝트 6건을 자동 초기화한 뒤 반환한다.

**반환값**
`Project[]` — 저장된 프로젝트 배열.

**주의**
- 데이터가 현재 로그인 사용자 ID별로 격리된다 (`projects_v1_${user.id}`).

---

#### saveProjects

```js
saveProjects(projects: Project[]): Promise<void>
```

프로젝트 목록 전체를 현재 사용자 키에 덮어쓰기 저장한다.

**파라미터**
| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| projects | Project[] | 필수 | 저장할 프로젝트 배열 전체 |

**반환값**
`Promise<void>`

---

#### addProject

```js
addProject(project: object): Promise<Project[]>
```

새 프로젝트를 목록 맨 앞에 추가한다. `id`와 `createdAt`은 자동 생성된다.

**파라미터**
| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| project | object | 필수 | `{ title, deadline, status, progress, priority, notes?, clientIds?, meetingRecordIds?, startDate? }` |

**반환값**
신규 항목이 포함된 업데이트된 `Project[]`

**예제**
```js
// ProjectScreen.js 패턴 기반

// 목록 조회 (병렬 로드)
const [allProjects, records, clientList, histList] = await Promise.all([
  getProjects(),
  getMeetingRecords(),
  getClients(),
  getHistories(),
]);

// 프로젝트 추가
const updated = await addProject({
  title: 'LG전자 연간 계약 갱신',
  deadline: '2026-08-31',
  startDate: '2026-07-01',
  status: '진행중',     // '진행중' | '위험' | '지연' | '완료' | '취소'
  progress: 20,         // 0~100
  priority: '높음',     // '높음' | '보통' | '낮음'
  notes: '2024년 대비 20% 단가 인하 목표',
  clientIds: ['client_id_1'],
  meetingRecordIds: [],
});
setProjects(updated);
```

---

#### updateProject

```js
updateProject(id: string, changes: object): Promise<Project[]>
```

지정 ID 프로젝트의 특정 필드를 업데이트한다. `updatedAt`이 자동으로 현재 타임스탬프로 갱신된다.

**파라미터**
| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| id | string | 필수 | 수정할 프로젝트 ID |
| changes | object | 필수 | 변경할 필드만 포함 |

**반환값**
업데이트된 `Project[]`

**주의**
- AI 자연어 명령으로 프로젝트 상태를 변경할 때 JSON 응답 파싱 후 이 함수를 호출한다. `askClaude()` 호출 시 반드시 `{ raw: true }`를 전달해야 JSON이 `stripNonKorean()`으로 손상되지 않는다.

**예제**
```js
// 프로젝트 수정
const updated = await updateProject(project.id, {
  status: '위험',
  progress: 45,
  notes: '담당자 교체로 일정 지연 위험',
});
setProjects(updated);

// AI JSON 응답으로 프로젝트 업데이트 (raw:true 필수)
const reply = await askClaude(
  apiMessages,
  buildProjectDelaySystem(projects, []),
  { raw: true }
);
if (reply.includes('"action":"update_project"')) {
  const parsed = JSON.parse(reply.trim());
  const updated = await updateProject(parsed.id, parsed.changes);
  setProjects(updated);
}
```

---

#### deleteProject

```js
deleteProject(id: string): Promise<Project[]>
```

지정 ID의 프로젝트를 삭제한다.

**파라미터**
| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| id | string | 필수 | 삭제할 프로젝트 ID |

**반환값**
삭제 후 `Project[]`

**예제**
```js
// 프로젝트 삭제
setProjects(await deleteProject(project.id));
```

---

### 메세지

---

#### getMessages

```js
getMessages(): Promise<Message[]>
```

현재 로그인 사용자의 메세지 목록 전체를 조회한다. 해당 사용자 키가 없으면 샘플 메세지 7건을 자동 초기화한 뒤 반환한다.

**반환값**
`Message[]` — 저장된 메세지 배열.

**주의**
- 데이터가 현재 로그인 사용자 ID별로 격리된다 (`messages_v3_${user.id}`).
- 키 버전이 `v3`임에 주의. 이전 `v1`, `v2` 데이터는 자동 마이그레이션되지 않는다.

---

#### saveMessages

```js
saveMessages(messages: Message[]): Promise<void>
```

현재 사용자의 메세지 목록 전체를 덮어쓰기 저장한다.

**파라미터**
| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| messages | Message[] | 필수 | 저장할 메세지 배열 전체 |

**반환값**
`Promise<void>`

---

#### addMessage

```js
addMessage(message: object): Promise<Message[]>
```

현재 로그인 사용자의 메세지함에 새 메세지를 맨 앞에 추가한다. `id`와 `createdAt`은 자동 생성된다.

**파라미터**
| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| message | object | 필수 | `{ direction, fromId, toId, sender, company, subject, content, priority, status }` |

**반환값**
신규 항목이 포함된 업데이트된 `Message[]`

**주의**
- 현재 로그인 사용자 기준 메세지함에 추가된다. 수신자 메세지함에 추가하려면 `addMessageForUser()`를 사용하라.
- `message` 객체에 `id`를 명시적으로 전달하면 자동 생성값을 덮어쓴다. 이 동작을 이용해 sent/received 메세지 ID를 연동할 수 있다 (아래 예제 참조).

**예제**
```js
// MessageScreen.js 패턴 기반

// 목록 조회
const messages = await getMessages();

// 메세지 전송 (보낸 메세지함 + 수신자 받은 메세지함 동시 추가)
const ts = Date.now();
const sentMsgId = String(ts);
const receivedMsgId = String(ts + 1);

await addMessage({
  id: sentMsgId,           // 명시적 id → 자동 생성값을 override (sent/received 연동용)
  direction: 'sent',
  sender: user.name,
  company: '내부',
  subject: 'Q3 발주 건 확인 요청',
  content: '안녕하세요. Q3 발주 물량 확인 부탁드립니다.',
  priority: '일반',   // '긴급' | '일반' | '낮음'
  status: '미확인',   // '미확인' | '확인' | '처리중' | '완료'
  fromId: user.id,
  toId: 'kmj',
  linkedReceivedId: receivedMsgId,
});

// 수신자 받은 메세지함에 추가
await addMessageForUser('kmj', {
  id: receivedMsgId,
  direction: 'received',
  sender: user.name,
  company: '내부',
  subject: 'Q3 발주 건 확인 요청',
  content: '안녕하세요. Q3 발주 물량 확인 부탁드립니다.',
  priority: '일반',
  status: '미확인',
  fromId: user.id,
  toId: 'kmj',
});

setMessages(await getMessages());
```

---

#### addMessageForUser

```js
addMessageForUser(userId: string, message: object): Promise<Message[]>
```

특정 사용자 ID의 메세지함에 직접 메세지를 추가한다. 계정 간 메세지 전송 시뮬레이션에 사용한다.

**파라미터**
| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| userId | string | 필수 | 수신 대상 사용자 ID (예: `'kmj'`) |
| message | object | 필수 | `{ direction, fromId, toId, sender, company, subject, content, priority, status }` |

**반환값**
대상 사용자의 업데이트된 `Message[]`

**주의**
- `userKey()` 헬퍼를 사용하지 않고 `messages_v3_${userId}` 키에 직접 접근한다.
- 대상 사용자의 메세지 데이터가 없으면 샘플 메세지로 자동 초기화된 뒤 추가된다.
- `message` 객체에 `id`를 명시적으로 전달하면 자동 생성값을 덮어쓴다.

---

#### updateMessage

```js
updateMessage(id: string, changes: object): Promise<Message[]>
```

현재 로그인 사용자 메세지함의 지정 ID 메세지를 업데이트한다. `updatedAt`이 자동 갱신된다.

**파라미터**
| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| id | string | 필수 | 수정할 메세지 ID |
| changes | object | 필수 | 변경할 필드만 포함 (예: `{ status: '확인' }`) |

**반환값**
업데이트된 `Message[]`

**예제**
```js
// MessageScreen.js 패턴 기반

// 메세지 읽음 처리 (상세 화면 열 때 자동 적용)
updateMessage(msg.id, { status: '확인' }).then((updated) => {
  setMessages(updated);
  setDetailMsg({ ...msg, status: '확인' });
});

// 메세지 수정 + 연결된 수신자 메세지 동기화
const updated = await updateMessage(detailMsg.id, {
  subject: '수정된 제목',
  content: '수정된 내용',
  priority: '긴급',
  status: '처리중',
});
if (detailMsg.linkedReceivedId && detailMsg.toId) {
  await updateMessageForUser(detailMsg.toId, detailMsg.linkedReceivedId, {
    subject: '수정된 제목',
    content: '수정된 내용',
  });
  // updateMessageForUser 반환값은 void — 목록 갱신 시 별도로 getMessages() 호출
}
setMessages(updated);

// 상태만 변경
async function handleStatusChange(id, status) {
  const updated = await updateMessage(id, { status });
  setMessages(updated);
}
```

---

#### updateMessageForUser

```js
updateMessageForUser(userId: string, id: string, changes: object): Promise<void>
```

특정 사용자 ID의 메세지함에서 지정 메세지를 업데이트한다. `updatedAt`이 자동 갱신된다.

**파라미터**
| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| userId | string | 필수 | 대상 사용자 ID |
| id | string | 필수 | 수정할 메세지 ID |
| changes | object | 필수 | 변경할 필드만 포함 |

**반환값**
`Promise<void>`

**주의**
- 대상 사용자의 메세지 데이터가 없으면(키 없음) 아무 작업 없이 조기 반환한다. 에러를 던지지 않는다.
- `updateMessage()`와 달리 반환값이 `void`다. 업데이트 후 목록이 필요하면 별도로 `getMessages()`를 호출해야 한다.

---

#### deleteMessage

```js
deleteMessage(id: string): Promise<Message[]>
```

현재 로그인 사용자 메세지함에서 지정 ID 메세지를 삭제한다.

**파라미터**
| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| id | string | 필수 | 삭제할 메세지 ID |

**반환값**
삭제 후 `Message[]`

**예제**
```js
// MessageScreen.js 패턴 기반
Alert.alert('삭제', `"${item.subject}" 메세지를 삭제할까요?`, [
  { text: '취소', style: 'cancel' },
  {
    text: '삭제',
    style: 'destructive',
    onPress: async () => setMessages(await deleteMessage(item.id)),
  },
]);
```

---

### 회의록

---

#### getMeetingRecords

```js
getMeetingRecords(): Promise<MeetingRecord[]>
```

현재 로그인 사용자의 회의록 목록 전체를 조회한다. 데이터가 없으면 빈 배열 `[]`을 반환한다.

**반환값**
`MeetingRecord[]` — 저장된 회의록 배열. 데이터 없으면 `[]` (샘플 데이터 자동 초기화 없음).

**주의**
- 데이터가 현재 로그인 사용자 ID별로 격리된다 (`meeting_records_v1_${user.id}`).
- 다른 도메인(`getSchedules` 등)과 달리 샘플 데이터 자동 초기화가 없다. 첫 호출 시 `[]`를 반환한다.

---

#### saveMeetingRecords

```js
saveMeetingRecords(records: MeetingRecord[]): Promise<void>
```

회의록 목록 전체를 현재 사용자 키에 덮어쓰기 저장한다.

**파라미터**
| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| records | MeetingRecord[] | 필수 | 저장할 회의록 배열 전체 |

**반환값**
`Promise<void>`

---

#### addMeetingRecord

```js
addMeetingRecord(record: object): Promise<MeetingRecord[]>
```

새 회의록을 목록 맨 앞에 추가한다. `id`와 `createdAt`은 자동 생성된다.

**파라미터**
| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| record | object | 필수 | `{ title, transcript, summary, source, clientIds, projectId, tasks }` |

**반환값**
신규 항목이 포함된 업데이트된 `MeetingRecord[]`

**주의**
- 반환된 배열(최신 목록)을 `analyzeWorkTopics()` 호출에 인자로 넘겨야 stale closure 없이 최신 목록 기준으로 분석된다.
- `projectId`는 회의록과 프로젝트 연결에 사용된다. 연결할 프로젝트가 없으면 `projectId: ''`를 전달할 것.

**예제**
```js
// MeetingScreen.js 패턴 기반

// 목록 조회
const records = await getMeetingRecords(); // 데이터 없으면 [] 반환 (샘플 초기화 없음)

// 회의록 저장 (STT + AI 요약 완료 후)
const updated = await addMeetingRecord({
  title: '2026-07-10 · recording',
  source: 'recording',       // 'recording' | 'file'
  summary: aiSummary,
  transcript: diarizedText,  // '[화자 1] 내용\n[화자 2] 내용' 형식
  tasks: [
    { assignee: '김민준', content: '견적서 제출', deadline: '2026-07-15', priority: '높음' },
  ],
  clientIds: ['client_id_1'],
  projectId: '',             // 연결할 프로젝트 없으면 '' 전달
});
setMeetingRecords(updated);
// 반환된 updated를 analyzeWorkTopics()에 전달하면 stale closure 없이 최신 목록으로 분석 가능
analyzeWorkTopics(updated);
```

---

#### updateMeetingRecord

```js
updateMeetingRecord(id: string, changes: object): Promise<MeetingRecord[]>
```

지정 ID 회의록의 특정 필드를 업데이트한다. 기존 데이터와 병합한다.

**파라미터**
| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| id | string | 필수 | 수정할 회의록 ID |
| changes | object | 필수 | 변경할 필드만 포함 |

**반환값**
업데이트된 `MeetingRecord[]`

**예제**
```js
// 회의록 수정 (트랜스크립트 업데이트 등)
const updated = await updateMeetingRecord(record.id, {
  transcript: updatedTranscript,
  summary: updatedSummary,
});
setMeetingRecords(updated);
```

---

#### deleteMeetingRecord

```js
deleteMeetingRecord(id: string): Promise<MeetingRecord[]>
```

지정 ID의 회의록을 삭제한다.

**파라미터**
| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| id | string | 필수 | 삭제할 회의록 ID |

**반환값**
삭제 후 `MeetingRecord[]`

**예제**
```js
// 직접 작성 예제
const updated = await deleteMeetingRecord(record.id);
setMeetingRecords(updated);
```

---

### 기타

---

#### getWorkTopics

```js
getWorkTopics(): Promise<string>
```

업무 주제 분석 결과 텍스트를 조회한다. 사용자 무관 전역 키(`work_topics_v1`)에 저장된다.

**반환값**
저장된 텍스트 문자열. 미설정 시 `''` (빈 문자열).

**주의**
- 사용자별 격리 없음. 모든 계정이 같은 업무 주제를 공유한다.

**예제**
```js
// MeetingScreen.js 패턴 기반
// 조회
const topicsText = await getWorkTopics(); // 미설정 시 ''

// 저장 (AI 분석 결과)
await saveWorkTopics(analysisResult);
```

---

#### saveWorkTopics

```js
saveWorkTopics(text: string): Promise<void>
```

업무 주제 분석 결과 텍스트를 `work_topics_v1` 전역 키에 저장한다.

**파라미터**
| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| text | string | 필수 | 저장할 업무 주제 텍스트 |

**반환값**
`Promise<void>`

---

#### getClientFavorites

```js
getClientFavorites(): Promise<string[]>
```

현재 로그인 사용자의 거래처 즐겨찾기 ID 배열을 조회한다.

**반환값**
즐겨찾기 거래처 ID 배열. 미설정 시 `[]`.

**주의**
- 데이터가 현재 로그인 사용자 ID별로 격리된다 (`client_favorites_v1_${user.id}`).

**예제**
```js
// ClientScreen.js 패턴 기반
// 초기 로드
const favs = await getClientFavorites(); // string[] — 즐겨찾기 clientId 배열
setFavorites(favs);

// 즐겨찾기 토글 (이미 있으면 제거, 없으면 추가)
const updatedFavs = await toggleClientFavorite(client.id);
setFavorites(updatedFavs);
```

---

#### toggleClientFavorite

```js
toggleClientFavorite(clientId: string): Promise<string[]>
```

거래처 즐겨찾기를 토글한다. 이미 즐겨찾기에 있으면 제거하고, 없으면 추가한다.

**파라미터**
| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| clientId | string | 필수 | 토글할 거래처 ID |

**반환값**
업데이트된 즐겨찾기 ID 배열

---

#### getUserProfile

```js
getUserProfile(): Promise<UserProfile | null>
```

현재 로그인 사용자의 확장 프로필을 조회한다. 기본 User 필드에 확장 필드(`contact`, `notes` 등)를 병합한 객체를 반환한다.

**반환값**
- 로그인 상태: `{ contact: string, notes: string, ...User, ...extendedFields }`
  - `contact`와 `notes`는 미설정 시 기본값 `''`
- 미로그인: `null`

**주의**
- 확장 프로필 저장 키는 `user_profile_v1_${user.id}`. `userKey()` 헬퍼 대신 직접 키를 조합한다.
- 반환 객체는 기본 User 필드(`id`, `email`, `name`, `role`, `team`)와 확장 필드가 병합된 상태다.

**예제**
```js
// SettingsScreen.js 패턴 기반
// 로드
useEffect(() => {
  getUserProfile().then((p) => { if (p) setProfile(p); });
}, []);
// profile: { id, email, name, role, team, contact, notes, ...extendedFields }
// 미로그인이면 null

// 저장 (확장 필드만 업데이트, 기본 User 필드는 변경 불가)
async function handleProfileSave() {
  await saveUserProfile({
    contact: editContact.trim(),
    notes: editNotes.trim(),
  });
  const updated = await getUserProfile();
  setProfile(updated);
}
```

---

#### saveUserProfile

```js
saveUserProfile(fields: object): Promise<void>
```

현재 로그인 사용자의 확장 프로필 필드를 부분 업데이트한다. 기존 확장 프로필 데이터와 병합한다.

**파라미터**
| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| fields | object | 필수 | 저장할 확장 프로필 필드 (예: `{ contact: '010-...', notes: '...' }`) |

**반환값**
`Promise<void>`

**주의**
- 미로그인 상태에서 호출하면 아무 작업 없이 조기 반환한다. 에러를 던지지 않는다.
- 기본 User 필드(`id`, `email`, `name`, `role`, `team`)는 이 함수로 변경할 수 없다. 테스트 계정이 하드코딩되어 있기 때문이다.

---

## claude.js

AI 호출 진입점 + 시스템 프롬프트 빌더. Groq(`llama-3.3-70b-versatile`) 또는 Grok(`grok-3`) 공급자를 `getAiProvider()` 설정에 따라 자동 선택한다. 내부 헬퍼 `callGroq`, `callGrok`, `fmtDate`는 export되지 않으므로 외부에서 직접 사용 불가.

```js
import {
  askClaude,
  fixForeignWordsInText,
  buildScheduleSystem,
  buildProjectDelaySystem,
  buildTaskExtractionSystem,
  buildClientSystem,
  josa과와,
  stripNonKorean,
  normalizeAIDates,
} from '../services/claude';
```

---

### 한국어 유틸리티

---

#### josa과와

```js
josa과와(word: string): string
```

한국어 단어의 마지막 음절 받침 유무에 따라 조사 `과` 또는 `와`를 반환한다.

**파라미터**
| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| word | string | 필수 | 조사를 붙일 한국어 단어 |

**반환값**
- 받침 있음: `'과'`
- 받침 없음 또는 마지막 글자가 한글 범위 밖: `'와'`

**주의**
- 비동기 함수가 아니다.
- 마지막 글자가 영문자·숫자 등 한글 범위(`0xAC00`–`0xD7A3`) 밖이면 항상 `'와'`를 반환한다.

**예제**
```js
// ClientScreen.js 패턴 기반 (동기 함수)
const particle = josa과와(client.name); // '과' 또는 '와'
const prompt = `${client.company} ${client.name}${particle}의 관계를 요약해줘.`;
```

---

#### stripNonKorean

```js
stripNonKorean(text: string): string
```

텍스트에서 한글·공백·숫자·기본 문장부호(`.?!,:\[\]`) 외의 모든 문자를 제거한다. `askClaude()` 내부에서 `raw=false`(기본) 시 자동 적용된다.

**파라미터**
| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| text | string | 필수 | 필터링할 텍스트 |

**반환값**
한글·공백·숫자·`.?!,:\[\]` 만 남긴 문자열.

**주의**
- 비동기 함수가 아니다.
- 영문자, 한자, 일본어, 특수기호가 모두 제거된다. JSON 응답이나 영문 포함 결과를 기대하는 경우 `askClaude()` 호출 시 반드시 `{ raw: true }`를 전달해야 한다.

**예제**
```js
// 직접 작성 예제 (동기 함수)
// askClaude() 내부에서 raw=false(기본) 시 자동 적용됨
// 직접 사용이 필요한 경우:
const koreanOnly = stripNonKorean('Hello 안녕 123 World!');
// → '안녕 123'
// 주의: JSON 응답에 직접 적용하면 구조가 손상됨
```

---

#### normalizeAIDates

```js
normalizeAIDates(text: string | null | undefined): string | null | undefined
```

AI 응답 텍스트의 `YYYY-MM-DD`, `YYYY.MM.DD`, `YYYY/MM/DD` 형식 날짜를 `yyyy년 mm월 dd일` 형식으로 변환한다.

**파라미터**
| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| text | string \| null \| undefined | 필수 | 날짜 형식이 포함된 AI 응답 텍스트 |

**반환값**
날짜 형식이 한국어로 변환된 문자열. falsy 입력(`null`, `undefined`, `''`)은 입력값 그대로 반환한다 (`null` 입력 → `null` 반환, `undefined` 입력 → `undefined` 반환).

**주의**
- 비동기 함수가 아니다.
- `askClaude()` 호출 후 UI에 표시하기 전에 적용한다.
- 반환 타입에 `null`이 포함됨에 주의. TypeScript 사용 시 `string | null | undefined`로 타입 가드 필요.

**예제**
```js
// 직접 작성 예제 (동기 함수)
// AI 응답 표시 전 날짜 형식 한국어 변환
const displayText = normalizeAIDates(aiResponse);
// '2026-07-10' → '2026년 07월 10일'
// '2026.07.10' → '2026년 07월 10일'
// null/undefined 입력은 그대로 반환
```

---

### AI 호출

---

#### askClaude

```js
askClaude(messages: Array<{role: string, content: string}>, systemPrompt: string, options?: {raw?: boolean}): Promise<string>
```

AI 공급자(Groq/Grok)를 자동 선택하여 채팅 완성 요청을 실행하는 메인 AI 호출 함수. `raw=false`(기본)이면 응답에 `stripNonKorean()`을 적용하여 한국어·숫자·기본 부호만 반환한다.

**파라미터**
| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| messages | Array<{role: string, content: string}> | 필수 | 대화 히스토리 배열 (`role`: `'user'` 또는 `'assistant'`) |
| systemPrompt | string | 필수 | 시스템 프롬프트 문자열 |
| options | `{ raw?: boolean }` | 선택 | 기본 `{}`. `raw: true`이면 필터 없이 원문 반환 |

**반환값**
AI 응답 텍스트. `raw=false`(기본)이면 `stripNonKorean()` 적용 후 반환.

**에러**
- API 키 미설정: `Error('API_KEY_MISSING')`
- HTTP 오류: `Error('API 오류 (status)')` 또는 API 서버의 에러 메시지

**주의**
- **JSON 응답을 기대하는 모든 호출에는 반드시 `{ raw: true }` 전달.** 예시: 태스크 추출(`buildTaskExtractionSystem`), 프로젝트 상태 업데이트(`buildProjectDelaySystem`의 `update_project` 응답), 일정 생성(`buildScheduleSystem`의 `create_schedule` 응답). `raw: true` 없이 호출하면 JSON이 `stripNonKorean()`으로 손상되어 파싱 실패한다.
- 공급자 선택은 `getAiProvider()` 설정에 따른다. Groq는 `getApiKey()`, Grok은 `getGrokApiKey()`를 사용한다.

**예제 — 일반 텍스트 응답 (raw 불필요)**
```js
// ScheduleScreen.js 패턴 기반
// 일정 AI 비서 채팅
const systemPrompt = buildScheduleSystem(schedules);
try {
  const reply = await askClaude(
    [...chatHistory, { role: 'user', content: userInput }],
    systemPrompt
    // raw 옵션 생략 = 기본 false → stripNonKorean 자동 적용
  );
  setChatHistory((prev) => [...prev, { role: 'assistant', content: reply }]);
} catch (e) {
  if (e.message === 'API_KEY_MISSING') {
    Alert.alert('API 키 필요', 'API 키를 설정해주세요.', [
      { text: '설정으로', onPress: () => navigation.navigate('설정') },
    ]);
  }
}
```

**예제 — JSON 파싱 시 raw:true 필수**
```js
// ScheduleScreen.js 패턴 기반 (create_schedule JSON 파싱)
const reply = await askClaude(
  apiMessages,
  buildScheduleSystem(schedules),
  { raw: true } // JSON에 영문·특수문자 포함 → 필터 비활성화 필수
);
if (reply.includes('"action":"create_schedule"')) {
  const jsonStr = reply.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
  const parsed = JSON.parse(jsonStr);
  const updated = await addSchedule(parsed.data);
  setSchedules(updated);
}
```

```js
// MeetingScreen.js 패턴 기반 (태스크 추출 JSON 파싱)
const raw = await askClaude(
  [{ role: 'user', content: transcriptText }],
  buildTaskExtractionSystem(),
  { raw: true } // JSON 배열 응답 — raw:true 없으면 파싱 실패
);
const jsonStr = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
const tasks = JSON.parse(jsonStr);
// tasks: [{ assignee, content, deadline, priority }]
```

---

#### fixForeignWordsInText

```js
fixForeignWordsInText(text: string): Promise<string>
```

STT 결과 텍스트의 문맥에 맞지 않는 외국어(영어·일본어·한자 등)를 AI로 자연스러운 한국어로 교체한다. 고유명사(사람 이름·회사명·제품명·기술명)와 표준 외래어(인터넷·컴퓨터 등)는 변경하지 않는다.

**파라미터**
| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| text | string | 필수 | STT 결과 등 외국어가 포함된 텍스트 |

**반환값**
외국어가 한국어로 교체된 문자열(`.trim()` 적용). 수정 불필요 시 원문 그대로 반환.

**에러**
- API 키 미설정: `Error('API_KEY_MISSING')`
- HTTP 오류: `Error('API 오류 (status)')`

**주의**
- `askClaude()`와 달리 `stripNonKorean()`을 적용하지 않는다. 내부적으로 `callGroq`/`callGrok`를 직접 호출한다. 고유명사(영문 회사명 등)가 포함된 원문을 유지해야 하기 때문이다.
- `[화자 N]` 형식의 화자 표시와 텍스트 구조(줄바꿈, 제목 등)는 변경하지 않도록 프롬프트에 명시되어 있다.

**예제**
```js
// MeetingScreen.js 패턴 기반
// STT 결과의 외국어를 한국어로 교체 (고유명사·표준 외래어 유지)
try {
  const [fixedTranscript, fixedSummary] = await Promise.all([
    item.transcript ? fixForeignWordsInText(item.transcript) : null,
    item.summary ? fixForeignWordsInText(item.summary) : null,
  ]);
  const updated = await updateMeetingRecord(item.id, {
    transcript: fixedTranscript ?? item.transcript,
    summary: fixedSummary ?? item.summary,
  });
  setMeetingRecords(updated);
} catch (e) {
  Alert.alert('오류', e.message);
}
```

---

### 시스템 프롬프트 빌더

---

#### buildScheduleSystem

```js
buildScheduleSystem(schedules: Schedule[]): string
```

현재 일정 목록과 오늘 날짜를 포함한 일정 관리 AI 시스템 프롬프트를 생성한다. `askClaude()`의 `systemPrompt` 인자로 전달한다.

**파라미터**
| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| schedules | Schedule[] | 필수 | 현재 사용자의 일정 배열 |

**반환값**
일정 AI 시스템 프롬프트 문자열. 일정 조회·충돌 감지·새 일정 생성(`create_schedule` JSON 액션) 기능 포함.

**주의**
- 비동기 함수가 아니다.
- 일정 생성 JSON 응답(`create_schedule`)을 파싱할 때는 `askClaude()` 호출에 반드시 `{ raw: true }` 전달.

**예제**
```js
// ScheduleScreen.js 패턴 기반 (동기 함수)
const systemPrompt = buildScheduleSystem(schedules);
// 일정 목록 + 오늘 날짜 컨텍스트 포함
// create_schedule JSON 응답 파싱 시 askClaude에 { raw: true } 필수
const reply = await askClaude(messages, systemPrompt, { raw: true });
```

---

#### buildProjectDelaySystem

```js
buildProjectDelaySystem(projects: Project[], schedules: Schedule[]): string
```

프로젝트 현황(상태·마감·진행률·위험도)과 오늘 날짜를 포함한 프로젝트 지연 분석 AI 시스템 프롬프트를 생성한다.

**파라미터**
| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| projects | Project[] | 필수 | 현재 사용자의 프로젝트 배열 |
| schedules | Schedule[] | 필수 | 현재 사용자의 일정 배열 |

**반환값**
프로젝트 지연 분석 AI 시스템 프롬프트 문자열. 지연 원인 분석·긴급도 순위·프로젝트 상태 업데이트(`update_project` JSON 액션) 기능 포함.

**주의**
- 비동기 함수가 아니다.
- 마감일 기준으로 D-day와 위험도(`⚠️`) 플래그가 자동 계산되어 컨텍스트에 포함된다 (마감 7일 이내 + 진행률 80% 미만).
- `update_project` JSON 응답 파싱 시 반드시 `{ raw: true }` 전달.

**예제**
```js
// ProjectScreen.js 패턴 기반 (동기 함수)
const systemPrompt = buildProjectDelaySystem(projects, []);
// 두 번째 인자: 일정 배열 (ProjectScreen은 빈 배열로 전달)
// update_project JSON 응답 파싱 시 { raw: true } 필수
const reply = await askClaude(apiMessages, systemPrompt, { raw: true });
```

---

#### buildTaskExtractionSystem

```js
buildTaskExtractionSystem(): string
```

회의 스크립트에서 실행 가능한 태스크를 JSON 배열로 추출하는 AI 시스템 프롬프트를 생성한다.

**반환값**
태스크 추출 AI 시스템 프롬프트 문자열. AI는 아래 형식의 JSON 배열만 반환하도록 지시된다:
```json
[{"assignee": "담당자", "content": "태스크 내용", "deadline": "YYYY-MM-DD", "priority": "높음|보통|낮음"}]
```

**주의**
- 비동기 함수가 아니다.
- 이 프롬프트로 `askClaude()` 호출 시 반드시 `{ raw: true }` 전달. 그렇지 않으면 `stripNonKorean()`이 JSON 구조(따옴표·괄호 등)를 제거하여 파싱이 실패한다.
- 태스크가 없으면 AI가 빈 배열 `[]`을 반환한다.

**예제**
```js
// MeetingScreen.js 패턴 기반 (동기 함수)
// 인자 없음 — 회의 스크립트를 user 메세지로 전달
const raw = await askClaude(
  [{ role: 'user', content: transcriptText }],
  buildTaskExtractionSystem(),
  { raw: true } // JSON 배열 응답 — raw:true 없으면 파싱 실패
);
// AI 응답: [{"assignee":"...", "content":"...", "deadline":"YYYY-MM-DD", "priority":"높음|보통|낮음"}]
const jsonStr = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
const tasks = JSON.parse(jsonStr);
```

---

#### buildClientSystem

```js
buildClientSystem(clients: Client[], histories: History[]): string
```

거래처 목록과 거래처별 히스토리(마지막 연락일 포함)를 컨텍스트로 포함한 거래처 관계 관리 AI 시스템 프롬프트를 생성한다.

**파라미터**
| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| clients | Client[] | 필수 | 현재 사용자의 거래처 배열 |
| histories | History[] | 필수 | 현재 사용자의 전체 히스토리 배열 |

**반환값**
거래처 관계 관리 AI 시스템 프롬프트 문자열. 거래처별 히스토리·마지막 연락일·후속 조치 제안 기능 포함.

**주의**
- 비동기 함수가 아니다.
- 내부에서 거래처별로 히스토리를 `createdAt` 내림차순 정렬하여 마지막 연락일을 계산한다. 별도로 `getHistoriesByClient()`를 호출할 필요 없이 전체 `histories` 배열을 그대로 전달하면 된다.

**예제**
```js
// ClientScreen.js 패턴 기반 (동기 함수)
// 전체 거래처 + 전체 히스토리를 그대로 전달 (내부에서 거래처별 정렬 처리)
const systemPrompt = buildClientSystem(clients, histories);

// 채팅 AI
const reply = await askClaude(apiMessages, systemPrompt);

// 개별 거래처 관계 요약 (단일 거래처 + 해당 히스토리)
const clientHistList = histories.filter((h) => h.clientId === client.id);
const singleSystem = buildClientSystem([client], clientHistList);
const reply = await askClaude(
  [{ role: 'user', content: `${client.company} ${client.name}와의 관계를 3~4문장으로 요약해줘.` }],
  singleSystem
);
```

---

## groqStt.js

Groq Whisper STT 및 AI/Pyannote 화자 분리 서비스. STT는 Groq Whisper API(`whisper-large-v3`)를 사용하며, 화자 분리는 LLM 기반(`diarizeSegments`)과 Pyannote 서버 기반(`diarizeWithPyannote`) 두 경로를 지원한다. Pyannote 서버는 선택적이며 미설정 시 `null`을 반환한다.

```js
import {
  transcribeAudio,
  diarizeSegments,
  rediarizeTranscript,
  convertToMonoViaServer,
  diarizeWithPyannote,
} from '../services/groqStt';
```

---

### STT (음성 → 텍스트)

---

#### transcribeAudio

```js
transcribeAudio(fileUri: string, mimeType?: string): Promise<{text: string, segments: Segment[]}>
```

오디오 파일을 Groq Whisper API(`whisper-large-v3`)로 전사하여 전체 텍스트와 타임스탬프 세그먼트를 반환한다. 언어는 한국어(`ko`)로 고정된다.

**파라미터**
| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| fileUri | string | 필수 | 전사할 오디오 파일의 로컬 URI |
| mimeType | string | 선택 | MIME 타입 (기본값: `'audio/m4a'`) |

**반환값**
```js
{
  text: string,           // 전체 전사 텍스트 (trim 적용)
  segments: Array<{
    start: number,        // 세그먼트 시작 시간 (초)
    end: number,          // 세그먼트 종료 시간 (초)
    text: string,         // 세그먼트 텍스트
    no_speech_prob: number, // 무음 확률 (0~1)
    avg_logprob: number,  // 평균 로그 확률
    // ... Whisper verbose_json 기타 필드
  }>
}
```

**에러**
- Groq API 키 미설정: `Error('API_KEY_MISSING')`
- HTTP 오류: `Error('API 오류 (status)')` 또는 Groq API 오류 메시지

**주의**
- Groq API 키만 사용한다 (`getApiKey()`). Grok 키나 AI 공급자 설정과 무관하게 항상 Groq Whisper를 호출한다.
- 반환된 `segments`는 `diarizeSegments()` 또는 `diarizeWithPyannote()`의 입력으로 사용한다.

---

### 화자 분리 (LLM 기반)

---

#### diarizeSegments

```js
diarizeSegments(segments: Segment[], speakerCount?: number | null): Promise<string>
```

Whisper 세그먼트 배열을 AI로 분석하여 화자를 구분하고, `[화자 N] 내용` 형식의 텍스트를 반환한다. 오타 수정·조사 교정·업무 용어 정규화도 함께 수행한다.

**파라미터**
| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| segments | Segment[] | 필수 | `transcribeAudio()` 반환값의 `segments` 배열 |
| speakerCount | number \| null | 선택 | 화자 수 힌트 (기본값: `null` — AI가 자동 판단) |

**반환값**
`[화자 N] 내용` 형식의 화자 구분 텍스트.

**에러**
- `askClaude()` 내부 에러 전파 (`API_KEY_MISSING`, `API 오류 (status)`)

**주의**
- `segments` 배열이 비어 있거나 `null`이면 즉시 `''`를 반환한다.
- 내부적으로 `isValidSegment()` 필터를 적용한다: `no_speech_prob < 0.6` AND `avg_logprob > -1.0`을 만족하는 세그먼트만 사용한다. 단, 유효 세그먼트가 모두 필터링되어 빈 입력이 되어도 `askClaude('')`는 호출된다 (즉시 `''` 반환 조건은 원본 배열이 비거나 `null`인 경우뿐).
- `speakerCount`를 지정하면 프롬프트에 "반드시 N명으로만 구분" 힌트가 추가된다.
- `askClaude()`를 `raw` 옵션 없이(기본 `false`) 호출하므로 `stripNonKorean()`이 적용된다. `[화자 N]` 태그의 대괄호(`[]`)는 필터에서 살아남는다.

**예제**
```js
// 직접 작성 예제 (Pyannote 없이 LLM만 사용)
const { text, segments } = await transcribeAudio(fileUri, 'audio/m4a');

// speakerCount 없으면 AI가 자동 판단
const diarized = await diarizeSegments(segments);

// speakerCount 힌트를 주면 정확도 향상
const diarized2 = await diarizeSegments(segments, 3); // 3명으로 구분
// diarized: '[화자 1] ...\n[화자 2] ...' 또는 segments가 비면 ''
```

---

#### rediarizeTranscript

```js
rediarizeTranscript(transcriptText: string, speakerCount?: number | null): Promise<string>
```

기존 `[화자 N]` 태그를 제거한 뒤 AI로 화자를 재구분한다. 회의록 저장 후 화자 재분리 기능에 사용한다.

**파라미터**
| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| transcriptText | string | 필수 | 기존 `[화자 N]` 태그가 포함된 트랜스크립트 텍스트 |
| speakerCount | number \| null | 선택 | 화자 수 힌트 (기본값: `null`) |

**반환값**
재구분된 `[화자 N] 내용` 형식 텍스트. 입력이 빈 문자열이거나 태그 제거 후 내용이 없으면 원문(`transcriptText`) 그대로 반환.

**에러**
- `askClaude()` 내부 에러 전파

**주의**
- 내부에서 `[화자 N]` 또는 수동 입력된 화자명 태그(`[이름]` 패턴)를 모두 제거한 뒤 AI에 전달한다.
- 오타 수정·조사 교정 없이 화자 구분만 수행한다 (`diarizeSegments()`와 달리). 텍스트 정제가 필요하면 별도로 처리해야 한다.

**예제**
```js
// MeetingScreen.js 패턴 기반 (저장된 회의록 화자 재분리)
async function confirmRediarize(item, speakerCountInput) {
  const count = parseInt(speakerCountInput) || null;
  try {
    const newTranscript = await rediarizeTranscript(item.transcript, count);
    // 재분리 완료 후 AI 요약 재생성
    const updated = await updateMeetingRecord(item.id, {
      transcript: newTranscript,
      summary: newSummary,
    });
    setMeetingRecords(updated);
  } catch (e) {
    Alert.alert('오류', e.message);
  }
}
```

---

### 화자 분리 (Pyannote 서버 기반)

---

#### convertToMonoViaServer

```js
convertToMonoViaServer(fileUri: string, mimeType: string): Promise<string | null>
```

Pyannote 서버의 `/mono` 엔드포인트로 오디오를 모노 WAV로 변환하여 로컬 캐시에 저장한다. `diarizeWithPyannote()` 전처리 단계에서 필요에 따라 사용한다.

**파라미터**
| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| fileUri | string | 필수 | 변환할 원본 오디오 파일 URI |
| mimeType | string | 필수 | MIME 타입 (예: `'audio/m4a'`) |

**반환값**
- 성공: 변환된 모노 WAV 파일의 로컬 캐시 URI (`FileSystem.cacheDirectory` 하위 `mono_${Date.now()}.wav`)
- 실패(`null` 반환 조건):
  - Pyannote 서버 URL 미설정 (`getPyannoteUrl()` → `null`)
  - HTTP 응답 비정상 (`!res.ok`)
  - 서버 연결 오류 또는 기타 예외

**주의**
- 에러를 던지지 않는다. 모든 실패 케이스에서 `null`을 반환한다.
- `null` 반환 시 호출부에서 LLM 기반 `diarizeSegments()`로 fallback해야 한다.

**예제**
```js
// 직접 작성 예제
// Pyannote 서버로 모노 변환 — 실패 시 null 반환 (에러 throw 없음)
const monoUri = await convertToMonoViaServer(fileUri, 'audio/m4a');
if (!monoUri) {
  // Pyannote 서버 미설정 또는 변환 실패 → 원본 파일 그대로 사용
  console.log('모노 변환 불가 — 원본 파일로 진행');
}
```

---

#### diarizeWithPyannote

```js
diarizeWithPyannote(fileUri: string, mimeType: string, whisperSegments: Segment[]): Promise<string | null>
```

Pyannote 서버(`/diarize`)로 화자 분리를 수행하고, Whisper 세그먼트와 병합하여 `[화자 N] 내용` 형식 텍스트를 생성한다. 최종 결과에 AI 교정(`polishTranscript`)을 적용한다.

**파라미터**
| 이름 | 타입 | 필수 | 설명 |
|------|------|------|------|
| fileUri | string | 필수 | 화자 분리할 원본 오디오 파일 URI |
| mimeType | string | 필수 | MIME 타입 (예: `'audio/m4a'`) |
| whisperSegments | Segment[] | 필수 | `transcribeAudio()` 반환값의 `segments` 배열 |

**반환값**
- 성공: `[화자 N] 내용` 형식 텍스트
- 실패(`null` 반환 조건):
  - `whisperSegments`가 비어 있거나 `null`/`undefined`
  - Pyannote 서버 URL 미설정
  - HTTP 응답 비정상 또는 서버 예외
  - Pyannote 응답에 세그먼트 없음

**주의**
- 에러를 던지지 않는다. 모든 실패 케이스에서 `null`을 반환한다.
- `null` 반환 시 호출부에서 반드시 `diarizeSegments()`로 fallback해야 한다.
- 내부적으로 `buildTranscript()`(Pyannote 세그먼트 + Whisper 세그먼트 겹침 계산)와 `polishTranscript()`(AI 교정 — `askClaude()` 호출)를 순차 실행한다.
- `isValidSegment()` 필터(`no_speech_prob < 0.6` AND `avg_logprob > -1.0`)가 내부에서 적용된다.
- Pyannote 세그먼트와 겹침이 없는 Whisper 세그먼트는 이전 화자로 귀속된다. 첫 세그먼트에 겹침이 없으면 `'화자 1'`로 처리된다.

**예제 — Pyannote + LLM fallback 통합 패턴**
```js
// MeetingScreen.js 패턴 기반 (Pyannote → LLM fallback 패턴)
let monoUri = null;
try {
  // 1단계: Pyannote 서버로 모노 변환 시도 (서버 없으면 null)
  monoUri = await convertToMonoViaServer(fileUri, mimeType);
  const audioUri = monoUri ?? fileUri;
  const audioMime = monoUri ? 'audio/wav' : mimeType;

  // 2단계: Whisper STT
  const { text, segments } = await transcribeAudio(audioUri, audioMime);
  // text: 전체 전사 텍스트, segments: 타임스탬프 세그먼트 배열

  // 3단계: 화자 분리 (Pyannote 우선, 실패 시 LLM fallback)
  let diarized = text;
  if (segments.length > 0) {
    const pyResult = await diarizeWithPyannote(audioUri, audioMime, segments);
    diarized = pyResult ?? await diarizeSegments(segments, speakerCount);
    // speakerCount: null(자동) 또는 숫자(힌트)
  }
  // diarized: '[화자 1] 발화 내용\n[화자 2] 발화 내용' 형식
  setTranscript(diarized);
} catch (e) {
  if (e.message === 'API_KEY_MISSING') {
    Alert.alert('API 키 필요', '설정에서 Groq API 키를 입력해주세요.');
  } else {
    Alert.alert('오류', e.message);
  }
} finally {
  // 임시 모노 파일 정리
  if (monoUri) {
    FileSystem.deleteAsync(monoUri, { idempotent: true }).catch(() => {});
  }
}
```

**예제 — 단독 사용**
```js
// 직접 작성 예제
const { text, segments } = await transcribeAudio(fileUri, 'audio/m4a');
const pyResult = await diarizeWithPyannote(fileUri, 'audio/m4a', segments);

if (!pyResult) {
  // Pyannote 서버 없음 또는 분리 실패 → LLM fallback
  const diarized = await diarizeSegments(segments, speakerCount);
  return diarized;
}
// pyResult: '[화자 1] ...\n[화자 2] ...' (AI 교정 적용된 결과)
```

---

## AsyncStorage 키 참조표

| 키 | 설명 | 사용자 격리 |
|----|------|-----------|
| `schedules_v1_${userId}` | 일정 배열 | 예 |
| `clients_v1_${userId}` | 거래처 배열 | 예 |
| `histories_v1_${userId}` | 거래처 히스토리 배열 | 예 |
| `projects_v1_${userId}` | 프로젝트 배열 | 예 |
| `messages_v3_${userId}` | 메세지 배열 (v3 주의) | 예 |
| `meeting_records_v1_${userId}` | 회의록 배열 | 예 |
| `client_favorites_v1_${userId}` | 즐겨찾기 ID 배열 | 예 |
| `user_profile_v1_${userId}` | 확장 프로필 | 예 |
| `current_user_v1` | 현재 로그인 유저 | 아니오 (전역) |
| `claude_api_key` | Groq API 키 | 아니오 (전역) |
| `grok_api_key` | Grok API 키 | 아니오 (전역) |
| `ai_provider` | `'groq'` \| `'grok'` | 아니오 (전역) |
| `pyannote_url` | Pyannote 서버 URL | 아니오 (전역) |
| `work_topics_v1` | 작업 주제 분석 결과 | 아니오 (전역) |
