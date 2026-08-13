import {
  Text, View, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Modal, KeyboardAvoidingView, Platform, ActivityIndicator, Linking,
  Animated,
} from 'react-native';
import { Alert } from '../utils/alertCompat';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as Contacts from 'expo-contacts';
import { C } from '../theme';
import { commonStyles } from '../styles/common';
import { getClients, addClient, updateClient, deleteClient, saveClients, getHistories, getTopics, getMeetingRecords, getProjects, getClientFavorites, toggleClientFavorite, sendClientEmail, searchDiscoverableProfiles, getMutualClientHistory, getMutualClientTopics } from '../services/storage';
import { askClaude, buildClientSystem, josa과와, normalizeAIDates, fixForeignWordsInText, stripForeignScripts } from '../services/claude';
import { useSwipeClose } from '../hooks/useSwipeClose';
import { useLiveDepartments } from '../hooks/useLiveDepartments';
import { useUser } from '../context/UserContext';
import { priorityColor as priorityColorClient, projectStatusColor } from '../utils/colors';
import { formatDate, ONE_DAY_MS } from '../utils/dateUtils';
import { parseTranscriptSegments } from '../utils/transcript';
import ClientHistorySection from '../components/ClientHistorySection';
import { IS_PC } from '../utils/deviceType';

const SPEAKER_COLORS = ['#5B7FC4', '#4AADA0', '#8B6FC4', '#C4A35A', '#C45B5B', '#5BC48B', '#C47B5B'];
// 국내 전화번호 형식 검증: 010-1234-5678, 02-123-4567, 031-1234-5678 등. 하이픈은 선택.
const PHONE_REGEX = /^0\d{1,2}-?\d{3,4}-?\d{4}$/;
const NOTES_MAX_LENGTH = 2000;

// 하이픈 없이 입력해도 기존 회원 데이터와 동일한 010-0000-0000 형식으로 자동 정렬
function fmtPhone(text) {
  const d = text.replace(/\D/g, '').slice(0, 11);
  if (d.length < 4) return d;
  if (d.startsWith('02')) {
    if (d.length <= 5) return `${d.slice(0, 2)}-${d.slice(2)}`;
    if (d.length <= 9) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`;
    return `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6, 10)}`;
  }
  if (d.length <= 7) return `${d.slice(0, 3)}-${d.slice(3)}`;
  if (d.length <= 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7, 11)}`;
}

