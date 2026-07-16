import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { supabase } from './supabaseClient';

// expo-secure-store는 웹에서 네이티브 모듈이 구현되어 있지 않아(getValueWithKeyAsync 등이 없음)
// SecureStore.getItemAsync/setItemAsync를 웹에서 그대로 호출하면 TypeError가 던져진다.
// 웹에서는 대신 AsyncStorage(react-native-web에서 localStorage 기반)로 폴백한다.
async function secureGetItem(key) {
  if (Platform.OS === 'web') return AsyncStorage.getItem(key);
  return SecureStore.getItemAsync(key);
}
async function secureSetItem(key, value) {
  if (Platform.OS === 'web') return AsyncStorage.setItem(key, value);
  return SecureStore.setItemAsync(key, value);
}

const KEYS = {
  apiKey: 'claude_api_key',
  grokApiKey: 'grok_api_key',
  aiProvider: 'ai_provider',
  pyannoteUrl: 'pyannote_url',
};

// 마이그레이션 전 기기 로컬(AsyncStorage)에 남아있던 예전 키 — migrateLocalDataToCloud()에서만 참조
const LEGACY_KEYS = {
  schedules: 'schedules_v1',
  clients: 'clients_v1',
  histories: 'histories_v1',
  projects: 'projects_v1',
  messages: 'messages_v3',
  meetingRecords: 'meeting_records_v1',
  workTopics: 'work_topics_v1',
  clientFavorites: 'client_favorites_v1',
  userProfile: 'user_profile_v1',
};

// 손상된 저장 데이터(수동 편집, 앱 강제 종료 중 쓰기 실패 등)로 인한 크래시 방지
function safeParseJSON(raw) {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Supabase Auth의 UUID는 계정마다 새로 발급되므로, seed 스크립트 실행 후 나온 값을 붙여넣어 둔다.
// legacyId는 마이그레이션(migrateLocalDataToCloud)에서 예전 AsyncStorage 키(`_${legacyId}`)를 찾을 때만 사용.
const ROSTER = [
  { id: 'f42080f8-343f-42d5-9377-0efa8701fed3', legacyId: 'test', email: 'test@secretary.app', name: '테스트 계정', role: 'tester', team: '개발팀' },
  { id: '6309db8f-0c79-4773-b4b0-ae3ae4b33c84', legacyId: 'admin', email: 'peach.nireat@gmail.com', name: '관리자', role: 'admin', team: '운영팀' },
  { id: '20ac9bc4-efef-45ed-b091-b204eba4e231', legacyId: 'kmj', email: 'kmj@secretary.app', name: '김민준', role: '구매팀장', team: '삼성물산' },
  { id: 'f9ebdb42-0273-4753-bdf7-d78b48455cf9', legacyId: 'lsy', email: 'lsy@secretary.app', name: '이서연', role: '기획팀 과장', team: '현대건설' },
  { id: '55dc6288-622b-464e-a1e2-25f683394fb9', legacyId: 'pjh', email: 'nireat@naver.com', name: '박지훈', role: '영업이사', team: 'LG전자' },
  { id: '356c2bca-09c1-4b25-8aab-a71f532e974a', legacyId: 'csa', email: 'like-a-g6@daum.net', name: '최수아', role: '마케팅 팀장', team: 'SK텔레콤' },
];

// __DEV__ 전용 계정 전환(switchAccount)에서만 사용 — 이미 LoginScreen __DEV__ 자동입력 버튼과
// CLAUDE.md에 공개된 고정 테스트 비밀번호라 노출 위험이 없다.
const DEV_PASSWORDS = {
  test: 'test1234', admin: 'admin1234', kmj: 'test1234', lsy: 'test1234', pjh: 'test1234', csa: 'test1234',
};

function findRoster({ id, legacyId }) {
  return ROSTER.find((r) => (id ? r.id === id : r.legacyId === legacyId));
}

function rosterToUser({ id, email, name, role, team }) {
  return { id, email, name, role, team };
}

let _cachedUser = null;

async function hydrateUserFromSession(session) {
  if (!session?.user) return null;
  const entry = findRoster({ id: session.user.id });
  if (entry) return rosterToUser(entry);
  // ROSTER에 없는 계정(회원가입으로 새로 생성된 계정)은 profiles 테이블에서 직접 조회한다.
  const { data, error } = await supabase.from('profiles').select('id, email, name, role, team, contact').eq('id', session.user.id).single();
  if (data) return { id: data.id, email: data.email, name: data.name, role: data.role, team: data.team, contact: data.contact };
  // profiles 행이 아직 없는 경우(이메일 인증이 필요한 프로젝트에서는 signUp 시점에
  // auth.uid()가 없어 RLS 때문에 즉시 생성할 수 없었다) 최초 로그인 시점에 생성한다.
  if (error?.code === 'PGRST116') {
    const displayName = session.user.user_metadata?.name?.trim() || session.user.email.split('@')[0];
    const contact = session.user.user_metadata?.contact?.trim() || '';
    const role = session.user.user_metadata?.role?.trim() || '';
    const team = session.user.user_metadata?.team?.trim() || '';
    const { data: inserted, error: insertErr } = await supabase.from('profiles').insert({
      id: session.user.id,
      email: session.user.email,
      name: displayName,
      role,
      team,
      contact,
    }).select('id, email, name, role, team, contact').single();
    if (insertErr || !inserted) return null;
    return { id: inserted.id, email: inserted.email, name: inserted.name, role: inserted.role, team: inserted.team, contact: inserted.contact };
  }
  return null;
}

// ── 로그인 시도 제한 (인메모리, 앱 재시작 시 초기화) ─────────
const MAX_LOGIN_ATTEMPTS = 5;
const LOGIN_LOCK_MS = 30 * 1000;
const _loginAttempts = new Map(); // email -> { count, lockedUntil }

function assertNotLocked(email) {
  const entry = _loginAttempts.get(email);
  if (entry && entry.lockedUntil && entry.lockedUntil > Date.now()) {
    const remainingSec = Math.ceil((entry.lockedUntil - Date.now()) / 1000);
    throw new Error(`너무 많은 시도로 30초간 잠겼습니다. ${remainingSec}초 후 다시 시도하세요.`);
  }
}

function recordLoginFailure(email) {
  const entry = _loginAttempts.get(email) || { count: 0, lockedUntil: 0 };
  entry.count += 1;
  if (entry.count >= MAX_LOGIN_ATTEMPTS) {
    entry.lockedUntil = Date.now() + LOGIN_LOCK_MS;
    entry.count = 0;
  }
  _loginAttempts.set(email, entry);
}

function resetLoginAttempts(email) {
  _loginAttempts.delete(email);
}

export async function login(email, password) {
  assertNotLocked(email);
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    // 이메일 인증 미완료는 자격증명 오류가 아니라 별도 상태이므로, 로그인 실패 횟수에도
    // 포함시키지 않고(잠금 로직 오작동 방지) 사용자가 실제 원인을 알 수 있게 그대로 안내한다.
    if (error.code === 'email_not_confirmed' || error.message?.includes('Email not confirmed')) {
      throw new Error('이메일 인증이 완료되지 않았습니다. 가입 시 받은 확인 메일의 링크를 클릭한 후 다시 로그인해주세요.');
    }
    recordLoginFailure(email);
    throw new Error('이메일 또는 비밀번호가 올바르지 않습니다.');
  }
  resetLoginAttempts(email);
  _cachedUser = await hydrateUserFromSession(data.session);
  return _cachedUser;
}

