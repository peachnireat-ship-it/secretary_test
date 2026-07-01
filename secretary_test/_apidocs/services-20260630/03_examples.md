# 사용 예제: secretary_test 서비스 레이어
작성일: 2026-06-30

---

## storage.js

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

#### login

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

#### logout

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

#### getTestAccounts

```js
// SettingsScreen.js 패턴 기반
// 동기 함수 — await 없이 호출
const accounts = getTestAccounts();
// accounts: [{ id, email, name, role, team }, ...]
```

#### switchAccount

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

#### getCurrentUser

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

#### getApiKey / setApiKey

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

#### getGrokApiKey / setGrokApiKey

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

#### getAiProvider / setAiProvider

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

#### getPyannoteUrl / setPyannoteUrl

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

### 일정 CRUD

#### getSchedules + addSchedule + deleteSchedule + updateSchedule

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

// 일정 수정
const updated = await updateSchedule(scheduleId, {
  title: '미팅 장소 변경',
  time: '15:00',
  notes: '장소: 삼성물산 본사 3F',
});
setSchedules(updated);

// 일정 삭제
const updated = await deleteSchedule(scheduleId);
setSchedules(updated);
```

#### saveSchedules

```js
// 직접 작성 예제
// 전체 목록 초기화 (샘플 데이터 제거 등)
await saveSchedules([]);
// 주의: 기존 데이터 전체가 교체됨 — 단건 수정은 updateSchedule 사용
```

---

### 거래처 CRUD

#### getClients + addClient + updateClient

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

// 거래처 수정
const updated = await updateClient(client.id, {
  role: '구매본부장',
  workContact: '02-9999-0000',
});
setClients(updated);
```

#### saveClients (거래처 삭제 대체 패턴)

```js
// ClientScreen.js 패턴 기반
// deleteClient 함수가 없으므로 필터링 후 saveClients로 처리
const allClients = await getClients();
await saveClients(allClients.filter((c) => c.id !== targetId));
setClients(await getClients());
```

---

### 히스토리 CRUD

#### getHistories + addHistory + updateHistory + deleteHistory

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

// 히스토리 수정
const updated = await updateHistory(editingHistory.id, {
  type: '통화',
  title: '견적서 후속 통화',
  content: '견적 조건 수락',
  result: '계약서 작성 진행',
});
setHistories(updated);

// 히스토리 삭제
const updated = await deleteHistory(historyId);
setHistories(updated);
```

#### getHistoriesByClient

```js
// 직접 작성 예제
// 특정 거래처의 히스토리만 최신순으로 조회
const clientHistories = await getHistoriesByClient(selectedClient.id);
// clientHistories: History[] (createdAt 내림차순 정렬)
// 해당 거래처 히스토리가 없으면 []
```

---

### 프로젝트 CRUD

#### getProjects + addProject + updateProject + deleteProject

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

// 프로젝트 수정
const updated = await updateProject(project.id, {
  status: '위험',
  progress: 45,
  notes: '담당자 교체로 일정 지연 위험',
});
setProjects(updated);

// 프로젝트 삭제
setProjects(await deleteProject(project.id));
```

---

### 메세지 CRUD

#### getMessages + addMessage + addMessageForUser

```js
// MessageScreen.js 패턴 기반

// 목록 조회
const messages = await getMessages();

// 메세지 전송 (보낸 메세지함 + 수신자 받은 메세지함 동시 추가)
const ts = Date.now();
const sentMsgId = String(ts);
const receivedMsgId = String(ts + 1);

await addMessage({
  id: sentMsgId,
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

#### updateMessage + updateMessageForUser

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

#### deleteMessage

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

### 회의록 CRUD

#### getMeetingRecords + addMeetingRecord + updateMeetingRecord + deleteMeetingRecord

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
});
setMeetingRecords(updated);
// 반환된 updated를 analyzeWorkTopics()에 전달하면 stale closure 없이 최신 목록으로 분석 가능
analyzeWorkTopics(updated);

// 회의록 수정 (트랜스크립트 업데이트 등)
const updated = await updateMeetingRecord(record.id, {
  transcript: updatedTranscript,
  summary: updatedSummary,
});
setMeetingRecords(updated);

// 회의록 삭제
// 직접 작성 예제
const updated = await deleteMeetingRecord(record.id);
setMeetingRecords(updated);
```

---

### 기타

#### getWorkTopics / saveWorkTopics

```js
// MeetingScreen.js 패턴 기반
// 조회
const topicsText = await getWorkTopics(); // 미설정 시 ''

// 저장 (AI 분석 결과)
await saveWorkTopics(analysisResult);
```

#### getClientFavorites + toggleClientFavorite

```js
// ClientScreen.js 패턴 기반
// 초기 로드
const favs = await getClientFavorites(); // string[] — 즐겨찾기 clientId 배열
setFavorites(favs);

// 즐겨찾기 토글 (이미 있으면 제거, 없으면 추가)
const updatedFavs = await toggleClientFavorite(client.id);
setFavorites(updatedFavs);
```

#### getUserProfile + saveUserProfile

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

## claude.js

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

#### josa과와

