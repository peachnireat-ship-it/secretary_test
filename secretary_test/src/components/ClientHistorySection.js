import {
  Text, View, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Alert } from '../utils/alertCompat';
import { useState } from 'react';
import { C } from '../theme';
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
export default function ClientHistorySection({ client, histories, mutualHistories, topics, onHistoriesChange, onTopicsChange, children }) {
  const [showAddHistory, setShowAddHistory] = useState(false);
  const [editingHistory, setEditingHistory] = useState(null);
  const [hType, setHType] = useState('미팅');
  const [hTitle, setHTitle] = useState('');
  const [hContent, setHContent] = useState('');
  const [hResult, setHResult] = useState('');
  const [hShared, setHShared] = useState(false);
  const [hTopicId, setHTopicId] = useState(null);
  const [showTopicCreate, setShowTopicCreate] = useState(false);
  const [topicCreateName, setTopicCreateName] = useState('');
  const [showTopicManager, setShowTopicManager] = useState(false);
  const [mgrNewTopicName, setMgrNewTopicName] = useState('');
  const [viewMode, setViewMode] = useState('timeline'); // 'timeline' | 'topic'
  const [expandedTopics, setExpandedTopics] = useState(new Set());
  const [expandedItems, setExpandedItems] = useState(new Set());

  const isLinked = !!client?.linkedProfileId;

  const clientHistories = client
    ? histories.filter((h) => h.clientId === client.id).sort((a, b) => b.createdAt - a.createdAt)
    : [];

  const clientTopics = client ? (topics || []).filter((t) => t.clientId === client.id) : [];

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
    const name = h.__mutual ? h.topicName : clientTopics.find((t) => t.id === h.topicId)?.name;
    const key = name || UNCLASSIFIED_TOPIC;
    if (!topicMap.has(key)) topicMap.set(key, []);
    topicMap.get(key).push(h);
  }
  const topicGroups = [...topicMap.entries()]
    .map(([topic, items]) => ({ topic, items }))
    .sort((a, b) => b.items[0].createdAt - a.items[0].createdAt);

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
    setHTopicId(null); setShowTopicCreate(false); setTopicCreateName('');
  }

  // 히스토리 등록/수정 모달의 토픽 선택기에서 "+ 새 토픽"으로 즉석에서 만든 토픽은 바로 선택된다.
  async function handleCreateTopic(name) {
    const trimmed = name.trim();
    if (!trimmed || !client) return null;
    const id = Date.now().toString();
    const updated = await addTopic({ id, clientId: client.id, name: trimmed });
    onTopicsChange?.(updated);
    return id;
  }

  async function handleInlineCreateTopic() {
    const id = await handleCreateTopic(topicCreateName);
    if (id) {
      setHTopicId(id);
      setTopicCreateName('');
      setShowTopicCreate(false);
    }
  }

  async function handleManagerCreateTopic() {
    const id = await handleCreateTopic(mgrNewTopicName);
    if (id) setMgrNewTopicName('');
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
        {combinedHistories.length === 0 ? (
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
            const topicOpen = expandedTopics.has(g.topic);
            return (
              <View key={g.topic} style={s.topicGroup}>
                <TouchableOpacity style={s.topicHeader} onPress={() => toggleTopic(g.topic)} activeOpacity={0.7}>
                  <Text style={s.topicChevron}>{topicOpen ? '▾' : '▸'}</Text>
                  <Text style={s.topicName} numberOfLines={1}>{g.topic}</Text>
                  <Text style={s.topicCount}>{g.items.length}건</Text>
                </TouchableOpacity>
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
              topics={clientTopics}
              value={hTopicId}
              onSelect={setHTopicId}
              showCreate={showTopicCreate}
              onToggleCreate={() => setShowTopicCreate((v) => !v)}
              createName={topicCreateName}
              onCreateNameChange={setTopicCreateName}
              onCreateConfirm={handleInlineCreateTopic}
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
              topics={clientTopics}
              value={hTopicId}
              onSelect={setHTopicId}
              showCreate={showTopicCreate}
              onToggleCreate={() => setShowTopicCreate((v) => !v)}
              createName={topicCreateName}
              onCreateNameChange={setTopicCreateName}
              onCreateConfirm={handleInlineCreateTopic}
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
              {clientTopics.length === 0 ? (
                <Text style={s.emptyText}>등록된 토픽이 없습니다</Text>
              ) : (
                clientTopics.map((t) => {
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
                      <TouchableOpacity onPress={() => confirmDeleteTopic(t)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Text style={s.deleteHistoryBtn}>삭제</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })
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
    </>
  );
}

function TopicPicker({ topics, value, onSelect, showCreate, onToggleCreate, createName, onCreateNameChange, onCreateConfirm }) {
  return (
    <>
      <Text style={s.inputLabel}>업무 토픽 (선택)</Text>
      <View style={s.tagRow}>
        <TouchableOpacity style={[s.tagOption, !value && s.tagOptionActive]} onPress={() => onSelect(null)}>
          <Text style={[s.tagOptionText, !value && s.tagOptionTextActive]}>없음</Text>
        </TouchableOpacity>
        {topics.map((t) => (
          <TouchableOpacity key={t.id} style={[s.tagOption, value === t.id && s.tagOptionActive]} onPress={() => onSelect(t.id)}>
            <Text style={[s.tagOptionText, value === t.id && s.tagOptionTextActive]}>{t.name}</Text>
          </TouchableOpacity>
        ))}
        <TouchableOpacity style={s.tagOptionNew} onPress={onToggleCreate}>
          <Text style={s.tagOptionNewText}>+ 새 토픽</Text>
        </TouchableOpacity>
      </View>
      {showCreate && (
        <View style={s.topicCreateRow}>
          <TextInput style={[s.input, s.flex1]} value={createName} onChangeText={onCreateNameChange} placeholder="토픽 이름" placeholderTextColor={C.textDim} />
          <TouchableOpacity style={s.topicCreateBtn} onPress={onCreateConfirm}>
            <Text style={s.topicCreateBtnText}>추가</Text>
          </TouchableOpacity>
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
  tagOptionNew: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: C.accentTeal + '55', backgroundColor: C.accentTeal + '11' },
  tagOptionNewText: { color: C.accentTeal, fontSize: 12 },
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
  topicGroup: { marginBottom: 10 },
  topicHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10 },
  topicChevron: { color: C.accentTeal, fontSize: 12, width: 12 },
  topicName: { color: C.textPrimary, fontSize: 13, flex: 1, fontWeight: '500' },
  topicCount: { color: C.textDim, fontSize: 11 },
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