export async function signup(email, password, name, contact, team, role) {
  const displayName = name?.trim() || email.split('@')[0];
  // name/contact/team/role은 auth 사용자 메타데이터에 저장해 둔다. 이메일 인증이 필요한 프로젝트는
  // signUp 직후 세션이 없어(auth.uid() 없음) profiles 행을 바로 만들 수 없으므로,
  // 실제 profiles 행 생성은 세션이 생기는 시점(hydrateUserFromSession)에 지연 처리한다.
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name: displayName, contact: contact?.trim() || '', team: team?.trim() || '', role: role?.trim() || '' } },
  });
  if (error) {
    if (error.message?.includes('already registered') || error.message?.includes('already been registered')) {
      throw new Error('이미 가입된 이메일입니다.');
    }
    throw new Error(error.message || '회원가입에 실패했습니다.');
  }
  if (!data.user) throw new Error('회원가입에 실패했습니다.');

  // Supabase는 계정 존재 여부를 통한 이메일 추측(enumeration) 공격을 막기 위해, 이미 가입된
  // 이메일로 signUp()을 호출해도 에러를 던지지 않고 identities가 빈 배열인 "가짜 성공" 응답을
  // 돌려준다. 이 경우 실제로는 아무 계정도 새로 만들어지지 않고 기존 계정 비밀번호도 그대로라서,
  // 에러 체크만으로는 이 상황을 걸러낼 수 없다 — identities가 비어있으면 이미 가입된 이메일로 간주한다.
  if (Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    throw new Error('이미 가입된 이메일입니다. 로그인을 시도해주세요.');
  }

  // 이메일 인증이 활성화된 프로젝트는 signUp 직후 세션이 발급되지 않는다.
  // 이 경우 로그인 화면으로 돌아가 인증 완료 후 다시 로그인하도록 안내한다.
  if (!data.session) return null;

  _cachedUser = await hydrateUserFromSession(data.session);
  return _cachedUser;
}

export async function logout() {
  await supabase.auth.signOut();
  _cachedUser = null;
}

export function getTestAccounts() {
  return ROSTER.map(rosterToUser);
}

