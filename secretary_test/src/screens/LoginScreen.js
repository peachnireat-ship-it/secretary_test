import {
  Text, View, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator,
} from 'react-native';
import { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '../theme';
import { login } from '../services/storage';

export default function LoginScreen({ onLogin }) {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

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

  function fillTest() {
    setEmail('test@secretary.app');
    setPassword('test1234');
    setError('');
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.root}>
      <View style={[s.inner, { paddingTop: insets.top + 60, paddingBottom: insets.bottom + 40 }]}>
        <View style={s.logoWrap}>
          <Text style={s.logoGlyph}>◈</Text>
          <Text style={s.logoTitle}>Secretary</Text>
          <Text style={s.logoSub}>업무 비서 앱</Text>
        </View>

        <View style={s.form}>
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
            onSubmitEditing={handleLogin}
            returnKeyType="done"
          />

          {!!error && <Text style={s.error}>{error}</Text>}

          <TouchableOpacity style={[s.loginBtn, loading && { opacity: 0.6 }]} onPress={handleLogin} disabled={loading} activeOpacity={0.8}>
            {loading
              ? <ActivityIndicator color="#09090E" />
              : <Text style={s.loginBtnText}>로그인</Text>
            }
          </TouchableOpacity>
        </View>

        <View style={s.testAccountWrap}>
          <Text style={s.testAccountLabel}>테스트 계정</Text>
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
      </View>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  inner: { flex: 1, paddingHorizontal: 32 },
  logoWrap: { alignItems: 'center', marginBottom: 48 },
  logoGlyph: { color: C.accentBlue, fontSize: 40, marginBottom: 12 },
  logoTitle: { color: C.textPrimary, fontSize: 28, fontWeight: '300', letterSpacing: 2 },
  logoSub: { color: C.textDim, fontSize: 12, marginTop: 4 },
  form: { gap: 4 },
  label: { color: C.textDim, fontSize: 10, letterSpacing: 1.5, marginTop: 20, marginBottom: 8 },
  input: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, color: C.textPrimary, fontSize: 14, paddingHorizontal: 16, paddingVertical: 14 },
  error: { color: C.red, fontSize: 12, marginTop: 8 },
  loginBtn: { marginTop: 28, backgroundColor: C.accentBlue, borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  loginBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  testAccountWrap: { marginTop: 40, gap: 10 },
  testAccountLabel: { color: C.textDim, fontSize: 10, letterSpacing: 1.5, marginBottom: 4 },
  testAccountBtn: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 14, gap: 4 },
  testAccountRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  testAccountEmail: { color: C.textSecondary, fontSize: 13 },
  testAccountPw: { color: C.textDim, fontSize: 12, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  testAccountHint: { color: C.textDim, fontSize: 10 },
});
