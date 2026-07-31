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
  // ROSTER(하드코딩 6개 테스트 계정)는 회사 계정 시나리오 밖이므로 항상 false/null.
  return { id, email, name, role, team, isCompanyAdmin: false, companyId: null };
}

let _cachedUser = null;

async function hydrateUserFromSession(session) {
  if (!session?.user) return null;
  const entry = findRoster({ id: session.user.id });
  if (entry) return rosterToUser(entry);
  // ROSTER에 없는 계정(회원가입으로 새로 생성된 계정, 회사 계정 시나리오 계정 포함)은
  // profiles 테이블에서 직접 조회한다.
  const { data, error } = await supabase.from('profiles').select('id, email, name, role, team, contact, is_company_admin, company_id').eq('id', session.user.id).single();
  if (data) {
    // 과거에 회사 등록 RPC가 실패해(예: 회사명 중복) profiles 행은 있지만 company_id가 비어있는
    // 계정을 재로그인 시점에도 계속 감지한다 — 이 플래그가 없으면 최초 실패 이후에는 아무 안내도
    // 없이 회사 미소속 상태로 영구히 남는다(설정 화면에서 재시도 유도용, completeCompanySetup 참고).
    const accountType = session.user.user_metadata?.accountType;
    const companySetupPending = (accountType === 'admin' || accountType === 'employee') && !data.company_id;
    return {
      id: data.id, email: data.email, name: data.name, role: data.role, team: data.team, contact: data.contact,
      isCompanyAdmin: !!data.is_company_admin, companyId: data.company_id || null,
      companySetupPending, pendingAccountType: companySetupPending ? accountType : undefined,
    };
  }
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

    // 회원가입 시 선택한 회사관리자/회사직원에 따라 companies/departments/profiles를 실제로 채운다.
    // 이 지점은 signUp() 직후 즉시 세션이 있는 경우와, 이메일 인증 후 나중에 로그인하는 경우 둘 다
    // profiles 행이 처음 생성되는 유일한 지점이라 회사 가입 처리를 여기 한 곳에만 두면 된다.
    const accountType = session.user.user_metadata?.accountType;
    const departmentName = session.user.user_metadata?.departmentName?.trim() || '';
    let companyId = null;
    let companySetupPending = false;
    if (accountType === 'admin' || accountType === 'employee') {
      const { error: rpcErr } = accountType === 'admin'
        ? await supabase.rpc('signup_create_company_as_admin', { p_company_name: team })
        : await supabase.rpc('signup_join_company_as_employee', { p_company_name: team, p_department_name: departmentName });
      if (rpcErr) {
        // 주의: 여기서 그대로 throw하면 안 된다. auth.signUp()과 위 profiles insert는 이미 커밋된
        // 뒤라 계정 자체는 생성이 끝난 상태인데, 예외를 던지면 signup()/login() 호출 자체가
        // 실패로 끝나 로그인이 막힌다. 게다가 같은 이메일로 회원가입을 다시 시도해도 "이미 가입된
        // 이메일입니다"로 막혀 사용자가 영구히 갇히는 데드엔드가 생긴다(회사명 중복처럼 사용자가
        // 스스로 고칠 수 있는 원인일수록 이 데드엔드를 자주 밟게 됨). 대신 로그인은 그대로
        // 진행시키고 companySetupPending 플래그만 세워 설정 화면에서 재시도(completeCompanySetup)
        // 하도록 안내한다.
        companySetupPending = true;
      } else {
        // RPC가 profiles.company_id를 채운 뒤이므로, insert 시점 select에는 없던 값을 다시 조회한다.
        const { data: refreshed } = await supabase.from('profiles').select('company_id').eq('id', inserted.id).single();
        companyId = refreshed?.company_id || null;
      }
    }

    return {
      id: inserted.id, email: inserted.email, name: inserted.name, role: inserted.role, team: inserted.team, contact: inserted.contact,
      isCompanyAdmin: accountType === 'admin' && !companySetupPending, companyId,
      companySetupPending, pendingAccountType: companySetupPending ? accountType : undefined,
    };
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

export async function signup(email, password, name, contact, team, role, accountType, departmentName) {
  const displayName = name?.trim() || email.split('@')[0];
  // name/contact/team/role/accountType/departmentName은 auth 사용자 메타데이터에 저장해 둔다.
  // 이메일 인증이 필요한 프로젝트는 signUp 직후 세션이 없어(auth.uid() 없음) profiles 행을 바로
  // 만들 수 없으므로, 실제 profiles 행 생성(및 회사 가입 RPC 호출)은 세션이 생기는 시점
  // (hydrateUserFromSession)에 지연 처리한다.
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { name: displayName, contact: contact?.trim() || '', team: team?.trim() || '', role: role?.trim() || '', accountType: accountType || '', departmentName: departmentName?.trim() || '' } },
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

// 회원가입(회사직원) 화면에서 기존 회사 목록을 칩으로 보여주기 위한 조회.
// 목록 조회 실패가 가입 자체를 막으면 안 되므로 에러를 던지지 않고 빈 배열을 반환한다.
export async function getCompanyList() {
  const { data, error } = await supabase.from('companies').select('id, name').order('name');
  if (error) return [];
  return data || [];
}

// 회원가입 시 회사 등록 RPC(signup_create_company_as_admin/signup_join_company_as_employee)가
// 실패해(대표적으로 회사명 중복) profiles.company_id가 비어있는 상태(user.companySetupPending)를
// 설정 화면에서 재시도하기 위한 함수. 원래 가입 시 선택했던 accountType(관리자/직원)은
// auth 세션의 user_metadata에 그대로 남아있으므로 그걸 그대로 사용해 올바른 RPC를 다시 호출한다.
// 성공할 때까지(올바른/미사용 회사명을 입력할 때까지) 여러 번 호출될 수 있다.
export async function completeCompanySetup(companyName, departmentName) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session?.user) throw new Error('로그인이 필요합니다.');
  const accountType = session.user.user_metadata?.accountType;
  if (accountType !== 'admin' && accountType !== 'employee') {
    throw new Error('회사 계정 정보를 확인할 수 없습니다. 문의해주세요.');
  }
  const trimmedName = companyName?.trim();
  if (!trimmedName) throw new Error('회사명을 입력해주세요.');

  const { error: rpcErr } = accountType === 'admin'
    ? await supabase.rpc('signup_create_company_as_admin', { p_company_name: trimmedName })
    : await supabase.rpc('signup_join_company_as_employee', { p_company_name: trimmedName, p_department_name: departmentName?.trim() || '' });
  if (rpcErr) {
    if (rpcErr.message?.includes('이미 사용 중인 회사명입니다')) throw new Error(rpcErr.message);
    throw new Error('회사 정보 등록에 실패했습니다. 잠시 후 다시 시도해주세요.');
  }

  // _cachedUser에 의존하지 않고 profiles를 다시 전체 조회해 최신 상태로 재구성한다
  // (_cachedUser가 비어있는 예외적인 상황에서도 name 등 필수 필드가 누락되지 않도록).
  const { data: refreshed } = await supabase.from('profiles').select('id, email, name, role, team, contact, is_company_admin, company_id').eq('id', session.user.id).single();
  _cachedUser = refreshed
    ? {
        id: refreshed.id, email: refreshed.email, name: refreshed.name, role: refreshed.role, team: refreshed.team, contact: refreshed.contact,
        isCompanyAdmin: !!refreshed.is_company_admin, companyId: refreshed.company_id || null,
        companySetupPending: false, pendingAccountType: undefined,
      }
    : { ..._cachedUser, companySetupPending: false, pendingAccountType: undefined };
  return _cachedUser;
}