export async function switchAccount(accountId, currentPassword) {
  if (!__DEV__) throw new Error('계정 전환은 개발 모드에서만 사용 가능합니다.');
  const current = await getCurrentUser();
  if (!current) throw new Error('현재 로그인된 계정이 없습니다.');
  const { error: verifyErr } = await supabase.auth.signInWithPassword({ email: current.email, password: currentPassword || '' });
  if (verifyErr) throw new Error('현재 계정 비밀번호가 일치하지 않습니다.');
  const target = findRoster({ id: accountId });
  if (!target) throw new Error('계정을 찾을 수 없습니다.');
  await supabase.auth.signOut();
  const { data, error } = await supabase.auth.signInWithPassword({ email: target.email, password: DEV_PASSWORDS[target.legacyId] });
  if (error) throw error;
  _cachedUser = await hydrateUserFromSession(data.session);
  return _cachedUser;
}

export async function getCurrentUser() {
  if (_cachedUser) return _cachedUser;
  const { data: { session } } = await supabase.auth.getSession();
  _cachedUser = await hydrateUserFromSession(session);
  return _cachedUser;
}

// ── Groq API Key (기기별 설정 — 마이그레이션 범위 밖, 변경 없음) ──
let _cachedApiKey;

export async function getApiKey() {
  if (_cachedApiKey !== undefined) return _cachedApiKey;
  const stored = await secureGetItem('groq_api_key_secure');
  if (stored) {
    _cachedApiKey = stored;
    return stored;
  }
  const legacy = await AsyncStorage.getItem(KEYS.apiKey);
  if (legacy) {
    await secureSetItem('groq_api_key_secure', legacy);
    await AsyncStorage.removeItem(KEYS.apiKey);
    _cachedApiKey = legacy;
    return legacy;
  }
  _cachedApiKey = null;
  return null;
}

export async function setApiKey(key) {
  _cachedApiKey = key;
  return secureSetItem('groq_api_key_secure', key);
}

// ── Grok API Key ──────────────────────────────────────────
let _cachedGrokApiKey;

export async function getGrokApiKey() {
  if (_cachedGrokApiKey !== undefined) return _cachedGrokApiKey;
  const stored = await secureGetItem('grok_api_key_secure');
  if (stored) {
    _cachedGrokApiKey = stored;
    return stored;
  }
  const legacy = await AsyncStorage.getItem(KEYS.grokApiKey);
  if (legacy) {
    await secureSetItem('grok_api_key_secure', legacy);
    await AsyncStorage.removeItem(KEYS.grokApiKey);
    _cachedGrokApiKey = legacy;
    return legacy;
  }
  _cachedGrokApiKey = null;
  return null;
}

export async function setGrokApiKey(key) {
  _cachedGrokApiKey = key;
  return secureSetItem('grok_api_key_secure', key);
}

// ── AI Provider ───────────────────────────────────────────
let _cachedAiProvider;

export async function getAiProvider() {
  if (_cachedAiProvider !== undefined) return _cachedAiProvider;
  const stored = await AsyncStorage.getItem(KEYS.aiProvider);
  _cachedAiProvider = stored || 'groq';
  return _cachedAiProvider;
}

export async function setAiProvider(provider) {
  _cachedAiProvider = provider;
  return AsyncStorage.setItem(KEYS.aiProvider, provider);
}

// ── camelCase(JS) <-> snake_case(DB) 매핑 헬퍼 ────────────
// defaults: bulk upsert(여러 행을 한 번에 insert)에서는 PostgREST가 각 행에 없는 키를
// 컬럼 기본값이 아니라 NULL로 채우므로, NOT NULL 컬럼은 배치 전체에서 항상 값을 명시해야 한다.
function toRow(obj, keymap, defaults = {}) {
  const row = {};
  for (const [jsKey, dbKey] of Object.entries(keymap)) {
    if (obj[jsKey] !== undefined) row[dbKey] = obj[jsKey];
    else if (Object.prototype.hasOwnProperty.call(defaults, dbKey)) row[dbKey] = defaults[dbKey];
  }
  return row;
}

function fromRow(row, keymap) {
  const obj = { id: row.id };
  for (const [jsKey, dbKey] of Object.entries(keymap)) {
    obj[jsKey] = row[dbKey];
  }
  return obj;
}

// clients.email <-> profiles.email 동기화 헬퍼. saveUserProfile/updateClient/addClient가 각각
// "자신이 수정한 테이블"에서 linked_profile_id로 연결된 반대편 테이블로 1홉만 전파할 때 사용한다.
// (A→B 전파만 하고 B가 다시 A를 갱신하는 재귀 호출은 만들지 않는다.)
async function syncEmail(table, matchColumn, matchValue, email) {
  if (!matchValue || email === undefined) return;
  const { error } = await supabase.from(table).update({ email }).eq(matchColumn, matchValue);
  if (error) throw error;
}

