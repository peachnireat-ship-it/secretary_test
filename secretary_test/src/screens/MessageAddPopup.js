import { useEffect, useState } from 'react';
import { Text, View, ScrollView, TouchableOpacity, StyleSheet, TextInput, ActivityIndicator } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { Alert } from '../utils/alertCompat';
import { C } from '../theme';
import { useUser } from '../context/UserContext';
import { getClients, getTestAccounts, addMessage, addMessageForUser } from '../services/storage';
import { applyPopupScrollbarStyle } from '../utils/popupScrollbar';

applyPopupScrollbarStyle();

const PRIORITIES = ['긴급', '일반', '낮음'];
const STATUSES = ['미확인', '확인', '처리중', '완료'];
const BOXES = [
  { key: 'received', label: '받은 메세지함' },
  { key: 'sent', label: '보낸 메세지함' },
];
const SUBJECT_MAX_LENGTH = 200;
const CONTENT_MAX_LENGTH = 2000;

function priorityColor(p) {
  return { 긴급: C.red, 일반: C.accentBlue, 낮음: C.textDim }[p] || C.textDim;
}
function statusColor(s) {
  return { 미확인: C.gold, 확인: C.accentBlue, 처리중: C.accentTeal, 완료: C.textDim }[s] || C.textDim;
}