export function getTestAccounts() {
  return ROSTER.map(rosterToUser);
}

// 설정 화면 "계정 전환" 목록용 — ROSTER(하드코딩 테스트 계정 6개)뿐 아니라 DB에 실제 가입된
// 모든 계정(profiles 테이블 전체)을 반환한다. 목록 조회 실패가 화면 전체를 막으면 안 되므로
// getCompanyList()와 동일하게 에러를 던지지 않고 빈 배열을 반환한다.
// isRosterAccount: true면 DEV_PASSWORDS로 비밀번호 입력 없이 즉시 전환 가능, false면 대상
// 계정의 실제 비밀번호를 반드시 입력해야 한다(switchAccount 참고).
export async function getAllAccounts() {
  const { data, error } = await supabase.rpc('get_all_accounts_for_switch');
  if (error) return [];
  return (data || []).map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    team: row.team,
    role: row.role,
    isRosterAccount: !!findRoster({ id: row.id }),
  }));
}

// 담당자(clients) 추가 화면의 "기존 회원 검색"용 — discoverable=true(옵트인)로 설정한 계정만
// 대상으로 name/email/team ilike 검색한다. 검색어가 비어있으면 search_discoverable_profiles()가
// 예외를 던지므로, 여기서 먼저 걸러 불필요한 API 호출/예외를 방지한다. 조회 실패도 getAllAccounts()와
// 동일하게 화면을 막지 않도록 빈 배열을 반환한다.
// contact: discoverable 옵트인 동의 범위가 "연락처 포함 노출 및 담당자 자동 추가"로 확장되면서
// RPC 반환 컬럼에 추가됨(patch_search_discoverable_profiles_add_contact.sql 참고) — 그대로 통과시킨다.
export async function searchDiscoverableProfiles(query) {
  const q = (query || '').trim();
  if (!q) return [];
  const { data, error } = await supabase.rpc('search_discoverable_profiles', { p_query: q });
  if (error) return [];
  return (data || []).map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    team: row.team,
    role: row.role,
    contact: row.contact,
  }));
}