const SCHEDULE_KEYMAP = { date: 'date', time: 'time', title: 'title', tag: 'tag', notes: 'notes', clientIds: 'client_ids', startDate: 'start_date', endDate: 'end_date', notifyEmail: 'notify_email', createdAt: 'created_at' };
const CLIENT_KEYMAP = { name: 'name', company: 'company', role: 'role', contact: 'contact', workContact: 'work_contact', email: 'email', sns: 'sns', notes: 'notes', aiSummary: 'ai_summary', linkedProfileId: 'linked_profile_id', createdAt: 'created_at' };
const HISTORY_KEYMAP = { clientId: 'client_id', date: 'date', type: 'type', title: 'title', content: 'content', result: 'result', createdAt: 'created_at' };
const PROJECT_KEYMAP = { title: 'title', deadline: 'deadline', startDate: 'start_date', status: 'status', priority: 'priority', notes: 'notes', progress: 'progress', clientIds: 'client_ids', meetingRecordIds: 'meeting_record_ids', notifyEmail: 'notify_email', createdAt: 'created_at', updatedAt: 'updated_at' };
const MEETING_KEYMAP = { title: 'title', transcript: 'transcript', summary: 'summary', source: 'source', clientIds: 'client_ids', projectId: 'project_id', tasks: 'tasks', diarizeSource: 'diarize_source', createdAt: 'created_at' };
const MESSAGE_KEYMAP = { direction: 'direction', sender: 'sender', company: 'company', subject: 'subject', content: 'content', priority: 'priority', status: 'status', fromId: 'sender_id', toId: 'to_id', linkedReceivedId: 'linked_received_id', editHistory: 'edit_history', createdAt: 'created_at', updatedAt: 'updated_at' };

// NOT NULL 컬럼 기본값 — 벌크 upsert 시 toRow()의 defaults 인자로 전달한다.
const SCHEDULE_DEFAULTS = { notes: '', client_ids: [], notify_email: true };
const CLIENT_DEFAULTS = { role: '', work_contact: '', email: '', sns: '', notes: '', ai_summary: '', linked_profile_id: null };
const HISTORY_DEFAULTS = { content: '', result: '' };
const PROJECT_DEFAULTS = { status: '진행중', priority: '보통', notes: '', progress: 0, client_ids: [], meeting_record_ids: [], notify_email: true };
const MEETING_DEFAULTS = { transcript: '', summary: '', client_ids: [], tasks: [] };
const MESSAGE_DEFAULTS = { sender: '', company: '', subject: '', content: '', priority: '일반', status: '미확인', edit_history: [] };

// ── Schedules ────────────────────────────────────────────
export async function getSchedules() {
  const user = await getCurrentUser();
  if (!user) return [];
  const { data, error } = await supabase.from('schedules').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
  if (error) throw error;
  return data.map((r) => fromRow(r, SCHEDULE_KEYMAP));
}

export async function saveSchedules(schedules) {
  const user = await getCurrentUser();
  if (!user || !schedules.length) return;
  const rows = schedules.map((s) => ({ id: s.id, user_id: user.id, ...toRow(s, SCHEDULE_KEYMAP, SCHEDULE_DEFAULTS) }));
  const { error } = await supabase.from('schedules').upsert(rows);
  if (error) throw error;
}

export async function addSchedule(schedule) {
  const user = await getCurrentUser();
  const row = { id: schedule.id || Date.now().toString(), user_id: user.id, created_at: Date.now(), ...toRow(schedule, SCHEDULE_KEYMAP) };
  const { error } = await supabase.from('schedules').insert(row);
  if (error) throw error;
  return getSchedules();
}

export async function deleteSchedule(id) {
  const user = await getCurrentUser();
  const { error } = await supabase.from('schedules').delete().eq('id', id).eq('user_id', user.id);
  if (error) throw error;
  return getSchedules();
}

export async function updateSchedule(id, fields) {
  const user = await getCurrentUser();
  const { error } = await supabase.from('schedules').update(toRow(fields, SCHEDULE_KEYMAP)).eq('id', id).eq('user_id', user.id);
  if (error) throw error;
  return getSchedules();
}

// ── Clients ───────────────────────────────────────────────
export async function getClients() {
  const user = await getCurrentUser();
  if (!user) return [];
  const { data, error } = await supabase.from('clients').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
  if (error) throw error;
  return data.map((r) => fromRow(r, CLIENT_KEYMAP));
}

export async function saveClients(clients) {
  const user = await getCurrentUser();
  if (!user || !clients.length) return;
  const rows = clients.map((c) => ({ id: c.id, user_id: user.id, ...toRow(c, CLIENT_KEYMAP, CLIENT_DEFAULTS) }));
  const { error } = await supabase.from('clients').upsert(rows);
  if (error) throw error;
}

export async function addClient(client) {
  const user = await getCurrentUser();
  // ROSTER(실제 로그인 계정)와 이름·회사가 정확히 일치하면 같은 인물로 간주해 linked_profile_id로 연결한다.
  // clients.id는 PRIMARY KEY라 여러 사용자의 row를 profiles.id 하나로 통일할 수 없어, 별도 컬럼으로 연결한다.
  const matched = ROSTER.find((r) => r.name === client.name && r.team === client.company);
  const id = matched
    ? client.id || Date.now().toString()
    : client.id || `${findRoster({ id: user.id })?.legacyId}__${Date.now()}`;
  const row = {
    id,
    user_id: user.id,
    created_at: Date.now(),
    ...toRow(client, CLIENT_KEYMAP),
    linked_profile_id: matched ? matched.id : null,
  };
  const { error } = await supabase.from('clients').insert(row);
  if (error) throw error;
  // 신규 거래처가 ROSTER 계정과 연결됐고 email이 입력된 경우, 해당 profiles.email도 동기화한다.
  if (matched && client.email !== undefined) await syncEmail('profiles', 'id', matched.id, client.email);
  return getClients();
}

