import {
  Text, View, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView, Modal,
} from 'react-native';
import { useState, useEffect } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Alert } from '../utils/alertCompat';
import { C } from '../theme';
import { login, signup, getCompanyList, getDepartmentsForSignup } from '../services/storage';

// 국내 전화번호 형식 검증: 010-1234-5678, 02-123-4567, 031-1234-5678 등. 하이픈은 선택.
const PHONE_REGEX = /^0\d{1,2}-?\d{3,4}-?\d{4}$/;

export default function LoginScreen({ onLogin }) {
  const insets = useSafeAreaInsets();
  const [mode, setMode] = useState('login'); // 'login' | 'signup'
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [team, setTeam] = useState('');
  const [role, setRole] = useState('');
  const [accountType, setAccountType] = useState(null); // null | 'admin' | 'employee'
  const [departmentName, setDepartmentName] = useState('');
  const [companyList, setCompanyList] = useState([]);
  const [showCompanyPicker, setShowCompanyPicker] = useState(false);
  const [companySearch, setCompanySearch] = useState('');
  const [selectedCompanyId, setSelectedCompanyId] = useState(null);
  const [departmentList, setDepartmentList] = useState([]);
  const [showDepartmentPicker, setShowDepartmentPicker] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  // 회사직원 선택 시에만 기존 회사 목록을 조회해 칩으로 보여준다(목록에 없으면 직접 입력).
  useEffect(() => {
    if (accountType !== 'employee') return;
    getCompanyList().then(setCompanyList);
  }, [accountType]);

  // 선택한 회사에 이미 구성된 부서 목록을 조회한다. 목록이 없으면(신규 회사이거나 관리자가 아직
  // 부서관리를 안 한 경우) departmentList는 빈 배열로 남아 화면에서 TextInput 수기 입력으로 폴백한다.
  useEffect(() => {
    if (accountType !== 'employee' || !selectedCompanyId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setDepartmentList([]);
      return;
    }
    getDepartmentsForSignup(selectedCompanyId).then(setDepartmentList);
  }, [accountType, selectedCompanyId]);

  function switchMode(next) {
    setMode(next);
    setError('');
    setInfo('');
    setPasswordConfirm('');
    setName('');
    setPhone('');
    setTeam('');
    setRole('');
    setAccountType(null);
    setDepartmentName('');
    setCompanyList([]);
    setShowCompanyPicker(false);
    setCompanySearch('');
    setSelectedCompanyId(null);
    setDepartmentList([]);
    setShowDepartmentPicker(false);
  }

  function openCompanyPicker() {
    setCompanySearch('');
    setShowCompanyPicker(true);
  }

  function selectCompany(company) {
    setTeam(company.name);
    setSelectedCompanyId(company.id);
    setDepartmentName(''); // 다른 회사의 부서명이 남아있으면 안 되므로 초기화
    setError('');
    setShowCompanyPicker(false);
  }

  function openDepartmentPicker() {
    setShowDepartmentPicker(true);
  }

  function selectDepartment(dept) {
    setDepartmentName(dept.name);
    setError('');
    setShowDepartmentPicker(false);
  }

  async function handleLogin() {
    const e = email.trim();
    const p = password.trim();
    if (!e || !p) { setError('이메일과 비밀번호를 입력하세요.'); return; }
    setError('');
    setLoading(true);
    try {
      const user = await login(e, p);
      onLogin(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSignup() {
    const e = email.trim();
    const p = password.trim();
    if (!e || !p) { setError('이메일과 비밀번호를 입력하세요.'); return; }
    if (p.length < 6) { setError('비밀번호는 6자 이상이어야 합니다.'); return; }
    if (p !== passwordConfirm.trim()) { setError('비밀번호가 일치하지 않습니다.'); return; }
    const ph = phone.trim();
    if (ph && !PHONE_REGEX.test(ph)) { setError('올바른 전화번호 형식이 아닙니다. (예: 010-1234-5678)'); return; }
    if (!accountType) { setError('회사관리자 또는 회사직원을 선택해주세요.'); return; }
    const teamTrimmed = team.trim();
    if (!teamTrimmed) { setError('소속 회사를 입력해주세요.'); return; }
    const deptTrimmed = departmentName.trim();
    if (accountType === 'employee' && !deptTrimmed) { setError('부서명을 입력해주세요.'); return; }
    setError('');
    setLoading(true);
    try {
      const user = await signup(e, p, name, ph, teamTrimmed, role, accountType, deptTrimmed);
      if (user) {
        // 계정은 만들어졌지만 회사명 중복 등으로 회사 등록이 지연된 상태 — 로그인은 그대로
        // 진행시키되(계정 자체는 정상 생성됨), 설정 화면에서 마무리해야 함을 안내한다.
        if (user.companySetupPending) {
          Alert.alert(
            '회사 정보 등록 필요',
            '계정은 생성됐지만 회사 정보 등록이 아직 완료되지 않았습니다. 설정 화면에서 회사명을 다시 입력해 완료해주세요.',
            [{ text: '확인', onPress: () => onLogin(user) }],
          );
        } else {
          onLogin(user);
        }
      } else {
        setInfo('가입 확인 이메일을 보냈습니다. 메일함에서 인증 후 로그인해주세요.');
        switchMode('login');
        setEmail(e);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function fillTest() {
    setEmail('test@secretary.app');
    setPassword('test1234');
    setError('');
  }

  const companySearchTrimmed = companySearch.trim();
  const filteredCompanies = companyList.filter((c) =>
    !companySearchTrimmed || c.name.toLowerCase().includes(companySearchTrimmed.toLowerCase())
  );
  const companySearchHasExactMatch = companyList.some((c) => c.name.toLowerCase() === companySearchTrimmed.toLowerCase());

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.root}>
      <ScrollView
        style={s.root}
        contentContainerStyle={[s.inner, { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={s.logoWrap}>
          <Text style={s.logoGlyph}>◈</Text>
          <Text style={s.logoTitle}>Secretary</Text>
          <Text style={s.logoSub}>업무 비서 앱</Text>
        </View>

        <View style={s.form}>
          {mode === 'signup' && (
            <>
              <Text style={s.label}>계정 유형</Text>
              <View style={s.accountTypeRow}>
                <TouchableOpacity
                  style={[s.accountTypeBtn, accountType === 'admin' && s.accountTypeBtnActive]}
                  onPress={() => { setAccountType('admin'); setError(''); }}
                  activeOpacity={0.8}
                >
                  <Text style={[s.accountTypeText, accountType === 'admin' && s.accountTypeTextActive]}>회사관리자</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.accountTypeBtn, accountType === 'employee' && s.accountTypeBtnActive]}
                  onPress={() => { setAccountType('employee'); setError(''); }}
                  activeOpacity={0.8}
                >
                  <Text style={[s.accountTypeText, accountType === 'employee' && s.accountTypeTextActive]}>회사직원</Text>
                </TouchableOpacity>
              </View>

              <Text style={s.label}>이름 (선택)</Text>
              <TextInput
                style={s.input}
                value={name}
                onChangeText={(v) => { setName(v); setError(''); }}
                placeholder="이름"
                placeholderTextColor={C.textDim}
                autoCorrect={false}
              />

              <Text style={s.label}>핸드폰 번호 (선택)</Text>
              <TextInput
                style={s.input}
                value={phone}
                onChangeText={(v) => { setPhone(v); setError(''); }}
                placeholder="010-0000-0000"
                placeholderTextColor={C.textDim}
                keyboardType="phone-pad"
              />

              <Text style={s.label}>소속 회사</Text>
              {accountType === 'employee' ? (
                <TouchableOpacity style={s.pickerTrigger} onPress={openCompanyPicker} activeOpacity={0.8}>
                  <Text style={[s.pickerTriggerText, team && s.pickerTriggerTextActive]}>
                    {team || '회사 선택'}
                  </Text>
                </TouchableOpacity>
              ) : (
                <TextInput
                  style={s.input}
                  value={team}
                  onChangeText={(v) => { setTeam(v); setError(''); }}
                  placeholder="회사명"
                  placeholderTextColor={C.textDim}
                  autoCorrect={false}
                />
              )}

              {accountType === 'employee' && (
                <>
                  <Text style={s.label}>부서명</Text>
                  {departmentList.length > 0 ? (
                    <TouchableOpacity style={s.pickerTrigger} onPress={openDepartmentPicker} activeOpacity={0.8}>
                      <Text style={[s.pickerTriggerText, departmentName && s.pickerTriggerTextActive]}>
                        {departmentName || '부서 선택'}
                      </Text>
                    </TouchableOpacity>
                  ) : (
                    <TextInput
                      style={s.input}
                      value={departmentName}
                      onChangeText={(v) => { setDepartmentName(v); setError(''); }}
                      placeholder="부서명"
                      placeholderTextColor={C.textDim}
                      autoCorrect={false}
                    />
                  )}
                </>
              )}

              <Text style={s.label}>직급 (선택)</Text>
              <TextInput
                style={s.input}
                value={role}
                onChangeText={(v) => { setRole(v); setError(''); }}
                placeholder="예: 대리, 과장, 팀장"
                placeholderTextColor={C.textDim}
                autoCorrect={false}
              />
            </>
          )}

          <Text style={s.label}>이메일</Text>
          <TextInput
            style={s.input}
            value={email}
            onChangeText={(v) => { setEmail(v); setError(''); }}
            placeholder="이메일 주소"
            placeholderTextColor={C.textDim}
            autoCapitalize="none"
            keyboardType="email-address"
            autoCorrect={false}
          />

          <Text style={s.label}>비밀번호</Text>
          <TextInput
            style={s.input}
            value={password}
            onChangeText={(v) => { setPassword(v); setError(''); }}
            placeholder="비밀번호"
            placeholderTextColor={C.textDim}
            secureTextEntry
            onSubmitEditing={mode === 'login' ? handleLogin : undefined}
            returnKeyType={mode === 'login' ? 'done' : 'next'}
          />

          {mode === 'signup' && (
            <>
              <Text style={s.label}>비밀번호 확인</Text>
              <TextInput
                style={s.input}
                value={passwordConfirm}
                onChangeText={(v) => { setPasswordConfirm(v); setError(''); }}
                placeholder="비밀번호 확인"
                placeholderTextColor={C.textDim}
                secureTextEntry
                onSubmitEditing={handleSignup}
                returnKeyType="done"
              />
            </>
          )}

          {!!error && <Text style={s.error}>{error}</Text>}
          {!!info && <Text style={s.info}>{info}</Text>}

          {mode === 'login' ? (
            <TouchableOpacity style={[s.loginBtn, loading && s.loginBtnDisabled]} onPress={handleLogin} disabled={loading} activeOpacity={0.8}>
              {loading
                ? <ActivityIndicator color="#09090E" />
                : <Text style={s.loginBtnText}>로그인</Text>
              }
            </TouchableOpacity>
          ) : (
            <TouchableOpacity style={[s.loginBtn, loading && s.loginBtnDisabled]} onPress={handleSignup} disabled={loading} activeOpacity={0.8}>
              {loading
                ? <ActivityIndicator color="#09090E" />
                : <Text style={s.loginBtnText}>회원가입</Text>
              }
            </TouchableOpacity>
          )}

          <TouchableOpacity style={s.switchModeBtn} onPress={() => switchMode(mode === 'login' ? 'signup' : 'login')} activeOpacity={0.7}>
            <Text style={s.switchModeText}>
              {mode === 'login' ? '계정이 없으신가요? ' : '이미 계정이 있으신가요? '}
              <Text style={s.switchModeLink}>{mode === 'login' ? '회원가입' : '로그인'}</Text>
            </Text>
          </TouchableOpacity>
        </View>

        {__DEV__ && mode === 'login' && (
          <View style={s.testAccountWrap}>
            <Text style={s.testAccountLabel}>테스트 계정 (개발 전용)</Text>
            <TouchableOpacity style={s.testAccountBtn} onPress={fillTest} activeOpacity={0.7}>
              <View style={s.testAccountRow}>
                <Text style={s.testAccountEmail}>test@secretary.app</Text>
                <Text style={s.testAccountPw}>test1234</Text>
              </View>
              <Text style={s.testAccountHint}>탭하여 자동 입력</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.testAccountBtn} onPress={() => { setEmail('admin@secretary.app'); setPassword('admin1234'); setError(''); }} activeOpacity={0.7}>
              <View style={s.testAccountRow}>
                <Text style={s.testAccountEmail}>admin@secretary.app</Text>
                <Text style={s.testAccountPw}>admin1234</Text>
              </View>
              <Text style={s.testAccountHint}>탭하여 자동 입력</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      {/* ── 소속 회사 선택 (콤보박스) ── */}
      <Modal visible={showCompanyPicker} animationType="slide" transparent onRequestClose={() => setShowCompanyPicker(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.sheetBase, s.pickerSheet]}>
            <View style={s.pickerHeader}>
              <TouchableOpacity onPress={() => setShowCompanyPicker(false)} style={s.pickerHeaderBtn}>
                <Text style={s.pickerCancelText}>취소</Text>
              </TouchableOpacity>
              <Text style={s.pickerTitle}>소속 회사 선택</Text>
              <View style={s.pickerHeaderBtn} />
            </View>

            <View style={s.pickerSearchWrap}>
              <TextInput
                style={s.pickerSearchInput}
                value={companySearch}
                onChangeText={setCompanySearch}
                placeholder="회사명 검색"
                placeholderTextColor={C.textDim}
                autoCorrect={false}
                autoFocus
              />
            </View>

            <ScrollView style={s.pickerList} showsVerticalScrollIndicator={false}>
              {!!companySearchTrimmed && !companySearchHasExactMatch && (
                <TouchableOpacity style={s.pickerAddNewBtn} onPress={() => selectCompany({ id: null, name: companySearchTrimmed })}>
                  <Text style={s.pickerAddNewText}>+ “{companySearchTrimmed}” 신규 회사로 등록</Text>
                </TouchableOpacity>
              )}
              {filteredCompanies.length === 0 ? (
                companySearchTrimmed ? null : <Text style={s.pickerEmptyText}>등록된 회사가 없습니다. 회사명을 검색해 새로 등록해주세요.</Text>
              ) : (
                filteredCompanies.map((c) => {
                  const selected = team === c.name;
                  return (
                    <TouchableOpacity
                      key={c.id}
                      style={[s.pickerRow, selected && s.pickerRowSelected]}
                      onPress={() => selectCompany(c)}
                      activeOpacity={0.7}
                    >
                      <View style={s.pickerNameWrap}>
                        <Text style={[s.pickerName, selected && s.pickerNameSelected]}>{c.name}</Text>
                      </View>
                      <View style={[s.pickerCheck, selected && s.pickerCheckSelected]}>
                        {selected && <Text style={s.pickerCheckMark}>✓</Text>}
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
              <View style={s.spacerH40} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── 부서명 선택 (콤보박스, 검색 없이 목록만) ── */}
      <Modal visible={showDepartmentPicker} animationType="slide" transparent onRequestClose={() => setShowDepartmentPicker(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.sheetBase, s.pickerSheet]}>
            <View style={s.pickerHeader}>
              <TouchableOpacity onPress={() => setShowDepartmentPicker(false)} style={s.pickerHeaderBtn}>
                <Text style={s.pickerCancelText}>취소</Text>
              </TouchableOpacity>
              <Text style={s.pickerTitle}>부서 선택</Text>
              <View style={s.pickerHeaderBtn} />
            </View>

            <ScrollView style={s.pickerList} showsVerticalScrollIndicator={false}>
              {departmentList.length === 0 ? (
                <Text style={s.pickerEmptyText}>등록된 부서가 없습니다.</Text>
              ) : (
                departmentList.map((d) => {
                  const selected = departmentName === d.name;
                  return (
                    <TouchableOpacity
                      key={d.id}
                      style={[s.pickerRow, selected && s.pickerRowSelected]}
                      onPress={() => selectDepartment(d)}
                      activeOpacity={0.7}
                    >
                      <View style={s.pickerNameWrap}>
                        <Text style={[s.pickerName, selected && s.pickerNameSelected]}>{d.name}</Text>
                      </View>
                      <View style={[s.pickerCheck, selected && s.pickerCheckSelected]}>
                        {selected && <Text style={s.pickerCheckMark}>✓</Text>}
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
              <View style={s.spacerH40} />
            </ScrollView>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  inner: { flexGrow: 1, paddingHorizontal: 32 },
  logoWrap: { alignItems: 'center', marginBottom: 48 },
  logoGlyph: { color: C.accentBlue, fontSize: 40, marginBottom: 12 },
  logoTitle: { color: C.textPrimary, fontSize: 28, fontWeight: '300', letterSpacing: 2 },
  logoSub: { color: C.textDim, fontSize: 12, marginTop: 4 },
  form: { gap: 4 },
  label: { color: C.textDim, fontSize: 10, letterSpacing: 1.5, marginTop: 20, marginBottom: 8 },
  input: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, color: C.textPrimary, fontSize: 14, paddingHorizontal: 16, paddingVertical: 14 },
  accountTypeRow: { flexDirection: 'row', gap: 10 },
  accountTypeBtn: { flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  accountTypeBtnActive: { backgroundColor: C.companyIndigo + '22', borderColor: C.companyIndigo },
  accountTypeText: { color: C.textSecondary, fontSize: 14, fontWeight: '600' },
  accountTypeTextActive: { color: C.companyIndigo },
  pickerTrigger: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14 },
  pickerTriggerText: { color: C.textDim, fontSize: 14 },
  pickerTriggerTextActive: { color: C.textPrimary },

  modalOverlay: Platform.OS === 'web'
    ? { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center' }
    : { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  sheetBase: Platform.OS === 'web'
    ? { backgroundColor: C.surfaceHigh, borderTopLeftRadius: 20, borderTopRightRadius: 20, width: '100%', maxWidth: 480 }
    : { backgroundColor: C.surfaceHigh, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  pickerSheet: { height: '70%' },
  pickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  pickerHeaderBtn: { minWidth: 52 },
  pickerTitle: { color: C.textPrimary, fontSize: 16, fontWeight: '500' },
  pickerCancelText: { color: C.textSecondary, fontSize: 15 },
  pickerSearchWrap: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  pickerSearchInput: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, color: C.textPrimary, fontSize: 14, paddingHorizontal: 14, paddingVertical: 10 },
  pickerList: { flex: 1 },
  pickerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  pickerRowSelected: { backgroundColor: C.accentBlue + '0D' },
  pickerNameWrap: { flex: 1 },
  pickerName: { color: C.textPrimary, fontSize: 14 },
  pickerNameSelected: { color: C.accentBlue, fontWeight: '500' },
  pickerCheck: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  pickerCheckSelected: { backgroundColor: C.accentBlue, borderColor: C.accentBlue },
  pickerCheckMark: { color: '#fff', fontSize: 12, fontWeight: '700' },
  pickerAddNewBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.accentBlue + '0A' },
  pickerAddNewText: { color: C.accentBlue, fontSize: 14, fontWeight: '500' },
  pickerEmptyText: { color: C.textDim, fontSize: 12, padding: 20, textAlign: 'center' },
  spacerH40: { height: 40 },
  error: { color: C.red, fontSize: 12, marginTop: 8 },
  info: { color: C.accentTeal, fontSize: 12, marginTop: 8 },
  loginBtn: { marginTop: 28, backgroundColor: C.accentBlue, borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  loginBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  loginBtnDisabled: { opacity: 0.6 },
  switchModeBtn: { marginTop: 20, alignItems: 'center' },
  switchModeText: { color: C.textDim, fontSize: 13 },
  switchModeLink: { color: C.accentBlue, fontWeight: '600' },
  testAccountWrap: { marginTop: 40, gap: 10 },
  testAccountLabel: { color: C.textDim, fontSize: 10, letterSpacing: 1.5, marginBottom: 4 },
  testAccountBtn: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 14, gap: 4 },
  testAccountRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  testAccountEmail: { color: C.textSecondary, fontSize: 13 },
  testAccountPw: { color: C.textDim, fontSize: 12, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  testAccountHint: { color: C.textDim, fontSize: 10 },
});
