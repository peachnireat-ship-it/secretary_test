import {
  Text, View, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Alert } from '../utils/alertCompat';
import { useState } from 'react';
import { C } from '../theme';
import { commonStyles } from '../styles/common';
import { addHistory, updateHistory, deleteHistory, addTopic, updateTopic, deleteTopic } from '../services/storage';
import { typeColor } from '../utils/colors';

const HISTORY_TYPES = ['미팅', '통화', '이메일', '계약', '기타'];
const UNCLASSIFIED_TOPIC = '미분류';

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
 * @param {Array} [params.mutualHistories] 상호 등록된 거래처(client.linkedProfileId)가 공개한 상대방 히스토리.
 *   본인 히스토리와 합쳐 등록 시간순으로 정렬 표시하되, 읽기 전용(편집/삭제 불가)이며 배지로 구분한다.
 * @param {Array} [params.topics] 전체 토픽 배열(본인 소유, client.id로 필터링해서 사용)
 * @param {(updated: Array) => void} params.onHistoriesChange 추가/수정/삭제 후 갱신된 히스토리 배열을 부모에 전달하는 콜백
 * @param {(updated: Array) => void} [params.onTopicsChange] 토픽 추가/공유전환/삭제 후 갱신된 토픽 배열을 부모에 전달하는 콜백
 * @param {React.ReactNode} [params.children] 히스토리 목록 아래, 같은 ScrollView 안에 렌더링할 콘텐츠
 */
