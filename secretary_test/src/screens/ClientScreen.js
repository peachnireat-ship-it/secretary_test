import {
  Text, View, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Modal, KeyboardAvoidingView, Platform, ActivityIndicator, Alert, Linking,
  Animated,
} from 'react-native';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as Contacts from 'expo-contacts';
import { C } from '../theme';
import { getClients, addClient, updateClient, saveClients, getHistories, addHistory, updateHistory, deleteHistory, getMeetingRecords, getProjects, getClientFavorites, toggleClientFavorite, getCurrentUser } from '../services/storage';
import { askClaude, buildClientSystem, josa과와, normalizeAIDates } from '../services/claude';
import { useSwipeClose } from '../hooks/useSwipeClose';

const HISTORY_TYPES = ['미팅', '통화', '이메일', '계약', '기타'];

const SPEAKER_COLORS = ['#5B7FC4', '#4AADA0', '#8B6FC4', '#C4A35A', '#C45B5B', '#5BC48B', '#C47B5B'];

function parseTranscriptSegments(text) {
  if (!text) return [];
  const regex = /\[([^\]\n]+)\]([\s\S]*?)(?=\n*\[|$)/g;
  const segments = [];
  let m;
  while ((m = regex.exec(text)) !== null) {
    segments.push({ speaker: m[1], text: m[2].trim() });
  }
  return segments;
}