export async function updateClient(id, fields) {
  const user = await getCurrentUser();
  if (fields.email === undefined) {
    const { error } = await supabase.from('clients').update(toRow(fields, CLIENT_KEYMAP)).eq('id', id).eq('user_id', user.id);
    if (error) throw error;
    return getClients();
  }
  // email을 변경하는 경우에만 linked_profile_id를 함께 반환받아 profiles.email 동기화에 사용한다.
  const { data, error } = await supabase.from('clients').update(toRow(fields, CLIENT_KEYMAP)).eq('id', id).eq('user_id', user.id).select('linked_profile_id').single();
  if (error) throw error;
  await syncEmail('profiles', 'id', data?.linked_profile_id, fields.email);
  return getClients();
}

// AI 거래처 비서가 작성한 메일 초안을 사용자가 확인 후 실제로 발송할 때 호출.
// Edge Function이 clients.user_id와 로그인 세션의 user.id 일치 여부로 소유권을 검증하므로,
// 여기서는 별도 검사 없이 그대로 호출한다. 자세한 내용은 supabase/README_send_client_email.md 참고.
export async function sendClientEmail(clientId, subject, body) {
  const { data, error } = await supabase.functions.invoke('send-client-email', {
    body: { client_id: clientId, subject, body },
  });
  if (error) {
    // Edge Function이 오류 시 { error: '메시지' } JSON을 반환하므로, 가능하면 그 메시지를 그대로 노출한다.
    let message = error.message;
    try {
      const parsed = await error.context?.json();
      if (parsed?.error) message = parsed.error;
    } catch {
      // 응답 본문 파싱 실패 시 기본 에러 메시지 사용
    }
    throw new Error(message);
  }
  return data;
}

// ── Histories ─────────────────────────────────────────────
export async function getHistories() {
  const user = await getCurrentUser();
  if (!user) return [];
  const { data, error } = await supabase.from('histories').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
  if (error) throw error;
  return data.map((r) => fromRow(r, HISTORY_KEYMAP));
}

export async function saveHistories(histories) {
  const user = await getCurrentUser();
  if (!user || !histories.length) return;
  const rows = histories.map((h) => ({ id: h.id, user_id: user.id, ...toRow(h, HISTORY_KEYMAP, HISTORY_DEFAULTS) }));
  const { error } = await supabase.from('histories').upsert(rows);
  if (error) throw error;
}

export async function addHistory(history) {
  const user = await getCurrentUser();
  const row = { id: history.id || Date.now().toString(), user_id: user.id, created_at: Date.now(), ...toRow(history, HISTORY_KEYMAP) };
  const { error } = await supabase.from('histories').insert(row);
  if (error) throw error;
  return getHistories();
}

export async function updateHistory(id, changes) {
  const user = await getCurrentUser();
  const { error } = await supabase.from('histories').update(toRow(changes, HISTORY_KEYMAP)).eq('id', id).eq('user_id', user.id);
  if (error) throw error;
  return getHistories();
}

export async function deleteHistory(id) {
  const user = await getCurrentUser();
  const { error } = await supabase.from('histories').delete().eq('id', id).eq('user_id', user.id);
  if (error) throw error;
  return getHistories();
}

export async function getHistoriesByClient(clientId) {
  const user = await getCurrentUser();
  if (!user) return [];
  const { data, error } = await supabase.from('histories').select('*').eq('user_id', user.id).eq('client_id', clientId).order('created_at', { ascending: false });
  if (error) throw error;
  return data.map((r) => fromRow(r, HISTORY_KEYMAP));
}

// ── Projects ──────────────────────────────────────────────
export async function getProjects() {
  const user = await getCurrentUser();
  if (!user) return [];
  const { data, error } = await supabase.from('projects').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
  if (error) throw error;
  return data.map((r) => fromRow(r, PROJECT_KEYMAP));
}

export async function saveProjects(projects) {
  const user = await getCurrentUser();
  if (!user || !projects.length) return;
  const rows = projects.map((p) => ({ id: p.id, user_id: user.id, ...toRow(p, PROJECT_KEYMAP, PROJECT_DEFAULTS) }));
  const { error } = await supabase.from('projects').upsert(rows);
  if (error) throw error;
}

export async function addProject(project) {
  const user = await getCurrentUser();
  const row = { id: project.id || Date.now().toString(), user_id: user.id, created_at: Date.now(), ...toRow(project, PROJECT_KEYMAP) };
  const { error } = await supabase.from('projects').insert(row);
  if (error) throw error;
  return getProjects();
}

export async function updateProject(id, changes) {
  const user = await getCurrentUser();
  const row = { ...toRow(changes, PROJECT_KEYMAP), updated_at: Date.now() };
  const { error } = await supabase.from('projects').update(row).eq('id', id).eq('user_id', user.id);
  if (error) throw error;
  return getProjects();
}