```js
// ClientScreen.js 패턴 기반 (동기 함수)
const particle = josa과와(client.name); // '과' 또는 '와'
const prompt = `${client.company} ${client.name}${particle}의 관계를 요약해줘.`;
```

#### stripNonKorean

```js
// 직접 작성 예제 (동기 함수)
// askClaude() 내부에서 raw=false(기본) 시 자동 적용됨
// 직접 사용이 필요한 경우:
const koreanOnly = stripNonKorean('Hello 안녕 123 World!');
// → '안녕 123'
// 주의: JSON 응답에 직접 적용하면 구조가 손상됨
```

#### normalizeAIDates

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

#### askClaude — 일반 응답 (한국어 필터 자동 적용)

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

#### askClaude — JSON 파싱 시 raw:true 필수

```js
// ScheduleScreen.js 패턴 기반 (create_schedule JSON 파싱)
const reply = await askClaude(
  apiMessages,
  buildScheduleSystem(schedules),
  { raw: true } // JSON에 영문·특수문자 포함 → 필터 비활성화 필수
);
// JSON 액션 감지 및 파싱
if (reply.includes('"action":"create_schedule"')) {
  const jsonStr = reply.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
  const parsed = JSON.parse(jsonStr);
  const updated = await addSchedule(parsed.data);
  setSchedules(updated);
}
```

```js
// ProjectScreen.js 패턴 기반 (update_project JSON 파싱)
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

#### fixForeignWordsInText

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

#### buildScheduleSystem

```js
// ScheduleScreen.js 패턴 기반 (동기 함수)
const systemPrompt = buildScheduleSystem(schedules);
// 일정 목록 + 오늘 날짜 컨텍스트 포함
// create_schedule JSON 응답 파싱 시 askClaude에 { raw: true } 필수
const reply = await askClaude(messages, systemPrompt, { raw: true });
```

#### buildProjectDelaySystem

```js
// ProjectScreen.js 패턴 기반 (동기 함수)
const systemPrompt = buildProjectDelaySystem(projects, []);
// 두 번째 인자: 일정 배열 (ProjectScreen은 빈 배열로 전달)
// update_project JSON 응답 파싱 시 { raw: true } 필수
const reply = await askClaude(apiMessages, systemPrompt, { raw: true });
```

#### buildTaskExtractionSystem

```js
// MeetingScreen.js 패턴 기반 (동기 함수)
// 인자 없음 — 회의 스크립트를 user 메세지로 전달
const raw = await askClaude(
  [{ role: 'user', content: transcriptText }],
  buildTaskExtractionSystem(),
  { raw: true } // JSON 배열 응답 — raw:true 없으면 파싱 실패
);
// AI 응답: [{"assignee":"...", "content":"...", "deadline":"YYYY-MM-DD", "priority":"높음|보통|낮음"}]
```

#### buildClientSystem

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

### STT + 화자 분리 통합 패턴

#### transcribeAudio + diarizeWithPyannote + diarizeSegments (fallback 포함)

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

#### diarizeSegments (단독 사용)

```js
// 직접 작성 예제 (Pyannote 없이 LLM만 사용)
const { text, segments } = await transcribeAudio(fileUri, 'audio/m4a');

// speakerCount 없으면 AI가 자동 판단
const diarized = await diarizeSegments(segments);

// speakerCount 힌트를 주면 정확도 향상
const diarized = await diarizeSegments(segments, 3); // 3명으로 구분
// diarized: '[화자 1] ...\n[화자 2] ...' 또는 세그먼트 없으면 ''
```

#### rediarizeTranscript

```js
// MeetingScreen.js 패턴 기반 (저장된 회의록 화자 재분리)
async function confirmRediarize(item, speakerCountInput) {
  const count = parseInt(speakerCountInput) || null;
  try {
    const newTranscript = await rediarizeTranscript(item.transcript, count);
    // 재분리 완료 후 AI 요약 재생성
    const newSummary = await askClaude(
      [{ role: 'user', content: newTranscript }],
      meetingSummarySystemPrompt,
      { raw: true }
    );
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

#### convertToMonoViaServer (단독 사용)

```js
// 직접 작성 예제
// Pyannote 서버로 모노 변환 — 실패 시 null 반환 (에러 throw 없음)
const monoUri = await convertToMonoViaServer(fileUri, 'audio/m4a');
if (!monoUri) {
  // Pyannote 서버 미설정 또는 변환 실패 → 원본 파일 그대로 사용
  console.log('모노 변환 불가 — 원본 파일로 진행');
}
```

#### diarizeWithPyannote (단독 사용)

```js
// 직접 작성 예제
// Pyannote 서버 화자 분리 — 실패 시 null 반환 (에러 throw 없음)
const { text, segments } = await transcribeAudio(fileUri, 'audio/m4a');
const pyResult = await diarizeWithPyannote(fileUri, 'audio/m4a', segments);

if (!pyResult) {
  // Pyannote 서버 없음 또는 분리 실패 → LLM fallback
  const diarized = await diarizeSegments(segments, speakerCount);
  return diarized;
}
// pyResult: '[화자 1] ...\n[화자 2] ...' (AI 교정 적용된 결과)
```