// 상호 등록된 담당자(A가 B를 담당자로 등록 + B도 A를 담당자로 등록)이고, B가 설정 화면에서
// "상호 등록된 담당자와 히스토리 공유"를 옵트인한 경우에만 B가 기록한 히스토리(전체 항목)를
// 반환한다. get_mutual_client_history() RPC가 4단계 보안 조건을 전부 검사하므로 여기서는 결과를
// 그대로 통과시킨다. 조건 불충족 시(상호 등록 아님/상대방 비공개 등) 이유 구분 없이 빈 배열을
// 반환한다 — 프라이버시상 "왜 안 보이는지"를 알려주는 것 자체가 정보 유출이 될 수 있기 때문.
// 자세한 배경은 supabase/patch_mutual_client_history.sql 참고.
export async function getMutualClientHistory(otherProfileId) {
  if (!otherProfileId) return [];
  const { data, error } = await supabase.rpc('get_mutual_client_history', { p_other_profile_id: otherProfileId });
  if (error) return [];
  return (data || []).map((row) => ({
    id: row.id, date: row.date, type: row.type, title: row.title, content: row.content, result: row.result, topicId: row.topic_id, topicName: row.topic_name, createdAt: row.created_at,
  }));
}

// 상호 등록 및 히스토리 공유를 허용한 상대방의 "공유중" 토픽만 반환한다.
// 반환된 토픽은 내 히스토리를 공동으로 연결할 수 있지만, 토픽 자체의 수정/삭제 권한은 주지 않는다.
export async function getMutualClientTopics(otherProfileId) {
  if (!otherProfileId) return [];
  const { data, error } = await supabase.rpc('get_mutual_client_topics', { p_other_profile_id: otherProfileId });
  if (error) return [];
  return (data || []).map((row) => ({
    id: row.id, clientId: row.client_id, name: row.name, shared: true, createdAt: row.created_at, isMutual: true,
  }));
}