export async function deleteProject(id) {
  const user = await getCurrentUser();
  const { error } = await supabase.from('projects').delete().eq('id', id).eq('user_id', user.id);
  if (error) throw error;
  return getProjects();
}

// ── Messages (교차 계정 배달: mailbox_owner_id로 조회, sender_id로 RLS 검증) ──
export async function getMessages() {
  const user = await getCurrentUser();
  if (!user) return [];
  const { data, error } = await supabase.from('messages').select('*').eq('mailbox_owner_id', user.id).order('created_at', { ascending: false });
  if (error) throw error;
  return data.map((r) => fromRow(r, MESSAGE_KEYMAP));
}

export async function saveMessages(messages) {
  const user = await getCurrentUser();
  if (!user || !messages.length) return;
  const rows = messages.map((m) => ({ id: m.id, mailbox_owner_id: user.id, ...toRow(m, MESSAGE_KEYMAP, MESSAGE_DEFAULTS) }));
  const { error } = await supabase.from('messages').upsert(rows);
  if (error) throw error;
}

export async function addMessage(message) {
  const user = await getCurrentUser();
  const row = { id: message.id || Date.now().toString(), mailbox_owner_id: user.id, created_at: Date.now(), ...toRow(message, MESSAGE_KEYMAP) };
  const { error } = await supabase.from('messages').insert(row);
  if (error) throw error;
  return getMessages();
}

// RLS의 sender_id=auth.uid() OR 분기가 이 프로젝트에서 원인 불명으로 항상 실패해
// deliver_message_to RPC(SECURITY DEFINER)로 우회한다. supabase/rpc_messages_cross_account.sql 참고.
export async function addMessageForUser(userId, message) {
  const row = toRow(message, MESSAGE_KEYMAP);
  const { error } = await supabase.rpc('deliver_message_to', {
    p_id: message.id || Date.now().toString(),
    p_mailbox_owner_id: userId,
    p_to_id: row.to_id ?? userId,
    p_direction: row.direction,
    p_sender: row.sender,
    p_company: row.company ?? '',
    p_subject: row.subject,
    p_content: row.content,
    p_priority: row.priority,
    p_status: row.status,
    p_linked_received_id: row.linked_received_id ?? null,
    p_created_at: Date.now(),
  });
  if (error) throw error;
}

export async function updateMessage(id, changes) {
  const user = await getCurrentUser();
  const row = { ...toRow(changes, MESSAGE_KEYMAP), updated_at: Date.now() };
  const { error } = await supabase.from('messages').update(row).eq('id', id).eq('mailbox_owner_id', user.id);
  if (error) throw error;
  return getMessages();
}

// deliver_message_to와 동일한 이유로 update_message_cross_account RPC를 사용한다.
export async function updateMessageForUser(userId, id, changes) {
  const row = toRow(changes, MESSAGE_KEYMAP);
  const { error } = await supabase.rpc('update_message_cross_account', {
    p_id: id,
    p_mailbox_owner_id: userId,
    p_subject: row.subject,
    p_content: row.content,
    p_edit_history: row.edit_history ?? [],
  });
  if (error) throw error;
}

export async function deleteMessage(id) {
  const user = await getCurrentUser();
  const { error } = await supabase.from('messages').delete().eq('id', id).eq('mailbox_owner_id', user.id);
  if (error) throw error;
  return getMessages();
}

// ── Meeting Records ───────────────────────────────────────
export async function getMeetingRecords() {
  const user = await getCurrentUser();
  if (!user) return [];
  const { data, error } = await supabase.from('meeting_records').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
  if (error) throw error;
  return data.map((r) => fromRow(r, MEETING_KEYMAP));
}

export async function saveMeetingRecords(records) {
  const user = await getCurrentUser();
  if (!user || !records.length) return;
  const rows = records.map((r) => ({ id: r.id, user_id: user.id, ...toRow(r, MEETING_KEYMAP, MEETING_DEFAULTS) }));
  const { error } = await supabase.from('meeting_records').upsert(rows);
  if (error) throw error;
}

export async function addMeetingRecord(record) {
  const user = await getCurrentUser();
  const row = { id: record.id || Date.now().toString(), user_id: user.id, created_at: Date.now(), ...toRow(record, MEETING_KEYMAP) };
  const { error } = await supabase.from('meeting_records').insert(row);
  if (error) throw error;
  return getMeetingRecords();
}

export async function updateMeetingRecord(id, changes) {
  const user = await getCurrentUser();
  const { error } = await supabase.from('meeting_records').update(toRow(changes, MEETING_KEYMAP)).eq('id', id).eq('user_id', user.id);
  if (error) throw error;
  return getMeetingRecords();
}

export async function deleteMeetingRecord(id) {
  const user = await getCurrentUser();
  const { error } = await supabase.from('meeting_records').delete().eq('id', id).eq('user_id', user.id);
  if (error) throw error;
  return getMeetingRecords();
}

