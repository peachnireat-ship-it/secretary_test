import {
  Text, View, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Alert } from '../utils/alertCompat';
import { useState } from 'react';
import { C } from '../theme';
import { addHistory, updateHistory, deleteHistory } from '../services/storage';
import { typeColor } from '../utils/colors';

const HISTORY_TYPES = ['미팅', '통화', '이메일', '계약', '기타'];

function formatHistoryDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${y}년 ${m}월 ${d}일`;
}

/**
 * 거래처 상세 모달 내 히스토리(방문/상담 기록) CRUD 섹션.
 * 히스토리 목록 + 추가/수정 모달을 포함하며, 목록 하단에 부모가 넘긴 children(예: 연결된 회의록)을
 * 같은 ScrollView 안에 렌더링해 기존 스크롤 영역 구조를 그대로 유지한다.
 * @param {object} params
 * @param {object|null} params.client 현재 선택된 거래처 (selectedClient)
 * @param {Array} params.histories 전체 히스토리 배열 (client.id로 필터링해서 사용)
 * @param {(updated: Array) => void} params.onHistoriesChange 추가/수정/삭제 후 갱신된 히스토리 배열을 부모에 전달하는 콜백
 * @param {React.ReactNode} [params.children] 히스토리 목록 아래, 같은 ScrollView 안에 렌더링할 콘텐츠
 */
export default function ClientHistorySection({ client, histories, onHistoriesChange, children }) {
  const [showAddHistory, setShowAddHistory] = useState(false);
  const [editingHistory, setEditingHistory] = useState(null);
  const [hType, setHType] = useState('미팅');
  const [hTitle, setHTitle] = useState('');
  const [hContent, setHContent] = useState('');
  const [hResult, setHResult] = useState('');

  const clientHistories = client
    ? histories.filter((h) => h.clientId === client.id).sort((a, b) => b.createdAt - a.createdAt)
    : [];

  async function handleAddHistory() {
    if (!hTitle.trim() || !client) return;
    const today = new Date().toISOString().split('T')[0];
    const updated = await addHistory({ clientId: client.id, date: today, type: hType, title: hTitle.trim(), content: hContent.trim(), result: hResult.trim() });
    setShowAddHistory(false);
    setHTitle(''); setHContent(''); setHResult(''); setHType('미팅');
    onHistoriesChange(updated);
  }

  function openEditHistory(h) {
    setEditingHistory(h);
    setHType(h.type);
    setHTitle(h.title);
    setHContent(h.content || '');
    setHResult(h.result || '');
  }

  async function handleEditHistory() {
    if (!hTitle.trim() || !editingHistory) return;
    const updated = await updateHistory(editingHistory.id, { type: hType, title: hTitle.trim(), content: hContent.trim(), result: hResult.trim() });
    setEditingHistory(null);
    setHTitle(''); setHContent(''); setHResult(''); setHType('미팅');
    onHistoriesChange(updated);
  }

  function confirmDeleteHistory(h) {
    Alert.alert(
      '히스토리 삭제',
      `"${h.title}" 기록을 삭제하시겠습니까?`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제', style: 'destructive',
          onPress: async () => {
            const updated = await deleteHistory(h.id);
            onHistoriesChange(updated);
          },
        },
      ]
    );
  }

  return (
    <>
      {/* 히스토리 */}
      <View style={s.historyHeader}>
        <Text style={s.historyTitle}>히스토리 {clientHistories.length}건</Text>
        <TouchableOpacity style={s.addHistoryBtn} onPress={() => setShowAddHistory(true)}>
          <Text style={s.addHistoryText}>+ 추가</Text>
        </TouchableOpacity>
      </View>

      <ScrollView style={s.flex1} showsVerticalScrollIndicator={false}>
        {clientHistories.length === 0 ? (
          <Text style={s.emptyText}>기록된 히스토리가 없습니다</Text>
        ) : (
          clientHistories.map((h, i) => (
            <View key={h.id} style={s.historyItem}>
              <View style={s.historyLeft}>
                <Text style={s.historyDate}>{formatHistoryDate(h.date)}</Text>
                {i < clientHistories.length - 1 && <View style={s.historyLine} />}
              </View>
              <View style={s.historyRight}>
                <View style={s.historyMeta}>
                  <View style={[s.typeBadge, { backgroundColor: typeColor(h.type) + '22', borderColor: typeColor(h.type) + '55' }]}>
                    <Text style={[s.typeText, { color: typeColor(h.type) }]}>{h.type}</Text>
                  </View>
                  <Text style={s.historyTitleText}>{h.title}</Text>
                  <View style={s.historyActionRow}>
                    <TouchableOpacity onPress={() => openEditHistory(h)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={s.editHistoryBtn}>편집</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => confirmDeleteHistory(h)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={s.deleteHistoryBtn}>삭제</Text>
                    </TouchableOpacity>
                  </View>
                </View>
                {h.content ? <Text style={s.historyContent}>{h.content}</Text> : null}
                {h.result ? (
                  <View style={s.resultRow}>
                    <Text style={s.resultLabel}>결과</Text>
                    <Text style={s.resultText}>{h.result}</Text>
                  </View>
                ) : null}
              </View>
            </View>
          ))
        )}

        {children}
      </ScrollView>

      {/* ── 히스토리 추가 모달 ── */}
      <Modal visible={showAddHistory} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>히스토리 추가</Text>
            <Text style={s.modalSubTitle}>{client?.company} — {client?.name}</Text>

            <Text style={s.inputLabel}>유형</Text>
            <View style={s.tagRow}>
              {HISTORY_TYPES.map((t) => (
                <TouchableOpacity key={t} style={[s.tagOption, hType === t && s.tagOptionActive]} onPress={() => setHType(t)}>
                  <Text style={[s.tagOptionText, hType === t && s.tagOptionTextActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.inputLabel}>제목</Text>
            <TextInput style={s.input} value={hTitle} onChangeText={setHTitle} placeholder="미팅/연락 제목" placeholderTextColor={C.textDim} />

            <Text style={s.inputLabel}>내용</Text>
            <TextInput style={[s.input, s.inputMultiline]} value={hContent} onChangeText={setHContent} placeholder="논의 내용" placeholderTextColor={C.textDim} multiline />

            <Text style={s.inputLabel}>결과</Text>
            <TextInput style={s.input} value={hResult} onChangeText={setHResult} placeholder="결과 또는 다음 액션" placeholderTextColor={C.textDim} />

            <View style={s.modalBtns}>
              <TouchableOpacity style={s.modalCancel} onPress={() => setShowAddHistory(false)}>
                <Text style={s.modalCancelText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.modalConfirm} onPress={handleAddHistory}>
                <Text style={s.modalConfirmText}>저장</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── 히스토리 수정 모달 ── */}
      <Modal visible={!!editingHistory} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>히스토리 수정</Text>
            <Text style={s.modalSubTitle}>{client?.company} — {client?.name}</Text>

            <Text style={s.inputLabel}>유형</Text>
            <View style={s.tagRow}>
              {HISTORY_TYPES.map((t) => (
                <TouchableOpacity key={t} style={[s.tagOption, hType === t && s.tagOptionActive]} onPress={() => setHType(t)}>
                  <Text style={[s.tagOptionText, hType === t && s.tagOptionTextActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.inputLabel}>제목</Text>
            <TextInput style={s.input} value={hTitle} onChangeText={setHTitle} placeholder="미팅/연락 제목" placeholderTextColor={C.textDim} />

            <Text style={s.inputLabel}>내용</Text>
            <TextInput style={[s.input, s.inputMultiline]} value={hContent} onChangeText={setHContent} placeholder="논의 내용" placeholderTextColor={C.textDim} multiline />

            <Text style={s.inputLabel}>결과</Text>
            <TextInput style={s.input} value={hResult} onChangeText={setHResult} placeholder="결과 또는 다음 액션" placeholderTextColor={C.textDim} />

            <View style={s.modalBtns}>
              <TouchableOpacity style={s.modalCancel} onPress={() => { setEditingHistory(null); setHTitle(''); setHContent(''); setHResult(''); setHType('미팅'); }}>
                <Text style={s.modalCancelText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.modalConfirm} onPress={handleEditHistory}>
                <Text style={s.modalConfirmText}>저장</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  flex1: { flex: 1 },
  emptyText: { color: C.textDim, fontSize: 13, textAlign: 'center', paddingTop: 20 },
  historyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  historyTitle: { color: C.textDim, fontSize: 10, letterSpacing: 2, fontWeight: '600' },
  addHistoryBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: C.accentTeal + '55', backgroundColor: C.accentTeal + '11' },
  addHistoryText: { color: C.accentTeal, fontSize: 11 },
  historyItem: { flexDirection: 'row', gap: 14, marginBottom: 4 },
  historyLeft: { alignItems: 'center', width: 72 },
  historyDate: { color: C.textDim, fontSize: 10, textAlign: 'center', lineHeight: 16 },
  historyLine: { width: 1, flex: 1, backgroundColor: C.border, marginTop: 6 },
  historyRight: { flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 12, marginBottom: 10, gap: 6 },
  historyMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  typeBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, borderWidth: 1 },
  typeText: { fontSize: 10, fontWeight: '500' },
  historyTitleText: { color: C.textPrimary, fontSize: 13, flex: 1 },
  historyActionRow: { marginLeft: 'auto', flexDirection: 'row', gap: 10 },
  editHistoryBtn: { color: C.textDim, fontSize: 11 },
  deleteHistoryBtn: { color: C.red, fontSize: 11 },
  historyContent: { color: C.textSecondary, fontSize: 12, lineHeight: 18 },
  resultRow: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  resultLabel: { color: C.gold, fontSize: 10, fontWeight: '600', marginTop: 1 },
  resultText: { color: C.textDim, fontSize: 12, flex: 1 },
  // Modal
  // 웹에서 Modal은 document.body로 포탈되어 App.js의 480px 폭 제한을 벗어나므로 여기서 다시 맞춘다
  modalOverlay: Platform.OS === 'web'
    ? { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center' }
    : { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  modalSheet: Platform.OS === 'web'
    ? { backgroundColor: C.surfaceHigh, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 24, paddingBottom: 40, paddingTop: 12, width: '100%', maxWidth: 480 }
    : { backgroundColor: C.surfaceHigh, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 24, paddingBottom: 40, paddingTop: 12 },
  modalHandle: { width: 36, height: 4, backgroundColor: C.borderHigh, borderRadius: 2, alignSelf: 'center' },
  modalTitle: { color: C.textPrimary, fontSize: 18, fontWeight: '400', marginBottom: 4 },
  modalSubTitle: { color: C.textDim, fontSize: 12, marginBottom: 16 },
  inputLabel: { color: C.textDim, fontSize: 10, letterSpacing: 1.5 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tagOption: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  tagOptionActive: { borderColor: C.accentTeal + '88', backgroundColor: C.accentTeal + '22' },
  tagOptionText: { color: C.textDim, fontSize: 12 },
  tagOptionTextActive: { color: C.accentTeal },
  input: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, color: C.textPrimary, fontSize: 14, paddingHorizontal: 14, paddingVertical: 12 },
  inputMultiline: { height: 72 },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 24 },
  modalCancel: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  modalCancelText: { color: C.textSecondary, fontSize: 14 },
  modalConfirm: { flex: 2, paddingVertical: 14, borderRadius: 12, backgroundColor: C.accentTeal, alignItems: 'center' },
  modalConfirmText: { color: '#fff', fontSize: 14, fontWeight: '600' },
});
