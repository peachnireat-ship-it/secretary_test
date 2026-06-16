import {
  Text, View, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Modal, KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Contacts from 'expo-contacts';
import { C } from '../theme';
import { getClients, addClient, saveClients, getHistories, addHistory } from '../services/storage';
import { askClaude, buildClientSystem, josa과와 } from '../services/claude';

const HISTORY_TYPES = ['미팅', '통화', '이메일', '계약', '기타'];

export default function ClientScreen() {
  const insets = useSafeAreaInsets();
  const [clients, setClients] = useState([]);
  const [histories, setHistories] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState(null);

  const [showAddClient, setShowAddClient] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCompany, setNewCompany] = useState('');
  const [newRole, setNewRole] = useState('');
  const [newContact, setNewContact] = useState('');
  const [newNotes, setNewNotes] = useState('');

  const [showAddHistory, setShowAddHistory] = useState(false);
  const [hType, setHType] = useState('미팅');
  const [hTitle, setHTitle] = useState('');
  const [hContent, setHContent] = useState('');
  const [hResult, setHResult] = useState('');

  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [contactList, setContactList] = useState([]);
  const [contactSearch, setContactSearch] = useState('');
  const [contactLoading, setContactLoading] = useState(false);

  const [showAI, setShowAI] = useState(false);
  const [chatMessages, setChatMessages] = useState([
    { role: 'assistant', text: '거래처 관련 무엇이든 물어보세요.\n\n예) "삼성물산이랑 마지막 만난 게 언제야?", "LG전자 다음 미팅 전에 뭘 준비해야 해?", "현재 가장 관리가 필요한 거래처는?"' },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const chatScrollRef = useRef(null);

  useEffect(() => {
    load();
  }, []);

  async function load() {
    const [c, h] = await Promise.all([getClients(), getHistories()]);
    setClients(c);
    setHistories(h);
  }

  const filteredClients = clients.filter((c) =>
    !search || c.name.includes(search) || c.company.includes(search)
  );

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
    const updated = await addClient({ name: newName.trim(), company: newCompany.trim(), role: newRole.trim(), contact: newContact.trim(), notes: newNotes.trim() });
    setClients(updated);
    setShowAddClient(false);
    setNewName(''); setNewCompany(''); setNewRole(''); setNewContact(''); setNewNotes('');
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
        .filter((m) => m.role !== 'assistant' || history.indexOf(m) > 0)
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
      setClientSummary(reply);
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

      {/* ── 거래처 목록 ── */}
      <ScrollView style={s.list} contentContainerStyle={s.listContent} showsVerticalScrollIndicator={false}>
        {filteredClients.map((client) => {
          const lastH = histories.filter((h) => h.clientId === client.id).sort((a, b) => b.createdAt - a.createdAt)[0];
          const hCount = histories.filter((h) => h.clientId === client.id).length;
          return (
            <TouchableOpacity key={client.id} style={s.clientCard} activeOpacity={0.7} onPress={() => openClient(client)}>
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
                  {lastH && <Text style={s.clientMetaText}>마지막 연락: {lastH.date}</Text>}
                </View>
              </View>
              <Text style={s.chevron}>›</Text>
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
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={() => setShowSourcePicker(false)} />
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
          <View style={[s.modalSheet, { height: '80%' }]}>
            <View style={s.modalHandle} />
            <View style={s.chatHeader}>
              <Text style={s.modalTitle}>연락처 선택</Text>
              <TouchableOpacity onPress={() => { setShowContactPicker(false); setContactSearch(''); }}>
                <Text style={s.closeBtn}>✕</Text>
              </TouchableOpacity>
            </View>
            <TextInput
              style={[s.searchInput, { marginBottom: 12 }]}
              value={contactSearch}
              onChangeText={setContactSearch}
              placeholder="이름 검색"
              placeholderTextColor={C.textDim}
            />
            {contactLoading ? (
              <ActivityIndicator size="large" color={C.accentTeal} style={{ marginTop: 24 }} />
            ) : filteredContactList.length === 0 ? (
              <Text style={[s.emptyText, { marginTop: 24 }]}>연락처가 없습니다</Text>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                {filteredContactList.map((contact) => (
                  <TouchableOpacity key={contact.id} style={s.contactItem} onPress={() => selectContact(contact)}>
                    <View style={s.clientAvatar}>
                      <Text style={s.clientAvatarText}>{contact.name?.[0] || '?'}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
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
          <View style={[s.modalSheet, { height: '90%' }]}>
            <View style={s.modalHandle} />
            <View style={s.detailHeader}>
              <View style={s.detailAvatar}>
                <Text style={s.detailAvatarText}>{selectedClient?.name?.[0]}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.detailName}>{selectedClient?.name}</Text>
                <Text style={s.detailCompany}>{selectedClient?.company} · {selectedClient?.role}</Text>
                <Text style={s.detailContact}>{selectedClient?.contact}</Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedClient(null)}>
                <Text style={s.closeBtn}>✕</Text>
              </TouchableOpacity>
            </View>

            {/* AI 요약 */}
            <View style={s.summaryBox}>
              <View style={s.summaryLabelRow}>
                <Text style={s.aiGlyph}>✦</Text>
                <Text style={s.summaryLabel}>AI 관계 요약</Text>
              </View>
              {summaryLoading
                ? <ActivityIndicator size="small" color={C.accentTeal} style={{ marginTop: 8 }} />
                : <Text style={s.summaryText}>{clientSummary || '요약 준비 중...'}</Text>
              }
            </View>

            {/* 히스토리 */}
            <View style={s.historyHeader}>
              <Text style={s.historyTitle}>히스토리 {clientHistories.length}건</Text>
              <TouchableOpacity style={s.addHistoryBtn} onPress={() => setShowAddHistory(true)}>
                <Text style={s.addHistoryText}>+ 추가</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
              {clientHistories.length === 0 ? (
                <Text style={s.emptyText}>기록된 히스토리가 없습니다</Text>
              ) : (
                clientHistories.map((h, i) => (
                  <View key={h.id} style={s.historyItem}>
                    <View style={s.historyLeft}>
                      <Text style={s.historyDate}>{h.date}</Text>
                      {i < clientHistories.length - 1 && <View style={s.historyLine} />}
                    </View>
                    <View style={s.historyRight}>
                      <View style={s.historyMeta}>
                        <View style={[s.typeBadge, { backgroundColor: typeColor(h.type) + '22', borderColor: typeColor(h.type) + '55' }]}>
                          <Text style={[s.typeText, { color: typeColor(h.type) }]}>{h.type}</Text>
                        </View>
                        <Text style={s.historyTitleText}>{h.title}</Text>
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
            </ScrollView>
          </View>
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

      {/* ── 거래처 추가 모달 ── */}
      <Modal visible={showAddClient} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>거래처 추가</Text>
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
            <Text style={s.inputLabel}>직책</Text>
            <TextInput style={s.input} value={newRole} onChangeText={setNewRole} placeholder="구매팀장" placeholderTextColor={C.textDim} />
            <View style={s.inputLabelRow}>
              <Text style={s.inputLabel}>연락처</Text>
              <Text style={s.requiredMark}>*</Text>
            </View>
            <TextInput style={s.input} value={newContact} onChangeText={setNewContact} placeholder="010-0000-0000" placeholderTextColor={C.textDim} keyboardType="phone-pad" />
            <Text style={s.inputLabel}>메모</Text>
            <TextInput style={s.input} value={newNotes} onChangeText={setNewNotes} placeholder="특이사항" placeholderTextColor={C.textDim} />
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

      {/* ── AI 채팅 모달 ── */}
      <Modal visible={showAI} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalOverlay}>
          <View style={[s.modalSheet, { height: '85%' }]}>
            <View style={s.modalHandle} />
            <View style={s.chatHeader}>
              <View style={s.chatHeaderLeft}>
                <Text style={[s.aiGlyph, { color: C.accentTeal }]}>✦</Text>
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
              <TouchableOpacity style={[s.sendBtn, { backgroundColor: C.accentTeal }, !chatInput.trim() && { opacity: 0.4 }]} onPress={handleAIChat} disabled={!chatInput.trim() || aiLoading}>
                <Text style={s.sendBtnText}>↑</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function typeColor(type) {
  const map = { 미팅: C.accentBlue, 통화: C.gold, 이메일: C.accentTeal, 계약: C.accentPurple, 기타: C.textSecondary };
  return map[type] || C.textSecondary;
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
  chevron: { color: C.textDim, fontSize: 18 },
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
  modalHandle: { width: 36, height: 4, backgroundColor: C.borderHigh, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  detailHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  detailAvatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: C.accentTeal + '33', borderWidth: 1, borderColor: C.accentTeal + '55', alignItems: 'center', justifyContent: 'center' },
  detailAvatarText: { color: C.accentTeal, fontSize: 22, fontWeight: '400' },
  detailName: { color: C.textPrimary, fontSize: 18, fontWeight: '400' },
  detailCompany: { color: C.textSecondary, fontSize: 12, marginTop: 2 },
  detailContact: { color: C.textDim, fontSize: 11, marginTop: 2 },
  closeBtn: { color: C.textSecondary, fontSize: 18, padding: 4 },
  summaryBox: { backgroundColor: C.surface + 'CC', borderWidth: 1, borderColor: C.accentTeal + '33', borderRadius: 12, padding: 14, marginBottom: 16 },
  summaryLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  aiGlyph: { color: C.accentTeal, fontSize: 14 },
  summaryLabel: { color: C.accentTeal, fontSize: 10, fontWeight: '600', letterSpacing: 1.5 },
  summaryText: { color: C.textSecondary, fontSize: 12, lineHeight: 19 },
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
  historyContent: { color: C.textSecondary, fontSize: 12, lineHeight: 18 },
  resultRow: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  resultLabel: { color: C.gold, fontSize: 10, fontWeight: '600', marginTop: 1 },
  resultText: { color: C.textDim, fontSize: 12, flex: 1 },

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
  sendBtn: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  sendBtnText: { color: '#fff', fontSize: 18 },
});