// ── Work Topics (계정별로 분리 — profiles.work_topics) ────
export async function getWorkTopics() {
  const user = await getCurrentUser();
  if (!user) return '';
  const { data, error } = await supabase.from('profiles').select('work_topics').eq('id', user.id).single();
  if (error) throw error;
  return data?.work_topics || '';
}

export async function saveWorkTopics(text) {
  const user = await getCurrentUser();
  if (!user) return;
  const { error } = await supabase.from('profiles').update({ work_topics: text }).eq('id', user.id);
  if (error) throw error;
}

// ── Client Favorites ──────────────────────────────────────
export async function getClientFavorites() {
  const user = await getCurrentUser();
  if (!user) return [];
  const { data, error } = await supabase.from('client_favorites').select('client_id').eq('user_id', user.id);
  if (error) throw error;
  return data.map((r) => r.client_id);
}

export async function toggleClientFavorite(clientId) {
  const user = await getCurrentUser();
  if (!user) return [];
  const current = await getClientFavorites();
  if (current.includes(clientId)) {
    const { error } = await supabase.from('client_favorites').delete().eq('user_id', user.id).eq('client_id', clientId);
    if (error) throw error;
  } else {
    const { error } = await supabase.from('client_favorites').insert({ user_id: user.id, client_id: clientId });
    if (error) throw error;
  }
  return getClientFavorites();
}

// ── User Profile (extended) ───────────────────────────────
export async function getUserProfile() {
  const user = await getCurrentUser();
  if (!user) return null;
  const { data, error } = await supabase.from('profiles').select('contact, notes, email, sns').eq('id', user.id).single();
  if (error) throw error;
  // 주의: user.email은 로그인용 Supabase Auth 이메일(계정 아이디)이므로, 알림 수신용 profiles.email로
  // 덮어쓰이지 않도록 ...user를 먼저 펼치고 profiles 필드를 뒤에 덮어쓴다.
  return { ...user, contact: data?.contact || '', notes: data?.notes || '', email: data?.email || '', sns: data?.sns || '' };
}

export async function saveUserProfile(fields) {
  const user = await getCurrentUser();
  if (!user) return;
  const { error } = await supabase.from('profiles').update(fields).eq('id', user.id);
  if (error) throw error;
  // 로그인 계정 본인의 email이 바뀐 경우, 이 계정을 linked_profile_id로 연결해둔 모든 clients row도 동기화한다.
  await syncEmail('clients', 'linked_profile_id', user.id, fields.email);
}

// ── Pyannote Server URL (기기별 설정 — 마이그레이션 범위 밖, 변경 없음) ──
export async function getPyannoteUrl() {
  return AsyncStorage.getItem(KEYS.pyannoteUrl);
}

function isPrivateOrLocalHost(hostname) {
  if (hostname === 'localhost' || hostname === '127.0.0.1') return true;
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (!m) return false;
  const octets = m.slice(1, 5).map(Number);
  if (octets.some((o) => o > 255)) return false;
  const [a, b] = octets;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

export async function setPyannoteUrl(url) {
  if (url) {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error('올바른 URL 형식이 아닙니다.');
    }
    const isHttps = parsed.protocol === 'https:';
    const isAllowedHttp = parsed.protocol === 'http:' && isPrivateOrLocalHost(parsed.hostname);
    if (!isHttps && !isAllowedHttp) {
      throw new Error('보안을 위해 HTTPS만 허용됩니다. (로컬 네트워크 주소는 HTTP 허용)');
    }
  }
  return AsyncStorage.setItem(KEYS.pyannoteUrl, url);
}

// ── 기존 모바일 로컬(AsyncStorage) 데이터 → 클라우드 1회성 업로드 ──
function legacyIdToUuid(legacyIdOrUuid) {
  const entry = findRoster({ legacyId: legacyIdOrUuid }) || ROSTER.find((r) => r.id === legacyIdOrUuid);
  return entry ? entry.id : legacyIdOrUuid;
}

async function readLegacyList(base, legacyId) {
  const raw = await AsyncStorage.getItem(`${base}_${legacyId}`);
  return safeParseJSON(raw) || [];
}

export async function hasLegacyLocalData() {
  const user = await getCurrentUser();
  if (!user) return false;
  const entry = findRoster({ id: user.id });
  if (!entry) return false;
  const { data, error } = await supabase.from('profiles').select('legacy_data_migrated').eq('id', user.id).single();
  if (error) throw error;
  if (data?.legacy_data_migrated) return false;
  const bases = [LEGACY_KEYS.schedules, LEGACY_KEYS.clients, LEGACY_KEYS.histories, LEGACY_KEYS.projects, LEGACY_KEYS.messages, LEGACY_KEYS.meetingRecords];
  for (const base of bases) {
    const list = await readLegacyList(base, entry.legacyId);
    if (list.length > 0) return true;
  }
  return false;
}