// 대상 계정이 ROSTER(하드코딩 테스트 계정)면 CLAUDE.md에 이미 공개된 고정 비밀번호로 비밀번호
// 입력 없이 즉시 전환한다(기존 동작 유지). ROSTER가 아닌 실제 가입 계정은 고정 비밀번호가 없으므로
// targetPassword를 반드시 입력받아 signInWithPassword로 검증한다 — 비밀번호 확인 없이 전환을
// 허용하면 "비밀번호 없이 남의 계정 접근"이 되는 심각한 보안 취약점이므로 절대 생략하지 않는다.
export async function switchAccount(targetEmail, currentPassword, targetPassword, targetId) {
  if (!__DEV__) throw new Error('계정 전환은 개발 모드에서만 사용 가능합니다.');
  const current = await getCurrentUser();
  if (!current) throw new Error('현재 로그인된 계정이 없습니다.');
  const { error: verifyErr } = await supabase.auth.signInWithPassword({ email: current.email, password: currentPassword || '' });
  if (verifyErr) throw new Error('현재 계정 비밀번호가 일치하지 않습니다.');

  // targetEmail은 profiles.email(알림 수신용, 사용자가 자유롭게 변경 가능)이라 ROSTER 이메일과
  // 달라질 수 있음 — getAllAccounts()의 isRosterAccount(id 기준)와 판정 기준을 맞추기 위해 id로 조회.
  const rosterEntry = findRoster({ id: targetId });
  // 검증(대상 비밀번호 누락 등)은 signOut 이전에 끝낸다 — 여기서 먼저 로그아웃해버리면 검증
  // 실패 시 현재 세션만 잃고 전환도 안 되는 상태로 남는다.
  if (!rosterEntry && !targetPassword) throw new Error('대상 계정의 비밀번호를 입력해주세요.');

  await supabase.auth.signOut();

  const { data, error } = rosterEntry
    ? await supabase.auth.signInWithPassword({ email: rosterEntry.email, password: DEV_PASSWORDS[rosterEntry.legacyId] })
    : await supabase.auth.signInWithPassword({ email: targetEmail, password: targetPassword });
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

// client_ids(schedules/projects) 소유권 사전 검증. RLS는 행 자체의 user_id만 검사할 뿐 배열 안의
// client_ids 원소가 실제로 호출자 소유의 담당자인지는 검사하지 않아, DB 트리거
// (validate_client_ids_ownership, supabase/patch_client_ids_ownership.sql)가 최종 방어선으로
// INSERT/UPDATE 자체를 막는다. 다만 트리거 예외 메시지는 사용자 친화적이지 않으므로, 저장 시도
// 전에 여기서 먼저 걸러 명확한 한국어 에러를 준다(보안 재감사 02_security.md 발견 #1 조치).
async function assertClientIdsOwned(userId, clientIds) {
  if (!Array.isArray(clientIds) || clientIds.length === 0) return;
  const uniqueIds = [...new Set(clientIds)];
  const { data, error } = await supabase.from('clients').select('id').eq('user_id', userId).in('id', uniqueIds);
  if (error) throw error;
  if ((data || []).length !== uniqueIds.length) {
    throw new Error('존재하지 않거나 접근 권한이 없는 담당자가 포함되어 있습니다.');
  }
}

// clients.email <-> profiles.email 동기화 헬퍼. saveUserProfile/updateClient/addClient가 각각
// "자신이 수정한 테이블"에서 linked_profile_id로 연결된 반대편 테이블로 1홉만 전파할 때 사용한다.
// (A→B 전파만 하고 B가 다시 A를 갱신하는 재귀 호출은 만들지 않는다.)
async function syncEmail(table, matchColumn, matchValue, email) {
  if (!matchValue || email === undefined) return;
  const { error } = await supabase.from(table).update({ email }).eq(matchColumn, matchValue);
  if (error) throw error;
}

const SCHEDULE_KEYMAP = { date: 'date', time: 'time', title: 'title', tag: 'tag', notes: 'notes', clientIds: 'client_ids', projectId: 'project_id', startDate: 'start_date', endDate: 'end_date', notifyEmail: 'notify_email', createdAt: 'created_at' };
const CLIENT_KEYMAP = { name: 'name', company: 'company', role: 'role', contact: 'contact', workContact: 'work_contact', email: 'email', sns: 'sns', notes: 'notes', aiSummary: 'ai_summary', linkedProfileId: 'linked_profile_id', createdAt: 'created_at' };
const HISTORY_KEYMAP = { clientId: 'client_id', date: 'date', type: 'type', title: 'title', content: 'content', result: 'result', sharedWithMutual: 'shared_with_mutual', topicId: 'topic_id', createdAt: 'created_at' };
const TOPIC_KEYMAP = { clientId: 'client_id', projectId: 'project_id', name: 'name', shared: 'shared', createdAt: 'created_at' };
const PROJECT_KEYMAP = { title: 'title', deadline: 'deadline', startDate: 'start_date', status: 'status', priority: 'priority', notes: 'notes', progress: 'progress', clientIds: 'client_ids', ownerClientId: 'owner_client_id', meetingRecordIds: 'meeting_record_ids', notifyEmail: 'notify_email', createdAt: 'created_at', updatedAt: 'updated_at' };
const MEETING_KEYMAP = { title: 'title', transcript: 'transcript', summary: 'summary', source: 'source', clientIds: 'client_ids', projectId: 'project_id', tasks: 'tasks', diarizeSource: 'diarize_source', createdAt: 'created_at' };
const MESSAGE_KEYMAP = { direction: 'direction', sender: 'sender', company: 'company', subject: 'subject', content: 'content', priority: 'priority', status: 'status', fromId: 'sender_id', toId: 'to_id', linkedReceivedId: 'linked_received_id', editHistory: 'edit_history', createdAt: 'created_at', updatedAt: 'updated_at' };

// NOT NULL 컬럼 기본값 — 벌크 upsert 시 toRow()의 defaults 인자로 전달한다.
const SCHEDULE_DEFAULTS = { notes: '', client_ids: [], notify_email: true };
const CLIENT_DEFAULTS = { role: '', work_contact: '', email: '', sns: '', notes: '', ai_summary: '', linked_profile_id: null };
const HISTORY_DEFAULTS = { content: '', result: '', shared_with_mutual: false, topic_id: null };
const TOPIC_DEFAULTS = { shared: false };
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
  const allClientIds = schedules.flatMap((s) => (Array.isArray(s.clientIds) ? s.clientIds : []));
  await assertClientIdsOwned(user.id, allClientIds);
  const rows = schedules.map((s) => ({ id: s.id, user_id: user.id, ...toRow(s, SCHEDULE_KEYMAP, SCHEDULE_DEFAULTS) }));
  const { error } = await supabase.from('schedules').upsert(rows);
  if (error) throw error;
}