export default function ClientHistorySection({ client, histories, mutualHistories, mutualTopics, topics, onHistoriesChange, onTopicsChange, children }) {
  const [showAddHistory, setShowAddHistory] = useState(false);
  const [editingHistory, setEditingHistory] = useState(null);
  const [hType, setHType] = useState('미팅');
  const [hTitle, setHTitle] = useState('');
  const [hContent, setHContent] = useState('');
  const [hResult, setHResult] = useState('');
  const [hShared, setHShared] = useState(false);
  const [hTopicId, setHTopicId] = useState(null);
  const [showTopicManager, setShowTopicManager] = useState(false);
  const [topicHistoryPicker, setTopicHistoryPicker] = useState(null);
  const [mgrNewTopicName, setMgrNewTopicName] = useState('');
  const [viewMode, setViewMode] = useState('timeline'); // 'timeline' | 'topic'
  const [expandedTopics, setExpandedTopics] = useState(new Set());
  const [expandedItems, setExpandedItems] = useState(new Set());

  const isLinked = !!client?.linkedProfileId;

  const clientHistories = client
    ? histories.filter((h) => h.clientId === client.id).sort((a, b) => b.createdAt - a.createdAt)
    : [];

  const clientTopics = client ? (topics || []).filter((t) => t.clientId === client.id) : [];
  const sharedMutualTopics = mutualTopics || [];
  // 내 토픽과 상대방이 공유한 토픽을 함께 선택할 수 있다. 상대 토픽은 연결만 가능하고 관리 권한은 없다.
  const selectableTopics = [...clientTopics, ...sharedMutualTopics];

  // 본인 히스토리 + 상대방이 공개한 히스토리를 등록 시간순(createdAt desc)으로 합쳐서 보여준다.
  // 두 목록을 각각 별도 섹션으로 나눠 보여주면 실제 시간 순서와 무관하게 쪼개져 보이므로,
  // 하나의 타임라인으로 병합하고 출처만 배지(공개/상대방 공유)로 구분한다.
  const combinedHistories = client
    ? [
        ...clientHistories.map((h) => ({ ...h, __mutual: false, __key: h.id })),
        ...(mutualHistories || []).map((h) => ({ ...h, __mutual: true, __key: `mutual-${h.id}` })),
      ].sort((a, b) => b.createdAt - a.createdAt)
    : [];

  // 토픽별 보기 — 본인 항목은 topicId로 clientTopics에서 이름을 찾고, 상대방 공유 항목은 RPC가
  // 이미 이름(topicName)을 채워 보내준다(상대방의 topics 행에는 직접 접근 권한이 없으므로).
  // 토픽이 없거나 찾을 수 없으면(삭제됨 등) "미분류"로 묶는다. 그룹 정렬은 그룹 내 최신 항목
  // (createdAt) 기준 내림차순 — combinedHistories가 이미 desc 정렬이라 각 그룹의 첫 항목이 곧
  // 최신 항목이다.
  const topicMap = new Map();
  for (const h of combinedHistories) {
    const topic = selectableTopics.find((t) => t.id === h.topicId);
    const key = h.topicId || UNCLASSIFIED_TOPIC;
    const name = topic?.name || h.topicName || UNCLASSIFIED_TOPIC;
    if (!topicMap.has(key)) topicMap.set(key, { topicId: h.topicId || null, name, items: [] });
    topicMap.get(key).items.push(h);
  }
  // 방금 만들어서 아직 어떤 히스토리도 태그되지 않은(0건) 내 토픽도 그룹으로 미리 노출한다.
  // 그래야 그룹 헤더의 "+ 추가" 버튼으로 첫 히스토리를 등록할 진입점이 생긴다 — 그렇지 않으면
  // combinedHistories 기반으로만 그룹이 만들어져 0건 토픽은 목록에서 아예 사라져 버튼도 보일
  // 방법이 없었다.
  for (const t of selectableTopics) {
    if (!topicMap.has(t.id)) topicMap.set(t.id, { topicId: t.id, name: t.name, items: [] });
  }
  const topicGroups = [...topicMap.entries()]
    .map(([, group]) => group)
    .sort((a, b) => {
      const aKey = a.items[0]?.createdAt ?? selectableTopics.find((t) => t.id === a.topicId)?.createdAt ?? 0;
      const bKey = b.items[0]?.createdAt ?? selectableTopics.find((t) => t.id === b.topicId)?.createdAt ?? 0;
      return bKey - aKey;
    });

  // 토픽 관리 모달용 — 상대방이 만들어 공유한 토픽(내 topics 테이블엔 없음)을 별도로 집계.
  // "토픽별 보기"에는 이미 그룹으로 보이는데 토픽 관리 모달엔 "등록된 토픽이 없습니다"만 뜨면
  // 혼동을 주므로, 읽기 전용으로라도 목록에 동기화해 보여준다.
  const mutualTopicGroups = sharedMutualTopics.map((t) => ({
    ...t,
    count: combinedHistories.filter((h) => h.topicId === t.id).length,
  }));

  function toggleTopic(topic) {
    setExpandedTopics((prev) => {
      const next = new Set(prev);
      if (next.has(topic)) next.delete(topic); else next.add(topic);
      return next;
    });
  }

  function toggleItemDetail(key) {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }

  async function handleAddHistory() {
    if (!hTitle.trim() || !client) return;
    const today = new Date().toISOString().split('T')[0];
    const updated = await addHistory({ clientId: client.id, date: today, type: hType, title: hTitle.trim(), content: hContent.trim(), result: hResult.trim(), sharedWithMutual: hShared, topicId: hTopicId });
    resetHistoryForm();
    setShowAddHistory(false);
    onHistoriesChange(updated);
  }

  function openEditHistory(h) {
    setEditingHistory(h);
    setHType(h.type);
    setHTitle(h.title);
    setHContent(h.content || '');
    setHResult(h.result || '');
    setHShared(!!h.sharedWithMutual);
    setHTopicId(h.topicId || null);
  }

  async function handleEditHistory() {
    if (!hTitle.trim() || !editingHistory) return;
    const updated = await updateHistory(editingHistory.id, { type: hType, title: hTitle.trim(), content: hContent.trim(), result: hResult.trim(), sharedWithMutual: hShared, topicId: hTopicId });
    resetHistoryForm();
    setEditingHistory(null);
    onHistoriesChange(updated);
  }

  function resetHistoryForm() {
    setHTitle(''); setHContent(''); setHResult(''); setHType('미팅'); setHShared(false);
    setHTopicId(null);
  }

  // 히스토리 등록/수정 모달의 토픽 선택기에서 "+ 새 토픽"으로 즉석에서 만든 토픽은 바로 선택된다.
  // 같은 거래처에 이름이 같은 토픽이 이미 있으면 새로 만들지 않고 기존 토픽 id를 그대로 재사용한다
  // (id 기준으로 하나의 토픽만 존재하도록 보장 — 이름이 같은 토픽이 중복 생성되는 것을 방지).
  async function handleCreateTopic(name) {
    const trimmed = name.trim();
    if (!trimmed || !client) return null;
    const existing = clientTopics.find((t) => t.name.trim().toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      Alert.alert('이미 있는 토픽입니다', `"${existing.name}" 토픽을 그대로 사용합니다.`);
      return existing.id;
    }
    const id = Date.now().toString();
    const updated = await addTopic({ id, clientId: client.id, name: trimmed });
    onTopicsChange?.(updated);
    return id;
  }

  async function handleManagerCreateTopic() {
    const id = await handleCreateTopic(mgrNewTopicName);
    if (id) setMgrNewTopicName('');
  }

  function openAddHistoryForTopic(topicId) {
    resetHistoryForm();
    setHTopicId(topicId);
    setShowAddHistory(true);
  }

  async function handleRemoveFromTopic(h) {
    const updated = await updateHistory(h.id, { topicId: null });
    onHistoriesChange(updated);
  }

  // 토픽 관리 화면에서 기존 히스토리를 사용자가 직접 선택해 해당 토픽으로 옮긴다.
  async function handleAssignExistingHistory(h) {
    if (!topicHistoryPicker) return;
    const updated = await updateHistory(h.id, { topicId: topicHistoryPicker.id });
    onHistoriesChange(updated);
  }

  async function handleToggleTopicShared(t, count) {
    if (!t.shared && count === 0) {
      Alert.alert('공유 불가', '이 토픽에 연결된 히스토리가 없습니다. 먼저 히스토리를 이 토픽으로 지정한 뒤 공유를 켜주세요.');
      return;
    }
    const updated = await updateTopic(t.id, { shared: !t.shared });
    onTopicsChange?.(updated);
  }

  function confirmDeleteTopic(t) {
    Alert.alert(
      '토픽 삭제',
      `"${t.name}" 토픽을 삭제하시겠습니까? 이 토픽에 속한 히스토리는 미분류로 남습니다.`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '삭제', style: 'destructive',
          onPress: async () => {
            const updated = await deleteTopic(t.id);
            onTopicsChange?.(updated);
          },
        },
      ]
    );
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
        <Text style={s.historyTitle}>히스토리 {combinedHistories.length}건</Text>
        <View style={s.historyHeaderRight}>
          <View style={s.viewModeToggle}>
            <TouchableOpacity style={[s.viewModeBtn, viewMode === 'timeline' && s.viewModeBtnActive]} onPress={() => setViewMode('timeline')}>
              <Text style={[s.viewModeText, viewMode === 'timeline' && s.viewModeTextActive]}>시간순</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.viewModeBtn, viewMode === 'topic' && s.viewModeBtnActive]} onPress={() => setViewMode('topic')}>
              <Text style={[s.viewModeText, viewMode === 'topic' && s.viewModeTextActive]}>토픽별</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity style={s.manageTopicsBtn} onPress={() => setShowTopicManager(true)}>
            <Text style={s.manageTopicsText}>토픽 관리</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.addHistoryBtn} onPress={() => setShowAddHistory(true)}>
            <Text style={s.addHistoryText}>+ 추가</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={s.flex1} showsVerticalScrollIndicator={false}>
        {viewMode === 'timeline' && combinedHistories.length === 0 ? (
          <Text style={s.emptyText}>기록된 히스토리가 없습니다</Text>
        ) : viewMode === 'topic' && topicGroups.length === 0 ? (
          <Text style={s.emptyText}>기록된 히스토리가 없습니다</Text>
        ) : viewMode === 'timeline' ? (
          combinedHistories.map((h, i) => (
            <View key={h.__key} style={s.historyItem}>
              <View style={s.historyLeft}>
                <Text style={s.historyDate}>{formatHistoryDate(h.date)}</Text>
                {i < combinedHistories.length - 1 && <View style={s.historyLine} />}
              </View>
              <View style={[s.historyRight, h.__mutual && s.historyRightMutual]}>
                <View style={s.historyMeta}>
                  <View style={[s.typeBadge, { backgroundColor: typeColor(h.type) + '22', borderColor: typeColor(h.type) + '55' }]}>
                    <Text style={[s.typeText, { color: typeColor(h.type) }]}>{h.type}</Text>
                  </View>
                  <Text style={s.historyTitleText}>{h.title}</Text>
                  {h.__mutual ? (
                    <Text style={s.mutualBadge}>상대방 공유</Text>
                  ) : (
                    isLinked && h.sharedWithMutual ? <Text style={s.sharedBadge}>공개</Text> : null
                  )}
                  {!h.__mutual && (
                    <View style={s.historyActionRow}>
                      <TouchableOpacity onPress={() => openEditHistory(h)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Text style={s.editHistoryBtn}>편집</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => confirmDeleteHistory(h)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Text style={s.deleteHistoryBtn}>삭제</Text>
                      </TouchableOpacity>
                    </View>
                  )}
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
        ) : (
          topicGroups.map((g) => {
            const groupKey = g.topicId || UNCLASSIFIED_TOPIC;
            const topicOpen = expandedTopics.has(groupKey);
            const topicId = g.topicId;
            return (
              <View key={groupKey} style={s.topicGroup}>
                <View style={s.topicHeader}>
                  <TouchableOpacity style={s.topicHeaderMain} onPress={() => toggleTopic(groupKey)} activeOpacity={0.7}>
                    <Text style={s.topicChevron}>{topicOpen ? '▾' : '▸'}</Text>
                    <Text style={s.topicName} numberOfLines={1}>{g.name}</Text>
                    <Text style={s.topicCount}>{g.items.length}건</Text>
                  </TouchableOpacity>
                  {topicId && (
                    <TouchableOpacity style={s.topicAddBtn} onPress={() => openAddHistoryForTopic(topicId)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <Text style={s.topicAddBtnText}>+ 추가</Text>
                    </TouchableOpacity>
                  )}
                </View>
                {topicOpen && g.items.length === 0 && (
                  <Text style={s.topicEmptyHint}>아직 연결된 히스토리가 없습니다. {'"+ 추가"'}로 첫 히스토리를 등록해보세요.</Text>
                )}
                {topicOpen && g.items.map((h) => {
                  const detailOpen = expandedItems.has(h.__key);
                  return (
                    <View key={h.__key} style={s.topicItem}>
                      <TouchableOpacity style={s.topicItemRow} onPress={() => toggleItemDetail(h.__key)} activeOpacity={0.7}>
                        <View style={[s.typeBadge, { backgroundColor: typeColor(h.type) + '22', borderColor: typeColor(h.type) + '55' }]}>
                          <Text style={[s.typeText, { color: typeColor(h.type) }]}>{h.type}</Text>
                        </View>
                        <Text style={s.topicItemDate}>{formatHistoryDate(h.date)}</Text>
                        <Text style={s.topicItemTitle} numberOfLines={1}>{h.title}</Text>
                        {h.__mutual ? (
                          <Text style={s.mutualBadge}>상대방 공유</Text>
                        ) : (
                          isLinked && h.sharedWithMutual ? <Text style={s.sharedBadge}>공개</Text> : null
                        )}
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => toggleItemDetail(h.__key)} hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}>
                        <Text style={s.topicDetailToggle}>{detailOpen ? '접기 ▴' : '상세 내용 보기 ▾'}</Text>
                      </TouchableOpacity>
                      {detailOpen && (
                        <View style={s.topicItemDetail}>
                          {h.content ? <Text style={s.historyContent}>{h.content}</Text> : null}
                          {h.result ? (
                            <View style={s.resultRow}>
                              <Text style={s.resultLabel}>결과</Text>
                              <Text style={s.resultText}>{h.result}</Text>
                            </View>
                          ) : null}
                          {!h.__mutual && (
                            <View style={s.historyActionRow}>
                              {h.topicId && (
                                <TouchableOpacity onPress={() => handleRemoveFromTopic(h)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                  <Text style={s.editHistoryBtn}>토픽에서 제외</Text>
                                </TouchableOpacity>
                              )}
                              <TouchableOpacity onPress={() => openEditHistory(h)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                <Text style={s.editHistoryBtn}>편집</Text>
                              </TouchableOpacity>
                              <TouchableOpacity onPress={() => confirmDeleteHistory(h)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                <Text style={s.deleteHistoryBtn}>삭제</Text>
                              </TouchableOpacity>
                            </View>
                          )}
                        </View>
                      )}
                    </View>
                  );
                })}
              </View>
            );
          })
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

            <TopicPicker
              topics={selectableTopics}
              value={hTopicId}
              onSelect={setHTopicId}
            />

            <Text style={s.inputLabel}>내용</Text>
            <TextInput style={[s.input, s.inputMultiline]} value={hContent} onChangeText={setHContent} placeholder="논의 내용" placeholderTextColor={C.textDim} multiline />

            <Text style={s.inputLabel}>결과</Text>
            <TextInput style={s.input} value={hResult} onChangeText={setHResult} placeholder="결과 또는 다음 액션" placeholderTextColor={C.textDim} />

            <SharedToggleRow visible={isLinked} value={hShared} onToggle={setHShared} />

            <View style={s.modalBtns}>
              <TouchableOpacity style={s.modalCancel} onPress={() => { setShowAddHistory(false); resetHistoryForm(); }}>
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

            <TopicPicker
              topics={selectableTopics}
              value={hTopicId}
              onSelect={setHTopicId}
            />

            <Text style={s.inputLabel}>내용</Text>
            <TextInput style={[s.input, s.inputMultiline]} value={hContent} onChangeText={setHContent} placeholder="논의 내용" placeholderTextColor={C.textDim} multiline />

            <Text style={s.inputLabel}>결과</Text>
            <TextInput style={s.input} value={hResult} onChangeText={setHResult} placeholder="결과 또는 다음 액션" placeholderTextColor={C.textDim} />

            <SharedToggleRow visible={isLinked} value={hShared} onToggle={setHShared} />

            <View style={s.modalBtns}>
              <TouchableOpacity style={s.modalCancel} onPress={() => { setEditingHistory(null); resetHistoryForm(); }}>
                <Text style={s.modalCancelText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.modalConfirm} onPress={handleEditHistory}>
                <Text style={s.modalConfirmText}>저장</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── 토픽 관리 모달 (이름은 등록 시 확정, 여기서는 공유 전환/삭제/추가만) ── */}
      <Modal visible={showTopicManager} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>토픽 관리</Text>
            <Text style={s.modalSubTitle}>{client?.company} — {client?.name}</Text>

            <ScrollView style={s.topicMgrList}>
              {clientTopics.length === 0 && mutualTopicGroups.length === 0 ? (
                <Text style={s.emptyText}>등록된 토픽이 없습니다</Text>
              ) : (
                <>
                  {clientTopics.map((t) => {
                    const count = clientHistories.filter((h) => h.topicId === t.id).length;
                    return (
                      <View key={t.id} style={s.topicMgrRow}>
                        <Text style={s.topicMgrName} numberOfLines={1}>{t.name}</Text>
                        <Text style={s.topicMgrCount}>{count}건</Text>
                        {isLinked && (
                          <TouchableOpacity style={[s.topicMgrShareBtn, t.shared && s.topicMgrShareBtnOn]} onPress={() => handleToggleTopicShared(t, count)}>
                            <Text style={[s.topicMgrShareText, t.shared && s.topicMgrShareTextOn]}>{t.shared ? '공유중' : '비공개'}</Text>
                          </TouchableOpacity>
                        )}
                        <TouchableOpacity style={s.topicMgrAssignBtn} onPress={() => setTopicHistoryPicker(t)}>
                          <Text style={s.topicMgrAssignText}>히스토리 추가</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => confirmDeleteTopic(t)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <Text style={s.deleteHistoryBtn}>삭제</Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                  {mutualTopicGroups.map((g) => (
                    <View key={`mutual-${g.id}`} style={s.topicMgrRow}>
                      <Text style={s.topicMgrName} numberOfLines={1}>{g.name}</Text>
                      <Text style={s.topicMgrCount}>{g.count}건</Text>
                      <Text style={s.mutualBadge}>상대방 토픽</Text>
                      <TouchableOpacity style={s.topicMgrAssignBtn} onPress={() => setTopicHistoryPicker(g)}>
                        <Text style={s.topicMgrAssignText}>히스토리 추가</Text>
                      </TouchableOpacity>
                    </View>
                  ))}
                </>
              )}
            </ScrollView>

            <View style={s.topicCreateRow}>
              <TextInput style={[s.input, s.flex1]} value={mgrNewTopicName} onChangeText={setMgrNewTopicName} placeholder="새 토픽 이름" placeholderTextColor={C.textDim} />
              <TouchableOpacity style={s.topicCreateBtn} onPress={handleManagerCreateTopic}>
                <Text style={s.topicCreateBtnText}>추가</Text>
              </TouchableOpacity>
            </View>

            <View style={s.modalBtns}>
              <TouchableOpacity style={s.modalConfirm} onPress={() => setShowTopicManager(false)}>
                <Text style={s.modalConfirmText}>닫기</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* 기존 히스토리를 선택해 현재 토픽에 수동으로 연결 */}
      <Modal visible={!!topicHistoryPicker} animationType="slide" transparent onRequestClose={() => setTopicHistoryPicker(null)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>기존 히스토리 추가</Text>
            <Text style={s.modalSubTitle}>{topicHistoryPicker?.name} 토픽에 넣을 히스토리를 선택하세요</Text>

            <ScrollView style={s.topicPickerList}>
              {clientHistories.filter((h) => h.topicId !== topicHistoryPicker?.id).length === 0 ? (
                <Text style={s.emptyText}>추가할 기존 히스토리가 없습니다</Text>
              ) : (
                clientHistories.filter((h) => h.topicId !== topicHistoryPicker?.id).map((h) => {
                  const currentTopic = selectableTopics.find((t) => t.id === h.topicId);
                  return (
                    <View key={h.id} style={s.topicPickerRow}>
                      <View style={[commonStyles.flex1, s.topicPickerInfo]}>
                        <Text style={s.topicPickerTitle} numberOfLines={1}>{h.title}</Text>
                        <Text style={s.topicPickerMeta} numberOfLines={1}>
                          {formatHistoryDate(h.date)} · {currentTopic ? `${currentTopic.name}에서 이동` : '미분류'}
                        </Text>
                      </View>
                      <TouchableOpacity style={s.topicPickerAddBtn} onPress={() => handleAssignExistingHistory(h)}>
                        <Text style={s.topicPickerAddText}>추가</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })
              )}
            </ScrollView>

            <View style={s.modalBtns}>
              <TouchableOpacity style={s.modalConfirm} onPress={() => setTopicHistoryPicker(null)}>
                <Text style={s.modalConfirmText}>완료</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

function TopicPicker({ topics, value, onSelect }) {
  const [open, setOpen] = useState(false);
  const selectedTopic = topics.find((t) => t.id === value);

  function selectTopic(topicId) {
    onSelect(topicId);
    setOpen(false);
  }

  return (
    <>
      <Text style={s.inputLabel}>업무 토픽 (선택)</Text>
      <TouchableOpacity style={s.topicSelect} onPress={() => setOpen((prev) => !prev)} activeOpacity={0.7}>
        <Text style={[s.topicSelectText, !selectedTopic && s.topicSelectPlaceholder]}>
          {selectedTopic?.name || '토픽 없음'}
        </Text>
        <Text style={s.topicSelectChevron}>{open ? '⌃' : '⌄'}</Text>
      </TouchableOpacity>
      {open && (
        <View style={s.topicOptions}>
          <TouchableOpacity style={s.topicOptionRow} onPress={() => selectTopic(null)}>
            <Text style={[s.topicOptionText, !value && s.topicOptionTextActive]}>토픽 없음</Text>
          </TouchableOpacity>
          {topics.map((t) => (
            <TouchableOpacity key={t.id} style={s.topicOptionRow} onPress={() => selectTopic(t.id)}>
              <Text style={[s.topicOptionText, value === t.id && s.topicOptionTextActive]}>{t.name}</Text>
            </TouchableOpacity>
          ))}
          {topics.length === 0 && <Text style={s.topicOptionsEmpty}>생성된 토픽이 없습니다. 토픽 관리에서 먼저 만들어 주세요.</Text>}
        </View>
      )}
    </>
  );
}

function SharedToggleRow({ visible, value, onToggle }) {
  if (!visible) return null;
  return (
    <TouchableOpacity style={s.sharedRow} onPress={() => onToggle(!value)} activeOpacity={0.7}>
      <View style={[s.sharedCheckbox, value && s.sharedCheckboxOn]}>
        {value ? <Text style={s.sharedCheckboxMark}>✓</Text> : null}
      </View>
      <Text style={s.sharedLabel}>상대방에게 이 항목 공개</Text>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  flex1: { flex: 1 },
  emptyText: { color: C.textDim, fontSize: 13, textAlign: 'center', paddingTop: 20 },
  historyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  historyTitle: { color: C.textDim, fontSize: 10, letterSpacing: 2, fontWeight: '600' },
  historyHeaderRight: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  viewModeToggle: { flexDirection: 'row', borderRadius: 8, borderWidth: 1, borderColor: C.border, overflow: 'hidden' },
  viewModeBtn: { paddingHorizontal: 10, paddingVertical: 5 },
  viewModeBtnActive: { backgroundColor: C.accentTeal + '22' },
  viewModeText: { color: C.textDim, fontSize: 11 },
  viewModeTextActive: { color: C.accentTeal, fontWeight: '600' },
  addHistoryBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: C.accentTeal + '55', backgroundColor: C.accentTeal + '11' },
  addHistoryText: { color: C.accentTeal, fontSize: 11 },
  manageTopicsBtn: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: C.border },
  manageTopicsText: { color: C.textSecondary, fontSize: 11 },
  topicSelect: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44, paddingHorizontal: 14, borderRadius: 10, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  topicSelectText: { color: C.textPrimary, fontSize: 14 },
  topicSelectPlaceholder: { color: C.textDim },
  topicSelectChevron: { color: C.textDim, fontSize: 16 },
  topicOptions: { borderWidth: 1, borderColor: C.border, borderRadius: 10, backgroundColor: C.surfaceHigh, marginTop: 4, overflow: 'hidden' },
  topicOptionRow: { paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: C.border },
  topicOptionText: { color: C.textSecondary, fontSize: 13 },
  topicOptionTextActive: { color: C.accentTeal, fontWeight: '600' },
  topicOptionsEmpty: { color: C.textDim, fontSize: 12, paddingHorizontal: 14, paddingVertical: 11 },
  topicCreateRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
  topicCreateBtn: { paddingHorizontal: 16, borderRadius: 10, backgroundColor: C.accentTeal, alignItems: 'center', justifyContent: 'center' },
  topicCreateBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  topicMgrList: { maxHeight: 280, marginBottom: 8 },
  topicMgrRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  topicMgrName: { color: C.textPrimary, fontSize: 14, flex: 1 },
  topicMgrCount: { color: C.textDim, fontSize: 11 },
  topicMgrShareBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 7, borderWidth: 1, borderColor: C.border },
  topicMgrShareBtnOn: { borderColor: C.accentTeal + '88', backgroundColor: C.accentTeal + '22' },
  topicMgrShareText: { color: C.textDim, fontSize: 11 },
  topicMgrShareTextOn: { color: C.accentTeal, fontWeight: '600' },
  topicMgrAssignBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 7, borderWidth: 1, borderColor: C.accentTeal + '55', backgroundColor: C.accentTeal + '11' },
  topicMgrAssignText: { color: C.accentTeal, fontSize: 11, fontWeight: '600' },
  topicPickerList: { maxHeight: 360, marginTop: 4 },
  topicPickerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: C.border },
  topicPickerInfo: { gap: 3 },
  topicPickerTitle: { color: C.textPrimary, fontSize: 14 },
  topicPickerMeta: { color: C.textDim, fontSize: 11 },
  topicPickerAddBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, backgroundColor: C.accentTeal + '22', borderWidth: 1, borderColor: C.accentTeal + '55' },
  topicPickerAddText: { color: C.accentTeal, fontSize: 12, fontWeight: '600' },
  topicGroup: { marginBottom: 10 },
  topicHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  topicHeaderMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8 },
  topicAddBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 7, borderWidth: 1, borderColor: C.accentTeal + '55', backgroundColor: C.accentTeal + '11' },
  topicAddBtnText: { color: C.accentTeal, fontSize: 11 },
  topicChevron: { color: C.accentTeal, fontSize: 12, width: 12 },
  topicName: { color: C.textPrimary, fontSize: 13, flex: 1, fontWeight: '500' },
  topicCount: { color: C.textDim, fontSize: 11 },
  topicEmptyHint: { color: C.textDim, fontSize: 11, paddingHorizontal: 14, paddingVertical: 10, marginLeft: 10 },
  topicItem: { backgroundColor: C.surface, borderLeftWidth: 2, borderLeftColor: C.border, borderBottomWidth: 1, borderBottomColor: C.border, paddingHorizontal: 14, paddingVertical: 10, marginLeft: 10, gap: 6 },
  topicItemRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  topicItemDate: { color: C.textDim, fontSize: 10 },
  topicItemTitle: { color: C.textPrimary, fontSize: 13, flex: 1 },
  topicDetailToggle: { color: C.accentTeal, fontSize: 11 },
  topicItemDetail: { gap: 6, paddingTop: 2 },
  historyItem: { flexDirection: 'row', gap: 14, marginBottom: 4 },
  historyLeft: { alignItems: 'center', width: 72 },
  historyDate: { color: C.textDim, fontSize: 10, textAlign: 'center', lineHeight: 16 },
  historyLine: { width: 1, flex: 1, backgroundColor: C.border, marginTop: 6 },
  historyRight: { flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 12, marginBottom: 10, gap: 6 },
  historyRightMutual: { borderColor: C.accentPurple + '55', backgroundColor: C.accentPurple + '0d' },
  mutualBadge: { color: C.accentPurple, fontSize: 9, fontWeight: '600', borderWidth: 1, borderColor: C.accentPurple + '55', backgroundColor: C.accentPurple + '11', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1 },
  historyMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  typeBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, borderWidth: 1 },
  typeText: { fontSize: 10, fontWeight: '500' },
  historyTitleText: { color: C.textPrimary, fontSize: 13, flex: 1 },
  sharedBadge: { color: C.accentTeal, fontSize: 9, fontWeight: '600', borderWidth: 1, borderColor: C.accentTeal + '55', backgroundColor: C.accentTeal + '11', borderRadius: 5, paddingHorizontal: 5, paddingVertical: 1 },
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
  sharedRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 16 },
  sharedCheckbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 1, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  sharedCheckboxOn: { borderColor: C.accentTeal, backgroundColor: C.accentTeal + '22' },
  sharedCheckboxMark: { color: C.accentTeal, fontSize: 13, fontWeight: '700' },
  sharedLabel: { color: C.textSecondary, fontSize: 13 },
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
