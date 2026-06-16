import AsyncStorage from '@react-native-async-storage/async-storage';

const KEYS = {
  schedules: 'schedules_v1',
  clients: 'clients_v1',
  histories: 'histories_v1',
  projects: 'projects_v1',
  messages: 'messages_v1',
  apiKey: 'claude_api_key',
  grokApiKey: 'grok_api_key',
  aiProvider: 'ai_provider',
  meetingRecords: 'meeting_records_v1',
};

// ── Groq API Key ──────────────────────────────────────────
export async function getApiKey() {
  const stored = await AsyncStorage.getItem(KEYS.apiKey);
  return stored || process.env.EXPO_PUBLIC_GROQ_API_KEY || null;
}

export async function setApiKey(key) {
  return AsyncStorage.setItem(KEYS.apiKey, key);
}

// ── Grok API Key ──────────────────────────────────────────
export async function getGrokApiKey() {
  const stored = await AsyncStorage.getItem(KEYS.grokApiKey);
  return stored || process.env.EXPO_PUBLIC_GROK_API_KEY || null;
}

export async function setGrokApiKey(key) {
  return AsyncStorage.setItem(KEYS.grokApiKey, key);
}

// ── AI Provider ───────────────────────────────────────────
export async function getAiProvider() {
  const stored = await AsyncStorage.getItem(KEYS.aiProvider);
  return stored || 'groq';
}

export async function setAiProvider(provider) {
  return AsyncStorage.setItem(KEYS.aiProvider, provider);
}

// ── Schedules ────────────────────────────────────────────
export async function getSchedules() {
  const raw = await AsyncStorage.getItem(KEYS.schedules);
  if (raw) return JSON.parse(raw);
  const sample = getSampleSchedules();
  await AsyncStorage.setItem(KEYS.schedules, JSON.stringify(sample));
  return sample;
}

export async function saveSchedules(schedules) {
  await AsyncStorage.setItem(KEYS.schedules, JSON.stringify(schedules));
}

export async function addSchedule(schedule) {
  const list = await getSchedules();
  const updated = [{ id: Date.now().toString(), createdAt: Date.now(), ...schedule }, ...list];
  await saveSchedules(updated);
  return updated;
}

export async function deleteSchedule(id) {
  const list = await getSchedules();
  const updated = list.filter((s) => s.id !== id);
  await saveSchedules(updated);
  return updated;
}

// ── Clients ───────────────────────────────────────────────
export async function getClients() {
  const raw = await AsyncStorage.getItem(KEYS.clients);
  if (raw) return JSON.parse(raw);
  const sample = getSampleClients();
  await AsyncStorage.setItem(KEYS.clients, JSON.stringify(sample));
  return sample;
}

export async function saveClients(clients) {
  await AsyncStorage.setItem(KEYS.clients, JSON.stringify(clients));
}

export async function addClient(client) {
  const list = await getClients();
  const updated = [{ id: Date.now().toString(), createdAt: Date.now(), ...client }, ...list];
  await saveClients(updated);
  return updated;
}

// ── Histories ─────────────────────────────────────────────
export async function getHistories() {
  const raw = await AsyncStorage.getItem(KEYS.histories);
  if (raw) return JSON.parse(raw);
  const sample = getSampleHistories();
  await AsyncStorage.setItem(KEYS.histories, JSON.stringify(sample));
  return sample;
}

export async function saveHistories(histories) {
  await AsyncStorage.setItem(KEYS.histories, JSON.stringify(histories));
}

export async function addHistory(history) {
  const list = await getHistories();
  const updated = [{ id: Date.now().toString(), createdAt: Date.now(), ...history }, ...list];
  await saveHistories(updated);
  return updated;
}

export async function getHistoriesByClient(clientId) {
  const all = await getHistories();
  return all.filter((h) => h.clientId === clientId).sort((a, b) => b.createdAt - a.createdAt);
}

// ── Projects ──────────────────────────────────────────────
export async function getProjects() {
  const raw = await AsyncStorage.getItem(KEYS.projects);
  if (raw) return JSON.parse(raw);
  const sample = getSampleProjects();
  await AsyncStorage.setItem(KEYS.projects, JSON.stringify(sample));
  return sample;
}

export async function saveProjects(projects) {
  await AsyncStorage.setItem(KEYS.projects, JSON.stringify(projects));
}

export async function addProject(project) {
  const list = await getProjects();
  const updated = [{ id: Date.now().toString(), createdAt: Date.now(), ...project }, ...list];
  await saveProjects(updated);
  return updated;
}

export async function updateProject(id, changes) {
  const list = await getProjects();
  const updated = list.map((p) => (p.id === id ? { ...p, ...changes, updatedAt: Date.now() } : p));
  await saveProjects(updated);
  return updated;
}

export async function deleteProject(id) {
  const list = await getProjects();
  const updated = list.filter((p) => p.id !== id);
  await saveProjects(updated);
  return updated;
}