// 일정의 관련 인물 중 이 앱에 가입된 계정(clients.linked_profile_id)에게 동일한 일정 사본을
// 만들어준다(sync_schedule_mirrors RPC, patch_schedule_mirror.sql). 관련 인물에서 빠지면 그
// 사람의 사본도 함께 삭제된다. 실패해도(패치 미실행 등) 핵심 저장 자체는 막지 않는다.
async function syncScheduleMirrors(scheduleId) {
  const { error } = await supabase.rpc('sync_schedule_mirrors', { p_schedule_id: scheduleId });
  if (error) console.warn('syncScheduleMirrors 실패:', error.message);
}

export async function addSchedule(schedule) {
  const user = await getCurrentUser();
  await assertClientIdsOwned(user.id, schedule.clientIds);
  const row = { id: schedule.id || Date.now().toString(), user_id: user.id, created_at: Date.now(), ...toRow(schedule, SCHEDULE_KEYMAP) };
  const { error } = await supabase.from('schedules').insert(row);
  if (error) throw error;
  await syncScheduleMirrors(row.id);
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
  if (fields.clientIds !== undefined) await assertClientIdsOwned(user.id, fields.clientIds);
  const { error } = await supabase.from('schedules').update(toRow(fields, SCHEDULE_KEYMAP)).eq('id', id).eq('user_id', user.id);
  if (error) throw error;
  await syncScheduleMirrors(id);
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
  // client.linkedProfileId: "기존 회원 검색"에서 사용자가 명시적으로 특정 profile을 고른 경우
  // 확실하게 연결해야 하는 값이므로 최우선으로 사용한다. ROSTER(실제 로그인 계정) 이름·회사 일치
  // 휴리스틱은 linkedProfileId가 없을 때만 폴백으로 사용한다 — 휴리스틱에만 의존하면 이름이
  // 우연히 겹치는 다른 사람과 잘못 연결될 위험이 있다.
  const matched = client.linkedProfileId ? null : ROSTER.find((r) => r.name === client.name && r.team === client.company);
  const linkedProfileId = client.linkedProfileId || (matched ? matched.id : null);
  const id = matched
    ? client.id || Date.now().toString()
    : client.id || `${findRoster({ id: user.id })?.legacyId}__${Date.now()}`;
  // linkedProfileId는 아래에서 별도로 linked_profile_id에 명시적으로 싣기 때문에, toRow() 대상에서
  // 빼서 CLIENT_KEYMAP을 통해 중복으로(그리고 우선순위 없이) row에 실리지 않도록 한다.
  const { linkedProfileId: _omit, ...clientForRow } = client;
  const row = {
    id,
    user_id: user.id,
    created_at: Date.now(),
    ...toRow(clientForRow, CLIENT_KEYMAP),
    linked_profile_id: linkedProfileId,
  };
  const { error } = await supabase.from('clients').insert(row);
  if (error) throw error;
  // 신규 담당자가 profile과 연결됐고(검색 선택 또는 ROSTER 매칭) email이 입력된 경우,
  // 해당 profiles.email도 동기화한다.
  if (linkedProfileId && client.email !== undefined) await syncEmail('profiles', 'id', linkedProfileId, client.email);
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

export async function deleteClient(id) {
  const user = await getCurrentUser();
  const { error } = await supabase.from('clients').delete().eq('id', id).eq('user_id', user.id);
  if (error) throw error;
  return getClients();
}

// AI 담당자 비서가 작성한 메일 초안을 사용자가 확인 후 실제로 발송할 때 호출.
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

// ── Topics (히스토리 업무 토픽) ──────────────────────────
// topic.shared를 켜면 그 토픽에 속한 히스토리가 상대방에게 공개될 "후보"가 된다. 실제 노출은
// 히스토리 개별 shared_with_mutual과의 AND 게이트로 get_mutual_client_history()가 판정한다.
// 자세한 배경은 supabase/patch_history_topic.sql 참고.
// ClientScreen.load()가 clients/histories 등과 함께 Promise.all로 병렬 호출하므로, 여기서
// throw하면 topics 테이블/컬럼이 아직 없는(마이그레이션 미실행) 환경에서 무관한 나머지 데이터
// 로딩까지 전부 실패해 화면이 텅 비어 보이는 문제가 생긴다. 토픽은 부가 기능이므로 실패 시
// 조용히 빈 배열을 반환해 나머지 로딩을 막지 않는다.
export async function getTopics() {
  const user = await getCurrentUser();
  if (!user) return [];
  const { data, error } = await supabase.from('topics').select('*').eq('user_id', user.id);
  if (error) return [];
  return data.map((r) => fromRow(r, TOPIC_KEYMAP));
}

export async function addTopic(topic) {
  const user = await getCurrentUser();
  const row = { id: topic.id || Date.now().toString(), user_id: user.id, created_at: Date.now(), ...toRow(topic, TOPIC_KEYMAP, TOPIC_DEFAULTS) };
  const { error } = await supabase.from('topics').insert(row);
  if (error) throw error;
  return getTopics();
}

export async function updateTopic(id, changes) {
  const user = await getCurrentUser();
  const { error } = await supabase.from('topics').update(toRow(changes, TOPIC_KEYMAP)).eq('id', id).eq('user_id', user.id);
  if (error) throw error;
  return getTopics();
}

export async function deleteTopic(id) {
  const user = await getCurrentUser();
  const { error } = await supabase.from('topics').delete().eq('id', id).eq('user_id', user.id);
  if (error) throw error;
  return getTopics();
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
  const allClientIds = projects.flatMap((p) => (Array.isArray(p.clientIds) ? p.clientIds : []));
  await assertClientIdsOwned(user.id, allClientIds);
  const rows = projects.map((p) => ({ id: p.id, user_id: user.id, ...toRow(p, PROJECT_KEYMAP, PROJECT_DEFAULTS) }));
  const { error } = await supabase.from('projects').upsert(rows);
  if (error) throw error;
}

// 프로젝트의 관련 인물 중 이 앱에 가입된 계정(clients.linked_profile_id)에게 동일한 프로젝트 사본을
// 만들어준다(sync_project_mirrors RPC, patch_project_mirror.sql). 관련 인물에서 빠지면 그
// 사람의 사본도 함께 삭제된다. 실패해도(패치 미실행 등) 핵심 저장 자체는 막지 않는다.
async function syncProjectMirrors(projectId) {
  const { error } = await supabase.rpc('sync_project_mirrors', { p_project_id: projectId });
  if (error) console.warn('syncProjectMirrors 실패:', error.message);
}

export async function addProject(project) {
  const user = await getCurrentUser();
  await assertClientIdsOwned(user.id, project.clientIds);
  const row = { id: project.id || Date.now().toString(), user_id: user.id, created_at: Date.now(), ...toRow(project, PROJECT_KEYMAP) };
  const { error } = await supabase.from('projects').insert(row);
  if (error) throw error;
  await syncProjectMirrors(row.id);
  return getProjects();
}

export async function updateProject(id, changes) {
  const user = await getCurrentUser();
  if (changes.clientIds !== undefined) await assertClientIdsOwned(user.id, changes.clientIds);
  const row = { ...toRow(changes, PROJECT_KEYMAP), updated_at: Date.now() };
  const { error } = await supabase.from('projects').update(row).eq('id', id).eq('user_id', user.id);
  if (error) throw error;
  await syncProjectMirrors(id);
  return getProjects();
}

export async function deleteProject(id) {
  const user = await getCurrentUser();
  const { error } = await supabase.from('projects').delete().eq('id', id).eq('user_id', user.id);
  if (error) throw error;
  return getProjects();
}

// 회사 관리자 전용: 같은 회사 소속 전체 부서의 프로젝트를 부서별로 그룹핑해서 반환한다.
// get_company_projects() RPC(SECURITY DEFINER, patch_get_company_projects.sql)를 사용한다 —
// 예전에는 projects.select('*, profiles!inner(...)')로 직접 임베드 조회를 했었지만, 다른 직원의
// profiles 행은 profiles_select_own RLS에 막혀 !inner 조인에서 통째로 탈락하는 버그가 있었다
// (get_company_colleagues()와 동일한 이유 — 자세한 배경은 patch_get_company_projects.sql 참고).
export async function getCompanyProjects() {
  const { data, error } = await supabase.rpc('get_company_projects');
  if (error) throw error;

  const groups = new Map();
  for (const row of data) {
    const { owner_name, owner_team, department_name, related_people, ...projectRow } = row;
    const project = fromRow(projectRow, PROJECT_KEYMAP);
    project.ownerName = owner_name || '';
    project.ownerTeam = owner_team || '';
    project.relatedPeople = related_people || [];
    const departmentName = department_name || '미배정';
    if (!groups.has(departmentName)) groups.set(departmentName, []);
    groups.get(departmentName).push(project);
  }
  return [...groups.entries()].map(([departmentName, projects]) => ({ departmentName, projects }));
}

// 회사 관리자 전용: 같은 회사 소속 전체 부서의 직원(profiles) 목록을 부서별로 그룹핑해서 반환한다.
// 보안 재감사(_review/secretary_test-20260723/02_security.md 발견 #3)에서 profiles_select_same_company
// RLS가 email/contact/notes/work_topics까지 전체 컬럼을 노출한다는 MEDIUM 이슈가 지적돼, 그 정책은
// drop되고 SECURITY DEFINER 함수 get_company_colleagues()로 대체됐다(patch_profiles_colleagues_columns.sql
// 참고). 이 함수는 id/name/role/department_id/is_company_admin만 반환하므로 email/contact 등
// 민감 컬럼은 DB 레벨에서부터 조회 자체가 불가능하다.
export async function getCompanyEmployees() {
  const user = await getCurrentUser();
  if (!user?.companyId) return [];

  const [{ data: profilesData, error: profilesErr }, { data: departmentsData, error: deptErr }] = await Promise.all([
    supabase.rpc('get_company_colleagues'),
    supabase.from('departments').select('id, name').eq('company_id', user.companyId),
  ]);
  if (profilesErr) throw profilesErr;
  if (deptErr) throw deptErr;

  const deptNameById = new Map((departmentsData || []).map((d) => [d.id, d.name]));

  const groups = new Map();
  for (const row of profilesData || []) {
    const departmentName = deptNameById.get(row.department_id) || '미배정';
    const employee = { id: row.id, name: row.name || '', role: row.role || '', isCompanyAdmin: !!row.is_company_admin, departmentId: row.department_id || null };
    if (!groups.has(departmentName)) groups.set(departmentName, []);
    groups.get(departmentName).push(employee);
  }
  return [...groups.entries()].map(([departmentName, employees]) => ({ departmentName, employees }));
}

// 회사 관리자 전용: 같은 회사 소속 부서 목록(계층 구조). 부서 관리 모달의 목록·재배치 chip에 사용된다.
export async function getCompanyDepartments() {
  const user = await getCurrentUser();
  if (!user?.companyId) return [];
  const { data, error } = await supabase.from('departments').select('id, name, parent_department_id').eq('company_id', user.companyId);
  if (error) throw error;
  return (data || []).map((d) => ({ id: d.id, name: d.name, parentId: d.parent_department_id || null }));
}

// 회사 관리자 전용: 부서 추가. parentId는 상위 부서 id(null = 최상위). RPC 내부에서 my_is_company_admin() 체크 및 중복/미입력 검증(한국어 예외 메시지) 수행.
export async function createDepartment(name, parentId) {
  const { data, error } = await supabase.rpc('create_department', { p_name: name, p_parent_department_id: parentId || null });
  if (error) throw error;
  return data;
}

// 회사 관리자 전용: 부서명 변경.
export async function renameDepartment(id, name) {
  const { error } = await supabase.rpc('rename_department', { p_department_id: id, p_new_name: name });
  if (error) throw error;
}

// 회사 관리자 전용: 부서의 상위 부서 변경(트리 재배치). parentId가 null이면 최상위로 이동. 자기 자신 지정·순환 참조는 서버에서 예외를 던져 거부한다.
export async function setDepartmentParent(id, parentId) {
  const { error } = await supabase.rpc('set_department_parent', { p_department_id: id, p_parent_department_id: parentId || null });
  if (error) throw error;
}

// 회사 관리자 전용: 부서 삭제. 하위 부서가 있으면 서버에서 예외를 던진다("하위 부서가 있는 부서는 삭제할 수 없습니다..."). 소속 직원은 자동으로 미배정 처리된다(FK on delete set null).
export async function deleteDepartment(id) {
  const { error } = await supabase.rpc('delete_department', { p_department_id: id });
  if (error) throw error;
}

// 회사 관리자 전용: 직원의 소속 부서 재배치. departmentId에 null을 넘기면 "미배정"으로 변경된다.
export async function assignEmployeeDepartment(employeeId, departmentId) {
  const { error } = await supabase.rpc('assign_employee_department', { p_employee_id: employeeId, p_department_id: departmentId });
  if (error) throw error;
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
  const { data, error } = await supabase.from('profiles').select('contact, notes, email, sns, discoverable, share_mutual_history').eq('id', user.id).single();
  if (error) throw error;
  // 주의: user.email은 로그인용 Supabase Auth 이메일(계정 아이디)이므로, 알림 수신용 profiles.email로
  // 덮어쓰이지 않도록 ...user를 먼저 펼치고 profiles 필드를 뒤에 덮어쓴다.
  return { ...user, contact: data?.contact || '', notes: data?.notes || '', email: data?.email || '', sns: data?.sns || '', discoverable: !!data?.discoverable, shareMutualHistory: !!data?.share_mutual_history };
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