// PC 웹에서 MessageScreen의 FAB이 window.open()으로 띄우는 실제 브라우저 팝업 창.
// 같은 origin이라 Supabase 세션(localStorage)을 공유하므로 별도 로그인 없이 바로 열린다.
// 저장 성공 시 opener(원래 탭)에 postMessage로 알리고 스스로 창을 닫는다.
export default function MessageAddPopup() {
  const { user } = useUser();
  const [dataLoading, setDataLoading] = useState(true);
  const [clients, setClients] = useState([]);
  const [internalAccounts, setInternalAccounts] = useState([]);

  const [newSender, setNewSender] = useState('');
  const [newCompany, setNewCompany] = useState('');
  const [newSubject, setNewSubject] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newPriority, setNewPriority] = useState('일반');
  const [newStatus, setNewStatus] = useState('미확인');
  const [newDirection, setNewDirection] = useState('sent');
  const [newToId, setNewToId] = useState(null);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      const clientList = await getClients();
      if (cancelled) return;
      setClients(clientList);
      setInternalAccounts(getTestAccounts().filter((a) => a.id !== user.id));
      setDataLoading(false);
    })();
    return () => { cancelled = true; };
  }, [user]);

  function handleCancel() {
    window.close();
  }

  async function handleAdd() {
    if (!newSender.trim() || !newSubject.trim()) {
      Alert.alert('입력 필요', '이름과 제목은 필수 입력 항목입니다.');
      return;
    }
    if (newSubject.trim().length > SUBJECT_MAX_LENGTH) {
      Alert.alert('입력 길이 초과', `제목은 최대 ${SUBJECT_MAX_LENGTH}자까지 입력 가능합니다.`);
      return;
    }
    if (newContent.trim().length > CONTENT_MAX_LENGTH) {
      Alert.alert('입력 길이 초과', `내용은 최대 ${CONTENT_MAX_LENGTH}자까지 입력 가능합니다.`);
      return;
    }
    const ts = Date.now();
    const sentMsgId = String(ts);
    const receivedMsgId = (newDirection === 'sent' && newToId) ? String(ts + 1) : undefined;
    const base = {
      id: sentMsgId,
      direction: newDirection,
      sender: newSender.trim(),
      company: newCompany.trim(),
      subject: newSubject.trim(),
      content: newContent.trim(),
      priority: newPriority,
      status: newStatus,
      fromId: user?.id,
      toId: newDirection === 'received' ? user?.id : (newToId || undefined),
      linkedReceivedId: receivedMsgId,
    };
    await addMessage(base);
    if (newDirection === 'sent' && newToId && receivedMsgId) {
      await addMessageForUser(newToId, {
        id: receivedMsgId,
        direction: 'received',
        sender: user?.name || newSender.trim(),
        company: '내부',
        subject: newSubject.trim(),
        content: newContent.trim(),
        priority: newPriority,
        status: '미확인',
        fromId: user?.id,
        toId: newToId,
      });
    }
    try {
      window.opener?.postMessage({ type: 'secretary:message-created' }, window.location.origin);
    } catch {
      // opener가 이미 닫혔거나 접근 불가한 경우 무시
    }
    window.close();
  }

  if (user === null) {
    return (
      <View style={s.center}>
        <Text style={s.centerText}>로그인이 필요합니다. 창을 닫고 다시 시도해주세요.</Text>
      </View>
    );
  }
  if (user === undefined || dataLoading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={C.accentPurple} />
      </View>
    );
  }

  return (
    <View style={s.page}>
      <StatusBar style="light" />
      <View style={s.header}>
        <Text style={s.headerTitle}>메세지 추가</Text>
        <TouchableOpacity onPress={handleCancel}>
          <Text style={s.closeBtn}>✕</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={s.body} contentContainerStyle={s.bodyContent} keyboardShouldPersistTaps="handled">
        <View style={s.directionRow}>
          {BOXES.map((b) => (
            <TouchableOpacity
              key={b.key}
              style={[s.directionBtn, newDirection === b.key && s.directionBtnActive]}
              onPress={() => setNewDirection(b.key)}
            >
              <Text style={[s.directionText, newDirection === b.key && s.directionTextActive]}>{b.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {newDirection === 'sent' && internalAccounts.length > 0 && (
          <>
            <Text style={s.inputLabel}>내부 수신자 (선택)</Text>
            <View style={s.optionRow}>
              <TouchableOpacity
                style={[s.optionBtn, !newToId && { borderColor: C.accentPurple + '88', backgroundColor: C.accentPurple + '18' }]}
                onPress={() => { setNewToId(null); setNewSender(''); setNewCompany(''); }}
              >
                <Text style={[s.optionText, !newToId && { color: C.accentPurple }]}>외부</Text>
              </TouchableOpacity>
              {internalAccounts.map((a) => (
                <TouchableOpacity
                  key={a.id}
                  style={[s.optionBtn, newToId === a.id && { borderColor: C.accentPurple + '88', backgroundColor: C.accentPurple + '18' }]}
                  onPress={() => {
                    const client = clients.find((c) => c.name === a.name);
                    setNewToId(a.id);
                    setNewSender(a.name);
                    setNewCompany(client?.company || a.team || '내부');
                  }}
                >
                  <Text style={[s.optionText, newToId === a.id && { color: C.accentPurple }]}>{a.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        <Text style={s.inputLabel}>{newDirection === 'sent' ? '수신자 *' : '발신자 *'}</Text>
        <TextInput style={s.input} value={newSender} onChangeText={setNewSender} placeholder="이름" placeholderTextColor={C.textDim} />

        <Text style={s.inputLabel}>회사 (선택)</Text>
        <TextInput style={s.input} value={newCompany} onChangeText={setNewCompany} placeholder="회사명" placeholderTextColor={C.textDim} />

        <Text style={s.inputLabel}>제목 *</Text>
        <TextInput style={s.input} value={newSubject} onChangeText={setNewSubject} placeholder="메세지 제목" placeholderTextColor={C.textDim} />

        <Text style={s.inputLabel}>내용</Text>
        <TextInput style={[s.input, s.h100]} value={newContent} onChangeText={setNewContent} placeholder="메세지 내용" placeholderTextColor={C.textDim} multiline />

        <Text style={s.inputLabel}>우선순위</Text>
        <View style={s.optionRow}>
          {PRIORITIES.map((p) => (
            <TouchableOpacity key={p} style={[s.optionBtn, newPriority === p && { borderColor: priorityColor(p) + '88', backgroundColor: priorityColor(p) + '18' }]} onPress={() => setNewPriority(p)}>
              <Text style={[s.optionText, newPriority === p && { color: priorityColor(p) }]}>{p}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <Text style={s.inputLabel}>처리상태</Text>
        <View style={s.optionRow}>
          {STATUSES.map((st) => (
            <TouchableOpacity key={st} style={[s.optionBtn, newStatus === st && { borderColor: statusColor(st) + '88', backgroundColor: statusColor(st) + '18' }]} onPress={() => setNewStatus(st)}>
              <Text style={[s.optionText, newStatus === st && { color: statusColor(st) }]}>{st}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      <View style={s.footer}>
        <TouchableOpacity style={s.cancelBtn} onPress={handleCancel}>
          <Text style={s.cancelBtnText}>취소</Text>
        </TouchableOpacity>
        <TouchableOpacity style={s.confirmBtn} onPress={handleAdd}>
          <Text style={s.confirmBtnText}>추가</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  page: { flex: 1, minHeight: '100vh', backgroundColor: C.bg },
  center: { flex: 1, minHeight: '100vh', backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', padding: 24 },
  centerText: { color: C.textSecondary, fontSize: 14, textAlign: 'center' },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  headerTitle: { color: C.textPrimary, fontSize: 16, fontWeight: '600' },
  closeBtn: { color: C.textDim, fontSize: 18, paddingLeft: 12 },

  body: { flex: 1 },
  bodyContent: { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24 },

  directionRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  directionBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: C.border, alignItems: 'center', backgroundColor: C.surface },
  directionBtnActive: { borderColor: C.accentPurple + '88', backgroundColor: C.accentPurple + '18' },
  directionText: { color: C.textDim, fontSize: 13 },
  directionTextActive: { color: C.accentPurple, fontWeight: '600' },

  inputLabel: { color: C.textDim, fontSize: 10, letterSpacing: 1.5, marginBottom: 8, marginTop: 14 },
  input: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, color: C.textPrimary, fontSize: 14, paddingHorizontal: 14, paddingVertical: 12 },
  h100: { height: 100 },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  optionText: { color: C.textDim, fontSize: 12 },

  footer: { flexDirection: 'row', gap: 12, paddingHorizontal: 20, paddingVertical: 16, borderTopWidth: 1, borderTopColor: C.border },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  cancelBtnText: { color: C.textSecondary, fontSize: 14 },
  confirmBtn: { flex: 2, paddingVertical: 14, borderRadius: 12, backgroundColor: C.accentPurple, alignItems: 'center' },
  confirmBtnText: { color: '#ECEAF5', fontSize: 14, fontWeight: '600' },
});