export default function ClientScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { user: currentUser } = useUser();
  const [clients, setClients] = useState([]);
  const [histories, setHistories] = useState([]);
  const [topics, setTopics] = useState([]);
  const [meetingRecords, setMeetingRecords] = useState([]);
  const [projects, setProjects] = useState([]);
  const [search, setSearch] = useState('');
  const [activeTab, setActiveTab] = useState('all');
  const [favorites, setFavorites] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  // 담당자 상세 모달의 연락처 섹션 — "직장" 연락처를 아랫줄 "이메일" 텍스트 폭에 맞춰 절대 위치로
  // 정렬하기 위한 실측값. 컨테이너 폭·"직장" 박스 자체 폭까지 함께 실측해 화면 밖으로 넘치지
  // 않도록 clamp한다(긴 이메일 주소 대응). 담당자가 바뀌면(값이 전부 달라지므로) 반드시
  // 재측정해야 하므로 null로 리셋한다.
  const [emailRowWidth, setEmailRowWidth] = useState(null);
  const [contactPairWidth, setContactPairWidth] = useState(null);
  const [workRowWidth, setWorkRowWidth] = useState(null);
  const [sortOrder, setSortOrder] = useState('asc');
  const [selectedProject, setSelectedProject] = useState(null);
  // 상호 등록된 담당자(selectedClient.linkedProfileId 존재 시)의 히스토리 — 상대방이 상호 히스토리
  // 공유를 옵트인하지 않았거나 상호 등록이 아니면 항상 빈 배열([]) — 프라이버시상 이유를 구분해
  // 노출하지 않는다.
  const [mutualHistory, setMutualHistory] = useState([]);
  const [mutualTopics, setMutualTopics] = useState([]);

  const [showAddClient, setShowAddClient] = useState(false);
  const [showEditClient, setShowEditClient] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCompany, setNewCompany] = useState('');
  const [newRole, setNewRole] = useState('');
  const [newContact, setNewContact] = useState('');
  const [newWorkContact, setNewWorkContact] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newSns, setNewSns] = useState('');
  const [newNotes, setNewNotes] = useState('');
  // "기존 회원 검색"에서 선택한 profiles.id — 설정되어 있으면 addClient()가 ROSTER 이름 매칭
  // 휴리스틱보다 이 값을 우선해 linked_profile_id로 확실하게 연결한다.
  const [newLinkedProfileId, setNewLinkedProfileId] = useState(null);

  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [showContactPicker, setShowContactPicker] = useState(false);
  const [contactList, setContactList] = useState([]);
  const [contactSearch, setContactSearch] = useState('');
  const [contactLoading, setContactLoading] = useState(false);
  const [showPasteContacts, setShowPasteContacts] = useState(false);
  const [pasteText, setPasteText] = useState('');

  // ── 기존 회원 검색 (opt-in discoverable 회원 검색으로 담당자 추가) ──
  const [showMemberSearch, setShowMemberSearch] = useState(false);
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [memberSearchResults, setMemberSearchResults] = useState([]);
  const [memberSearchLoading, setMemberSearchLoading] = useState(false);
  // 검색을 한 번이라도 시도했는지 — "검색 결과 없음" 안내를 최초 진입 시(검색 전)에는 숨기기 위함
  const [memberSearchDone, setMemberSearchDone] = useState(false);
  // 검색 결과 선택 시 addClient() 호출 중 중복 클릭 방지용
  const [memberAddLoading, setMemberAddLoading] = useState(false);

  const [selectedMeetingRecord, setSelectedMeetingRecord] = useState(null);
  const [showAI, setShowAI] = useState(false);
  const [chatMessages, setChatMessages] = useState([
    { role: 'assistant', text: '담당자 관련 무엇이든 물어보세요.\n\n예) "삼성물산이랑 마지막 만난 게 언제야?", "LG전자 다음 미팅 전에 뭘 준비해야 해?", "현재 가장 관리가 필요한 담당자는?"' },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [fixingMsgIndex, setFixingMsgIndex] = useState(null);
  const [sendingEmailIndex, setSendingEmailIndex] = useState(null);
  const chatScrollRef = useRef(null);

  const swipeClient = useSwipeClose(() => setSelectedClient(null), !!selectedClient);

  // load() 최초 완료 여부 — clients/histories state를 재조회 없이 그대로 쓰는
  // fetchHistorySummary가 빈 배열([]) 상태로 실행되지 않도록 가드하는 데 사용
  const [loaded, setLoaded] = useState(false);

  async function load() {
    const [allClients, allHistories, allTopics, allMeetingRecords, allProjects, favoriteIds] = await Promise.all([getClients(), getHistories(), getTopics(), getMeetingRecords(), getProjects(), getClientFavorites()]);
    const filtered = currentUser ? allClients.filter((cl) => !(cl.name === currentUser.name && cl.company === currentUser.team)) : allClients;
    setClients(filtered);
    setHistories(allHistories);
    setTopics(allTopics);
    setMeetingRecords(allMeetingRecords);
    setProjects(allProjects);
    setFavorites(favoriteIds);
    setLoaded(true);
  }

  useFocusEffect(useCallback(() => { load(); }, []));

  // 연락처 섹션 "직장" 정렬용 실측값(emailRowWidth/contactPairWidth/workRowWidth)은 담당자마다
  // 이메일 길이·레이아웃이 달라지므로, 다른 담당자를 열 때마다 반드시 다시 측정해야 한다.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEmailRowWidth(null);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setContactPairWidth(null);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setWorkRowWidth(null);
  }, [selectedClient?.id]);

  // 상세 모달이 열릴 때(selectedClient가 상호 등록된 담당자일 때)만 상대방 히스토리를 조회한다.
  // 모달이 닫히거나(selectedClient === null) linkedProfileId가 없으면 즉시 빈 배열로 리셋해,
  // 다음에 다른 담당자를 열 때 이전 상대방의 데이터가 잠깐이라도 보이지 않게 한다.
  useEffect(() => {
    if (!selectedClient?.linkedProfileId) {
      // 모달이 닫히거나 linkedProfileId가 없는 담당자로 바뀔 때 이전 상대방의 mutualHistory가
      // 잠깐이라도 남아있지 않도록 즉시 리셋
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMutualHistory([]);
      setMutualTopics([]);
      return;
    }
    let cancelled = false;
    const client = selectedClient;
    Promise.all([getMutualClientHistory(client.linkedProfileId), getMutualClientTopics(client.linkedProfileId)]).then(([result, sharedTopics]) => {
      if (cancelled) return;
      setMutualHistory(result);
      setMutualTopics(sharedTopics);
      // 상호 등록 담당자는 상대방 히스토리까지 반영된 요약을 만들어야 하므로, 아직 캐시된 요약이
      // 없는 경우(신규 생성) 여기서 생성한다. openClient()는 이 경우 즉시 생성을 건너뛰고 이
      // effect가 상대방 히스토리를 확보한 뒤 생성하도록 위임한다.
      if (!client.aiSummary && !clientSummaryCache.current[client.id]) {
        fetchClientSummary(client, histories, result);
      }
    });
    return () => { cancelled = true; };
  }, [selectedClient?.linkedProfileId]);

  // 실제 가입 회원과 연결된 담당자(linked_profile_id)들의 소속 부서를 Supabase Realtime으로
  // 실시간 반영 — 회사 관리자가 부서를 바꾸면 이 화면을 새로고침하지 않아도 즉시 갱신된다.
  const linkedProfileIds = useMemo(
    () => clients.map((c) => c.linkedProfileId).filter(Boolean),
    [clients]
  );
  const { departmentByProfileId } = useLiveDepartments(linkedProfileIds);

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
    if (activeTab === 'all') {
      const aFav = favorites.includes(a.id);
      const bFav = favorites.includes(b.id);
      if (aFav !== bFav) return aFav ? -1 : 1;
    }
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

  function handlePickFromContacts() {
    // 안드로이드에서 Modal은 각각 별도의 네이티브 Dialog로 렌더링되어, 한 배치(같은 핸들러) 안에서
    // showSourcePicker를 false로 하고 showContactPicker를 true로 하면 두 번째 모달이 렌더링되지 않는
    // 레이스 컨디션이 발생함 — setTimeout으로 다음 모달 오픈을 다음 tick 이후로 미뤄서 회피
    setShowSourcePicker(false);
    setTimeout(async () => {
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
        fields: [Contacts.Fields.PhoneNumbers, Contacts.Fields.Name, Contacts.Fields.Company, Contacts.Fields.JobTitle, Contacts.Fields.Emails],
      });

      const withPhone = data
        .filter((c) => c.name && c.phoneNumbers?.length > 0)
        .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
      setContactList(withPhone);
      setContactLoading(false);
    }, 300);
  }

  function selectContact(contact) {
    const rawNumber = contact.phoneNumbers?.[0]?.number || '';
    const phone = rawNumber.replace(/[^\d-]/g, '');
    setNewName(contact.name || '');
    setNewContact(phone);
    setNewCompany(contact.company || '');
    setNewRole(contact.jobTitle || '');
    setNewEmail(contact.emails?.[0]?.email || '');
    setNewLinkedProfileId(null);
    setShowContactPicker(false);
    setContactSearch('');
    setShowAddClient(true);
  }

  // "기존 회원 검색" — discoverable=true(옵트인)로 설정한 가입 회원만 대상으로 검색한다.
  // 검색어가 비어있으면 searchDiscoverableProfiles()가 API 호출 없이 빈 배열을 반환한다.
  async function handleSearchMembers() {
    const q = memberSearchQuery.trim();
    if (!q) return;
    setMemberSearchLoading(true);
    try {
      const results = await searchDiscoverableProfiles(q);
      setMemberSearchResults(results);
    } finally {
      setMemberSearchLoading(false);
      setMemberSearchDone(true);
    }
  }

  function closeMemberSearch() {
    setShowMemberSearch(false);
    setMemberSearchQuery('');
    setMemberSearchResults([]);
    setMemberSearchDone(false);
  }

  // 검색 결과에서 회원을 선택하면 "직접 입력" 폼을 거치지 않고, DB에 저장된 회원 데이터(연락처
  // 포함) 그대로 담당자 목록에 즉시 추가한다. 이 회원은 이미 discoverable 옵트인으로 검색 노출과
  // 담당자 자동 추가에 동의한 상태이므로 별도 확인 절차 없이 진행한다(사용자 명시적 결정 —
  // patch_search_discoverable_profiles_add_contact.sql 참고). member.contact가 비어있어도
  // (본인 프로필에 연락처를 입력하지 않은 회원) 빈 문자열로 그대로 추가하며 별도 에러 처리는 하지
  // 않는다 — clients.contact는 not null이지만 빈 문자열은 허용된다.
  async function selectMemberResult(member) {
    if (memberAddLoading) return;
    // 검색 결과에는 이미 담당자로 등록된 회원도 그대로 나타날 수 있어(재검색 등), 다시 선택해도
    // 중복 담당자가 생기지 않도록 linkedProfileId 기준으로 먼저 걸러낸다.
    if (clients.some((c) => c.linkedProfileId === member.id)) {
      Alert.alert('이미 등록됨', `${member.name}님은 이미 담당자로 등록되어 있습니다.`);
      return;
    }
    setMemberAddLoading(true);
    try {
      const updated = await addClient({
        name: member.name || '',
        company: member.team || '',
        role: member.role || '',
        contact: member.contact || '',
        workContact: '',
        email: member.email || '',
        sns: '',
        notes: '',
        linkedProfileId: member.id,
      });
      setClients(updated);
      closeMemberSearch();
      Alert.alert('추가 완료', `${member.name}님을 담당자에 추가했습니다.`);
    } finally {
      setMemberAddLoading(false);
    }
  }

  function handleParsePastedContacts() {
    const { contacts, failedCount } = parsePastedContacts(pasteText);
    if (contacts.length === 0) {
      Alert.alert('인식 실패', '인식된 연락처가 없습니다.');
      return;
    }
    setShowPasteContacts(false);
    setPasteText('');
    if (failedCount > 0) {
      Alert.alert('일부 제외됨', `${failedCount}건은 전화번호를 인식하지 못해 제외되었습니다.`);
    }
    if (contacts.length === 1) {
      // 1건이면 연락처 선택 화면(showContactPicker)을 거치지 않고 바로 담당자 추가 폼으로 진입한다.
      // 안드로이드 Modal 레이스 컨디션(handlePickFromContacts와 동일) 회피 — 다음 모달은 지연 오픈
      setTimeout(() => selectContact(contacts[0]), 300);
      return;
    }
    setContactList(contacts);
    // 안드로이드 Modal 레이스 컨디션(handlePickFromContacts와 동일) 회피 — 다음 모달은 지연 오픈
    setTimeout(() => setShowContactPicker(true), 300);
  }

  async function handleAddClient() {
    if (!newName.trim() || !newCompany.trim() || !newContact.trim()) {
      Alert.alert('필수 항목 누락', '담당자 이름, 회사명, 연락처는 필수 입력 항목입니다.\n모두 입력 후 추가해주세요.');
      return;
    }
    if (!PHONE_REGEX.test(newContact.trim())) {
      Alert.alert('연락처 형식 오류', '올바른 전화번호 형식이 아닙니다. (예: 010-1234-5678)');
      return;
    }
    if (newWorkContact.trim() && !PHONE_REGEX.test(newWorkContact.trim())) {
      Alert.alert('연락처 형식 오류', '올바른 전화번호 형식이 아닙니다. (예: 010-1234-5678)');
      return;
    }
    if (newEmail.trim() && !newEmail.trim().includes('@')) {
      Alert.alert('이메일 형식 오류', '올바른 이메일 형식이 아닙니다.');
      return;
    }
    if (newNotes.trim().length > NOTES_MAX_LENGTH) {
      Alert.alert('입력 길이 초과', `메모는 최대 ${NOTES_MAX_LENGTH}자까지 입력 가능합니다.`);
      return;
    }
    const updated = await addClient({
      name: newName.trim(), company: newCompany.trim(), role: newRole.trim(), contact: newContact.trim(),
      workContact: newWorkContact.trim(), email: newEmail.trim(), sns: newSns.trim(), notes: newNotes.trim(),
      ...(newLinkedProfileId ? { linkedProfileId: newLinkedProfileId } : {}),
    });
    setClients(updated);
    setShowAddClient(false);
    setNewName(''); setNewCompany(''); setNewRole(''); setNewContact(''); setNewWorkContact(''); setNewEmail(''); setNewSns(''); setNewNotes(''); setNewLinkedProfileId(null);
  }

  function openEditClient(client) {
    setNewName(client.name);
    setNewCompany(client.company);
    setNewRole(client.role || '');
    setNewContact(client.contact || '');
    setNewWorkContact(client.workContact || '');
    setNewEmail(client.email || '');
    setNewSns(client.sns || '');
    setNewNotes(client.notes || '');
    setShowEditClient(true);
  }

  async function handleEditClient() {
    if (!newName.trim() || !newCompany.trim() || !newContact.trim()) {
      Alert.alert('필수 항목 누락', '담당자 이름, 회사명, 연락처는 필수 입력 항목입니다.');
      return;
    }
    if (!PHONE_REGEX.test(newContact.trim())) {
      Alert.alert('연락처 형식 오류', '올바른 전화번호 형식이 아닙니다. (예: 010-1234-5678)');
      return;
    }
    if (newWorkContact.trim() && !PHONE_REGEX.test(newWorkContact.trim())) {
      Alert.alert('연락처 형식 오류', '올바른 전화번호 형식이 아닙니다. (예: 010-1234-5678)');
      return;
    }
    if (newEmail.trim() && !newEmail.trim().includes('@')) {
      Alert.alert('이메일 형식 오류', '올바른 이메일 형식이 아닙니다.');
      return;
    }
    if (newNotes.trim().length > NOTES_MAX_LENGTH) {
      Alert.alert('입력 길이 초과', `메모는 최대 ${NOTES_MAX_LENGTH}자까지 입력 가능합니다.`);
      return;
    }
    const updated = await updateClient(selectedClient.id, { name: newName.trim(), company: newCompany.trim(), role: newRole.trim(), contact: newContact.trim(), workContact: newWorkContact.trim(), email: newEmail.trim(), sns: newSns.trim(), notes: newNotes.trim() });
    setClients(updated);
    const updatedClient = updated.find((c) => c.id === selectedClient.id);
    setSelectedClient(updatedClient);
    setShowEditClient(false);
    setNewName(''); setNewCompany(''); setNewRole(''); setNewContact(''); setNewWorkContact(''); setNewEmail(''); setNewSns(''); setNewNotes('');
  }

  function handleHistoriesChange(updated) {
    setHistories(updated);
    fetchClientSummary(selectedClient, updated);
  }

  function handleTopicsChange(updated) {
    setTopics(updated);
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
      const reply = await askClaude(apiMessages, systemPrompt, { raw: true });

      // 메일 초안 요청인지 먼저 확인 — JSON을 fixForeignWordsInText에 통째로 넣으면
      // AI가 자연어로 다시 써버려 파싱이 깨지므로, 파싱 후 subject/body 필드만 교정한다.
      const jsonMatch = reply.match(/\{[\s\S]*"action"\s*:\s*"draft_email"[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = parseLooseJson(jsonMatch[0]);
        if (parsed) {
          if (parsed.action === 'draft_email' && parsed.clientId && parsed.subject && parsed.body) {
            const draftClient = clients.find((c) => c.id === parsed.clientId);
            const clientName = draftClient?.name || '담당자';
            let subject = parsed.subject;
            let body = parsed.body;
            try {
              subject = await fixForeignWordsInText(subject);
              body = await fixForeignWordsInText(body);
            } catch {
              subject = stripForeignScripts(subject);
              body = stripForeignScripts(body);
            }
            setChatMessages([...history, {
              role: 'assistant',
              kind: 'emailDraft',
              clientId: parsed.clientId,
              clientName,
              subject,
              body,
              text: `${clientName}에게 보낼 메일 초안입니다. 확인 후 발송해주세요.`,
            }]);
            return;
          }
        }
        // parsed가 null이거나 draft_email 형태가 아니면 아래 일반 텍스트 응답 경로로 폴백
      }

      let fixedReply = reply;
      try {
        fixedReply = await fixForeignWordsInText(reply);
      } catch {
        // 외국어 교정 실패는 채팅 응답 자체 실패로 이어지지 않도록 원본 응답을 그대로 사용
        fixedReply = stripForeignScripts(fixedReply);
      }
      setChatMessages([...history, { role: 'assistant', text: fixedReply }]);
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

  async function handleFixMessageForeignWords(index) {
    if (fixingMsgIndex !== null) return;
    setFixingMsgIndex(index);
    try {
      const msg = chatMessages[index];
      if (msg.kind === 'emailDraft') {
        // 메일 초안은 subject/body가 별도 필드라 text 하나만 고쳐서는 반영되지 않으므로 둘을 함께 교정한다.
        let subject, body;
        try {
          [subject, body] = await Promise.all([
            fixForeignWordsInText(msg.subject),
            fixForeignWordsInText(msg.body),
          ]);
        } catch {
          subject = stripForeignScripts(msg.subject);
          body = stripForeignScripts(msg.body);
        }
        setChatMessages((prev) => prev.map((m, i) => (i === index ? { ...m, subject, body } : m)));
        return;
      }
      const original = msg.text;
      let fixed;
      try {
        fixed = await fixForeignWordsInText(original);
      } catch {
        // 외국어 교정 실패는 메시지 자체를 지우지 않고, 한자·일본어 가나만 결정적으로 제거
        fixed = stripForeignScripts(original);
      }
      setChatMessages((prev) => prev.map((m, i) => (i === index ? { ...m, text: fixed } : m)));
    } finally {
      setFixingMsgIndex(null);
    }
  }

  function handleDraftFieldChange(index, field, value) {
    setChatMessages((prev) => prev.map((m, i) => (i === index ? { ...m, [field]: value } : m)));
  }

  function handleSendDraftEmail(index) {
    const msg = chatMessages[index];
    if (!msg || msg.kind !== 'emailDraft' || msg.sent || sendingEmailIndex !== null) return;
    Alert.alert(
      '메일 발송',
      `${msg.clientName}님에게 아래 내용으로 메일을 보내시겠습니까?\n\n제목: ${msg.subject}`,
      [
        { text: '취소', style: 'cancel' },
        {
          text: '발송',
          onPress: async () => {
            setSendingEmailIndex(index);
            try {
              await sendClientEmail(msg.clientId, msg.subject, msg.body);
              setChatMessages((prev) => prev.map((m, i) => (i === index ? { ...m, sent: true } : m)));
              Alert.alert('메일 발송 완료', `${msg.clientName}님에게 메일을 발송했습니다.`);
            } catch (e) {
              Alert.alert('메일 발송 실패', e.message || '알 수 없는 오류가 발생했습니다.');
            } finally {
              setSendingEmailIndex(null);
            }
          },
        },
      ]
    );
  }

  // AI 요약 for selected client
  const [clientSummary, setClientSummary] = useState('');
  const [summaryLoading, setSummaryLoading] = useState(false);
  // clientId -> 마지막으로 받은 AI 요약 텍스트 캐시 — 모달을 다시 열 때마다 API 재호출 방지
  // 히스토리 추가/수정/삭제 시 fetchClientSummary가 다시 호출되어 해당 clientId 캐시가 최신값으로 갱신됨
  const clientSummaryCache = useRef({});

  const [showHistoryAI, setShowHistoryAI] = useState(false);
  const [historySummary, setHistorySummary] = useState('');
  const [historySummaryLoading, setHistorySummaryLoading] = useState(false);

  async function fetchClientSummary(client, histList, mutualList) {
    setClientSummary('');
    setSummaryLoading(true);
    try {
      const clientHistList = (histList || histories).filter((h) => h.clientId === client.id);
      // 상호 등록 담당자의 경우, 상대방이 기록한 히스토리(mutualHistory)도 함께 반영해 관계 요약이
      // 내 기록에만 치우치지 않도록 한다. buildClientSystem이 h.clientId로 필터링하므로 client.id를
      // 맞춰주고, AI가 출처를 구분하도록 제목 앞에 표시한다.
      const mutualHistList = (mutualList ?? mutualHistory).map((h) => ({
        ...h, clientId: client.id, title: `[상대방 기록] ${h.title}`,
      }));
      const combinedHistList = [...clientHistList, ...mutualHistList];
      const systemPrompt = buildClientSystem([client], combinedHistList);
      const lastWord = client.role?.trim() || client.name;
      const particle = josa과와(lastWord);
      const nameWithRole = client.role?.trim() ? `${client.name} ${client.role}` : client.name;
      const reply = await askClaude([{ role: 'user', content: `${client.company} ${nameWithRole}${particle}의 관계를 3~4문장으로 자연스럽게 요약해줘. 마지막 연락 날짜, 현재 상황, 다음 필요한 액션을 포함해줘. 메모에 기록된 내용도 반드시 참고해줘. 반드시 한국어로만 작성해줘.` }], systemPrompt, { raw: true });
      let fixedReply = reply;
      try {
        fixedReply = await fixForeignWordsInText(reply);
      } catch {
        // 외국어 교정 실패는 요약 자체 실패로 이어지지 않도록 원본 응답을 그대로 사용
        fixedReply = stripForeignScripts(fixedReply);
      }
      const normalized = normalizeAIDates(fixedReply);
      clientSummaryCache.current[client.id] = normalized;
      setClientSummary(normalized);
      // DB에 저장해 웹/모바일 등 다른 기기에서도 동일한 요약을 그대로 보게 한다 (기기별 재생성 방지)
      try {
        const updated = await updateClient(client.id, { aiSummary: normalized });
        setClients(updated);
      } catch {
        // 요약 저장 실패는 화면 표시(방금 생성된 텍스트)를 막지 않는다. 다음 갱신 때 다시 시도됨.
      }
    } catch (e) {
      setClientSummary(e.message === 'API_KEY_MISSING' ? '설정 탭에서 API 키를 입력하면 AI 요약을 볼 수 있습니다.' : `오류: ${e.message}`);
    } finally {
      setSummaryLoading(false);
    }
  }

  function openClient(client) {
    setSelectedClient(client);
    // client.aiSummary는 탭 포커스마다 load()가 getClients()로 다시 받아오는 DB 최신값이므로
    // 메모리 캐시(clientSummaryCache)보다 우선한다. 그렇지 않으면 다른 기기(웹/모바일)에서
    // 새로 생성/저장한 요약이 있어도, 이 세션에서 예전에 캐시해 둔 값이 계속 표시된다.
    if (client.aiSummary) {
      clientSummaryCache.current[client.id] = client.aiSummary;
      setClientSummary(client.aiSummary);
      setSummaryLoading(false);
      return;
    }
    const cached = clientSummaryCache.current[client.id];
    if (cached) {
      setClientSummary(cached);
      setSummaryLoading(false);
    } else if (!client.linkedProfileId) {
      setClientSummary('');
      fetchClientSummary(client);
    } else {
      // client.linkedProfileId가 있으면 상대방 히스토리 로딩 useEffect가 완료된 뒤 생성하도록
      // 위임한다(상호 등록 담당자는 상대방 히스토리까지 반영해야 하므로 여기서 미리 생성하지 않음).
      // 이전에 선택했던 담당자의 요약 텍스트가 잠깐 남아 보이지 않도록 먼저 비워둔다.
      setClientSummary('');
      setSummaryLoading(true);
    }
  }

  async function fetchHistorySummary() {
    setHistorySummary('');
    setHistorySummaryLoading(true);
    try {
      // clients/histories는 이미 컴포넌트 state에 로드되어 있으므로 재조회하지 않고 그대로 사용
      const systemPrompt = buildClientSystem(clients, histories);
      const reply = await askClaude(
        [{ role: 'user', content: `등록된 모든 담당자 인원의 관계 히스토리를 종합해서 보고서 형식으로 작성해줘. 각 담당자별로 현재 관계 상태, 마지막 연락 시점, 주요 히스토리 요약, 다음에 필요한 액션을 포함해줘. 메모에 기록된 내용도 반드시 참고해줘. 히스토리가 없는 담당자는 간략히 언급만 해줘. 반드시 한국어로만 작성해줘.` }],
        systemPrompt,
        { raw: true }
      );
      let fixedReply = reply;
      try {
        fixedReply = await fixForeignWordsInText(reply);
      } catch {
        // 외국어 교정 실패는 요약 자체 실패로 이어지지 않도록 원본 응답을 그대로 사용
        fixedReply = stripForeignScripts(fixedReply);
      }
      setHistorySummary(normalizeAIDates(fixedReply));
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
    // loaded가 false면(최초 load() 완료 전) 대기 — clients/histories가 아직 빈 배열인
    // 상태로 fetchHistorySummary가 실행되어 부정확한 AI 요약이 생성되는 것을 방지
    if (!showHistoryAI || !loaded || historySummary || historySummaryLoading) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 위 가드가 무한루프를 방지하는 조건부 데이터 페치 패턴
    fetchHistorySummary();
  }, [showHistoryAI, loaded]);

  // 담당자 수정 폼 필드 — 모바일 하단 모달과 PC 전용 수정 팝업이 그대로 공유한다(중복 정의 방지).
  function renderClientEditFields() {
    return (
      <>
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
        <TextInput style={s.input} value={newContact} onChangeText={(v) => setNewContact(fmtPhone(v))} placeholder="010-0000-0000" placeholderTextColor={C.textDim} keyboardType="phone-pad" />
        <Text style={[s.inputLabel, s.inputLabelSpacing]}>직장 연락처</Text>
        <TextInput style={s.input} value={newWorkContact} onChangeText={(v) => setNewWorkContact(fmtPhone(v))} placeholder="02-0000-0000" placeholderTextColor={C.textDim} keyboardType="phone-pad" />
        <Text style={[s.inputLabel, s.inputLabelSpacing]}>이메일</Text>
        <TextInput style={s.input} value={newEmail} onChangeText={setNewEmail} placeholder="example@company.com" placeholderTextColor={C.textDim} keyboardType="email-address" autoCapitalize="none" />
        <Text style={[s.inputLabel, s.inputLabelSpacing]}>SNS 계정</Text>
        <TextInput style={s.input} value={newSns} onChangeText={setNewSns} placeholder="instagram.com/company" placeholderTextColor={C.textDim} autoCapitalize="none" />
        <Text style={[s.inputLabel, s.inputLabelSpacing]}>메모</Text>
        <TextInput style={s.input} value={newNotes} onChangeText={setNewNotes} placeholder="특이사항" placeholderTextColor={C.textDim} />

        <View style={s.modalBtns}>
          <TouchableOpacity style={s.modalConfirmEqual} onPress={handleEditClient}>
            <Text style={s.modalConfirmText}>저장</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.modalCancel} onPress={() => { setShowEditClient(false); setNewName(''); setNewCompany(''); setNewRole(''); setNewContact(''); setNewWorkContact(''); setNewEmail(''); setNewSns(''); setNewNotes(''); }}>
            <Text style={s.modalCancelText}>취소</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  }

  // PC 마스터-디테일 패널에서 담당자 카드 클릭 시 상세 내용을 렌더링(모바일 바텀시트 모달과 완전히
  // 동일한 내용을 우측 인라인 패널에서도 재사용). 바깥 껍데기(Modal vs 고정 패널)만 호출부에서 분기한다.
  function renderClientDetailBody() {
    return (
      <>
        <View style={s.detailHeader}>
          <View style={s.detailAvatar}>
            <Text style={s.detailAvatarText}>{selectedClient?.name?.[0]}</Text>
          </View>
          <View style={commonStyles.flex1}>
            <View style={s.nameStarRow}>
              <Text style={s.detailName}>{selectedClient?.name}</Text>
              <TouchableOpacity onPress={() => selectedClient && handleToggleFavorite(selectedClient.id)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                <Text style={[s.detailStarIcon, selectedClient && favorites.includes(selectedClient.id) && s.starIconActive]}>
                  {selectedClient && favorites.includes(selectedClient.id) ? '★' : '☆'}
                </Text>
              </TouchableOpacity>
            </View>
            <Text style={s.detailCompany}>
              {[
                selectedClient?.company,
                selectedClient?.linkedProfileId ? departmentByProfileId[selectedClient.linkedProfileId] : null,
                selectedClient?.role,
              ].filter(Boolean).join(' · ')}
            </Text>
          </View>
          <View style={s.editCloseRow}>
            <TouchableOpacity onPress={() => openEditClient(selectedClient)} style={s.editClientBtn}>
              <Text style={s.editClientBtnText}>수정</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                Alert.alert('삭제', `"${selectedClient?.name}" 담당자를 삭제할까요?`, [
                  { text: '취소', style: 'cancel' },
                  {
                    text: '삭제',
                    style: 'destructive',
                    onPress: async () => {
                      setClients(await deleteClient(selectedClient.id));
                      setSelectedClient(null);
                    },
                  },
                ]);
              }}
              style={s.deleteClientBtn}
            >
              <Text style={s.deleteClientBtnText}>삭제</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => setSelectedClient(null)}>
              <Text style={s.closeBtn}>✕</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 연락처 */}
        {(selectedClient?.contact || selectedClient?.workContact || selectedClient?.email || selectedClient?.sns) && (
          <View style={s.contactSection}>
            {(() => {
              // "직장" 연락처는 개인 연락처와 이메일이 모두 함께 있을 때만, 아랫줄 이메일
              // 텍스트가 끝나는 x좌표에 맞춰 절대 위치로 정렬한다(실측 기반). 조건이 안 맞으면
              // 기존처럼 개인 연락처 옆에 자연스럽게 흐른다.
              const alignWorkToEmail = !!(selectedClient.contact && selectedClient.workContact && selectedClient.email);
              // 이메일 폭·컨테이너 폭·"직장" 박스 자체 폭을 모두 실측한 뒤에만 위치를 확정한다.
              // 그 전까지는 opacity 0으로 숨겨 잘못된 위치가 잠깐 보이는 것을 막는다.
              const measured = emailRowWidth != null && contactPairWidth != null && workRowWidth != null;
              const workLeft = measured ? Math.max(0, Math.min(emailRowWidth, contactPairWidth - workRowWidth)) : 0;
              return (selectedClient.contact || selectedClient.workContact) ? (
                <View style={s.contactPairRow} onLayout={(e) => setContactPairWidth(e.nativeEvent.layout.width)}>
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
                    <View
                      onLayout={(e) => setWorkRowWidth(e.nativeEvent.layout.width)}
                      style={[
                        s.contactRow,
                        alignWorkToEmail && {
                          position: 'absolute',
                          top: 0,
                          left: workLeft,
                          opacity: measured ? 1 : 0,
                        },
                      ]}
                    >
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
              ) : null;
            })()}
            {selectedClient.email ? (
              <View style={s.contactRow} onLayout={(e) => setEmailRowWidth(e.nativeEvent.layout.width)}>
                <Text style={s.contactLabel}>이메일</Text>
                <TouchableOpacity onPress={() => Alert.alert(
                  '메일 보내기',
                  `${selectedClient.name}(${selectedClient.email})에게 메일을 보내시겠습니까?`,
                  [
                    { text: '취소', style: 'cancel' },
                    { text: '메일 보내기', onPress: () => Linking.openURL(`mailto:${selectedClient.email}`) },
                  ]
                )}>
                  <Text style={s.contactNumber}>{selectedClient.email}</Text>
                </TouchableOpacity>
              </View>
            ) : null}
            {selectedClient.sns ? (
              <View style={s.contactRow}>
                <Text style={s.contactLabel}>SNS</Text>
                <TouchableOpacity onPress={() => Alert.alert(
                  'SNS로 이동',
                  `${selectedClient.name}님의 SNS 계정으로 이동하시겠습니까?\n\n${selectedClient.sns}`,
                  [
                    { text: '취소', style: 'cancel' },
                    { text: '이동', onPress: () => Linking.openURL(/^https?:\/\//i.test(selectedClient.sns) ? selectedClient.sns : `https://${selectedClient.sns}`) },
                  ]
                )}>
                  <Text style={s.contactNumber}>{selectedClient.sns}</Text>
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
            <TouchableOpacity
              style={s.summaryRefreshBtn}
              disabled={summaryLoading}
              onPress={() => fetchClientSummary(selectedClient, histories, mutualHistory)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[s.summaryRefreshText, summaryLoading && commonStyles.opacity40]}>⟳ 새로고침</Text>
            </TouchableOpacity>
          </View>
          {summaryLoading
            ? <ActivityIndicator size="small" color={C.accentTeal} style={commonStyles.mt8} />
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

        <ClientHistorySection client={selectedClient} histories={histories} mutualHistories={mutualHistory} mutualTopics={mutualTopics} topics={topics} onHistoriesChange={handleHistoriesChange} onTopicsChange={handleTopicsChange}>
          {/* 연결된 회의록 */}
          {(() => {
            const linked = meetingRecords.filter((r) => r.clientIds?.includes(selectedClient?.id));
            if (!linked.length) return null;
            return (
              <View style={[s.linkedSection, commonStyles.mt16]}>
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
        </ClientHistorySection>
      </>
    );
  }

  // 프로젝트 상세 콘텐츠 — 모바일 하단 바텀시트 모달과 PC 중앙 팝업이 그대로 공유한다(중복 정의 방지).
  // 호출부(양쪽 모두)에서 selectedProject가 있을 때만 렌더링되도록 이미 감싸져 있지만, 방어적으로
  // 여기서도 null이면 아무것도 렌더링하지 않는다.
  function renderProjectDetailBody() {
    if (!selectedProject) return null;
    return (
      <>
        <View style={s.projDetailHeader}>
          <View style={commonStyles.flex1}>
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
          <TouchableOpacity onPress={() => setSelectedProject(null)} style={commonStyles.ml8}>
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
                  <View key={c.id} style={[s.projPersonRow, idx < people.length - 1 && commonStyles.borderBottom]}>
                    <View style={s.clientAvatar}>
                      <Text style={s.clientAvatarText}>{c.name[0]}</Text>
                    </View>
                    <View style={commonStyles.flex1}>
                      <Text style={s.clientName}>{c.name}</Text>
                      {c.company ? (
                        <Text style={s.clientRole}>
                          {[c.company, c.linkedProfileId ? departmentByProfileId[c.linkedProfileId] : null, c.role].filter(Boolean).join(' · ')}
                        </Text>
                      ) : null}
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
          <View style={commonStyles.spacerH20} />
        </ScrollView>
      </>
    );
  }

  // 담당자 목록 카드 — PC(좌측 컬럼)와 모바일(전체 목록) 양쪽에서 동일하게 재사용
  function renderClientCard(client) {
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
            <Text style={s.clientCompany}>
              {client.company}
              {client.linkedProfileId && departmentByProfileId[client.linkedProfileId] ? ` · ${departmentByProfileId[client.linkedProfileId]}` : ''}
            </Text>
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
  }

  // 검색창 + 탭(전체/즐겨찾기, 정렬) — PC 좌측 컬럼과 모바일 전체 폭 양쪽에서 동일하게 재사용.
  // 자체 width를 지정하지 않으므로 실제 폭은 호출부의 부모 컨테이너(클라이언트 목록 컬럼 vs 루트)에 따라 결정된다.
  function renderSearchAndTabs() {
    return (
      <>
        <View style={s.searchWrap}>
          <TextInput style={s.searchInput} value={search} onChangeText={setSearch} placeholder="담당자 또는 회사명 검색" placeholderTextColor={C.textDim} />
          <TouchableOpacity style={s.searchAddBtn} onPress={() => setShowSourcePicker(true)}>
            <Text style={s.searchAddBtnText}>+</Text>
          </TouchableOpacity>
        </View>

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
          <View style={commonStyles.flex1} />
          <TouchableOpacity style={[s.sortBtn, sortOrder === 'asc' && s.sortBtnActive]} onPress={() => setSortOrder('asc')}>
            <Text style={[s.sortBtnText, sortOrder === 'asc' && s.sortBtnTextActive]}>가↑</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.sortBtn, sortOrder === 'desc' && s.sortBtnActive]} onPress={() => setSortOrder('desc')}>
            <Text style={[s.sortBtnText, sortOrder === 'desc' && s.sortBtnTextActive]}>가↓</Text>
          </TouchableOpacity>
        </View>
      </>
    );
  }

  const showDetailPanel = IS_PC;

  return (
    <View style={s.root}>
      {/* ── 헤더 ── */}
      <View style={[s.header, { paddingTop: insets.top + 16 }]}>
        <Text style={s.headerTitle}>담당자 관리</Text>
        <TouchableOpacity style={s.aiBtn} onPress={() => setShowAI(true)}>
          <Text style={s.aiBtnText}>✦ AI</Text>
        </TouchableOpacity>
      </View>

      {/* ── 검색+탭+목록 (PC: 좌우 50:50 분할 + 우측 상세 패널 / 모바일: 기존과 동일) ── */}
      {showDetailPanel ? (
        <View style={s.clientBodyPC}>
          <View style={s.clientListColumn}>
            {renderSearchAndTabs()}

            <ScrollView style={s.list} contentContainerStyle={s.listContent} showsVerticalScrollIndicator={false}>
              {filteredClients.map(renderClientCard)}
            </ScrollView>
          </View>

          <View style={s.detailPanel}>
            {selectedClient ? renderClientDetailBody() : (
              <View style={s.detailPanelEmpty}>
                <Text style={s.detailPanelEmptyText}>담당자를 선택하세요</Text>
              </View>
            )}
          </View>
        </View>
      ) : (
        <>
          {renderSearchAndTabs()}

          {/* ── 담당자 목록 ── */}
          <ScrollView style={s.list} contentContainerStyle={s.listContent} showsVerticalScrollIndicator={false}>
            {filteredClients.map(renderClientCard)}
          </ScrollView>
        </>
      )}

      {/* ── 입력 방식 선택 ── */}
      <Modal visible={showSourcePicker} animationType="fade" transparent onRequestClose={() => setShowSourcePicker(false)}>
        <View style={s.centerModalOverlay}>
          <View style={s.centerModalCard}>
            <View style={s.chatHeader}>
              <Text style={s.modalTitle}>담당자 추가</Text>
              <TouchableOpacity onPress={() => setShowSourcePicker(false)}>
                <Text style={s.closeBtn}>✕</Text>
              </TouchableOpacity>
            </View>
            <TouchableOpacity style={s.sourceOption} onPress={() => { setShowSourcePicker(false); setNewLinkedProfileId(null); setTimeout(() => setShowAddClient(true), 300); }}>
              <Text style={s.sourceIcon}>✏️</Text>
              <Text style={s.sourceOptionText}>직접 입력</Text>
            </TouchableOpacity>
            <TouchableOpacity style={s.sourceOption} onPress={() => { setShowSourcePicker(false); setTimeout(() => setShowMemberSearch(true), 300); }}>
              <Text style={s.sourceIcon}>🔍</Text>
              <Text style={s.sourceOptionText}>기존 회원 검색</Text>
            </TouchableOpacity>
            {Platform.OS !== 'web' && (
              <TouchableOpacity style={[s.sourceOption, s.noBorderBottom]} onPress={handlePickFromContacts}>
                <Text style={s.sourceIcon}>📱</Text>
                <Text style={s.sourceOptionText}>연락처에서 가져오기</Text>
              </TouchableOpacity>
            )}
            {Platform.OS === 'web' && (
              <TouchableOpacity style={[s.sourceOption, s.noBorderBottom]} onPress={() => { setShowSourcePicker(false); setTimeout(() => setShowPasteContacts(true), 300); }}>
                <Text style={s.sourceIcon}>📋</Text>
                <Text style={s.sourceOptionText}>텍스트로 가져오기</Text>
              </TouchableOpacity>
            )}
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
                    <View style={commonStyles.flex1}>
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

      {/* ── 텍스트 붙여넣기로 가져오기 모달 (웹 전용 진입점) ── */}
      <Modal visible={showPasteContacts} animationType="fade" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.centerModalOverlay}>
          <View style={[s.centerModalCard, commonStyles.maxH90pct]}>
            <View style={s.chatHeader}>
              <Text style={s.modalTitle}>텍스트로 가져오기</Text>
              <TouchableOpacity onPress={() => { setShowPasteContacts(false); setPasteText(''); }}>
                <Text style={s.closeBtn}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={s.pasteHint}>
              한 줄에 한 명씩 입력하세요. 이름·회사·직책·연락처는 공백, 쉼표 등으로 구분합니다.{'\n'}
              예) 홍길동 삼성전자 구매팀장 010-1234-5678
            </Text>
            <TextInput
              style={s.pasteInput}
              value={pasteText}
              onChangeText={setPasteText}
              placeholder={'홍길동 삼성전자 구매팀장 010-1234-5678\n김민준 현대건설 과장 010-2345-6789'}
              placeholderTextColor={C.textDim}
              multiline
              textAlignVertical="top"
            />
            <View style={s.modalBtns}>
              <TouchableOpacity style={s.modalCancel} onPress={() => { setShowPasteContacts(false); setPasteText(''); }}>
                <Text style={s.modalCancelText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.modalConfirm} onPress={handleParsePastedContacts}>
                <Text style={s.modalConfirmText}>다음</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── 기존 회원 검색 모달 ── */}
      <Modal visible={showMemberSearch} animationType="fade" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.centerModalOverlay}>
          <View style={[s.centerModalCard, commonStyles.maxH90pct]}>
            <View style={s.chatHeader}>
              <Text style={s.modalTitle}>기존 회원 검색</Text>
              <TouchableOpacity onPress={closeMemberSearch}>
                <Text style={s.closeBtn}>✕</Text>
              </TouchableOpacity>
            </View>
            <Text style={s.pasteHint}>
              이름·이메일·회사명으로 검색할 수 있습니다. “다른 사용자 검색에 내 정보 노출”을 허용한 회원만 검색 결과에 나타납니다.
            </Text>
            <View style={s.memberSearchRow}>
              <TextInput
                style={[s.searchInput, commonStyles.flex1]}
                value={memberSearchQuery}
                onChangeText={(v) => { setMemberSearchQuery(v); setMemberSearchDone(false); }}
                placeholder="이름, 이메일, 회사명"
                placeholderTextColor={C.textDim}
                autoCapitalize="none"
                returnKeyType="search"
                onSubmitEditing={handleSearchMembers}
              />
              <TouchableOpacity
                style={[s.memberSearchBtn, (!memberSearchQuery.trim() || memberSearchLoading) && commonStyles.opacity40]}
                onPress={handleSearchMembers}
                disabled={!memberSearchQuery.trim() || memberSearchLoading}
              >
                <Text style={s.memberSearchBtnText}>검색</Text>
              </TouchableOpacity>
            </View>
            {memberSearchLoading ? (
              <ActivityIndicator size="large" color={C.accentTeal} style={s.mt24} />
            ) : memberSearchDone && memberSearchResults.length === 0 ? (
              <Text style={[s.emptyText, s.mt24]}>검색 결과가 없습니다.{'\n'}상대방이 검색 노출을 허용하지 않았을 수 있습니다.</Text>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false}>
                {memberSearchResults.map((member) => {
                  // 이미 담당자로 등록된 회원인지 linkedProfileId로 판별 — 배지 표시 및 흐림 처리에 사용
                  const alreadyRegistered = clients.some((c) => c.linkedProfileId === member.id);
                  return (
                    <TouchableOpacity
                      key={member.id}
                      style={[s.contactItem, (memberAddLoading || alreadyRegistered) && commonStyles.opacity40]}
                      onPress={() => selectMemberResult(member)}
                      disabled={memberAddLoading}
                    >
                      <View style={s.clientAvatar}>
                        <Text style={s.clientAvatarText}>{member.name?.[0] || '?'}</Text>
                      </View>
                      <View style={commonStyles.flex1}>
                        <Text style={s.clientName}>{member.name}</Text>
                        <Text style={s.clientRole}>{member.team}{member.role ? ` · ${member.role}` : ''}</Text>
                      </View>
                      {alreadyRegistered && (
                        <View style={s.memberRegisteredBadge}>
                          <Text style={s.memberRegisteredBadgeText}>등록됨</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── 클라이언트 상세 모달 (모바일 전용): PC는 모달 대신 우측 인라인 상세 패널(s.detailPanel)이
          renderClientDetailBody()를 그대로 재사용해 표시한다 ── */}
      <Modal visible={!!selectedClient && !showDetailPanel} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <Animated.View style={[s.modalSheet, s.h90pct, swipeClient.animStyle]}>
            <View style={s.modalHandleWrap} {...swipeClient.panHandlers}>
              <View style={s.modalHandle} />
            </View>
            {renderClientDetailBody()}
          </Animated.View>
        </View>
      </Modal>

      {/* ── 담당자 수정 모달(모바일 전용, 하단 바텀시트): PC(IS_PC)는 대신 아래의 중앙 팝업
          (editPopupOverlay/editPopupCard)을 사용한다. 콘텐츠는 renderClientEditFields()로 공유하므로
          중복 없음. 모바일 동작은 기존과 동일 ── */}
      {!IS_PC && (
      <Modal visible={showEditClient} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.modalOverlay}>
          <View style={[s.modalSheet, commonStyles.maxH90pct]}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>담당자 정보 수정</Text>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={s.scrollPB8}>
              {renderClientEditFields()}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      )}

      {/* ── 담당자 수정 팝업(PC 전용): 하단 바텀시트 대신 화면 중앙에 사면 둥근 모서리로 뜨는 전용
          팝업 스타일(editPopupOverlay/editPopupCard)을 사용한다. 콘텐츠는 renderClientEditFields()로
          모바일 바텀시트와 공유한다(ScheduleScreen "일정 수정 팝업(PC 전용)" 패턴과 동일) ── */}
      {IS_PC && showEditClient && (
      <Modal visible transparent animationType="fade" onRequestClose={() => setShowEditClient(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.editPopupOverlay}>
          <View style={[s.editPopupCard, commonStyles.maxH80pct]}>
            <View style={s.modalTitleRow}>
              <Text style={[s.modalTitle, commonStyles.flex1]} numberOfLines={2}>담당자 정보 수정</Text>
              <TouchableOpacity onPress={() => { setShowEditClient(false); setNewName(''); setNewCompany(''); setNewRole(''); setNewContact(''); setNewWorkContact(''); setNewEmail(''); setNewSns(''); setNewNotes(''); }}>
                <Text style={s.closeBtn}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              {renderClientEditFields()}
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      )}

      {/* ── 담당자 추가 모달 ── */}
      <Modal visible={showAddClient} animationType="fade" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.centerModalOverlay}>
          <View style={[s.centerModalCard, commonStyles.maxH90pct]}>
            <Text style={s.modalTitle}>담당자 추가</Text>
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
              <TextInput style={s.input} value={newContact} onChangeText={(v) => setNewContact(fmtPhone(v))} placeholder="010-0000-0000" placeholderTextColor={C.textDim} keyboardType="phone-pad" />
              <Text style={[s.inputLabel, s.inputLabelSpacing]}>직장 연락처</Text>
              <TextInput style={s.input} value={newWorkContact} onChangeText={(v) => setNewWorkContact(fmtPhone(v))} placeholder="02-0000-0000" placeholderTextColor={C.textDim} keyboardType="phone-pad" />
              <Text style={[s.inputLabel, s.inputLabelSpacing]}>이메일</Text>
              <TextInput style={s.input} value={newEmail} onChangeText={setNewEmail} placeholder="example@company.com" placeholderTextColor={C.textDim} keyboardType="email-address" autoCapitalize="none" />
              <Text style={[s.inputLabel, s.inputLabelSpacing]}>SNS 계정</Text>
              <TextInput style={s.input} value={newSns} onChangeText={setNewSns} placeholder="instagram.com/company" placeholderTextColor={C.textDim} autoCapitalize="none" />
              <Text style={[s.inputLabel, s.inputLabelSpacing]}>메모</Text>
              <TextInput style={s.input} value={newNotes} onChangeText={setNewNotes} placeholder="특이사항" placeholderTextColor={C.textDim} />
            </ScrollView>
            <View style={s.modalBtns}>
              <TouchableOpacity style={s.modalConfirmEqual} onPress={handleAddClient}>
                <Text style={s.modalConfirmText}>저장</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.modalCancel} onPress={() => setShowAddClient(false)}>
                <Text style={s.modalCancelText}>취소</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── AI 담당자 히스토리 종합 모달 ── */}
      <Modal visible={showHistoryAI} animationType="slide" transparent onRequestClose={() => setShowHistoryAI(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, commonStyles.h85pct]}>
            <View style={s.modalHandle} />
            <View style={s.chatHeader}>
              <View style={s.chatHeaderLeft}>
                <Text style={s.aiGlyph}>✦</Text>
                <Text style={s.modalTitle}>AI 담당자 히스토리</Text>
              </View>
              <TouchableOpacity onPress={() => setShowHistoryAI(false)}>
                <Text style={s.closeBtn}>✕</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={commonStyles.flex1} showsVerticalScrollIndicator={false} contentContainerStyle={s.scrollPB24}>
              {historySummaryLoading ? (
                <View style={s.historyAILoading}>
                  <ActivityIndicator size="small" color={C.accentTeal} />
                  <Text style={s.historyAILoadingText}>담당자 히스토리를 분석하는 중...</Text>
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
          <View style={[s.modalSheet, commonStyles.h85pct]}>
            <View style={s.modalHandle} />
            <View style={s.chatHeader}>
              <View style={s.chatHeaderLeft}>
                <Text style={s.aiGlyph}>✦</Text>
                <Text style={s.modalTitle}>AI 담당자 비서</Text>
              </View>
              <TouchableOpacity onPress={() => setShowAI(false)}>
                <Text style={s.closeBtn}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView ref={chatScrollRef} style={s.chatLog} contentContainerStyle={s.chatLogContent} showsVerticalScrollIndicator={false}>
              {chatMessages.map((m, i) => (
                <View key={i} style={[s.bubble, m.role === 'user' ? s.bubbleUser : s.bubbleAI]}>
                  <Text style={[s.bubbleText, m.role === 'user' ? s.bubbleTextUser : s.bubbleTextAI]}>{m.text}</Text>
                  {m.kind === 'emailDraft' && (
                    <View style={s.emailDraftCard}>
                      <Text style={s.emailDraftLabel}>제목</Text>
                      <TextInput
                        style={[s.emailDraftSubject, s.emailDraftSubjectInput, m.sent && s.emailDraftInputSent]}
                        value={m.subject}
                        onChangeText={(t) => handleDraftFieldChange(i, 'subject', t)}
                        editable={!m.sent}
                        placeholderTextColor={C.textDim}
                      />
                      <Text style={s.emailDraftLabel}>본문</Text>
                      <TextInput
                        style={[s.emailDraftBody, s.emailDraftBodyInput, m.sent && s.emailDraftInputSent]}
                        value={m.body}
                        onChangeText={(t) => handleDraftFieldChange(i, 'body', t)}
                        editable={!m.sent}
                        multiline
                        textAlignVertical="top"
                        placeholderTextColor={C.textDim}
                      />
                      {m.sent ? (
                        <Text style={s.emailDraftSentText}>✓ 발송 완료</Text>
                      ) : (
                        <View style={s.emailDraftActionRow}>
                          <TouchableOpacity
                            style={[s.fixForeignBtn, s.fixForeignBtnInRow, fixingMsgIndex !== null && s.fixForeignBtnDisabled]}
                            onPress={() => handleFixMessageForeignWords(i)}
                            disabled={fixingMsgIndex !== null}
                            activeOpacity={0.7}
                          >
                            <Text style={s.fixForeignBtnText}>
                              {fixingMsgIndex === i ? '수정 중…' : '외국어 재수정'}
                            </Text>
                          </TouchableOpacity>
                          <TouchableOpacity
                            style={[s.emailDraftSendBtn, sendingEmailIndex !== null && s.fixForeignBtnDisabled]}
                            onPress={() => handleSendDraftEmail(i)}
                            disabled={sendingEmailIndex !== null}
                            activeOpacity={0.7}
                          >
                            <Text style={s.emailDraftSendBtnText}>
                              {sendingEmailIndex === i ? '발송 중…' : '메일 발송'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  )}
                  {m.role !== 'user' && i > 0 && m.kind !== 'emailDraft' && (
                    <TouchableOpacity
                      style={[s.fixForeignBtn, fixingMsgIndex !== null && s.fixForeignBtnDisabled]}
                      onPress={() => handleFixMessageForeignWords(i)}
                      disabled={fixingMsgIndex !== null}
                      activeOpacity={0.7}
                    >
                      <Text style={s.fixForeignBtnText}>
                        {fixingMsgIndex === i ? '수정 중…' : '외국어 재수정'}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              ))}
              {aiLoading && (
                <View style={s.bubbleAI}>
                  <ActivityIndicator size="small" color={C.accentTeal} />
                </View>
              )}
            </ScrollView>

            <View style={s.chatInputRow}>
              <TextInput style={s.chatInput} value={chatInput} onChangeText={setChatInput} placeholder="담당자에 대해 물어보세요..." placeholderTextColor={C.textDim} onSubmitEditing={handleAIChat} returnKeyType="send" />
              <TouchableOpacity style={[s.sendBtn, !chatInput.trim() && commonStyles.opacity40]} onPress={handleAIChat} disabled={!chatInput.trim() || aiLoading}>
                <Text style={s.sendBtnText}>↑</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      {/* ── 프로젝트 상세 모달(모바일 전용, 하단 바텀시트): PC(IS_PC)는 대신 아래의 중앙 팝업
          (editPopupOverlay/editPopupCard)을 사용한다. 콘텐츠는 renderProjectDetailBody()로 공유하므로
          중복 없음. 모바일 동작은 기존과 동일 ── */}
      {!IS_PC && (
      <Modal visible={!!selectedProject} animationType="slide" transparent onRequestClose={() => setSelectedProject(null)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, commonStyles.maxH85pct]}>
            <View style={s.modalHandle} />
            {renderProjectDetailBody()}
          </View>
        </View>
      </Modal>
      )}

      {/* ── 프로젝트 상세 팝업(PC 전용): 하단 바텀시트 대신 화면 중앙에 사면 둥근 모서리로 뜨는 전용
          팝업 스타일(editPopupOverlay/editPopupCard)을 사용한다. 콘텐츠는 renderProjectDetailBody()로
          모바일 바텀시트와 공유한다(ScheduleScreen의 "일정 수정 팝업(PC 전용)" 패턴과 동일) ── */}
      {IS_PC && !!selectedProject && (
      <Modal visible transparent animationType="fade" onRequestClose={() => setSelectedProject(null)}>
        <View style={s.editPopupOverlay}>
          <View style={[s.editPopupCard, commonStyles.maxH80pct]}>
            {renderProjectDetailBody()}
          </View>
        </View>
      </Modal>
      )}

      {/* ── 회의록 상세 모달 ── */}
      <Modal visible={!!selectedMeetingRecord} animationType="slide" transparent onRequestClose={() => setSelectedMeetingRecord(null)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, commonStyles.maxH90pct]}>
            <View style={s.modalHandle} />
            {selectedMeetingRecord && (
              <>
                <View style={s.meetingDetailHeader}>
                  <View style={commonStyles.flex1}>
                    <Text style={[s.modalTitle, commonStyles.mb0]} numberOfLines={2}>{selectedMeetingRecord.title || '회의록'}</Text>
                    {selectedMeetingRecord.createdAt && (
                      <Text style={s.meetingDetailDate}>
                        {new Date(selectedMeetingRecord.createdAt).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })}
                        {selectedMeetingRecord.source ? ` · ${selectedMeetingRecord.source}` : ''}
                      </Text>
                    )}
                  </View>
                  <TouchableOpacity onPress={() => setSelectedMeetingRecord(null)} style={commonStyles.ml8}>
                    <Text style={s.closeBtn}>✕</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView showsVerticalScrollIndicator={false} style={commonStyles.mt8}>
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
                                    <Text style={[commonStyles.speakerLabel, { color }]}>{seg.speaker}</Text>
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
                    <Text style={[s.emptyText, commonStyles.mt20]}>저장된 내용이 없습니다.</Text>
                  )}
                  <View style={commonStyles.spacerH20} />
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

// 메일 본문처럼 여러 줄인 필드가 있으면 AI가 JSON 문자열 값 안의 줄바꿈을 이스케이프하지
// 않고 그대로 출력하는 경우가 있어 JSON.parse가 깨진다. 원본 그대로 먼저 시도하고,
// 실패하면 남아있는 원본 줄바꿈을 \n으로 치환해 한 번 더 시도한다.
function parseLooseJson(jsonText) {
  try {
    return JSON.parse(jsonText);
  } catch {
    try {
      return JSON.parse(jsonText.replace(/\r\n|\r|\n/g, '\\n'));
    } catch {
      return null;
    }
  }
}

function projDaysUntil(deadlineStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(deadlineStr);
  return Math.round((d - today) / ONE_DAY_MS);
}

function formatHistoryDate(dateStr) {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  return `${y}년 ${m}월 ${d}일`;
}

// 웹(PC)에서 expo-contacts 네이티브 접근이 불가능한 사용자를 위한 텍스트 붙여넣기 파싱.
// 한 줄 = 한 명, 토큰화 후 전화번호 패턴을 찾아 분리하고 나머지를 이름/회사/직책 순으로 채운다.
// handlePickFromContacts가 만드는 contact 객체와 동일한 shape({ id, name, phoneNumbers, company, jobTitle })으로 반환해
// showContactPicker/selectContact가 별도 분기 없이 그대로 재사용할 수 있게 한다.
function parsePastedContacts(text) {
  const phoneRegex = /\d{2,4}-?\d{3,4}-?\d{4}/;
  const lines = text.split('\n').map((l) => l.trim()).filter(Boolean);
  const contacts = [];
  let failedCount = 0;

  lines.forEach((line, index) => {
    const tokens = line.split(/[\s,\t]+/).filter(Boolean);
    const phoneIdx = tokens.findIndex((t) => phoneRegex.test(t));
    if (phoneIdx === -1) {
      failedCount += 1;
      return;
    }
    const phone = tokens[phoneIdx];
    const rest = tokens.filter((_, i) => i !== phoneIdx);
    contacts.push({
      id: `pasted-${Date.now()}-${index}`,
      name: rest[0] || '',
      phoneNumbers: [{ number: phone }],
      company: rest[1] || '',
      jobTitle: rest.slice(2).join(' '),
    });
  });

  return { contacts, failedCount };
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, paddingLeft: IS_PC ? 24 : 0 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 60, paddingHorizontal: 24, paddingBottom: 12 },
  // PC 마스터-디테일 레이아웃: 좌측 목록 컬럼과 우측 상세 패널을 flex:1로 50:50 분할
  clientBodyPC: { flex: 1, flexDirection: 'row' },
  clientListColumn: { flex: 1 },
  detailPanel: { flex: 1, borderLeftWidth: 1, borderLeftColor: C.border, paddingHorizontal: 20, paddingTop: 12 },
  detailPanelEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 100 },
  detailPanelEmptyText: { color: C.textDim, fontSize: 13 },
  headerTitle: { color: C.textPrimary, fontSize: 22, fontWeight: '300', letterSpacing: -0.5 },
  aiBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: C.accentTeal + '22', borderWidth: 1, borderColor: C.accentTeal + '55', borderRadius: 20 },
  aiBtnText: { color: C.accentTeal, fontSize: 12, fontWeight: '600', letterSpacing: 1 },
  searchWrap: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 24, paddingBottom: 12 },
  searchInput: { flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, color: C.textPrimary, fontSize: 13, paddingHorizontal: 16, paddingVertical: 12 },
  searchAddBtn: { width: 44, height: 44, borderRadius: 12, backgroundColor: C.accentTeal, alignItems: 'center', justifyContent: 'center' },
  searchAddBtnText: { color: '#fff', fontSize: 22, lineHeight: 26 },
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
  sourceSheet: Platform.OS === 'web'
    ? { backgroundColor: C.surfaceHigh, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 24, paddingBottom: 40, paddingTop: 12, width: '100%', maxWidth: 480 }
    : { backgroundColor: C.surfaceHigh, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 24, paddingBottom: 40, paddingTop: 12 },
  sourceOption: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  noBorderBottom: { borderBottomWidth: 0 },
  sourceIcon: { fontSize: 20, width: 28, textAlign: 'center' },
  sourceOptionText: { color: C.textPrimary, fontSize: 16 },
  contactItem: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  memberRegisteredBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, borderColor: C.accentTeal + '55', backgroundColor: C.accentTeal + '18' },
  memberRegisteredBadgeText: { color: C.accentTeal, fontSize: 11, fontWeight: '600' },
  pasteHint: { color: C.textDim, fontSize: 11, lineHeight: 16, marginBottom: 12 },
  pasteInput: { flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, color: C.textPrimary, fontSize: 14, paddingHorizontal: 14, paddingVertical: 12, minHeight: 180 },
  memberSearchRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  memberSearchBtn: { paddingHorizontal: 18, borderRadius: 12, backgroundColor: C.accentTeal, alignItems: 'center', justifyContent: 'center' },
  memberSearchBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },

  // Detail Modal
  // 웹에서 Modal은 document.body로 포탈되어 App.js의 480px 폭 제한을 벗어나므로 여기서 다시 맞춘다
  modalOverlay: Platform.OS === 'web'
    ? { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center' }
    : { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  modalSheet: Platform.OS === 'web'
    ? { backgroundColor: C.surfaceHigh, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 24, paddingBottom: 40, paddingTop: 12, width: '100%', maxWidth: 480 }
    : { backgroundColor: C.surfaceHigh, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 24, paddingBottom: 40, paddingTop: 12 },
  modalHandle: { width: 36, height: 4, backgroundColor: C.borderHigh, borderRadius: 2, alignSelf: 'center' },
  modalHandleWrap: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 40, marginBottom: 10 },
  // 담당자 추가 입력 방식 선택 / 실제 입력 폼 모달 전용 (중앙 카드형 팝업 — 다른 모달의 modalOverlay/modalSheet에는 영향 없음)
  centerModalOverlay: Platform.OS === 'web'
    ? { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)' }
    : { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 20 },
  centerModalCard: Platform.OS === 'web'
    ? { backgroundColor: C.surfaceHigh, borderRadius: 20, paddingHorizontal: 24, paddingTop: 20, paddingBottom: 24, width: '100%', maxWidth: 480, maxHeight: '85%' }
    : { backgroundColor: C.surfaceHigh, borderRadius: 20, paddingHorizontal: 24, paddingTop: 20, paddingBottom: 24, width: '100%', maxHeight: '85%' },
  // 프로젝트 상세 팝업(PC 전용) 전용 스타일 — 다른 모달들처럼 하단에 붙는 바텀시트가 아니라 화면
  // 중앙에 사면 모두 둥근 별도 창처럼 띄우기 위해 modalOverlay/modalSheet 대신 사용한다.
  editPopupOverlay: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)', padding: 24 },
  editPopupCard: {
    backgroundColor: C.surfaceHigh, borderRadius: 20, width: '100%', maxWidth: 480,
    paddingHorizontal: 24, paddingTop: 20, paddingBottom: 24,
    ...(Platform.OS === 'web' ? { boxShadow: '0 12px 40px rgba(0,0,0,0.45)' } : {
      shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.45, shadowRadius: 24, elevation: 12,
    }),
  },
  modalTitleRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  detailHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  detailAvatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: C.accentTeal + '33', borderWidth: 1, borderColor: C.accentTeal + '55', alignItems: 'center', justifyContent: 'center' },
  detailAvatarText: { color: C.accentTeal, fontSize: 22, fontWeight: '400' },
  detailName: { color: C.textPrimary, fontSize: 18, fontWeight: '400' },
  detailCompany: { color: C.textSecondary, fontSize: 12, marginTop: 2 },
  contactSection: { flexDirection: 'column', gap: 10, marginBottom: 14 },
  contactPairRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 16, position: 'relative' },
  contactRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  contactLabel: { color: C.textPrimary, fontSize: 12, fontWeight: '500' },
  contactNumber: { color: C.accentBlue, fontSize: 15, fontWeight: '400', textDecorationLine: 'underline' },
  closeBtn: { color: C.textSecondary, fontSize: 18, padding: 4 },
  editClientBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: C.accentBlue + '66', backgroundColor: C.accentBlue + '11' },
  editClientBtnText: { color: C.accentBlue, fontSize: 12, fontWeight: '500' },
  deleteClientBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8, borderWidth: 1, borderColor: C.red + '66', backgroundColor: C.red + '11' },
  deleteClientBtnText: { color: C.red, fontSize: 12, fontWeight: '500' },
  notesBox: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 12, marginBottom: 14 },
  notesLabel: { color: C.textDim, fontSize: 10, letterSpacing: 2, fontWeight: '600', marginBottom: 6 },
  notesText: { color: C.textSecondary, fontSize: 13, lineHeight: 19 },
  summaryBox: { backgroundColor: C.surface + 'CC', borderWidth: 1, borderColor: C.accentTeal + '33', borderRadius: 12, padding: 14, marginBottom: 16 },
  summaryLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  aiGlyph: { color: C.accentTeal, fontSize: 14 },
  summaryLabel: { color: C.accentTeal, fontSize: 10, fontWeight: '600', letterSpacing: 1.5 },
  summaryRefreshBtn: { marginLeft: 'auto' },
  summaryRefreshText: { color: C.textDim, fontSize: 10 },
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
  emptyText: { color: C.textDim, fontSize: 13, textAlign: 'center', paddingTop: 20 },

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
  inputLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 16, marginBottom: 8 },
  inputLabel: { color: C.textDim, fontSize: 10, letterSpacing: 1.5 },
  requiredMark: { color: C.accentTeal, fontSize: 12, lineHeight: 14 },
  input: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, color: C.textPrimary, fontSize: 14, paddingHorizontal: 14, paddingVertical: 12 },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 24 },
  modalCancel: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  modalCancelText: { color: C.textSecondary, fontSize: 14 },
  modalConfirm: { flex: 2, paddingVertical: 14, borderRadius: 12, backgroundColor: C.accentTeal, alignItems: 'center' },
  // 담당자 추가 모달 전용 — 취소 버튼과 크기를 동일하게 맞추기 위해 flex만 1로 낮춘 modalConfirm 변형.
  // modalConfirm은 담당자 수정/텍스트로 가져오기 모달에서도 공유하므로 직접 수정하지 않는다.
  modalConfirmEqual: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: C.accentTeal, alignItems: 'center' },
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
  fixForeignBtn: {
    alignSelf: 'flex-start', marginTop: 8,
    borderWidth: 1, borderColor: C.accentTeal + '55', borderRadius: 7,
    paddingVertical: 5, paddingHorizontal: 8,
  },
  fixForeignBtnInRow: { marginTop: 0 },
  fixForeignBtnText: { color: C.accentTeal, fontSize: 11, fontWeight: '500' },
  fixForeignBtnDisabled: { opacity: 0.4 },
  emailDraftCard: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.border },
  emailDraftLabel: { color: C.textDim, fontSize: 10, letterSpacing: 1, marginBottom: 3 },
  emailDraftSubject: { color: C.textPrimary, fontSize: 13, fontWeight: '600', marginBottom: 8 },
  emailDraftBody: { color: C.textSecondary, fontSize: 13, lineHeight: 20, marginBottom: 12 },
  emailDraftSubjectInput: {
    borderWidth: 1, borderColor: C.border, borderRadius: 8, backgroundColor: C.surface,
    paddingHorizontal: 10, paddingVertical: 8,
  },
  emailDraftBodyInput: {
    borderWidth: 1, borderColor: C.border, borderRadius: 8, backgroundColor: C.surface,
    paddingHorizontal: 10, paddingVertical: 8, minHeight: 100,
  },
  emailDraftInputSent: { borderColor: 'transparent', backgroundColor: 'transparent', paddingHorizontal: 0, paddingVertical: 0 },
  emailDraftActionRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  emailDraftSendBtn: {
    alignSelf: 'flex-start',
    backgroundColor: C.accentTeal, borderRadius: 7,
    paddingVertical: 5, paddingHorizontal: 8,
  },
  emailDraftSendBtnText: { color: '#fff', fontSize: 11, fontWeight: '500' },
  emailDraftSentText: { color: C.accentTeal, fontSize: 12, fontWeight: '500' },
  chatInputRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  chatInput: { flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 24, color: C.textPrimary, fontSize: 14, paddingHorizontal: 18, paddingVertical: 12 },
  sendBtn: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: C.accentTeal },
  sendBtnText: { color: '#fff', fontSize: 18 },
  // Layout helpers
  // Modal height variants
  h80pct: { height: '80%' },
  h90pct: { height: '90%' },
  // Spacing modifiers
  mb12: { marginBottom: 12 },
  mt24: { marginTop: 24 },
  inputLabelSpacing: { marginTop: 16, marginBottom: 8 },
  // Content container padding
  scrollPB8: { paddingBottom: 8 },
  scrollPB24: { paddingBottom: 24 },
  // Row layouts
  nameStarRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  editCloseRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  projDeadlineRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
  // Transcript
  transcriptSegments: { gap: 12 },
});
