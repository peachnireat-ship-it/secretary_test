import { Text, View, ScrollView, TextInput, TouchableOpacity, StyleSheet, Alert, Platform } from 'react-native';
import { useState, useEffect } from 'react';
import { C } from '../theme';
import { getApiKey, setApiKey, getGrokApiKey, setGrokApiKey, getAiProvider, setAiProvider } from '../services/storage';

export default function SettingsScreen() {
  const [provider, setProviderState] = useState('groq');
  const [apiKey, setApiKeyState] = useState('');
  const [saved, setSaved] = useState(false);
  const [masked, setMasked] = useState(true);
  const [grokApiKey, setGrokApiKeyState] = useState('');
  const [grokSaved, setGrokSaved] = useState(false);
  const [grokMasked, setGrokMasked] = useState(true);

  useEffect(() => {
    getApiKey().then((k) => { if (k) setApiKeyState(k); });
    getGrokApiKey().then((k) => { if (k) setGrokApiKeyState(k); });
    getAiProvider().then(setProviderState);
  }, []);

  async function handleProviderChange(p) {
    setProviderState(p);
    await setAiProvider(p);
  }

  async function handleSave() {
    const trimmed = apiKey.trim();
    if (!trimmed) { Alert.alert('오류', 'API 키를 입력해주세요.'); return; }
    await setApiKey(trimmed);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  async function handleClear() {
    Alert.alert('API 키 삭제', 'Groq API 키를 삭제하면 AI 기능을 사용할 수 없습니다.', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: async () => { await setApiKey(''); setApiKeyState(''); } },
    ]);
  }

  async function handleSaveGrok() {
    const trimmed = grokApiKey.trim();
    if (!trimmed) { Alert.alert('오류', 'API 키를 입력해주세요.'); return; }
    await setGrokApiKey(trimmed);
    setGrokSaved(true);
    setTimeout(() => setGrokSaved(false), 2000);
  }

  async function handleClearGrok() {
    Alert.alert('API 키 삭제', 'Grok API 키를 삭제하면 AI 기능을 사용할 수 없습니다.', [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: async () => { await setGrokApiKey(''); setGrokApiKeyState(''); } },
    ]);
  }

  const displayKey = masked && apiKey.length > 8
    ? apiKey.slice(0, 6) + '•••••••••••••••' + apiKey.slice(-4)
    : apiKey;

  const displayGrokKey = grokMasked && grokApiKey.length > 8
    ? grokApiKey.slice(0, 6) + '•••••••••••••••' + grokApiKey.slice(-4)
    : grokApiKey;

  return (
    <ScrollView style={s.root} contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
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
              <Text style={[s.aiGlyph, { color: C.accentPurple }]}>✦</Text>
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
              <TouchableOpacity style={[s.saveBtn, { backgroundColor: C.accentPurple }, grokSaved && s.savedBtn]} onPress={handleSaveGrok}>
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

      {/* ── AI 기능 안내 ── */}
      <View style={s.section}>
        <Text style={s.sectionLabel}>AI 기능 안내</Text>
        <View style={s.featureCard}>
          {[
            { color: C.accentBlue, title: '일정 AI 비서', desc: '자연어로 "다음 주 화요일 오후 2시 미팅 잡아줘" 처럼 입력하면 AI가 일정을 자동으로 파싱하여 추가합니다.' },
            { color: C.accentBlue, title: '일정 조회 및 요약', desc: '"이번 주 바쁜 날이 언제야?", "오늘 일정 요약해줘" 같은 질문에 답합니다.' },
            { color: C.accentTeal, title: '거래처 관계 요약', desc: '거래처를 탭하면 AI가 관계 히스토리를 분석해 현황과 다음 액션을 자동 요약합니다.' },
            { color: C.accentTeal, title: '거래처 히스토리 AI', desc: '"삼성물산이랑 마지막 만난 게 언제야?", "LG전자 다음 미팅 전에 뭘 준비해야 해?" 같은 질문에 답합니다.' },
          ].map((f, i) => (
            <View key={i} style={[s.featureRow, i > 0 && { borderTopWidth: 1, borderTopColor: C.border }]}>
              <View style={[s.featureDot, { backgroundColor: f.color }]} />
              <View style={{ flex: 1 }}>
                <Text style={s.featureTitle}>{f.title}</Text>
                <Text style={s.featureDesc}>{f.desc}</Text>
              </View>
            </View>
          ))}
        </View>
      </View>

      <View style={{ height: 60 }} />
    </ScrollView>
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
  hint: { backgroundColor: C.surfaceHigh, borderRadius: 8, padding: 12 },
  hintText: { color: C.textDim, fontSize: 11, lineHeight: 17 },
  featureCard: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14, overflow: 'hidden' },
  featureRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 16 },
  featureDot: { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
  featureTitle: { color: C.textPrimary, fontSize: 13, fontWeight: '500', marginBottom: 4 },
  featureDesc: { color: C.textSecondary, fontSize: 12, lineHeight: 18 },
});