// ── Messages ──────────────────────────────────────────────
export async function getMessages() {
  const raw = await AsyncStorage.getItem(KEYS.messages);
  if (raw) return JSON.parse(raw);
  const sample = getSampleMessages();
  await AsyncStorage.setItem(KEYS.messages, JSON.stringify(sample));
  return sample;
}

export async function saveMessages(messages) {
  await AsyncStorage.setItem(KEYS.messages, JSON.stringify(messages));
}

export async function addMessage(message) {
  const list = await getMessages();
  const updated = [{ id: Date.now().toString(), createdAt: Date.now(), ...message }, ...list];
  await saveMessages(updated);
  return updated;
}

export async function updateMessage(id, changes) {
  const list = await getMessages();
  const updated = list.map((m) => (m.id === id ? { ...m, ...changes, updatedAt: Date.now() } : m));
  await saveMessages(updated);
  return updated;
}

export async function deleteMessage(id) {
  const list = await getMessages();
  const updated = list.filter((m) => m.id !== id);
  await saveMessages(updated);
  return updated;
}

// ── Meeting Records ───────────────────────────────────────
export async function getMeetingRecords() {
  const raw = await AsyncStorage.getItem(KEYS.meetingRecords);
  return raw ? JSON.parse(raw) : [];
}

export async function saveMeetingRecords(records) {
  await AsyncStorage.setItem(KEYS.meetingRecords, JSON.stringify(records));
}

export async function addMeetingRecord(record) {
  const list = await getMeetingRecords();
  const updated = [{ id: Date.now().toString(), createdAt: Date.now(), ...record }, ...list];
  await saveMeetingRecords(updated);
  return updated;
}

export async function updateMeetingRecord(id, changes) {
  const list = await getMeetingRecords();
  const updated = list.map((r) => (r.id === id ? { ...r, ...changes } : r));
  await saveMeetingRecords(updated);
  return updated;
}

export async function deleteMeetingRecord(id) {
  const list = await getMeetingRecords();
  const updated = list.filter((r) => r.id !== id);
  await saveMeetingRecords(updated);
  return updated;
}

// ── Sample Data ───────────────────────────────────────────
function todayStr(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split('T')[0];
}

function getSampleSchedules() {
  return [
    { id: '1', date: todayStr(0), time: '10:00', title: '팀 스탠드업', tag: '회의', notes: '주간 진행 상황 공유', createdAt: Date.now() },
    { id: '2', date: todayStr(0), time: '14:00', title: '클라이언트 리뷰', tag: '회의', notes: '삼성물산 Q2 결과 검토', createdAt: Date.now() },
    { id: '3', date: todayStr(0), time: '16:30', title: '주간 보고서 제출', tag: '업무', notes: '', createdAt: Date.now() },
    { id: '4', date: todayStr(1), time: '09:30', title: '신규 거래처 미팅', tag: '영업', notes: '현대건설 담당자 첫 만남', createdAt: Date.now() },
    { id: '5', date: todayStr(1), time: '15:00', title: '계약서 검토', tag: '업무', notes: '', createdAt: Date.now() },
    { id: '6', date: todayStr(2), time: '11:00', title: '내부 전략 회의', tag: '회의', notes: '하반기 목표 수립', createdAt: Date.now() },
  ];
}

function getSampleClients() {
  return [
    { id: 'c1', name: '김민준', company: '삼성물산', role: '구매팀장', contact: '010-1234-5678', notes: '신뢰 높은 장기 거래처', createdAt: Date.now() - 86400000 * 30 },
    { id: 'c2', name: '이서연', company: '현대건설', role: '기획팀 과장', contact: '010-9876-5432', notes: '신규 파트너 검토 중', createdAt: Date.now() - 86400000 * 7 },
    { id: 'c3', name: '박지훈', company: 'LG전자', role: '영업이사', contact: '010-5555-7777', notes: '연간 계약 진행 중', createdAt: Date.now() - 86400000 * 60 },
    { id: 'c4', name: '최수아', company: 'SK텔레콤', role: '마케팅 팀장', contact: '010-3333-9999', notes: '디지털 전환 프로젝트 논의', createdAt: Date.now() - 86400000 * 14 },
  ];
}

