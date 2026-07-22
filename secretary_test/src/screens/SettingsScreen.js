import { Text, View, ScrollView, TextInput, TouchableOpacity, StyleSheet, Platform, Modal, KeyboardAvoidingView } from 'react-native';
import { Alert } from '../utils/alertCompat';
import { useState, useEffect } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '../theme';
import { getApiKey, setApiKey, getGrokApiKey, setGrokApiKey, getAiProvider, setAiProvider, getPyannoteUrl, setPyannoteUrl, logout, getTestAccounts, switchAccount, getUserProfile, saveUserProfile, hasLegacyLocalData, migrateLocalDataToCloud } from '../services/storage';
import { useUser } from '../context/UserContext';

// API 키 마스킹 표시 (앞 6자 + ••• + 뒤 4자), 9자 이하 또는 masked=false면 원문 그대로
function maskApiKey(key, masked) {
  return masked && key.length > 8
    ? key.slice(0, 6) + '•••••••••••••••' + key.slice(-4)
    : key;
}

// Groq/Grok 공통 API 키 저장·삭제 핸들러 팩토리
function createApiKeyHandlers({ label, key, setKeyState, saveKey, setSavedState }) {
  async function handleSave() {
    const trimmed = key.trim();
    if (!trimmed) { Alert.alert('오류', 'API 키를 입력해주세요.'); return; }
    await saveKey(trimmed);
    setSavedState(true);
    setTimeout(() => setSavedState(false), 2000);
  }

  async function handleClear() {
    Alert.alert('API 키 삭제', `${label} API 키를 삭제하면 AI 기능을 사용할 수 없습니다.`, [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: async () => { await saveKey(''); setKeyState(''); } },
    ]);
  }

  return { handleSave, handleClear };
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const { user, setUser } = useUser();
  const [provider, setProviderState] = useState('groq');
  const [apiKey, setApiKeyState] = useState('');
  const [saved, setSaved] = useState(false);
  const [masked, setMasked] = useState(true);
  const [grokApiKey, setGrokApiKeyState] = useState('');
  const [grokSaved, setGrokSaved] = useState(false);
  const [grokMasked, setGrokMasked] = useState(true);

  const [pyannoteUrl, setPyannoteUrlState] = useState('');
  const [pyannoteStatus, setPyannoteStatus] = useState('');
  const [pyannoteChecking, setPyannoteChecking] = useState(false);

  const [profile, setProfile] = useState(null);
  const [showProfileEdit, setShowProfileEdit] = useState(false);
  const [editContact, setEditContact] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editSns, setEditSns] = useState('');

  const [switchTarget, setSwitchTarget] = useState(null);
  const [switchPassword, setSwitchPassword] = useState('');
  const [switchError, setSwitchError] = useState('');

  const [showLegacyUpload, setShowLegacyUpload] = useState(false);
  const [legacyUploading, setLegacyUploading] = useState(false);

  useEffect(() => {
    getApiKey().then((k) => { if (k) setApiKeyState(k); });
    getGrokApiKey().then((k) => { if (k) setGrokApiKeyState(k); });
    getAiProvider().then(setProviderState);
    getPyannoteUrl().then((u) => { if (u) setPyannoteUrlState(u); });
    getUserProfile().then((p) => { if (p) setProfile(p); });
    hasLegacyLocalData().then(setShowLegacyUpload);
  }, []);

  async function handleLegacyUpload() {
    setLegacyUploading(true);
    try {
      await migrateLocalDataToCloud();
      setShowLegacyUpload(false);
      Alert.alert('완료', '이 기기에 저장되어 있던 로컬 데이터를 클라우드로 업로드했습니다.');
    } catch (e) {
      Alert.alert('업로드 실패', e.message);
    } finally {
      setLegacyUploading(false);
    }
  }

  async function handleProviderChange(p) {
    setProviderState(p);
    await setAiProvider(p);
  }

  async function handleConfirmSwitch() {
    if (!switchTarget) return;
    try {
      const u = await switchAccount(switchTarget.id, switchPassword);
      setSwitchTarget(null);
      setSwitchPassword('');
      setSwitchError('');
      setUser(u);
    } catch (e) {
      setSwitchError(e.message);
    }
  }

  const { handleSave, handleClear } = createApiKeyHandlers({
    label: 'Groq',
    key: apiKey,
    setKeyState: setApiKeyState,
    saveKey: setApiKey,
    setSavedState: setSaved,
  });

  const { handleSave: handleSaveGrok, handleClear: handleClearGrok } = createApiKeyHandlers({
    label: 'Grok',
    key: grokApiKey,
    setKeyState: setGrokApiKeyState,
    saveKey: setGrokApiKey,
    setSavedState: setGrokSaved,
  });

  // TODO(보안): 현재 http://도 허용 — 같은 Wi-Fi의 공격자가 회의 음성을 도청할 수 있는 위험이 있음(2026-07-01 보안 리포트 MEDIUM 항목).
  // 다만 로컬 IP(예: 192.168.1.x)로 pyannote-server를 Render 배포 전 테스트하는 워크플로우가 있어
  // 지금은 https 강제 차단 대신 허용해 둔 상태. 추후 최소한 https 강제 검증(또는 저장 시 경고 확인창)을 추가해야 한다.
  async function handleSavePyannoteUrl() {
    const trimmedUrl = pyannoteUrl.trim();
    if (trimmedUrl && !/^https?:\/\//.test(trimmedUrl)) {
      Alert.alert('URL 형식 오류', 'http:// 또는 https://로 시작하는 URL을 입력해주세요.');
      return;
    }
    try {
      await setPyannoteUrl(trimmedUrl);
    } catch (err) {
      Alert.alert('오류', err.message);
      return;
    }
    setPyannoteStatus('saved');
    setTimeout(() => setPyannoteStatus(''), 2000);
  }

  async function handleClearPyannoteUrl() {
    await setPyannoteUrl('');
    setPyannoteUrlState('');
    setPyannoteStatus('');
  }

  async function handleTestPyannote() {
    const url = pyannoteUrl.trim();
    if (!url) return;
    setPyannoteChecking(true);
    setPyannoteStatus('');
    try {
      const res = await fetch(`${url.replace(/\/$/, '')}/health`, { method: 'GET' });
      setPyannoteStatus(res.ok ? 'ok' : 'fail');
    } catch {
      setPyannoteStatus('fail');
    } finally {
      setPyannoteChecking(false);
    }
  }

  const displayKey = maskApiKey(apiKey, masked);

  const displayGrokKey = maskApiKey(grokApiKey, grokMasked);

  return (
    <View style={s.root}>
    <ScrollView contentContainerStyle={[s.scroll, { paddingTop: insets.top + 16 }]} showsVerticalScrollIndicator={false}>
      <View style={s.header}>
        <Text style={s.headerTitle}>설정</Text>
      </View>

      {/* ── AI 설정 ── */}
      <View style={s.section}>
        <Text style={s.sectionLabel}>AI 설정</Text>

        {/* 프로바이더 토글 */}
        <View style={s.providerToggle}>
          <TouchableOpacity
            style={[s.providerBtn, provider === 'groq' && s.providerBtnActive]}
            onPress={() => handleProviderChange('groq')}
          >
            <Text style={[s.providerBtnText, provider === 'groq' && s.providerBtnTextActive]}>Groq</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.providerBtn, provider === 'grok' && s.providerBtnActiveGrok]}
            onPress={() => handleProviderChange('grok')}
          >
            <Text style={[s.providerBtnText, provider === 'grok' && s.providerBtnTextActiveGrok]}>Grok</Text>
          </TouchableOpacity>
        </View>

        {/* Groq 키 */}
        {provider === 'groq' && (
          <View style={s.card}>
            <View style={s.cardHeader}>
              <Text style={s.aiGlyph}>✦</Text>
              <Text style={s.cardTitle}>Groq API 키</Text>
            </View>
            <Text style={s.cardDesc}>
              일정 관리 및 거래처 히스토리의 AI 기능을 사용하려면 Groq API 키가 필요합니다. 모델: llama-3.3-70b-versatile
            </Text>
            <View style={s.inputWrap}>
              <TextInput
                style={s.input}
                value={displayKey}
                onChangeText={(t) => { setApiKeyState(t); setMasked(false); }}
                onFocus={() => setMasked(false)}
                onBlur={() => setMasked(true)}
                placeholder="gsk_..."
                placeholderTextColor={C.textDim}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            <View style={s.btnRow}>
              <TouchableOpacity style={[s.saveBtn, saved && s.savedBtn]} onPress={handleSave}>
                <Text style={s.saveBtnText}>{saved ? '저장됨 ✓' : '저장'}</Text>
              </TouchableOpacity>
              {apiKey ? (
                <TouchableOpacity style={s.clearBtn} onPress={handleClear}>
                  <Text style={s.clearBtnText}>삭제</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <View style={s.hint}>
              <Text style={s.hintText}>
                API 키는 기기에만 저장되며 외부로 전송되지 않습니다.{'\n'}
                키 발급: console.groq.com
              </Text>
            </View>
          </View>
        )}

        {/* Grok 키 */}
        {provider === 'grok' && (
          <View style={s.card}>
            <View style={s.cardHeader}>
              <Text style={[s.aiGlyph, s.aiGlyphPurple]}>✦</Text>
              <Text style={s.cardTitle}>xAI Grok API 키</Text>
            </View>
            <Text style={s.cardDesc}>
              Grok AI 기능을 사용하려면 xAI API 키가 필요합니다. 모델: grok-3
            </Text>
            <View style={s.inputWrap}>
              <TextInput
                style={s.input}
                value={displayGrokKey}
                onChangeText={(t) => { setGrokApiKeyState(t); setGrokMasked(false); }}
                onFocus={() => setGrokMasked(false)}
                onBlur={() => setGrokMasked(true)}
                placeholder="gsk_..."
                placeholderTextColor={C.textDim}
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
            <View style={s.btnRow}>
              <TouchableOpacity style={[s.saveBtn, s.saveBtnGrok, grokSaved && s.savedBtn]} onPress={handleSaveGrok}>
                <Text style={s.saveBtnText}>{grokSaved ? '저장됨 ✓' : '저장'}</Text>
              </TouchableOpacity>
              {grokApiKey ? (
                <TouchableOpacity style={s.clearBtn} onPress={handleClearGrok}>
                  <Text style={s.clearBtnText}>삭제</Text>
                </TouchableOpacity>
              ) : null}
            </View>
            <View style={s.hint}>
              <Text style={s.hintText}>
                API 키는 기기에만 저장되며 외부로 전송되지 않습니다.{'\n'}
                키 발급: console.x.ai
              </Text>
            </View>
          </View>
        )}
      </View>

      {/* ── 화자 구분 서버 ── */}
      <View style={s.section}>
        <Text style={s.sectionLabel}>화자 구분 서버 (pyannote)</Text>
        <View style={s.card}>
          <View style={s.cardHeader}>
            <Text style={[s.aiGlyph, s.aiGlyphTeal]}>◈</Text>
            <Text style={s.cardTitle}>pyannote 서버 URL</Text>
          </View>
          <Text style={s.cardDesc}>
            음성 기반 화자 구분(Speaker Diarization)을 사용하려면 pyannote 백엔드 서버를 실행하고 URL을 입력하세요.{'\n'}
            미설정 시 AI 텍스트 분석으로 대체됩니다.
          </Text>
          <View style={s.inputWrap}>
            <TextInput
              style={s.input}
              value={pyannoteUrl}
              onChangeText={setPyannoteUrlState}
              placeholder="http://192.168.1.x:8000"
              placeholderTextColor={C.textDim}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
            />
          </View>
          <View style={s.btnRow}>
            <TouchableOpacity
              style={[s.saveBtn, s.saveBtnTeal, pyannoteStatus === 'saved' && s.savedBtn]}
              onPress={handleSavePyannoteUrl}
            >
              <Text style={s.saveBtnText}>{pyannoteStatus === 'saved' ? '저장됨 ✓' : '저장'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[s.clearBtn, s.testBtnMod]}
              onPress={handleTestPyannote}
              disabled={pyannoteChecking || !pyannoteUrl}
            >
              <Text style={[s.pyannoteTestText, { color: pyannoteStatus === 'ok' ? C.accentTeal : pyannoteStatus === 'fail' ? C.red : C.textSecondary }]}>
                {pyannoteChecking ? '확인 중…' : pyannoteStatus === 'ok' ? '연결 성공 ✓' : pyannoteStatus === 'fail' ? '연결 실패 ✗' : '연결 테스트'}
              </Text>
            </TouchableOpacity>
            {!!pyannoteUrl && (
              <TouchableOpacity style={s.clearBtn} onPress={handleClearPyannoteUrl}>
                <Text style={s.clearBtnText}>삭제</Text>
              </TouchableOpacity>
            )}
          </View>
          <View style={s.hint}>
            <Text style={s.hintText}>
              서버 실행 방법:{'\n'}
              1. HuggingFace에서 pyannote/speaker-diarization-3.1 접근 승인{'\n'}
              2. HF_TOKEN=your_token uvicorn server:app --host 0.0.0.0 --port 8000{'\n'}
              3. ffmpeg이 설치되어 있어야 합니다
            </Text>
          </View>
        </View>
      </View>

      {/* ── 계정 ── */}
      {user && (
        <View style={s.section}>
          <Text style={s.sectionLabel}>계정</Text>

          {/* 내 프로필 */}
          <View style={[s.card, s.mb10]}>
            <View style={s.cardHeader}>
              <View style={s.accountAvatar}>
                <Text style={s.accountAvatarText}>{user.name[0]}</Text>
              </View>
              <View style={s.flex1}>
                <Text style={s.accountName}>{user.name}</Text>
                <Text style={s.accountEmail}>{user.email}</Text>
                {user.team && <Text style={s.accountTeam}>{user.team}{user.role ? ` · ${user.role}` : ''}</Text>}
                {profile?.contact ? <Text style={s.profileContact}>{profile.contact}</Text> : null}
                {profile?.email && profile.email !== user.email ? <Text style={s.profileEmail}>{`알림 수신: ${profile.email}`}</Text> : null}
                {profile?.sns ? <Text style={s.profileEmail}>{`SNS: ${profile.sns}`}</Text> : null}
                {profile?.notes ? <Text style={s.profileNotes}>{profile.notes}</Text> : null}
              </View>
              <View style={s.profileActions}>
                <View style={s.activeBadge}><Text style={s.activeBadgeText}>현재</Text></View>
                <TouchableOpacity
                  style={s.profileEditBtn}
                  onPress={() => {
                    setEditContact(profile?.contact || '');
                    setEditNotes(profile?.notes || '');
                    setEditEmail(profile?.email || '');
                    setEditSns(profile?.sns || '');
                    setShowProfileEdit(true);
                  }}
                >
                  <Text style={s.profileEditBtnText}>내 정보 수정</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
          {showLegacyUpload && (
            <TouchableOpacity
              style={[s.card, s.legacyUploadCard]}
              activeOpacity={0.8}
              onPress={handleLegacyUpload}
              disabled={legacyUploading}
            >
              <Text style={s.legacyUploadTitle}>{legacyUploading ? '업로드 중...' : '로컬 데이터를 클라우드로 가져오기'}</Text>
              <Text style={s.legacyUploadDesc}>이 기기에만 저장되어 있던 일정·거래처·프로젝트·메세지·회의록을 클라우드로 올려서 다른 기기(PC 등)에서도 볼 수 있게 합니다.</Text>
            </TouchableOpacity>
          )}
          {/* 다른 계정 목록 */}
          {getTestAccounts()
            .filter((a) => a.id !== user.id)
            .map((account) => (
              <TouchableOpacity
                key={account.id}
                style={[s.card, s.switchCard]}
                activeOpacity={0.75}
                onPress={() => { setSwitchTarget(account); setSwitchPassword(''); setSwitchError(''); }}
              >
                <View style={s.cardHeader}>
                  <View style={[s.accountAvatar, s.accountAvatarAlt]}>
                    <Text style={[s.accountAvatarText, s.accountAvatarTextAlt]}>{account.name[0]}</Text>
                  </View>
                  <View style={s.flex1}>
                    <Text style={s.accountName}>{account.name}</Text>
                    <Text style={s.accountEmail}>{account.email}</Text>
                  </View>
                  <Text style={s.switchArrow}>전환 →</Text>
                </View>
              </TouchableOpacity>
            ))
          }
          <TouchableOpacity
            style={[s.logoutBtn, s.mt10]}
            onPress={() => Alert.alert('로그아웃', '로그아웃 하시겠습니까?', [
              { text: '취소', style: 'cancel' },
              { text: '로그아웃', style: 'destructive', onPress: async () => { await logout(); setUser(null); } },
            ])}
            activeOpacity={0.8}
          >
            <Text style={s.logoutBtnText}>로그아웃</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={s.h60} />
    </ScrollView>

      {/* ── 내 정보 수정 모달 ── */}
      <Modal visible={!!switchTarget} animationType="slide" transparent onRequestClose={() => setSwitchTarget(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>계정 전환</Text>
            <Text style={s.modalSubTitle}>{switchTarget?.name}({switchTarget?.email}) 계정으로 전환하려면 현재 계정({user?.name})의 비밀번호를 입력하세요.</Text>

            <Text style={s.inputLabel}>현재 계정 비밀번호</Text>
            <TextInput
              style={s.profileInput}
              value={switchPassword}
              onChangeText={(v) => { setSwitchPassword(v); setSwitchError(''); }}
              placeholder="비밀번호"
              placeholderTextColor={C.textDim}
              secureTextEntry
              autoFocus
              onSubmitEditing={handleConfirmSwitch}
            />
            {switchError ? <Text style={s.switchErrorText}>{switchError}</Text> : null}

            <View style={s.modalBtns}>
              <TouchableOpacity style={s.modalCancel} onPress={() => { setSwitchTarget(null); setSwitchPassword(''); setSwitchError(''); }}>
                <Text style={s.modalCancelText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.modalConfirm} onPress={handleConfirmSwitch}>
                <Text style={s.modalConfirmText}>전환</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={showProfileEdit} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>내 정보 수정</Text>
            <Text style={s.modalSubTitle}>{user?.name} · {user?.team}</Text>

            <Text style={s.inputLabel}>연락처 (전화번호)</Text>
            <TextInput
              style={s.profileInput}
              value={editContact}
              onChangeText={setEditContact}
              placeholder="010-0000-0000"
              placeholderTextColor={C.textDim}
              keyboardType="phone-pad"
            />

            <Text style={[s.inputLabel, s.mt16]}>이메일 (알림 수신용)</Text>
            <TextInput
              style={s.profileInput}
              value={editEmail}
              onChangeText={setEditEmail}
              placeholder="example@email.com"
              placeholderTextColor={C.textDim}
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Text style={[s.inputLabel, s.mt16]}>SNS 계정</Text>
            <TextInput
              style={s.profileInput}
              value={editSns}
              onChangeText={setEditSns}
              placeholder="instagram.com/username"
              placeholderTextColor={C.textDim}
              autoCapitalize="none"
            />

            <Text style={[s.inputLabel, s.mt16]}>메모 / 소개</Text>
            <TextInput
              style={[s.profileInput, s.h80]}
              value={editNotes}
              onChangeText={setEditNotes}
              placeholder="본인 소개 또는 특이사항"
              placeholderTextColor={C.textDim}
              multiline
            />

            <View style={s.modalBtns}>
              <TouchableOpacity style={s.modalCancel} onPress={() => setShowProfileEdit(false)}>
                <Text style={s.modalCancelText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={s.modalConfirm}
                onPress={async () => {
                  if (editEmail.trim() && !editEmail.trim().includes('@')) {
                    Alert.alert('이메일 형식 오류', '올바른 이메일 형식이 아닙니다.');
                    return;
                  }
                  await saveUserProfile({ contact: editContact.trim(), notes: editNotes.trim(), email: editEmail.trim(), sns: editSns.trim() });
                  const p = await getUserProfile();
                  setProfile(p);
                  setShowProfileEdit(false);
                }}
              >
                <Text style={s.modalConfirmText}>저장</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  scroll: { paddingTop: 60, paddingHorizontal: 24 },
  header: { marginBottom: 32 },
  headerTitle: { color: C.textPrimary, fontSize: 22, fontWeight: '300', letterSpacing: -0.5 },
  section: { marginBottom: 28 },
  sectionLabel: { color: C.textDim, fontSize: 10, letterSpacing: 2.5, fontWeight: '600', marginBottom: 14 },
  providerToggle: { flexDirection: 'row', gap: 8, marginBottom: 14 },
  providerBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, alignItems: 'center' },
  providerBtnActive: { borderColor: C.accentBlue + '88', backgroundColor: C.accentBlue + '22' },
  providerBtnActiveGrok: { borderColor: C.accentPurple + '88', backgroundColor: C.accentPurple + '22' },
  providerBtnText: { color: C.textDim, fontSize: 13, fontWeight: '500' },
  providerBtnTextActive: { color: C.accentBlue },
  providerBtnTextActiveGrok: { color: C.accentPurple },
  card: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 20, gap: 14 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  accountAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.accentBlue + '33', alignItems: 'center', justifyContent: 'center' },
  accountAvatarText: { color: C.accentBlue, fontSize: 16, fontWeight: '600' },
  accountName: { color: C.textPrimary, fontSize: 15, fontWeight: '400' },
  accountEmail: { color: C.textDim, fontSize: 12, marginTop: 2 },
  accountTeam: { color: C.accentBlue, fontSize: 11, marginTop: 3, letterSpacing: 0.5 },
  activeBadge: { backgroundColor: C.accentBlue + '22', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  activeBadgeText: { color: C.accentBlue, fontSize: 11, fontWeight: '600' },
  switchCard: { borderColor: C.border, marginBottom: 8 },
  switchArrow: { color: C.accentTeal, fontSize: 12, fontWeight: '500' },
  logoutBtn: { paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: C.red + '55', alignItems: 'center' },
  logoutBtnText: { color: C.red, fontSize: 14, fontWeight: '500' },
  aiGlyph: { color: C.gold, fontSize: 16 },
  cardTitle: { color: C.textPrimary, fontSize: 16, fontWeight: '400' },
  cardDesc: { color: C.textSecondary, fontSize: 12, lineHeight: 19 },
  inputWrap: {},
  input: { backgroundColor: C.surfaceHigh, borderWidth: 1, borderColor: C.borderHigh, borderRadius: 10, color: C.textPrimary, fontSize: 13, paddingHorizontal: 14, paddingVertical: 12, fontFamily: Platform?.OS === 'ios' ? 'Menlo' : 'monospace' },
  btnRow: { flexDirection: 'row', gap: 10 },
  saveBtn: { flex: 1, paddingVertical: 12, borderRadius: 10, backgroundColor: C.gold, alignItems: 'center' },
  savedBtn: { backgroundColor: C.accentTeal },
  saveBtnText: { color: C.bg, fontSize: 14, fontWeight: '600' },
  clearBtn: { paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: C.red + '55', alignItems: 'center' },
  clearBtnText: { color: C.red, fontSize: 14 },
  pyannoteTestText: { fontSize: 14 },
  hint: { backgroundColor: C.surfaceHigh, borderRadius: 8, padding: 12 },
  hintText: { color: C.textDim, fontSize: 11, lineHeight: 17 },
  profileContact: { color: C.accentTeal, fontSize: 12, marginTop: 3 },
  profileEmail: { color: C.accentTeal, fontSize: 11, marginTop: 2 },
  profileNotes: { color: C.textDim, fontSize: 11, marginTop: 2, lineHeight: 16 },
  profileEditBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 7, borderWidth: 1, borderColor: C.accentBlue + '55', backgroundColor: C.accentBlue + '11' },
  profileEditBtnText: { color: C.accentBlue, fontSize: 11, fontWeight: '500' },
  legacyUploadCard: { borderWidth: 1, borderColor: C.accentTeal + '55', backgroundColor: C.accentTeal + '11', marginBottom: 10 },
  legacyUploadTitle: { color: C.accentTeal, fontSize: 14, fontWeight: '500', marginBottom: 4 },
  legacyUploadDesc: { color: C.textSecondary, fontSize: 12, lineHeight: 18 },
  // 웹에서 Modal은 document.body로 포탈되어 App.js의 480px 폭 제한을 벗어나므로 여기서 다시 맞춘다
  modalOverlay: Platform.OS === 'web'
    ? { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center' }
    : { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  modalSheet: Platform.OS === 'web'
    ? { backgroundColor: C.surfaceHigh, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 24, paddingBottom: 40, paddingTop: 12, width: '100%', maxWidth: 480 }
    : { backgroundColor: C.surfaceHigh, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 24, paddingBottom: 40, paddingTop: 12 },
  modalHandle: { width: 36, height: 4, backgroundColor: C.borderHigh, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  modalTitle: { color: C.textPrimary, fontSize: 18, fontWeight: '400', marginBottom: 4 },
  modalSubTitle: { color: C.textDim, fontSize: 12, marginBottom: 20 },
  inputLabel: { color: C.textDim, fontSize: 10, letterSpacing: 1.5, marginBottom: 8 },
  profileInput: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, color: C.textPrimary, fontSize: 14, paddingHorizontal: 14, paddingVertical: 12 },
  switchErrorText: { color: C.red, fontSize: 12, marginTop: 8 },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 24 },
  modalCancel: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  modalCancelText: { color: C.textSecondary, fontSize: 14 },
  modalConfirm: { flex: 2, paddingVertical: 14, borderRadius: 12, backgroundColor: C.accentTeal, alignItems: 'center' },
  modalConfirmText: { color: '#fff', fontSize: 14, fontWeight: '600' },

  aiGlyphPurple: { color: C.accentPurple },
  aiGlyphTeal: { color: C.accentTeal },
  saveBtnGrok: { backgroundColor: C.accentPurple },
  saveBtnTeal: { backgroundColor: C.accentTeal },
  testBtnMod: { borderColor: C.accentTeal + '55', flex: 1 },
  mb10: { marginBottom: 10 },
  flex1: { flex: 1 },
  profileActions: { gap: 6, alignItems: 'flex-end' },
  accountAvatarAlt: { backgroundColor: C.accentTeal + '22', borderColor: C.accentTeal + '44' },
  accountAvatarTextAlt: { color: C.accentTeal },
  mt10: { marginTop: 10 },
  h60: { height: 60 },
  mt16: { marginTop: 16 },
  h80: { height: 80 },
});