export async function migrateLocalDataToCloud() {
  const user = await getCurrentUser();
  if (!user) throw new Error('로그인이 필요합니다.');
  const entry = findRoster({ id: user.id });
  if (!entry) throw new Error('레거시 계정 정보를 찾을 수 없습니다.');
  const legacyId = entry.legacyId;

  // 예전 샘플 데이터는 계정마다 동일한 id(c1, p1, m1 ...)를 썼다 — 이제는 전 계정이
  // 하나의 테이블을 공유하므로 id가 계정 간 충돌하지 않도록 legacyId를 접두어로 붙인다.
  const ns = (id) => (id ? `${legacyId}__${id}` : id);
  const nsArr = (arr) => (Array.isArray(arr) ? arr.map(ns) : arr);

  const legacyClients = await readLegacyList(LEGACY_KEYS.clients, legacyId);
  if (legacyClients.length) {
    // addClient()와 동일하게 ROSTER(실제 로그인 계정)와 이름·회사가 일치하면 linked_profile_id로 연결한다.
    const rows = legacyClients.map((c) => {
      const matched = ROSTER.find((r) => r.name === c.name && r.team === c.company);
      return {
        id: ns(c.id), user_id: user.id, ...toRow(c, CLIENT_KEYMAP, CLIENT_DEFAULTS),
        linked_profile_id: matched ? matched.id : null,
      };
    });
    const { error } = await supabase.from('clients').upsert(rows);
    if (error) throw error;
  }

  const legacyProjects = await readLegacyList(LEGACY_KEYS.projects, legacyId);
  if (legacyProjects.length) {
    const rows = legacyProjects.map((p) => ({
      id: ns(p.id), user_id: user.id, ...toRow(p, PROJECT_KEYMAP, PROJECT_DEFAULTS),
      client_ids: nsArr(p.clientIds) ?? [], meeting_record_ids: nsArr(p.meetingRecordIds) ?? [],
    }));
    const { error } = await supabase.from('projects').upsert(rows);
    if (error) throw error;
  }

  const legacyMeetingRecords = await readLegacyList(LEGACY_KEYS.meetingRecords, legacyId);
  if (legacyMeetingRecords.length) {
    const rows = legacyMeetingRecords.map((m) => ({
      id: ns(m.id), user_id: user.id, ...toRow(m, MEETING_KEYMAP, MEETING_DEFAULTS),
      client_ids: nsArr(m.clientIds) ?? [], project_id: ns(m.projectId),
    }));
    const { error } = await supabase.from('meeting_records').upsert(rows);
    if (error) throw error;
  }

  const legacyHistories = await readLegacyList(LEGACY_KEYS.histories, legacyId);
  if (legacyHistories.length) {
    const rows = legacyHistories.map((h) => ({
      id: ns(h.id), user_id: user.id, ...toRow(h, HISTORY_KEYMAP, HISTORY_DEFAULTS), client_id: ns(h.clientId),
    }));
    const { error } = await supabase.from('histories').upsert(rows);
    if (error) throw error;
  }

  const legacySchedules = await readLegacyList(LEGACY_KEYS.schedules, legacyId);
  if (legacySchedules.length) {
    const rows = legacySchedules.map((s) => ({
      id: ns(s.id), user_id: user.id, ...toRow(s, SCHEDULE_KEYMAP, SCHEDULE_DEFAULTS), client_ids: nsArr(s.clientIds) ?? [],
    }));
    const { error } = await supabase.from('schedules').upsert(rows);
    if (error) throw error;
  }

  const legacyMessages = await readLegacyList(LEGACY_KEYS.messages, legacyId);
  if (legacyMessages.length) {
    const rows = legacyMessages.map((m) => ({
      id: ns(m.id),
      mailbox_owner_id: user.id,
      ...toRow(m, MESSAGE_KEYMAP, MESSAGE_DEFAULTS),
      sender_id: legacyIdToUuid(m.fromId),
      to_id: m.toId ? legacyIdToUuid(m.toId) : null,
      linked_received_id: m.linkedReceivedId ? ns(m.linkedReceivedId) : null,
    }));
    const { error } = await supabase.from('messages').upsert(rows);
    if (error) throw error;
  }

  const legacyFavorites = await readLegacyList(LEGACY_KEYS.clientFavorites, legacyId);
  if (legacyFavorites.length) {
    const rows = legacyFavorites.map((clientId) => ({ user_id: user.id, client_id: ns(clientId) }));
    const { error } = await supabase.from('client_favorites').upsert(rows);
    if (error) throw error;
  }

  const legacyProfileRaw = await AsyncStorage.getItem(`${LEGACY_KEYS.userProfile}_${legacyId}`);
  const legacyProfileExt = safeParseJSON(legacyProfileRaw) || {};
  const legacyWorkTopics = await AsyncStorage.getItem(LEGACY_KEYS.workTopics);
  const profileUpdate = { legacy_data_migrated: true };
  if (legacyProfileExt.contact) profileUpdate.contact = legacyProfileExt.contact;
  if (legacyProfileExt.notes) profileUpdate.notes = legacyProfileExt.notes;
  if (legacyWorkTopics) profileUpdate.work_topics = legacyWorkTopics;

  const { error } = await supabase.from('profiles').update(profileUpdate).eq('id', user.id);
  if (error) throw error;
}