export default function ClientScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const [clients, setClients] = useState([]);
  const [histories, setHistories] = useState([]);
  const [meetingRecords, setMeetingRecords] = useState([]);
  const [projects, setProjects] = useState([]);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [favorites, setFavorites] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [sortOrder, setSortOrder] = useState('asc');
  const [selectedProject, setSelectedProject] = useState(null);

  const [showAddClient, setShowAddClient] = useState(false);
  const [showEditClient, setShowEditClient] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCompany, setNewCompany] = useState('');
  const [newRole, setNewRole] = useState('');
  const [newContact, setNewContact] = useState('');
  const [newWorkContact, setNewWorkContact] = useState('');
  const [newNotes, setNewNotes] = useState('');

  const [showAddHistory, setShowAddHistory] = useState(false);
  const [editingHistory, setEditingHistory] = useState(null);
  const [hType, setHType] = useState('미팅');
  const [hTitle, setHTitle] = useState('');
  const [hContent, setHContent] = useState('');
  const [hResult, setHResult] = useState('');

  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [contactList, setContactList] = useState([]);
  const [contactSearch, setContactSearch] = useState('');
  const [contactLoading, setContactLoading] = useState(false);

  const [selectedMeetingRecord, setSelectedMeetingRecord] = useState(null);
  const [showAI, setShowAI] = useState(false);
  const [chatMessages, setChatMessages] = useState([
    { role: 'assistant', text: '거래처 관련 무엇이든 물어보세요.\n\n예) "삼성물산이랑 마지막 만난 게 언제야?", "LG전자 다음 미팅 전에 뭘 준비해야 해?", "현재 가장 관리가 필요한 거래처는?"' },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const chatScrollRef = useRef(null);

  const swipeClient = useSwipeClose(() => setSelectedClient(null));

  async function load() {
    const [c, h, m, p, favs, me] = await Promise.all([getClients(), getHistories(), getMeetingRecords(), getProjects(), getClientFavorites(), getCurrentUser()]);
    const filtered = me ? c.filter((cl) => !(cl.name === me.name && cl.company === me.team)) : c;
    setClients(filtered);
    setHistories(h);
    setMeetingRecords(m);
    setProjects(p);
    setFavorites(favs);
  }

  useFocusEffect(useCallback(() => { load(); }, []));

  // clientId -> history[] (createdAt desc) 사전 인덱싱 — O(n×m) 목록 렌더링 방지
  const historiesByClient = useMemo(() => {
    const map = new Map();
    for (const h of histories) {
      const arr = map.get(h.clientId);
      if (arr) arr.push(h);
      else map.set(h.clientId, [h]);
    }
    for (const arr of map.values()) arr.sort((a, b) => b.createdAt - a.createdAt);
    return map;
  }, [histories]);

  const filteredClients = clients.filter((c) => {
    const matchesSearch = !search || c.name.includes(search) || c.company.includes(search);
    const matchesTab = activeTab === 'all' || favorites.includes(c.id);
    return matchesSearch && matchesTab;
  }).sort((a, b) => {
    const aKo = /^[가-힣]/.test(a.name);
    const bKo = /^[가-힣]/.test(b.name);
    let result;
    if (aKo && !bKo) result = -1;
    else if (!aKo && bKo) result = 1;
    else {
      const locale = aKo ? 'ko' : 'en';
      const cmp = a.name.localeCompare(b.name, locale);
      result = cmp !== 0 ? cmp : a.company.localeCompare(b.company, locale);
    }
    return sortOrder === 'asc' ? result : -result;
  });

  async function handleToggleFavorite(clientId) {
    const updated = await toggleClientFavorite(clientId);
    setFavorites(updated);
  }

  const filteredContactList = contactList.filter((c) =>
    !contactSearch || c.name?.includes(contactSearch)
  );

  const clientHistories = selectedClient
    ? histories.filter((h) => h.clientId === selectedClient.id).sort((a, b) => b.createdAt - a.createdAt)
    : [];

  async function handlePickFromContacts() {
    setShowSourcePicker(false);
    setContactLoading(true);
    setShowContactPicker(true);

    const { status } = await Contacts.requestPermissionsAsync();
    if (status !== 'granted') {
      setShowContactPicker(false);
      setContactLoading(false);
      Alert.alert('권한 필요', '연락처 접근 권한이 필요합니다. 기기 설정에서 권한을 허용해주세요.');
      return;
    }

    const { data } = await Contacts.getContactsAsync({
      fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name, Contacts.Fields.Company, Contacts.Fields.JobTitle],
    });

    const withPhone = data
      .filter((c) => c.name && c.phoneNumbers?.length > 0)
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
    setContactList(withPhone);
    setContactLoading(false);
  }

  function selectContact(contact) {
    const rawNumber = contact.phoneNumbers?.[0]?.number || '';
    const phone = rawNumber.replace(/[^\d-]/g, '');
    setNewName(contact.name || '');
    setNewContact(phone);
    setNewCompany(contact.company || '');
    setNewRole(contact.jobTitle || '');
    setShowContactPicker(false);
    setContactSearch('');
    setShowAddClient(true);
  }

  async function handleAddClient() {
    if (!newName.trim() || !newCompany.trim() || !newContact.trim()) {
      Alert.alert('필수 항목 누락', '담당자 이름, 회사명, 연락처는 필수 입력 항목입니다.\n모두 입력 후 추가해주세요.');
      return;
    }
    const updated = await addClient({ name: newName.trim(), company: newCompany.trim(), role: newRole.trim(), contact: newContact.trim(), workContact: newWorkContact.trim(), notes: newNotes.trim() });
    setClients(updated);
    setShowAddClient(false);
    setNewName(''); setNewCompany(''); setNewRole(''); setNewContact(''); setNewWorkContact(''); setNewNotes('');
  }

  function openEditClient(client) {
    setNewName(client.name);
    setNewCompany(client.company);
    setNewRole(client.role || '');
    setNewContact(client.contact || '');
    setNewWorkContact(client.workContact || '');
    setNewNotes(client.notes || '');
    setShowEditClient(true);
  }

  async function handleEditClient() {
    if (!newName.trim() || !newCompany.trim() || !newContact.trim()) {
      Alert.alert('필수 항목 누락', '담당자 이름, 회사명, 연락처는 필수 입력 항목입니다.');
      return;
    }
    const updated = await updateClient(selectedClient.id, { name: newName.trim(), company: newCompany.trim(), role: newRole.trim(), contact: newContact.trim(), workContact: newWorkContact.trim(), notes: newNotes.trim() });
    setClients(updated);
    const updatedClient = updated.find((c) => c.id === selectedClient.id);
    setSelectedClient(updatedClient);
    setShowEditClient(false);
    setNewName(''); setNewCompany(''); setNewRole(''); setNewContact(''); setNewWorkContact(''); setNewNotes('');
  }

  async function handleAddHistory() {
    if (!hTitle.trim() || !selectedClient) return;
    const today = new Date().toISOString().split('T')[0];
    const updated = await addHistory({ clientId: selectedClient.id, date: today, type: hType, title: hTitle.trim(), content: hContent.trim(), result: hResult.trim() });
    setHistories(updated);
    setShowAddHistory(false);
    setHTitle(''); setHContent(''); setHResult(''); setHType('미팅');
    fetchClientSummary(selectedClient, updated);
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
    setHistories(updated);
    setEditingHistory(null);
    setHTitle(''); setHContent(''); setHResult(''); setHType('미팅');
    fetchClientSummary(selectedClient, updated);
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
            setHistories(updated);
            fetchClientSummary(selectedClient, updated);
          },
        },
      ]
    );
  }

  async function handleAIChat() {
    const text = chatInput.trim();
    if (!text || aiLoading) return;
    setChatInput('');

    const userMsg = { role: 'user', text };
    const history = [...chatMessages, userMsg];
    setChatMessages(history);
    setAiLoading(true);

    try {
      const apiMessages = history
        .filter((m, idx) => m.role !== 'assistant' || idx > 0)
        .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.text }));
      const systemPrompt = buildClientSystem(clients, histories);
      const reply = await askClaude(apiMessages, systemPrompt);
      setChatMessages([...history, { role: 'assistant', text: reply }]);
    } catch (e) {
      const errText = e.message === 'API_KEY_MISSING'
        ? 'API 키가 설정되지 않았습니다. 설정 탭에서 Google AI API 키를 입력해주세요.'
        : `오류: ${e.message}`;
      setChatMessages([...history, { role: 'assistant', text: errText }]);
    } finally {
      setAiLoading(false);
      setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }

  // AI 요약 for selected client
  const [clientSummary, setClientSummary] = useState('');
  const [summaryLoading, setSummaryLoading] = useState(false);

  const [showHistoryAI, setShowHistoryAI] = useState(false);
  const [historySummary, setHistorySummary] = useState('');
  const [historySummaryLoading, setHistorySummaryLoading] = useState(false);

  async function fetchClientSummary(client, histList) {
    setClientSummary('');
    setSummaryLoading(true);
    try {
      const clientHistList = (histList || histories).filter((h) => h.clientId === client.id);
      const systemPrompt = buildClientSystem([client], clientHistList);
      const lastWord = client.role?.trim() || client.name;
      const particle = josa과와(lastWord);
      const nameWithRole = client.role?.trim() ? `${client.name} ${client.role}` : client.name;
      const reply = await askClaude([{ role: 'user', content: `${client.company} ${nameWithRole}${particle}의 관계를 3~4문장으로 자연스럽게 요약해줘. 마지막 연락 날짜, 현재 상황, 다음 필요한 액션을 포함해줘. 반드시 한국어로만 작성해줘.` }], systemPrompt);
      setClientSummary(normalizeAIDates(reply));
    } catch (e) {
      setClientSummary(e.message === 'API_KEY_MISSING' ? '설정 탭에서 API 키를 입력하면 AI 요약을 볼 수 있습니다.' : `오류: ${e.message}`);
    } finally {
      setSummaryLoading(false);
    }
  }

  function openClient(client) {
    setSelectedClient(client);
    setClientSummary('');
    fetchClientSummary(client);
  }

  async function fetchHistorySummary() {
    setHistorySummary('');
    setHistorySummaryLoading(true);
    try {
      const [clientList, histList] = await Promise.all([getClients(), getHistories()]);
      const systemPrompt = buildClientSystem(clientList, histList);
      const reply = await askClaude(
        [{ role: 'user', content: `등록된 모든 거래처 인원의 관계 히스토리를 종합해서 보고서 형식으로 작성해줘. 각 거래처별로 현재 관계 상태, 마지막 연락 시점, 주요 히스토리 요약, 다음에 필요한 액션을 포함해줘. 히스토리가 없는 거래처는 간략히 언급만 해줘. 반드시 한국어로만 작성해줘.` }],
        systemPrompt
      );
      setHistorySummary(normalizeAIDates(reply));
    } catch (e) {
      setHistorySummary(e.message === 'API_KEY_MISSING' ? '설정 탭에서 API 키를 입력하면 AI 요약을 볼 수 있습니다.' : `오류: ${e.message}`);
    } finally {
      setHistorySummaryLoading(false);
    }
  }

  useEffect(() => {
    if (!route?.params?.openHistoryAI) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowHistoryAI(true);
    navigation.setParams({ openHistoryAI: undefined });
  }, [route?.params?.openHistoryAI]);

  useEffect(() => {
    if (!showHistoryAI || historySummary || historySummaryLoading) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 위 가드가 무한루프를 방지하는 조건부 데이터 페치 패턴
    fetchHistorySummary();
  }, [showHistoryAI]);

  return (
    <View style={s.root}>
      {/* ── 헤더 ── */}
      <View style={[s.header, { paddingTop: insets.top + 16 }]}>
        <Text style={s.headerTitle}>거래처 관리</Text>
        <TouchableOpacity style={s.aiBtn} onPress={() => setShowAI(true)}>
          <Text style={s.aiBtnText}>✦ AI</Text>
        </TouchableOpacity>
      </View>

      {/* ── 검색 ── */}
      <View style={s.searchWrap}>
        <TextInput style={s.searchInput} value={search} onChangeText={setSearch} placeholder="거래처 또는 담당자 검색" placeholderTextColor={C.textDim} />
      </View>

      {/* ── 탭 ── */}
      <View style={s.tabRow}>
        <TouchableOpacity style={[s.tab, activeTab === 'all' && s.tabActive]} onPress={() => setActiveTab('all')}>
          <Text style={[s.tabText, activeTab === 'all' && s.tabTextActive]}>전체</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.tab, activeTab === 'favorites' && s.tabActive]} onPress={() => setActiveTab('favorites')}>
          <Text style={[s.tabText, activeTab === 'favorites' && s.tabTextActive]}>★ 즐겨찾기</Text>
          {favorites.length > 0 && (
            <View style={s.tabBadge}>
              <Text style={s.tabBadgeText}>{favorites.length}</Text>
            </View>
          )}
        </TouchableOpacity>
        <View style={s.flex1} />
        <TouchableOpacity style={[s.sortBtn, sortOrder === 'asc' && s.sortBtnActive]} onPress={() => setSortOrder('asc')}>
          <Text style={[s.sortBtnText, sortOrder === 'asc' && s.sortBtnTextActive]}>가↑</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[s.sortBtn, sortOrder === 'desc' && s.sortBtnActive]} onPress={() => setSortOrder('desc')}>
          <Text style={[s.sortBtnText, sortOrder === 'desc' && s.sortBtnTextActive]}>가↓</Text>
        </TouchableOpacity>
      </View>

      {/* ── 거래처 목록 ── */}
      <ScrollView style={s.list} contentContainerStyle={s.listContent} showsVerticalScrollIndicator={false}>
        {filteredClients.map((client) => {
          const clientHist = historiesByClient.get(client.id) || [];
          const lastH = clientHist[0];
          const hCount = clientHist.length;
          return (
            <TouchableOpacity key={client.id} style={[s.clientCard, favorites.includes(client.id) && s.clientCardFav]} activeOpacity={0.7} onPress={() => openClient(client)}>
              <View style={s.clientAvatar}>
                <Text style={s.clientAvatarText}>{client.name[0]}</Text>
              </View>
              <View style={s.clientBody}>
                <View style={s.clientRow}>
                  <Text style={s.clientName}>{client.name}</Text>
                  <Text style={s.clientCompany}>{client.company}</Text>
                </View>
                <Text style={s.clientRole}>{client.role}</Text>
                <View style={s.clientMeta}>
                  <Text style={s.clientMetaText}>히스토리 {hCount}건</Text>
                  {lastH && <Text style={s.clientMetaText}>마지막 연락: {formatHistoryDate(lastH.date)}</Text>}
                </View>
              </View>
              <TouchableOpacity style={s.starBtn} onPress={() => handleToggleFavorite(client.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={[s.starIcon, favorites.includes(client.id) && s.starIconActive]}>
                  {favorites.includes(client.id) ? '★' : '☆'}
                </Text>
              </TouchableOpacity>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* ── 추가 버튼 ── */}
      <TouchableOpacity style={s.fab} onPress={() => setShowSourcePicker(true)}>
        <Text style={s.fabText}>+</Text>
      </TouchableOpacity>

      {/* ── 입력 방식 선택 ── */}
      <Modal visible={showSourcePicker} animationType="fade" transparent>
        <View style={s.modalOverlay}>
          <TouchableOpacity style={s.flex1} activeOpacity={1} onPress={() => setShowSourcePicker(false)} />
          <View style={s.sourceSheet}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>거래처 추가</Text>
            <TouchableOpacity style={s.sourceOption} onPress={() => { setShowSourcePicker(false); setShowAddClient(true); }}>
              <Text style={s.sourceIcon}>✏️</Text>
              <Text style={s.sourceOptionText}>직접 입력</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[s.sourceOption, { borderBottomWidth: 0 }]} onPress={handlePickFromContacts}>
              <Text style={s.sourceIcon}>📱</Text>
              <Text style={s.sourceOptionText}>연락처에서 가져오기</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── 연락처 선택 모달 ── */}
      <Modal visible={showContactPicker} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, s.h80pct]}>
            <View style={s.modalHandle} />
            <View style={s.chatHeader}>
              <Text style={s.modalTitle}>연락처 선택</Text>
              <TouchableOpacity onPress={() => { setShowContactPicker(false); setContactSearch(''); }}>
                <Text style={s.closeBtn}>✕</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={[s.searchInput, s.mb12]}
              value={contactSearch}
              onChangeText={setContactSearch}
              placeholder="이름 검색"
              placeholderTextColor={C.textDim}
            />
            {contactLoading ? (
              <ActivityIndicator size="large" color={C.accentTeal} style={s.mt24} />
            ) : filteredContactList.length === 0 ? (
              <Text style={[s.emptyText, s.mt24]}>연락처가 없습니다</Text>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                {filteredContactList.map((contact) => (
                  <TouchableOpacity key={contact.id} style={s.contactItem} onPress={() => selectContact(contact)}>
                    <View style={s.clientAvatar}>
                      <Text style={s.clientAvatarText}>{contact.name?.[0] || '?'}</Text>
                    </View>
                    <View style={s.flex1}>
                      <Text style={s.clientName}>{contact.name}</Text>
                      <Text style={s.clientRole}>{contact.phoneNumbers?.[0]?.number || ''}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ── 클라이언트 상세 모달 ── */}
      <Modal visible={!!selectedClient} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <Animated.View style={[s.modalSheet, s.h90pct, swipeClient.animStyle]}>
            <View style={s.modalHandleWrap} {...swipeClient.panHandlers}>
              <View style={s.modalHandle} />
            </View>
            <View style={s.detailHeader}>
              <View style={s.detailAvatar}>
                <Text style={s.detailAvatarText}>{selectedClient?.name?.[0]}</Text>
              </View>
              <View style={s.flex1}>
                <View style={s.nameStarRow}>
                  <Text style={s.detailName}>{selectedClient?.name}</Text>
                  <TouchableOpacity onPress={() => selectedClient && handleToggleFavorite(selectedClient.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={[s.detailStarIcon, selectedClient && favorites.includes(selectedClient.id) && s.starIconActive]}>
                      {selectedClient && favorites.includes(selectedClient.id) ? '★' : '☆'}
                    </Text>
                  </TouchableOpacity>
                </View>
                <Text style={s.detailCompany}>{selectedClient?.company} · {selectedClient?.role}</Text>
              </View>
              <View style={s.editCloseRow}>
                <TouchableOpacity onPress={() => openEditClient(selectedClient)} style={s.editClientBtn}>
                  <Text style={s.editClientBtnText}>수정</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setSelectedClient(null)}>
                  <Text style={s.closeBtn}>✕</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* 연락처 */}
            {(selectedClient?.contact || selectedClient?.workContact) && (
              <View style={s.contactSection}>
                {selectedClient.contact ? (
                  <View style={s.contactRow}>
                    <Text style={s.contactLabel}>개인</Text>
                    <TouchableOpacity onPress={() => Alert.alert(
                      '전화 걸기',
                      `${selectedClient.name}(${selectedClient.contact})에게 전화하시겠습니까?`,
                      [
                        { text: '취소', style: 'cancel' },
                        { text: '전화 걸기', onPress: () => Linking.openURL(`tel:${selectedClient.contact.replace(/[^0-9+]/g, '')}`) },
                      ]
                    )}>
                      <Text style={s.contactNumber}>{selectedClient.contact}</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
                {selectedClient.workContact ? (
                  <View style={s.contactRow}>
                    <Text style={s.contactLabel}>직장</Text>
                    <TouchableOpacity onPress={() => Alert.alert(
                      '전화 걸기',
                      `${selectedClient.name} 직장(${selectedClient.workContact})에 전화하시겠습니까?`,
                      [
                        { text: '취소', style: 'cancel' },
                        { text: '전화 걸기', onPress: () => Linking.openURL(`tel:${selectedClient.workContact.replace(/[^0-9+]/g, '')}`) },
                      ]
                    )}>
                      <Text style={s.contactNumber}>{selectedClient.workContact}</Text>
                    </TouchableOpacity>
                  </View>
                ) : null}
              </View>
            )}

            {/* 메모 */}
            {selectedClient?.notes ? (
              <View style={s.notesBox}>
                <Text style={s.notesLabel}>MEMO</Text>
                <Text style={s.notesText}>{selectedClient.notes}</Text>
              </View>
            ) : null}

            {/* AI 요약 */}
            <View style={s.summaryBox}>
              <View style={s.summaryLabelRow}>
                <Text style={s.aiGlyph}>✦</Text>
                <Text style={s.summaryLabel}>AI 관계 요약</Text>
              </View>
              {summaryLoading
                ? <ActivityIndicator size="small" color={C.accentTeal} style={s.mt8} />
                : <Text style={s.summaryText}>{clientSummary || '요약 준비 중...'}</Text>
              }
            </View>

            {/* 연결된 프로젝트 */}
            {(() => {
              const linked = projects.filter((p) => p.clientIds?.includes(selectedClient?.id));
              if (!linked.length) return null;
              return (
                <View style={s.linkedSection}>
                  <Text style={s.linkedSectionLabel}>연결된 프로젝트</Text>
                  <View style={s.linkedChipRow}>
                    {linked.map((p) => (
                      <TouchableOpacity key={p.id} style={[s.projectChip, { borderColor: projectStatusColor(p.status) + '55', backgroundColor: projectStatusColor(p.status) + '15' }]} activeOpacity={0.7} onPress={() => setSelectedProject(p)}>
                        <View style={[s.projectChipDot, { backgroundColor: projectStatusColor(p.status) }]} />
                        <Text style={[s.projectChipText, { color: projectStatusColor(p.status) }]} numberOfLines={1}>{p.title}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              );
            })()}

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

              {/* 연결된 회의록 */}
              {(() => {
                const linked = meetingRecords.filter((r) => r.clientIds?.includes(selectedClient?.id));
                if (!linked.length) return null;
                return (
                  <View style={[s.linkedSection, s.mt16]}>
                    <Text style={s.linkedSectionLabel}>연결된 회의록 {linked.length}건</Text>
                    {linked.map((r) => (
                      <TouchableOpacity key={r.id} style={s.meetingRecordItem} activeOpacity={0.7} onPress={() => setSelectedMeetingRecord(r)}>
                        <View style={s.meetingRecordItemHeader}>
                          <Text style={s.meetingRecordItemTitle} numberOfLines={1}>📋 {r.title || '회의록'}</Text>
                          <Text style={s.meetingRecordItemDate}>{formatDate(r.createdAt)}</Text>
                        </View>
                        {r.summary ? <Text style={s.meetingRecordItemSummary} numberOfLines={2}>{r.summary}</Text> : null}
                      </TouchableOpacity>
                    ))}
                  </View>
                );
              })()}
            </ScrollView>
          </Animated.View>
        </View>
      </Modal>

      {/* ── 히스토리 추가 모달 ── */}
      <Modal visible={showAddHistory} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>히스토리 추가</Text>
            <Text style={s.modalSubTitle}>{selectedClient?.company} — {selectedClient?.name}</Text>

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
            <TextInput style={[s.input, { height: 72 }]} value={hContent} onChangeText={setHContent} placeholder="논의 내용" placeholderTextColor={C.textDim} multiline />

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
            <Text style={s.modalSubTitle}>{selectedClient?.company} — {selectedClient?.name}</Text>

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
            <TextInput style={[s.input, { height: 72 }]} value={hContent} onChangeText={setHContent} placeholder="논의 내용" placeholderTextColor={C.textDim} multiline />

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

      {/* ── 거래처 수정 모달 ── */}
      <Modal visible={showEditClient} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.modalOverlay}>
          <View style={[s.modalSheet, s.maxH90pct]}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>거래처 수정</Text>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={s.scrollPB8}>
              <View style={s.inputLabelRow}>
                <Text style={s.inputLabel}>담당자 이름</Text>
                <Text style={s.requiredMark}>*</Text>
              </View>
              <TextInput style={s.input} value={newName} onChangeText={setNewName} placeholder="홍길동" placeholderTextColor={C.textDim} />
              <View style={s.inputLabelRow}>
                <Text style={s.inputLabel}>회사명</Text>
                <Text style={s.requiredMark}>*</Text>
              </View>
              <TextInput style={s.input} value={newCompany} onChangeText={setNewCompany} placeholder="(주)ABC" placeholderTextColor={C.textDim} />
              <Text style={[s.inputLabel, s.inputLabelSpacing]}>직책</Text>
              <TextInput style={s.input} value={newRole} onChangeText={setNewRole} placeholder="구매팀장" placeholderTextColor={C.textDim} />
              <View style={s.inputLabelRow}>
                <Text style={s.inputLabel}>연락처</Text>
                <Text style={s.requiredMark}>*</Text>
              </View>
              <TextInput style={s.input} value={newContact} onChangeText={setNewContact} placeholder="010-0000-0000" placeholderTextColor={C.textDim} keyboardType="phone-pad" />
              <Text style={[s.inputLabel, s.inputLabelSpacing]}>직장 연락처</Text>
              <TextInput style={s.input} value={newWorkContact} onChangeText={setNewWorkContact} placeholder="02-0000-0000" placeholderTextColor={C.textDim} keyboardType="phone-pad" />
              <Text style={[s.inputLabel, s.inputLabelSpacing]}>메모</Text>
              <TextInput style={s.input} value={newNotes} onChangeText={setNewNotes} placeholder="특이사항" placeholderTextColor={C.textDim} />
            </ScrollView>
            <View style={s.modalBtns}>
              <TouchableOpacity style={s.modalCancel} onPress={() => { setShowEditClient(false); setNewName(''); setNewCompany(''); setNewRole(''); setNewContact(''); setNewWorkContact(''); setNewNotes(''); }}>
                <Text style={s.modalCancelText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.modalConfirm} onPress={handleEditClient}>
                <Text style={s.modalConfirmText}>저장</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── 거래처 추가 모달 ── */}
      <Modal visible={showAddClient} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.modalOverlay}>
          <View style={[s.modalSheet, s.maxH90pct]}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>거래처 추가</Text>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={s.scrollPB8}>
              <View style={s.inputLabelRow}>
                <Text style={s.inputLabel}>담당자 이름</Text>
                <Text style={s.requiredMark}>*</Text>
              </View>
              <TextInput style={s.input} value={newName} onChangeText={setNewName} placeholder="홍길동" placeholderTextColor={C.textDim} />
              <View style={s.inputLabelRow}>
                <Text style={s.inputLabel}>회사명</Text>
                <Text style={s.requiredMark}>*</Text>
              </View>
              <TextInput style={s.input} value={newCompany} onChangeText={setNewCompany} placeholder="(주)ABC" placeholderTextColor={C.textDim} />
              <Text style={[s.inputLabel, s.inputLabelSpacing]}>직책</Text>
              <TextInput style={s.input} value={newRole} onChangeText={setNewRole} placeholder="구매팀장" placeholderTextColor={C.textDim} />
              <View style={s.inputLabelRow}>
                <Text style={s.inputLabel}>연락처</Text>
                <Text style={s.requiredMark}>*</Text>
              </View>
              <TextInput style={s.input} value={newContact} onChangeText={setNewContact} placeholder="010-0000-0000" placeholderTextColor={C.textDim} keyboardType="phone-pad" />
              <Text style={[s.inputLabel, s.inputLabelSpacing]}>직장 연락처</Text>
              <TextInput style={s.input} value={newWorkContact} onChangeText={setNewWorkContact} placeholder="02-0000-0000" placeholderTextColor={C.textDim} keyboardType="phone-pad" />
              <Text style={[s.inputLabel, s.inputLabelSpacing]}>메모</Text>
              <TextInput style={s.input} value={newNotes} onChangeText={setNewNotes} placeholder="특이사항" placeholderTextColor={C.textDim} />
            </ScrollView>
            <View style={s.modalBtns}>
              <TouchableOpacity style={s.modalCancel} onPress={() => setShowAddClient(false)}>
                <Text style={s.modalCancelText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.modalConfirm} onPress={handleAddClient}>
                <Text style={s.modalConfirmText}>추가</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── AI 거래처 히스토리 종합 모달 ── */}
      <Modal visible={showHistoryAI} animationType="slide" transparent onRequestClose={() => setShowHistoryAI(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, s.h85pct]}>
            <View style={s.modalHandle} />
            <View style={s.chatHeader}>
              <View style={s.chatHeaderLeft}>
                <Text style={s.aiGlyph}>✦</Text>
                <Text style={s.modalTitle}>AI 거래처 히스토리</Text>
              </View>
              <TouchableOpacity onPress={() => setShowHistoryAI(false)}>
                <Text style={s.closeBtn}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={s.flex1} showsVerticalScrollIndicator={false} contentContainerStyle={s.scrollPB24}>
              {historySummaryLoading ? (
                <View style={s.historyAILoading}>
                  <ActivityIndicator size="small" color={C.accentTeal} />
                  <Text style={s.historyAILoadingText}>거래처 히스토리를 분석하는 중...</Text>
                </View>
              ) : (
                <View style={s.summaryBox}>
                  <View style={s.summaryLabelRow}>
                    <Text style={s.aiGlyph}>✦</Text>
                    <Text style={s.summaryLabel}>관계 히스토리 종합 보고서</Text>
                  </View>
                  <Text style={s.summaryText}>{historySummary || '데이터를 불러오는 중...'}</Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── AI 채팅 모달 ── */}
      <Modal visible={showAI} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalOverlay}>
          <View style={[s.modalSheet, s.h85pct]}>
            <View style={s.modalHandle} />
            <View style={s.chatHeader}>
              <View style={s.chatHeaderLeft}>
                <Text style={s.aiGlyph}>✦</Text>
                <Text style={s.modalTitle}>AI 거래처 비서</Text>
              </View>
              <TouchableOpacity onPress={() => setShowAI(false)}>
                <Text style={s.closeBtn}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView ref={chatScrollRef} style={s.chatLog} contentContainerStyle={s.chatLogContent} showsVerticalScrollIndicator={false}>
              {chatMessages.map((m, i) => (
                <View key={i} style={[s.bubble, m.role === 'user' ? s.bubbleUser : s.bubbleAI]}>
                  <Text style={[s.bubbleText, m.role === 'user' ? s.bubbleTextUser : s.bubbleTextAI]}>{m.text}</Text>
                </View>
              ))}
              {aiLoading && (
                <View style={s.bubbleAI}>
                  <ActivityIndicator size="small" color={C.accentTeal} />
                </View>
              )}
            </ScrollView>

            <View style={s.chatInputRow}>
              <TextInput style={s.chatInput} value={chatInput} onChangeText={setChatInput} placeholder="거래처에 대해 물어보세요..." placeholderTextColor={C.textDim} onSubmitEditing={handleAIChat} returnKeyType="send" />
              <TouchableOpacity style={[s.sendBtn, !chatInput.trim() && s.opacity40]} onPress={handleAIChat} disabled={!chatInput.trim() || aiLoading}>
                <Text style={s.sendBtnText}>↑</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      {/* ── 프로젝트 상세 모달 ── */}
      <Modal visible={!!selectedProject} animationType="slide" transparent onRequestClose={() => setSelectedProject(null)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, s.maxH85pct]}>
            <View style={s.modalHandle} />
            {selectedProject && (
              <>
                <View style={s.projDetailHeader}>
                  <View style={s.flex1}>
                    <View style={s.projDetailBadgeRow}>
                      <View style={[s.projStatusBadge, { borderColor: projectStatusColor(selectedProject.status) + '66', backgroundColor: projectStatusColor(selectedProject.status) + '18' }]}>
                        <Text style={[s.projStatusText, { color: projectStatusColor(selectedProject.status) }]}>{selectedProject.status}</Text>
                      </View>
                      {selectedProject.priority ? (
                        <View style={[s.projPriorityBadge, { borderColor: priorityColorClient(selectedProject.priority) + '55' }]}>
                          <Text style={[s.projPriorityText, { color: priorityColorClient(selectedProject.priority) }]}>{selectedProject.priority}</Text>
                        </View>
                      ) : null}
                    </View>
                    <Text style={s.projDetailTitle}>{selectedProject.title}</Text>
                  </View>
                  <TouchableOpacity onPress={() => setSelectedProject(null)} style={s.ml8}>
                    <Text style={s.closeBtn}>✕</Text>
                  </TouchableOpacity>
                </View>

                <View style={s.projProgressWrap}>
                  <View style={s.projProgressTrack}>
                    <View style={[s.projProgressFill, { width: `${selectedProject.progress ?? 0}%`, backgroundColor: projectStatusColor(selectedProject.status) }]} />
                  </View>
                  <View style={s.projDeadlineRow}>
                    <Text style={s.projDeadlineText}>마감일 {selectedProject.deadline}{selectedProject.deadline && selectedProject.deadline !== '미정' ? (() => { const d = projDaysUntil(selectedProject.deadline); return d > 0 ? `  ·  ${d}일 후` : d === 0 ? '  ·  오늘 마감' : `  ·  ${Math.abs(d)}일 초과`; })() : ''}</Text>
                    <Text style={s.projProgressLabel}>{selectedProject.progress ?? 0}%</Text>
                  </View>
                </View>

                <ScrollView showsVerticalScrollIndicator={false}>
                  {selectedProject.notes ? (
                    <View style={s.projSection}>
                      <Text style={s.linkedSectionLabel}>메모</Text>
                      <View style={s.projSectionBox}>
                        <Text style={s.meetingDetailText}>{selectedProject.notes}</Text>
                      </View>
                    </View>
                  ) : null}

                  {(() => {
                    const people = (selectedProject.clientIds || []).map((id) => clients.find((c) => c.id === id)).filter(Boolean);
                    if (!people.length) return null;
                    return (
                      <View style={s.projSection}>
                        <Text style={s.linkedSectionLabel}>관련 인물 {people.length}명</Text>
                        {people.map((c, idx) => (
                          <View key={c.id} style={[s.projPersonRow, idx < people.length - 1 && s.borderBottom]}>
                            <View style={s.clientAvatar}>
                              <Text style={s.clientAvatarText}>{c.name[0]}</Text>
                            </View>
                            <View style={s.flex1}>
                              <Text style={s.clientName}>{c.name}</Text>
                              {c.company ? <Text style={s.clientRole}>{c.company}{c.role ? ` · ${c.role}` : ''}</Text> : null}
                            </View>
                          </View>
                        ))}
                      </View>
                    );
                  })()}

                  {(() => {
                    const linked = (selectedProject.meetingRecordIds || []).map((id) => meetingRecords.find((r) => r.id === id)).filter(Boolean);
                    if (!linked.length) return null;
                    return (
                      <View style={s.projSection}>
                        <Text style={s.linkedSectionLabel}>연결된 회의록 {linked.length}건</Text>
                        {linked.map((r) => (
                          <TouchableOpacity key={r.id} style={s.meetingRecordItem} activeOpacity={0.7} onPress={() => setSelectedMeetingRecord(r)}>
                            <View style={s.meetingRecordItemHeader}>
                              <Text style={s.meetingRecordItemTitle} numberOfLines={1}>📋 {r.title || '회의록'}</Text>
                              <Text style={s.meetingRecordItemDate}>{formatDate(r.createdAt)}</Text>
                            </View>
                            {r.summary ? <Text style={s.meetingRecordItemSummary} numberOfLines={2}>{r.summary}</Text> : null}
                          </TouchableOpacity>
                        ))}
                      </View>
                    );
                  })()}
                  <View style={s.spacerH20} />
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* ── 회의록 상세 모달 ── */}
      <Modal visible={!!selectedMeetingRecord} animationType="slide" transparent onRequestClose={() => setSelectedMeetingRecord(null)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, s.maxH90pct]}>
            <View style={s.modalHandle} />
            {selectedMeetingRecord && (
              <>
                <View style={s.meetingDetailHeader}>
                  <View style={s.flex1}>
                    <Text style={[s.modalTitle, s.mb0]} numberOfLines={2}>{selectedMeetingRecord.title || '회의록'}</Text>
                    {selectedMeetingRecord.createdAt && (
                      <Text style={s.meetingDetailDate}>
                        {new Date(selectedMeetingRecord.createdAt).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })}
                        {selectedMeetingRecord.source ? ` · ${selectedMeetingRecord.source}` : ''}
                      </Text>
                    )}
                  </View>
                  <TouchableOpacity onPress={() => setSelectedMeetingRecord(null)} style={s.ml8}>
                    <Text style={s.closeBtn}>✕</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView showsVerticalScrollIndicator={false} style={s.mt8}>
                  {selectedMeetingRecord.summary ? (
                    <>
                      <Text style={s.meetingDetailSectionLabel}>SUMMARY</Text>
                      <View style={s.meetingDetailSection}>
                        <Text style={s.meetingDetailText}>{selectedMeetingRecord.summary}</Text>
                      </View>
                    </>
                  ) : null}
                  {selectedMeetingRecord.transcript ? (
                    <>
                      <Text style={s.meetingDetailSectionLabel}>TRANSCRIPT</Text>
                      <View style={s.meetingDetailSection}>
                        {(() => {
                          const segs = parseTranscriptSegments(selectedMeetingRecord.transcript);
                          if (segs.length === 0) return <Text style={s.meetingDetailText}>{selectedMeetingRecord.transcript}</Text>;
                          const allSpkrs = [...new Set(segs.map((sg) => sg.speaker))];
                          return (
                            <View style={s.transcriptSegments}>
                              {segs.map((seg, i) => {
                                const color = SPEAKER_COLORS[allSpkrs.indexOf(seg.speaker) % SPEAKER_COLORS.length];
                                return (
                                  <View key={i}>
                                    <Text style={[s.speakerLabel, { color }]}>{seg.speaker}</Text>
                                    <Text style={s.meetingDetailText}>{seg.text}</Text>
                                  </View>
                                );
                              })}
                            </View>
                          );
                        })()}
                      </View>
                    </>
                  ) : null}
                  {!selectedMeetingRecord.summary && !selectedMeetingRecord.transcript && (
                    <Text style={[s.emptyText, s.mt20]}>저장된 내용이 없습니다.</Text>
                  )}
                  <View style={s.spacerH20} />
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

function typeColor(type) {
  const map = { 미팅: C.accentBlue, 통화: C.gold, 이메일: C.accentTeal, 계약: C.accentPurple, 기타: C.textSecondary };
  return map[type] || C.textSecondary;
}

function priorityColorClient(priority) {
  return { 높음: C.red, 보통: C.gold, 낮음: C.accentTeal }[priority] || C.textDim;
}

function projDaysUntil(deadlineStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(deadlineStr);
  return Math.round((d - today) / 86400000);
}

function projectStatusColor(status) {
  const map = { 진행중: C.accentBlue, 위험: C.gold, 지연: C.red, 완료: C.accentTeal, 취소: C.textDim };
  return map[status] || C.textDim;
}

function formatDate(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function formatHistoryDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${y}년 ${m}월 ${d}일`;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 60, paddingHorizontal: 24, paddingBottom: 12 },
  headerTitle: { color: C.textPrimary, fontSize: 22, fontWeight: '300', letterSpacing: -0.5 },
  aiBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: C.accentTeal + '22', borderWidth: 1, borderColor: C.accentTeal + '55', borderRadius: 20 },
  aiBtnText: { color: C.accentTeal, fontSize: 12, fontWeight: '600', letterSpacing: 1 },
  searchWrap: { paddingHorizontal: 24, paddingBottom: 12 },
  searchInput: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, color: C.textPrimary, fontSize: 13, paddingHorizontal: 16, paddingVertical: 12 },
  list: { flex: 1 },
  listContent: { paddingHorizontal: 24, paddingBottom: 100, gap: 10 },
  clientCard: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14, flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14 },
  clientAvatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: C.accentTeal + '33', borderWidth: 1, borderColor: C.accentTeal + '55', alignItems: 'center', justifyContent: 'center' },
  clientAvatarText: { color: C.accentTeal, fontSize: 16, fontWeight: '500' },
  clientBody: { flex: 1, gap: 3 },
  clientRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  clientName: { color: C.textPrimary, fontSize: 15, fontWeight: '400' },
  clientCompany: { color: C.textDim, fontSize: 12 },
  clientRole: { color: C.textSecondary, fontSize: 12 },
  clientMeta: { flexDirection: 'row', gap: 12, marginTop: 2 },
  clientMetaText: { color: C.textDim, fontSize: 10 },
  clientCardFav: { borderColor: C.gold + '55', backgroundColor: C.gold + '08' },
  starBtn: { padding: 4 },
  starIcon: { color: C.textDim, fontSize: 18 },
  starIconActive: { color: C.gold },
  detailStarIcon: { color: C.textDim, fontSize: 18 },
  tabRow: { flexDirection: 'row', paddingHorizontal: 24, gap: 8, marginBottom: 8 },
  tab: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  tabActive: { borderColor: C.gold + '88', backgroundColor: C.gold + '18' },
  tabText: { color: C.textDim, fontSize: 12 },
  tabTextActive: { color: C.gold, fontWeight: '600' },
  tabBadge: { width: 16, height: 16, borderRadius: 8, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center' },
  tabBadgeText: { color: '#fff', fontSize: 9, fontWeight: '700' },
  sortBtn: { paddingHorizontal: 10, paddingVertical: 7, borderRadius: 20, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  sortBtnActive: { borderColor: C.accentTeal + '88', backgroundColor: C.accentTeal + '22' },
  sortBtnText: { color: C.textDim, fontSize: 12 },
  sortBtnTextActive: { color: C.accentTeal, fontWeight: '600' },
  fab: { position: 'absolute', bottom: 30, right: 24, width: 52, height: 52, borderRadius: 26, backgroundColor: C.accentTeal, alignItems: 'center', justifyContent: 'center' },
  fabText: { color: '#fff', fontSize: 26, lineHeight: 30 },
  sourceSheet: { backgroundColor: C.surfaceHigh, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 24, paddingBottom: 40, paddingTop: 12 },
  sourceOption: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  sourceIcon: { fontSize: 20, width: 28, textAlign: 'center' },
  sourceOptionText: { color: C.textPrimary, fontSize: 16 },
  contactItem: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },

  // Detail Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  modalSheet: { backgroundColor: C.surfaceHigh, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 24, paddingBottom: 40, paddingTop: 12 },
  modalHandle: { width: 36, height: 4, backgroundColor: C.borderHigh, borderRadius: 2, alignSelf: 'center' },
  modalHandleWrap: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 40, marginBottom: 10 },
  detailHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  detailAvatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: C.accentTeal + '33', borderWidth: 1, borderColor: C.accentTeal + '55', alignItems: 'center', justifyContent: 'center' },
  detailAvatarText: { color: C.accentTeal, fontSize: 22, fontWeight: '400' },
  detailName: { color: C.textPrimary, fontSize: 18, fontWeight: '400' },
  detailCompany: { color: C.textSecondary, fontSize: 12, marginTop: 2 },
  contactSection: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, marginBottom: 14 },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  contactLabel: { color: C.textPrimary, fontSize: 12, fontWeight: '500' },
  contactNumber: { color: C.accentBlue, fontSize: 15, fontWeight: '400', textDecorationLine: 'underline' },
  closeBtn: { color: C.textSecondary, fontSize: 18, padding: 4 },
  editClientBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: C.accentBlue + '66', backgroundColor: C.accentBlue + '11' },
  editClientBtnText: { color: C.accentBlue, fontSize: 12, fontWeight: '500' },
  notesBox: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 12, marginBottom: 14 },
  notesLabel: { color: C.textDim, fontSize: 10, letterSpacing: 2, fontWeight: '600', marginBottom: 6 },
  notesText: { color: C.textSecondary, fontSize: 13, lineHeight: 19 },
  summaryBox: { backgroundColor: C.surface + 'CC', borderWidth: 1, borderColor: C.accentTeal + '33', borderRadius: 12, padding: 14, marginBottom: 16 },
  summaryLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  aiGlyph: { color: C.accentTeal, fontSize: 14 },
  summaryLabel: { color: C.accentTeal, fontSize: 10, fontWeight: '600', letterSpacing: 1.5 },
  summaryText: { color: C.textSecondary, fontSize: 12, lineHeight: 19 },
  linkedSection: { marginBottom: 12 },
  linkedSectionLabel: { color: C.textDim, fontSize: 10, letterSpacing: 2, fontWeight: '600', marginBottom: 8 },
  linkedChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  meetingRecordItem: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.accentPurple + '44', borderRadius: 10, padding: 12, marginBottom: 8, gap: 5 },
  meetingRecordItemHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  meetingRecordItemTitle: { color: C.accentPurple, fontSize: 13, fontWeight: '500', flex: 1, marginRight: 8 },
  meetingRecordItemDate: { color: C.textDim, fontSize: 10 },
  meetingRecordItemSummary: { color: C.textSecondary, fontSize: 12, lineHeight: 17 },
  meetingDetailHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 },
  meetingDetailDate: { color: C.textDim, fontSize: 11, marginTop: 4 },
  meetingDetailSectionLabel: { color: C.textDim, fontSize: 10, letterSpacing: 2, fontWeight: '600', marginBottom: 8, marginTop: 14 },
  meetingDetailSection: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 14, marginBottom: 4 },
  meetingDetailText: { color: C.textSecondary, fontSize: 13, lineHeight: 20 },
  projectChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 8, paddingVertical: 5, paddingHorizontal: 10 },
  projectChipDot: { width: 5, height: 5, borderRadius: 3 },
  projectChipText: { fontSize: 11, fontWeight: '500', maxWidth: 160 },
  historyHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  historyTitle: { color: C.textDim, fontSize: 10, letterSpacing: 2, fontWeight: '600' },
  addHistoryBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: C.accentTeal + '55', backgroundColor: C.accentTeal + '11' },
  addHistoryText: { color: C.accentTeal, fontSize: 11 },
  emptyText: { color: C.textDim, fontSize: 13, textAlign: 'center', paddingTop: 20 },
  historyItem: { flexDirection: 'row', gap: 14, marginBottom: 4 },
  historyLeft: { alignItems: 'center', width: 72 },
  historyDate: { color: C.textDim, fontSize: 10, textAlign: 'center', lineHeight: 16 },
  historyLine: { width: 1, flex: 1, backgroundColor: C.border, marginTop: 6 },
  historyRight: { flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 12, marginBottom: 10, gap: 6 },
  historyMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  typeBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, borderWidth: 1 },
  typeText: { fontSize: 10, fontWeight: '500' },
  historyTitleText: { color: C.textPrimary, fontSize: 13, flex: 1 },
  editHistoryBtn: { color: C.textDim, fontSize: 11 },
  deleteHistoryBtn: { color: C.red, fontSize: 11 },
  historyContent: { color: C.textSecondary, fontSize: 12, lineHeight: 18 },
  resultRow: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  resultLabel: { color: C.gold, fontSize: 10, fontWeight: '600', marginTop: 1 },
  resultText: { color: C.textDim, fontSize: 12, flex: 1 },

  // Project detail modal
  projDetailHeader: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  projDetailBadgeRow: { flexDirection: 'row', gap: 6, marginBottom: 6 },
  projDetailTitle: { color: C.textPrimary, fontSize: 18, fontWeight: '400' },
  projStatusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  projStatusText: { fontSize: 11, fontWeight: '500' },
  projPriorityBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  projPriorityText: { fontSize: 11, fontWeight: '500' },
  projProgressWrap: { marginBottom: 14 },
  projProgressTrack: { height: 6, backgroundColor: C.border, borderRadius: 3 },
  projProgressFill: { height: 6, borderRadius: 3 },
  projProgressLabel: { color: C.textDim, fontSize: 11 },
  projDeadlineText: { color: C.textSecondary, fontSize: 12 },
  projSection: { marginBottom: 14 },
  projSectionBox: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 12 },
  projPersonRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },

  // Add modals
  modalTitle: { color: C.textPrimary, fontSize: 18, fontWeight: '400', marginBottom: 4 },
  modalSubTitle: { color: C.textDim, fontSize: 12, marginBottom: 16 },
  inputLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 16, marginBottom: 8 },
  inputLabel: { color: C.textDim, fontSize: 10, letterSpacing: 1.5 },
  requiredMark: { color: C.accentTeal, fontSize: 12, lineHeight: 14 },
  input: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, color: C.textPrimary, fontSize: 14, paddingHorizontal: 14, paddingVertical: 12 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tagOption: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  tagOptionActive: { borderColor: C.accentTeal + '88', backgroundColor: C.accentTeal + '22' },
  tagOptionText: { color: C.textDim, fontSize: 12 },
  tagOptionTextActive: { color: C.accentTeal },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 24 },
  modalCancel: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  modalCancelText: { color: C.textSecondary, fontSize: 14 },
  modalConfirm: { flex: 2, paddingVertical: 14, borderRadius: 12, backgroundColor: C.accentTeal, alignItems: 'center' },
  modalConfirmText: { color: '#fff', fontSize: 14, fontWeight: '600' },

  // AI Chat
  historyAILoading: { alignItems: 'center', gap: 12, paddingVertical: 40 },
  historyAILoadingText: { color: C.textDim, fontSize: 13 },
  chatHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  chatHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chatLog: { flex: 1 },
  chatLogContent: { gap: 10, paddingBottom: 10 },
  bubble: { maxWidth: '85%', borderRadius: 14, padding: 12 },
  bubbleAI: { alignSelf: 'flex-start', backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  bubbleUser: { alignSelf: 'flex-end', backgroundColor: C.accentTeal + '33', borderWidth: 1, borderColor: C.accentTeal + '55' },
  bubbleText: { fontSize: 13, lineHeight: 20 },
  bubbleTextAI: { color: C.textSecondary },
  bubbleTextUser: { color: C.textPrimary },
  chatInputRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  chatInput: { flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 24, color: C.textPrimary, fontSize: 14, paddingHorizontal: 18, paddingVertical: 12 },
  sendBtn: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: C.accentTeal },
  sendBtnText: { color: '#fff', fontSize: 18 },
  // Layout helpers
  flex1: { flex: 1 },
  spacerH20: { height: 20 },
  // Modal height variants
  h80pct: { height: '80%' },
  h85pct: { height: '85%' },
  h90pct: { height: '90%' },
  maxH85pct: { maxHeight: '85%' },
  maxH90pct: { maxHeight: '90%' },
  // Spacing modifiers
  mb0: { marginBottom: 0 },
  mb12: { marginBottom: 12 },
  mt8: { marginTop: 8 },
  mt16: { marginTop: 16 },
  mt20: { marginTop: 20 },
  mt24: { marginTop: 24 },
  ml8: { marginLeft: 8 },
  inputLabelSpacing: { marginTop: 16, marginBottom: 8 },
  // Content container padding
  scrollPB8: { paddingBottom: 8 },
  scrollPB24: { paddingBottom: 24 },
  // Row layouts
  nameStarRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  editCloseRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  historyActionRow: { marginLeft: 'auto', flexDirection: 'row', gap: 10 },
  projDeadlineRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  // Borders
  borderBottom: { borderBottomWidth: 1, borderBottomColor: C.border },
  // Transcript
  transcriptSegments: { gap: 12 },
  speakerLabel: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginBottom: 4 },
  opacity40: { opacity: 0.4 },
});