function getSampleProjects() {
  return [
    { id: 'p1', title: '신규 ERP 시스템 도입', deadline: todayStr(5), status: '위험', progress: 35, priority: '높음', notes: '예산 승인 지연으로 착수 늦어짐', createdAt: Date.now() - 86400000 * 40 },
    { id: 'p2', title: '삼성물산 Q3 제안서 작성', deadline: todayStr(3), status: '지연', progress: 60, priority: '높음', notes: '자료 수집 병목 발생', createdAt: Date.now() - 86400000 * 14 },
    { id: 'p3', title: '팀 온보딩 프로세스 개선', deadline: todayStr(14), status: '진행중', progress: 55, priority: '보통', notes: '', createdAt: Date.now() - 86400000 * 20 },
    { id: 'p4', title: 'SNS 마케팅 캠페인 기획', deadline: todayStr(21), status: '진행중', progress: 20, priority: '보통', notes: '디자인팀 일정 조율 필요', createdAt: Date.now() - 86400000 * 5 },
    { id: 'p5', title: '2024 연간 계약 재검토', deadline: todayStr(-5), status: '지연', progress: 80, priority: '높음', notes: '법무팀 검토 대기 중', createdAt: Date.now() - 86400000 * 45 },
    { id: 'p6', title: '내부 보안 감사', deadline: todayStr(-10), status: '완료', progress: 100, priority: '높음', notes: '일정 내 완료', createdAt: Date.now() - 86400000 * 60 },
  ];
}

function getSampleMessages() {
  const base = Date.now();
  return [
    { id: 'm1', sender: '김민준', company: '삼성물산', subject: 'Q3 납품 일정 조율 요청', content: '안녕하세요. Q3 납품 일정을 이번 주 내로 확정해 주실 수 있을까요? 내부 생산 계획 수립에 필요합니다.', priority: '긴급', status: '미확인', createdAt: base - 3600000 * 2 },
    { id: 'm2', sender: '이서연', company: '현대건설', subject: '제안서 검토 완료', content: '보내주신 제안서 검토가 완료되었습니다. 몇 가지 수정 사항이 있어 회신 드립니다. 다음 주 미팅 일정도 조율 부탁드립니다.', priority: '일반', status: '확인', createdAt: base - 3600000 * 5 },
    { id: 'm3', sender: '박지훈', company: 'LG전자', subject: '계약서 보증 기간 관련 문의', content: '계약서 상의 보증 기간을 2년에서 3년으로 연장 가능한지 검토 부탁드립니다. 법무팀과 협의 후 회신 주세요.', priority: '일반', status: '처리중', createdAt: base - 86400000 * 1 },
    { id: 'm4', sender: '최수아', company: 'SK텔레콤', subject: 'PoC 일정 확인', content: 'PoC 진행 일정을 다음 달 초로 확정하고 싶습니다. 담당자 배정 및 환경 준비 현황 공유 부탁드립니다.', priority: '긴급', status: '미확인', createdAt: base - 86400000 * 2 },
    { id: 'm5', sender: '정우성', company: '내부', subject: '주간 보고서 제출 안내', content: '이번 주 금요일까지 주간 업무 보고서를 팀 공유 폴더에 업로드해 주세요.', priority: '낮음', status: '완료', createdAt: base - 86400000 * 3 },
  ];
}

function getSampleHistories() {
  const base = Date.now();
  return [
    { id: 'h1', clientId: 'c1', date: todayStr(-3), type: '미팅', title: 'Q2 결과 검토 미팅', content: '2분기 납품 실적 검토 및 3분기 계획 논의. 전반적으로 만족스러운 결과.', result: '3분기 물량 10% 증가 합의', createdAt: base - 86400000 * 3 },
    { id: 'h2', clientId: 'c1', date: todayStr(-15), type: '통화', title: '납품 일정 조율', content: '긴급 납품 일정 변경 요청. 1주일 앞당겨 처리 가능 여부 확인.', result: '납품일 조정 완료', createdAt: base - 86400000 * 15 },
    { id: 'h3', clientId: 'c1', date: todayStr(-30), type: '계약', title: '연간 계약 갱신', content: '2024년 연간 계약 갱신 미팅. 단가 5% 인상 협의.', result: '계약 갱신 완료 (3% 인상)', createdAt: base - 86400000 * 30 },
    { id: 'h4', clientId: 'c2', date: todayStr(-7), type: '미팅', title: '첫 미팅 및 니즈 파악', content: '현대건설 신규 프로젝트 관련 공급 가능 여부 논의. 담당자 이서연 과장과 첫 만남.', result: '2주 내 제안서 제출 요청', createdAt: base - 86400000 * 7 },
    { id: 'h5', clientId: 'c3', date: todayStr(-5), type: '이메일', title: '계약 조건 수정 요청', content: 'LG전자 측에서 계약 조건 중 보증 기간 연장 요청 이메일 수신.', result: '내부 검토 후 회신 예정', createdAt: base - 86400000 * 5 },
    { id: 'h6', clientId: 'c3', date: todayStr(-20), type: '미팅', title: '연간 계약 협상', content: '박지훈 이사와 연간 계약 조건 협상. 납품량 및 단가 논의.', result: '추가 검토 필요, 재미팅 예정', createdAt: base - 86400000 * 20 },
    { id: 'h7', clientId: 'c4', date: todayStr(-14), type: '미팅', title: '디지털 전환 프로젝트 킥오프', content: 'SK텔레콤 디지털 전환 관련 솔루션 제안. 최수아 팀장과 요구사항 논의.', result: 'PoC 진행 합의', createdAt: base - 86400000 * 14 },
  ];
}
