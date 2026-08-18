import {
  Text, View, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Modal, KeyboardAvoidingView, Platform, Animated, ActivityIndicator,
} from 'react-native';
import { Alert } from '../utils/alertCompat';
import { useState, useEffect, useRef } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '../theme';
import { commonStyles } from '../styles/common';
import { getMessages, addMessage, addMessageForUser, updateMessage, updateMessageForUser, deleteMessage, getClients } from '../services/storage';
import { askClaude, buildMessageSystem, fixForeignWordsInText, stripForeignScripts } from '../services/claude';
import { useUser } from '../context/UserContext';
import { useSwipeClose } from '../hooks/useSwipeClose';
import { IS_PC } from '../utils/deviceType';

const PRIORITIES = ['긴급', '일반', '낮음'];
const STATUSES = ['미확인', '확인'];
const FILTERS = ['전체', '미확인', '확인'];
const BOXES = [
  { key: 'received', label: '받은 메세지함' },
  { key: 'sent', label: '보낸 메세지함' },
];
const SUBJECT_MAX_LENGTH = 200;
const CONTENT_MAX_LENGTH = 2000;
// AI 도우미 팝업 초기 인사말. bottom-tabs는 탭 전환 시 화면을 unmount하지 않아 chatMessages state가
// 그대로 보존되므로, 팝업을 다시 열 때마다 이 값으로 되돌려 이전 대화가 남아있지 않도록 한다.
const INITIAL_MESSAGE_CHAT_MESSAGE = { role: 'assistant', text: '메세지함에 대해 무엇이든 물어보세요.\n\n예) "미확인 메세지 요약해줘", "긴급 우선순위 메세지 있어?", "OOO회사와 주고받은 내용 정리해줘"' };

function priorityColor(p) {
  return { 긴급: C.red, 일반: C.accentBlue, 낮음: C.textDim }[p] || C.textDim;
}

function statusColor(s) {
  return { 미확인: C.gold, 확인: C.accentBlue }[s] || C.textDim;
}

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const m = Math.floor(diff / 60000);
  if (m < 1) return '방금';
  if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}시간 전`;
  return `${Math.floor(h / 24)}일 전`;
}

export default function MessageScreen() {
  const insets = useSafeAreaInsets();
  const { user } = useUser();
  const [messages, setMessages] = useState([]);
  const [box, setBox] = useState('received');
  const [filter, setFilter] = useState('전체');

  const [showAI, setShowAI] = useState(false);
  const [chatMessages, setChatMessages] = useState([INITIAL_MESSAGE_CHAT_MESSAGE]);
  const [chatInput, setChatInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const chatScrollRef = useRef(null);
  // AI 도우미 팝업을 열 때마다 이전 대화 내역을 초기 인사말로 되돌린다(탭 전환 후 재진입 시 잔존 방지).
  function openAIChat() {
    setChatMessages([INITIAL_MESSAGE_CHAT_MESSAGE]);
    setShowAI(true);
  }

  const [showAdd, setShowAdd] = useState(false);
  const [newSender, setNewSender] = useState('');
  const [newCompany, setNewCompany] = useState('');
  const [newSubject, setNewSubject] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newPriority, setNewPriority] = useState('일반');
  const [newStatus, setNewStatus] = useState('미확인');
  // 'self' 토큰(나) 또는 클라이언트(담당자) id로 이루어진 다중 수신자 선택.
  const [newRecipientIds, setNewRecipientIds] = useState([]);
  const [recipientSearch, setRecipientSearch] = useState('');
  const [clients, setClients] = useState([]);

  const [showDetail, setShowDetail] = useState(false);
  const [detailMsg, setDetailMsg] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editSender, setEditSender] = useState('');
  const [editCompany, setEditCompany] = useState('');
  const [editSubject, setEditSubject] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editPriority, setEditPriority] = useState('일반');
  const [editStatus, setEditStatus] = useState('미확인');
  const [replyMode, setReplyMode] = useState(false);
  const [replySubject, setReplySubject] = useState('');
  const [replyContent, setReplyContent] = useState('');

  const swipeDetail = useSwipeClose(() => { setShowDetail(false); setEditMode(false); setReplyMode(false); }, showDetail);

  async function load() {
    setMessages(await getMessages());
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); getClients().then(setClients); }, []);

  function handleAddPress() {
    setShowAdd(true);
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
      const visibleMessages = messages.filter((m) => {
        const direction = m.direction || 'received';
        if (direction === 'received' && m.toId !== user?.id) return false;
        if (direction === 'sent' && m.fromId && m.fromId !== user?.id) return false;
        return true;
      });
      const systemPrompt = buildMessageSystem(visibleMessages);
      const reply = await askClaude(apiMessages, systemPrompt, { raw: true });
      let fixedReply = reply;
      try {
        fixedReply = await fixForeignWordsInText(reply);
      } catch {
        fixedReply = stripForeignScripts(fixedReply);
      }
      setChatMessages([...history, { role: 'assistant', text: fixedReply }]);
    } catch (e) {
      const errText = e.message === 'API_KEY_MISSING'
        ? 'API 키가 설정되지 않았습니다. 설정 탭에서 API 키를 입력해주세요.'
        : `오류: ${e.message}`;
      setChatMessages([...history, { role: 'assistant', text: errText }]);
    } finally {
      setAiLoading(false);
      setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }

  const STATUS_ORDER = { 미확인: 0, 확인: 1 };
  const PRIORITY_ORDER = { 긴급: 0, 일반: 1, 낮음: 2 };
  const filtered = messages
    .filter((m) => {
      if ((m.direction || 'received') !== box) return false;
      if (filter !== '전체' && m.status !== filter) return false;
      if (box === 'received' && m.toId !== user?.id) return false;
      if (box === 'sent' && m.fromId && m.fromId !== user?.id) return false;
      return true;
    })
    .sort((a, b) => {
      if (STATUS_ORDER[a.status] !== STATUS_ORDER[b.status])
        return STATUS_ORDER[a.status] - STATUS_ORDER[b.status];
      if (PRIORITY_ORDER[a.priority] !== PRIORITY_ORDER[b.priority])
        return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
      return (b.updatedAt || b.createdAt) - (a.updatedAt || a.createdAt);
    });
  const unreadCount = messages.filter((m) =>
    (m.direction || 'received') === 'received' &&
    m.status === '미확인' &&
    m.toId === user?.id
  ).length;

  async function handleAdd() {
    if (!newSender.trim()) {
      Alert.alert('입력 필요', '수신자를 한 명 이상 선택해주세요.');
      return;
    }
    if (!newSubject.trim()) return;
    if (newSubject.trim().length > SUBJECT_MAX_LENGTH) {
      Alert.alert('입력 길이 초과', `제목은 최대 ${SUBJECT_MAX_LENGTH}자까지 입력 가능합니다.`);
      return;
    }
    if (newContent.trim().length > CONTENT_MAX_LENGTH) {
      Alert.alert('입력 길이 초과', `내용은 최대 ${CONTENT_MAX_LENGTH}자까지 입력 가능합니다.`);
      return;
    }
    const ts = Date.now();
    const selfSelected = newRecipientIds.includes('self');
    const selectedClients = clients.filter((c) => newRecipientIds.includes(c.id));
    // 앱 계정(linkedProfileId)이 연결된 수신자만 실제 받은메세지함 사본을 받는다.
    // 연결 안 된 담당자는 수신자 이름 표기에만 포함되고 실제 전달은 없다.
    const deliverTargets = [
      ...(selfSelected ? [user?.id] : []),
      ...selectedClients.filter((c) => c.linkedProfileId).map((c) => c.linkedProfileId),
    ].filter(Boolean);
    const uniqueTargets = [...new Set(deliverTargets)];
    const primaryTarget = uniqueTargets[0];
    const sentMsgId = String(ts);
    const receivedMsgId = primaryTarget ? String(ts + 1) : undefined;
    const base = {
      id: sentMsgId,
      direction: 'sent',
      sender: newSender.trim(),
      company: newCompany.trim(),
      subject: newSubject.trim(),
      content: newContent.trim(),
      priority: newPriority,
      status: newStatus,
      fromId: user?.id,
      toId: primaryTarget || undefined,
      linkedReceivedId: receivedMsgId,
    };
    await addMessage(base);
    for (let i = 0; i < uniqueTargets.length; i++) {
      const targetId = uniqueTargets[i];
      await addMessageForUser(targetId, {
        id: i === 0 ? receivedMsgId : String(ts + 2 + i),
        direction: 'received',
        sender: user?.name || newSender.trim(),
        company: '내부',
        subject: newSubject.trim(),
        content: newContent.trim(),
        priority: newPriority,
        status: '미확인',
        fromId: user?.id,
        toId: targetId,
      });
    }
    setMessages(await getMessages());
    setShowAdd(false);
    setBox(selfSelected ? 'received' : 'sent');
    setFilter('전체');
    setNewSender(''); setNewCompany(''); setNewSubject('');
    setNewContent(''); setNewPriority('일반'); setNewStatus('미확인');
    setNewRecipientIds([]); setRecipientSearch('');
  }

  function recipientLabel(id) {
    if (id === 'self') return user?.name || '나';
    return clients.find((c) => c.id === id)?.name || '';
  }

  // 선택 즉시 수신자 표시 필드(이름/회사)를 재계산해 자동으로 채운다. 회사는 1명만
  // 선택됐을 때만 의미가 있어 자동 채우고, 0명/다중 선택 시에는 수동 입력에 맡긴다.
  function toggleRecipient(id) {
    setNewRecipientIds((prev) => {
      const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
      setNewSender(next.map(recipientLabel).filter(Boolean).join(', '));
      if (next.length === 1) {
        const only = next[0];
        setNewCompany(only === 'self' ? (user?.team || '') : (clients.find((c) => c.id === only)?.company || ''));
      } else {
        // 0명(초기화) 또는 2명 이상(단일 회사로 표시 불가)일 때는 값을 비워 수동 입력에 맡긴다.
        setNewCompany('');
      }
      return next;
    });
  }

  const recipientSearchQ = recipientSearch.trim();
  const filteredClients = recipientSearchQ
    ? clients.filter((c) => c.name.includes(recipientSearchQ) || (c.company || '').includes(recipientSearchQ))
    : clients;

  function openDetail(msg) {
    setDetailMsg(msg);
    setEditMode(false);
    setReplyMode(false);
    setShowDetail(true);
    if (msg.status === '미확인') {
      updateMessage(msg.id, { status: '확인' }).then((updated) => {
        setMessages(updated);
        setDetailMsg({ ...msg, status: '확인' });
      });
    }
  }

  function startEdit(msg) {
    setEditSender(msg.sender);
    setEditCompany(msg.company || '');
    setEditSubject(msg.subject);
    setEditContent(msg.content);
    setEditPriority(msg.priority);
    setEditStatus(msg.status);
    setEditMode(true);
  }

  async function handleEditSave() {
    if (!editSender.trim() || !editSubject.trim()) return;
    if (editSubject.trim().length > SUBJECT_MAX_LENGTH) {
      Alert.alert('입력 길이 초과', `제목은 최대 ${SUBJECT_MAX_LENGTH}자까지 입력 가능합니다.`);
      return;
    }
    if (editContent.trim().length > CONTENT_MAX_LENGTH) {
      Alert.alert('입력 길이 초과', `내용은 최대 ${CONTENT_MAX_LENGTH}자까지 입력 가능합니다.`);
      return;
    }
    const historyEntry = {
      subject: detailMsg.subject,
      content: detailMsg.content,
      editedAt: Date.now(),
    };
    const changes = {
      sender: editSender.trim(),
      company: editCompany.trim(),
      subject: editSubject.trim(),
      content: editContent.trim(),
      priority: editPriority,
      status: editStatus,
      editHistory: [...(detailMsg.editHistory || []), historyEntry],
    };
    const updated = await updateMessage(detailMsg.id, changes);
    if (detailMsg.linkedReceivedId && detailMsg.toId) {
      await updateMessageForUser(detailMsg.toId, detailMsg.linkedReceivedId, {
        subject: editSubject.trim(),
        content: editContent.trim(),
        editHistory: [...(detailMsg.editHistory || []), historyEntry],
      });
    }
    setMessages(updated);
    setDetailMsg(updated.find((m) => m.id === detailMsg.id));
    setEditMode(false);
  }

  function startReply(msg) {
    setReplySubject(`Re: ${msg.subject}`);
    setReplyContent('');
    setReplyMode(true);
  }

  async function handleReply() {
    if (!replyContent.trim()) return;
    if (replySubject.trim().length > SUBJECT_MAX_LENGTH) {
      Alert.alert('입력 길이 초과', `제목은 최대 ${SUBJECT_MAX_LENGTH}자까지 입력 가능합니다.`);
      return;
    }
    if (replyContent.trim().length > CONTENT_MAX_LENGTH) {
      Alert.alert('입력 길이 초과', `내용은 최대 ${CONTENT_MAX_LENGTH}자까지 입력 가능합니다.`);
      return;
    }
    const toId = detailMsg.fromId;
    const ts = Date.now();
    const sentMsgId = String(ts);
    const receivedMsgId = toId ? String(ts + 1) : undefined;
    await addMessage({
      id: sentMsgId,
      direction: 'sent',
      sender: detailMsg.sender,
      company: detailMsg.company || '',
      subject: replySubject.trim(),
      content: replyContent.trim(),
      priority: '일반',
      status: '미확인',
      fromId: user?.id,
      toId: toId || undefined,
      linkedReceivedId: receivedMsgId,
    });
    if (toId) {
      await addMessageForUser(toId, {
        id: receivedMsgId,
        direction: 'received',
        sender: user?.name || '',
        company: clients.find((c) => c.name === user?.name)?.company || '',
        subject: replySubject.trim(),
        content: replyContent.trim(),
        priority: '일반',
        status: '미확인',
        fromId: user?.id,
        toId,
      });
    }
    setMessages(await getMessages());
    setReplyMode(false);
    setShowDetail(false);
  }

  async function handleStatusChange(id, status) {
    const updated = await updateMessage(id, { status });
    setMessages(updated);
    setDetailMsg((prev) => prev ? { ...prev, status } : prev);
  }

  // PC에서는 상세를 모달 대신 우측 고정 패널(마스터-디테일)로 표시한다.
  const showDetailPanel = IS_PC;

  // 상세 뷰 렌더링(모바일 바텀시트 모달 / PC 우측 패널 공용). 내용은 완전히 동일 —
  // 바깥 껍데기(Modal vs 고정 패널)만 호출부에서 분기한다. detailMsg가 없을 수 있으므로
  // 호출부에서 `detailMsg &&`로 감싸 사용한다(ProjectScreen과 동일한 방식).
  function renderDetailFields() {
    return (
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* 헤더 */}
        <View style={s.detailHeader}>
          <View style={commonStyles.flex1}>
            {editMode ? (
              <>
                <Text style={s.inputLabel}>{detailMsg.direction === 'sent' ? '수신자' : '발신자'}</Text>
                <TextInput style={s.input} value={editSender} onChangeText={setEditSender} placeholderTextColor={C.textDim} />
                <Text style={s.inputLabel}>회사</Text>
                <TextInput style={s.input} value={editCompany} onChangeText={setEditCompany} placeholderTextColor={C.textDim} placeholder="선택" />
              </>
            ) : (
              <>
                <Text style={s.detailSender}>{detailMsg.sender}{detailMsg.company ? ` · ${detailMsg.company}` : ''}</Text>
                <Text style={s.detailTime}>{timeAgo(detailMsg.createdAt)}</Text>
              </>
            )}
          </View>
          <TouchableOpacity onPress={() => { setShowDetail(false); setEditMode(false); setReplyMode(false); }}>
            <Text style={s.closeBtn}>✕</Text>
          </TouchableOpacity>
        </View>

        {/* 제목 */}
        <View style={s.detailSection}>
          <Text style={s.sectionLabel}>제목</Text>
          {editMode
            ? <TextInput style={s.input} value={editSubject} onChangeText={setEditSubject} placeholderTextColor={C.textDim} />
            : <Text style={s.detailSubject}>{detailMsg.subject}</Text>
          }
        </View>

        {/* 우선순위 · 처리상태 */}
        {editMode ? (
          <>
            <View style={s.detailSection}>
              <Text style={s.sectionLabel}>우선순위</Text>
              <View style={s.optionRow}>
                {PRIORITIES.map((p) => (
                  <TouchableOpacity key={p} style={[s.optionBtn, editPriority === p && { borderColor: priorityColor(p) + '88', backgroundColor: priorityColor(p) + '18' }]} onPress={() => setEditPriority(p)}>
                    <Text style={[s.optionText, editPriority === p && { color: priorityColor(p) }]}>{p}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            <View style={s.detailSection}>
              <Text style={s.sectionLabel}>처리상태</Text>
              <View style={s.optionRow}>
                {STATUSES.map((st) => (
                  <TouchableOpacity key={st} style={[s.optionBtn, editStatus === st && { borderColor: statusColor(st) + '88', backgroundColor: statusColor(st) + '18' }]} onPress={() => setEditStatus(st)}>
                    <Text style={[s.optionText, editStatus === st && { color: statusColor(st) }]}>{st}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </>
        ) : (
          <View style={[s.detailSection, s.badgesRow]}>
            <View style={[s.priorityBadge, { borderColor: priorityColor(detailMsg.priority) + '55', backgroundColor: priorityColor(detailMsg.priority) + '18' }]}>
              <Text style={[s.badgeLabel, { color: priorityColor(detailMsg.priority) }]}>{detailMsg.priority}</Text>
            </View>
            <View style={[s.statusBadge, { borderColor: statusColor(detailMsg.status) + '55', backgroundColor: statusColor(detailMsg.status) + '18' }]}>
              <Text style={[s.badgeLabel, { color: statusColor(detailMsg.status) }]}>{detailMsg.status}</Text>
            </View>
          </View>
        )}

        {/* 내용 */}
        <View style={s.detailSection}>
          <Text style={s.sectionLabel}>내용</Text>
          {editMode
            ? <TextInput style={[s.input, s.h120]} value={editContent} onChangeText={setEditContent} multiline placeholderTextColor={C.textDim} placeholder="메세지 내용" />
            : <Text style={s.detailContent}>{detailMsg.content || '내용 없음'}</Text>
          }
        </View>

        {/* 수정 이력 */}
        {!editMode && !replyMode && detailMsg.editHistory?.length > 0 && (
          <View style={s.detailSection}>
            <Text style={s.sectionLabel}>수정 이력 ({detailMsg.editHistory.length})</Text>
            {[...detailMsg.editHistory].reverse().map((h, i) => (
              <View key={i} style={s.historyEntry}>
                <Text style={s.historyMeta}>수정 전 · {timeAgo(h.editedAt)}</Text>
                {h.subject !== detailMsg.subject && (
                  <Text style={s.historySubject}>{h.subject}</Text>
                )}
                <Text style={s.historyContent}>{h.content || '내용 없음'}</Text>
              </View>
            ))}
          </View>
        )}

        {/* 빠른 상태 변경 (보기 모드) */}
        {!editMode && !replyMode && (
          <View style={s.detailSection}>
            <Text style={s.sectionLabel}>처리상태 변경</Text>
            <View style={s.optionRow}>
              {STATUSES.map((st) => (
                <TouchableOpacity
                  key={st}
                  style={[s.optionBtn, detailMsg.status === st && { borderColor: statusColor(st) + '88', backgroundColor: statusColor(st) + '18' }]}
                  onPress={() => handleStatusChange(detailMsg.id, st)}
                >
                  <Text style={[s.optionText, detailMsg.status === st && { color: statusColor(st) }]}>{st}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        )}

        {/* 답장 폼 */}
        {replyMode && (
          <>
            <View style={s.detailSection}>
              <Text style={s.sectionLabel}>답장 제목</Text>
              <TextInput style={s.input} value={replySubject} onChangeText={setReplySubject} placeholderTextColor={C.textDim} />
            </View>
            <View style={s.detailSection}>
              <Text style={s.sectionLabel}>답장 내용</Text>
              <TextInput style={[s.input, s.h120]} value={replyContent} onChangeText={setReplyContent} multiline placeholderTextColor={C.textDim} placeholder="답장 내용을 입력하세요" />
            </View>
          </>
        )}

        {/* 버튼 */}
        <View style={s.modalBtns}>
          {replyMode ? (
            <>
              <TouchableOpacity style={s.confirmBtn} onPress={handleReply}>
                <Text style={s.confirmText}>전송</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setReplyMode(false)}>
                <Text style={s.cancelText}>취소</Text>
              </TouchableOpacity>
            </>
          ) : !editMode ? (
            <View style={s.pairRow}>
              {detailMsg.direction === 'received' && (
                <TouchableOpacity style={[s.pairBtn, s.pairBtnTeal]} onPress={() => startReply(detailMsg)}>
                  <Text style={s.confirmText}>답장</Text>
                </TouchableOpacity>
              )}
              {detailMsg.direction === 'sent' && (
                <TouchableOpacity style={[s.pairBtn, s.pairBtnPurple]} onPress={() => startEdit(detailMsg)}>
                  <Text style={s.confirmText}>수정</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={[s.pairBtn, s.pairBtnOutline]} onPress={() => Alert.alert('삭제', `"${detailMsg.subject}" 메세지를 삭제할까요?`, [
                { text: '취소', style: 'cancel' },
                { text: '삭제', style: 'destructive', onPress: async () => { setMessages(await deleteMessage(detailMsg.id)); setShowDetail(false); } },
              ])}>
                <Text style={[s.cancelText, s.textRed]}>삭제</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <>
              <TouchableOpacity style={s.cancelBtn} onPress={() => setEditMode(false)}>
                <Text style={s.cancelText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.confirmBtn} onPress={handleEditSave}>
                <Text style={s.confirmText}>저장</Text>
              </TouchableOpacity>
            </>
          )}
        </View>
      </ScrollView>
    );
  }

  // 받은/보낸함 탭(모바일 상단 전체 폭 / PC는 좌측 목록 컬럼 안에서 공용으로 재사용).
  function renderBoxTabs(extraStyle) {
    return (
      <View style={[s.boxRow, extraStyle]}>
        {BOXES.map((b) => (
          <TouchableOpacity
            key={b.key}
            style={[s.boxTab, box === b.key && s.boxTabActive]}
            onPress={() => { setBox(b.key); setFilter('전체'); setShowDetail(false); setDetailMsg(null); setEditMode(false); setReplyMode(false); }}
          >
            <Text style={[s.boxText, box === b.key && s.boxTextActive]}>{b.label}</Text>
            {b.key === 'received' && unreadCount > 0 && (
              <View style={s.badge}><Text style={s.badgeText}>{unreadCount}</Text></View>
            )}
          </TouchableOpacity>
        ))}
      </View>
    );
  }

  // 상태 필터 탭(모바일 상단 전체 폭 / PC는 좌측 목록 컬럼 안에서 공용으로 재사용).
  function renderFilterTabs(extraStyle) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[s.filterWrap, extraStyle]} contentContainerStyle={s.filterRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity key={f} style={[s.filterTab, filter === f && s.filterTabActive]} onPress={() => setFilter(f)}>
            <Text style={[s.filterText, filter === f && s.filterTextActive]}>{f}</Text>
            {f === '미확인' && unreadCount > 0 && (
              <View style={s.badge}><Text style={s.badgeText}>{unreadCount}</Text></View>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  }

  // 메세지 카드 렌더링(모바일 세로 목록 / PC 좌측 컬럼 공용). PC에서 선택된 항목에는
  // cardPCActive 강조가 추가로 붙는다(모바일에서는 IS_PC가 false라 무효 — byte-동일 동작).
  function renderMessageCard(item) {
    const isSelectedOnPC = IS_PC && showDetail && detailMsg?.id === item.id;
    return (
      <TouchableOpacity
        key={item.id}
        style={[s.card, item.status === '미확인' && s.cardUnread, isSelectedOnPC && s.cardPCActive]}
        activeOpacity={0.75}
        onPress={() => openDetail(item)}
        onLongPress={() => Alert.alert('삭제', `"${item.subject}" 메세지를 삭제할까요?`, [
          { text: '취소', style: 'cancel' },
          { text: '삭제', style: 'destructive', onPress: async () => setMessages(await deleteMessage(item.id)) },
        ])}
      >
        <View style={s.cardTop}>
          <View style={s.cardSenderRow}>
            {item.status === '미확인' && <View style={s.unreadDot} />}
            <Text style={s.cardSender}>{item.sender}</Text>
            {item.company ? <Text style={s.cardCompany}> · {item.company}</Text> : null}
          </View>
          <View style={s.cardBadges}>
            <View style={[s.priorityBadge, { borderColor: priorityColor(item.priority) + '55', backgroundColor: priorityColor(item.priority) + '18' }]}>
              <Text style={[s.badgeLabel, { color: priorityColor(item.priority) }]}>{item.priority}</Text>
            </View>
            <View style={[s.statusBadge, { borderColor: statusColor(item.status) + '55', backgroundColor: statusColor(item.status) + '18' }]}>
              <Text style={[s.badgeLabel, { color: statusColor(item.status) }]}>{item.status}</Text>
            </View>
          </View>
        </View>
        <Text style={[s.cardSubject, item.status === '미확인' && s.cardSubjectUnread]} numberOfLines={1}>{item.subject}</Text>
        <View style={s.cardBottom}>
          <Text style={s.cardPreview} numberOfLines={1}>{item.content || '내용 없음'}</Text>
          <Text style={s.cardTime}>{timeAgo(item.createdAt)}</Text>
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View style={s.root}>
      {/* 헤더 */}
      <View style={[s.header, { paddingTop: insets.top + 16 }]}>
        <View>
          <Text style={s.headerTitle}>메세지</Text>
          {unreadCount > 0 && <Text style={s.headerSub}>{unreadCount}건 미확인</Text>}
        </View>
      </View>

      {/* 모바일: 받은/보낸 박스 탭 + 필터 탭이 전체 폭 상단에 놓인다. PC는 아래 좌측 목록
          컬럼(listColumn) 안으로 옮겨 목록 카드와 한 영역으로 묶고, 남은 폭 전체를 상세 패널이 쓴다.
          모바일에서는 우측 상단에 떠 있는 aiFab과 겹치지 않도록 오른쪽 여백을 추가로 확보한다. */}
      {!showDetailPanel && renderBoxTabs(s.boxRowFabSpace)}
      {!showDetailPanel && renderFilterTabs(s.filterWrapFabSpace)}

      {/* 메세지 목록 (PC: 좌측 목록+우측 상세패널 / 모바일: 세로 목록+하단시트) */}
      {showDetailPanel ? (
        <View style={s.bodyPC}>
          <View style={s.listColumn}>
            <View style={s.boxRowPC}>
              <View style={s.boxRowPCBoxes}>{renderBoxTabs()}</View>
              <TouchableOpacity style={s.aiBtn} onPress={openAIChat}>
                <Text style={s.aiBtnText}>✦ AI</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.addBtnPC} onPress={handleAddPress}>
                <Text style={s.addBtnPCText}>+ 새 메세지</Text>
              </TouchableOpacity>
            </View>
            {renderFilterTabs()}
            <ScrollView style={s.list} contentContainerStyle={s.listContent} showsVerticalScrollIndicator={false}>
              {filtered.length === 0 ? (
                <View style={s.emptyWrap}>
                  <Text style={s.emptyText}>메세지가 없습니다</Text>
                  <Text style={s.emptyHint}>+ 버튼으로 메세지를 추가하세요</Text>
                </View>
              ) : (
                filtered.map(renderMessageCard)
              )}
            </ScrollView>
          </View>
          <View style={s.detailPanel}>
            {showDetail && detailMsg ? renderDetailFields() : (
              <View style={s.detailPanelEmpty}>
                <Text style={s.detailPanelEmptyText}>메세지를 선택하세요</Text>
              </View>
            )}
          </View>
        </View>
      ) : (
        <>
          <ScrollView style={s.list} contentContainerStyle={s.listContent} showsVerticalScrollIndicator={false}>
            {filtered.length === 0 ? (
              <View style={s.emptyWrap}>
                <Text style={s.emptyText}>메세지가 없습니다</Text>
                <Text style={s.emptyHint}>+ 버튼으로 메세지를 추가하세요</Text>
              </View>
            ) : (
              filtered.map(renderMessageCard)
            )}
          </ScrollView>

          {/* AI FAB: 새 메세지 FAB 바로 아래에 배치 */}
          <TouchableOpacity style={[s.aiFab, { top: insets.top + 16 + 52 + 12 }]} onPress={openAIChat}>
            <Text style={s.aiFabText}>✦</Text>
          </TouchableOpacity>

          {/* FAB: 받은/보낸 메세지함 탭 바로 위에 떠 있도록 헤더 영역 안쪽에 배치 */}
          <TouchableOpacity style={[s.fab, { top: insets.top + 16 }]} onPress={handleAddPress}>
            <Text style={s.fabText}>+</Text>
          </TouchableOpacity>
        </>
      )}

      {/* 상세 모달 (모바일 전용, PC는 우측 패널로 대체) */}
      <Modal visible={showDetail && !showDetailPanel} animationType="slide" transparent onRequestClose={() => { setShowDetail(false); setEditMode(false); setReplyMode(false); }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.overlay}>
          <Animated.View style={[s.sheet, commonStyles.maxH90pct, swipeDetail.animStyle]}>
            <View style={s.handleWrap} {...swipeDetail.panHandlers}>
              <View style={s.handle} />
            </View>
            {detailMsg && renderDetailFields()}
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── AI 채팅 모달 ── */}
      <Modal visible={showAI} animationType="fade" transparent onRequestClose={() => setShowAI(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.centerModalOverlay}>
          <View style={[s.centerModalCard, commonStyles.maxH85pct]}>
            <View style={s.chatHeader}>
              <View style={s.chatHeaderLeft}>
                <Text style={s.aiGlyph}>✦</Text>
                <Text style={s.modalTitle}>AI 메세지 비서</Text>
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
                  <ActivityIndicator size="small" color={C.accentPurple} />
                </View>
              )}
            </ScrollView>
            <View style={s.chatInputRow}>
              <TextInput style={s.chatInput} value={chatInput} onChangeText={setChatInput} placeholder="메세지함에 대해 물어보세요..." placeholderTextColor={C.textDim} onSubmitEditing={handleAIChat} returnKeyType="send" />
              <TouchableOpacity style={[s.sendBtn, !chatInput.trim() && commonStyles.opacity40]} onPress={handleAIChat} disabled={!chatInput.trim() || aiLoading}>
                <Text style={s.sendBtnText}>↑</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* 추가 모달 (담당자 추가 팝업과 동일한 중앙 카드형) */}
      <Modal visible={showAdd} animationType="fade" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.centerModalOverlay}>
          <View style={[s.centerModalCard, commonStyles.maxH90pct]}>
            <Text style={s.modalTitle}>새 메세지</Text>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 8 }}>
              <Text style={s.inputLabel}>수신자 선택 (담당자 목록, 다중 선택)</Text>
              {newRecipientIds.length > 0 && (
                <View style={s.selectedPeopleRow}>
                  {newRecipientIds.map((id) => (
                    <TouchableOpacity key={id} style={s.selectedPersonChip} onPress={() => toggleRecipient(id)}>
                      <Text style={s.selectedPersonChipText}>{recipientLabel(id)}</Text>
                      <Text style={s.selectedPersonChipX}> ✕</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
              <TextInput style={s.input} value={recipientSearch} onChangeText={setRecipientSearch} placeholder="이름 또는 회사로 검색" placeholderTextColor={C.textDim} />
              <ScrollView style={s.peopleList} nestedScrollEnabled>
                {!recipientSearch.trim() && (
                  <TouchableOpacity style={[s.peopleRow, newRecipientIds.includes('self') && s.peopleRowSelected]} onPress={() => toggleRecipient('self')}>
                    <View style={[s.peopleCheckbox, newRecipientIds.includes('self') && s.peopleCheckboxChecked]}>
                      {newRecipientIds.includes('self') && <Text style={s.peopleCheckmark}>✓</Text>}
                    </View>
                    <Text style={[s.peopleRowName, newRecipientIds.includes('self') && s.peopleRowNameSelected]} numberOfLines={1}>나 ({user?.name})</Text>
                    <Text style={s.peopleRowCompany} numberOfLines={1}>{user?.team || ''}</Text>
                  </TouchableOpacity>
                )}
                {filteredClients.length === 0 ? (
                  <Text style={s.peopleEmpty}>검색 결과가 없습니다</Text>
                ) : (
                  filteredClients.slice(0, 50).map((c) => {
                    const selected = newRecipientIds.includes(c.id);
                    return (
                      <TouchableOpacity key={c.id} style={[s.peopleRow, selected && s.peopleRowSelected]} onPress={() => toggleRecipient(c.id)}>
                        <View style={[s.peopleCheckbox, selected && s.peopleCheckboxChecked]}>
                          {selected && <Text style={s.peopleCheckmark}>✓</Text>}
                        </View>
                        <Text style={[s.peopleRowName, selected && s.peopleRowNameSelected]} numberOfLines={1}>{c.name}</Text>
                        <Text style={s.peopleRowCompany} numberOfLines={1}>{c.company}</Text>
                        {!c.linkedProfileId && <Text style={s.peopleRowExternal}>연락처만</Text>}
                      </TouchableOpacity>
                    );
                  })
                )}
              </ScrollView>

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
            <View style={s.addModalBtns}>
              <TouchableOpacity style={s.addModalConfirm} onPress={handleAdd}>
                <Text style={s.addModalConfirmText}>전송</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.addModalCancel} onPress={() => setShowAdd(false)}>
                <Text style={s.addModalCancelText}>닫기</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg, paddingLeft: IS_PC ? 24 : 0 },
  header: { paddingTop: 60, paddingHorizontal: 24, paddingBottom: 16 },
  headerTitle: { color: C.textPrimary, fontSize: 22, fontWeight: '300', letterSpacing: -0.5 },
  headerSub: { color: C.gold, fontSize: 11, marginTop: 2 },

  boxRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.border, marginHorizontal: 20 },
  // 모바일 전용: aiFab(우측 상단 고정)이 boxTab 텍스트 위에 겹치지 않도록 오른쪽에 추가 여백 확보.
  // boxTab이 flex:1이라 이 paddingRight만큼 자동으로 좁아진다. PC(boxRowPCBoxes 내부)에는 적용하지 않음.
  boxRowFabSpace: { paddingRight: 66 },
  boxTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  boxTabActive: { borderBottomColor: C.accentPurple },
  boxText: { color: C.textDim, fontSize: 13, fontWeight: '500' },
  boxTextActive: { color: C.accentPurple, fontWeight: '600' },

  boxRowPC: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingTop: 12, paddingRight: 20 },
  boxRowPCBoxes: { flex: 1 },
  addBtnPC: { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: C.accentPurple + '22', borderWidth: 1, borderColor: C.accentPurple + '55', borderRadius: 20 },
  addBtnPCText: { color: C.accentPurple, fontSize: 12, fontWeight: '600' },

  filterWrap: { maxHeight: 44 },
  // 모바일 전용: aiFab과 겹치지 않도록 스크롤 뷰포트 우측에 여백 확보(PC 목록 컬럼에는 미적용).
  filterWrapFabSpace: { paddingRight: 66 },
  filterRow: { paddingHorizontal: 20, gap: 8, alignItems: 'center' },
  filterTab: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: C.border },
  filterTabActive: { borderColor: C.accentPurple + '88', backgroundColor: C.accentPurple + '18' },
  filterText: { color: C.textDim, fontSize: 12 },
  filterTextActive: { color: C.accentPurple },
  badge: { backgroundColor: C.gold, borderRadius: 8, minWidth: 16, height: 16, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  badgeText: { color: '#09090E', fontSize: 9, fontWeight: '700' },

  list: { flex: 1 },
  listContent: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 100, gap: 10 },
  emptyWrap: { paddingTop: 60, alignItems: 'center', gap: 8 },
  emptyText: { color: C.textDim, fontSize: 14 },
  emptyHint: { color: C.textDim, fontSize: 11 },

  // PC 마스터-디테일 레이아웃. 목록/상세를 동일한 폭(flex:1)으로 절반씩 나눈다.
  bodyPC: { flex: 1, flexDirection: 'row' },
  listColumn: { flex: 1, borderRightWidth: 1, borderRightColor: C.border },
  detailPanel: { flex: 1, paddingHorizontal: 24, paddingTop: 16 },
  detailPanelEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingTop: 100 },
  detailPanelEmptyText: { color: C.textDim, fontSize: 13 },

  card: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 16, gap: 8 },
  cardUnread: { borderColor: C.accentPurple + '44', backgroundColor: C.accentPurple + '08' },
  cardPCActive: { borderColor: C.accentPurple + 'aa', backgroundColor: C.accentPurple + '0c' },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardSenderRow: { flexDirection: 'row', alignItems: 'center', gap: 5, flex: 1, marginRight: 8 },
  unreadDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.accentPurple },
  cardSender: { color: C.textPrimary, fontSize: 13, fontWeight: '500' },
  cardCompany: { color: C.textDim, fontSize: 12 },
  cardBadges: { flexDirection: 'row', gap: 5 },
  priorityBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, borderWidth: 1 },
  statusBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, borderWidth: 1 },
  badgeLabel: { fontSize: 10, fontWeight: '600' },
  cardSubject: { color: C.textSecondary, fontSize: 13, fontWeight: '400' },
  cardBottom: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardPreview: { color: C.textDim, fontSize: 11, flex: 1, marginRight: 8 },
  cardTime: { color: C.textDim, fontSize: 10 },

  fab: { position: 'absolute', right: 24, width: 52, height: 52, borderRadius: 26, backgroundColor: C.accentPurple, alignItems: 'center', justifyContent: 'center' },
  fabText: { color: '#09090E', fontSize: 26, lineHeight: 30, fontWeight: '300' },

  // 웹에서 Modal은 document.body로 포탈되어 App.js의 480px 폭 제한을 벗어나므로 여기서 다시 맞춘다
  overlay: Platform.OS === 'web'
    ? { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center' }
    : { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  sheet: Platform.OS === 'web'
    ? { backgroundColor: C.surfaceHigh, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 24, paddingBottom: 40, paddingTop: 12, width: '100%', maxWidth: 480 }
    : { backgroundColor: C.surfaceHigh, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 24, paddingBottom: 40, paddingTop: 12 },
  handle: { width: 36, height: 4, backgroundColor: C.borderHigh, borderRadius: 2, alignSelf: 'center' },
  handleWrap: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 40, marginBottom: 10 },
  modalTitle: { color: C.textPrimary, fontSize: 18, fontWeight: '400', marginBottom: 12 },

  // 메세지 추가 팝업 전용 (담당자 추가 팝업과 동일한 중앙 카드형 — 다른 모달의 overlay/sheet에는 영향 없음)
  centerModalOverlay: Platform.OS === 'web'
    ? { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)' }
    : { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 20 },
  centerModalCard: Platform.OS === 'web'
    ? { backgroundColor: C.surfaceHigh, borderRadius: 20, paddingHorizontal: 24, paddingTop: 20, paddingBottom: 24, width: '100%', maxWidth: 480, maxHeight: '85%' }
    : { backgroundColor: C.surfaceHigh, borderRadius: 20, paddingHorizontal: 24, paddingTop: 20, paddingBottom: 24, width: '100%', maxHeight: '85%' },
  addModalBtns: { flexDirection: 'row', gap: 12, marginTop: 24 },
  addModalConfirm: { flex: 1, paddingVertical: 14, borderRadius: 12, backgroundColor: C.accentPurple, alignItems: 'center' },
  addModalConfirmText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  addModalCancel: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  addModalCancelText: { color: C.textSecondary, fontSize: 14 },

  detailHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 },
  detailSender: { color: C.textPrimary, fontSize: 15, fontWeight: '500' },
  detailTime: { color: C.textDim, fontSize: 11, marginTop: 2 },
  detailSubject: { color: C.textPrimary, fontSize: 16, fontWeight: '400', lineHeight: 24 },
  detailContent: { color: C.textSecondary, fontSize: 14, lineHeight: 22 },
  detailSection: { marginTop: 18 },
  sectionLabel: { color: C.textDim, fontSize: 10, letterSpacing: 1.5, marginBottom: 8 },

  inputLabel: { color: C.textDim, fontSize: 10, letterSpacing: 1.5, marginBottom: 8, marginTop: 14 },
  input: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, color: C.textPrimary, fontSize: 14, paddingHorizontal: 14, paddingVertical: 12 },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  optionText: { color: C.textDim, fontSize: 12 },

  // 새 메세지 수신자 다중 선택 콤보박스(ProjectAddForm의 관련 인물 선택과 동일 패턴)
  selectedPeopleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  selectedPersonChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, backgroundColor: C.accentPurple + '22', borderWidth: 1, borderColor: C.accentPurple + '55', borderRadius: 12 },
  selectedPersonChipText: { color: C.accentPurple, fontSize: 12, fontWeight: '500' },
  selectedPersonChipX: { color: C.accentPurple, fontSize: 11 },
  peopleList: { maxHeight: 160, marginTop: 8, borderWidth: 1, borderColor: C.border, borderRadius: 10, backgroundColor: C.surface },
  peopleEmpty: { color: C.textDim, fontSize: 12, padding: 14, textAlign: 'center' },
  peopleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  peopleRowSelected: { backgroundColor: C.accentPurple + '14' },
  peopleCheckbox: { width: 18, height: 18, borderRadius: 5, borderWidth: 1.5, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  peopleCheckboxChecked: { backgroundColor: C.accentPurple, borderColor: C.accentPurple },
  peopleCheckmark: { color: '#fff', fontSize: 11, fontWeight: '700', lineHeight: 13 },
  peopleRowName: { color: C.textSecondary, fontSize: 13, flexShrink: 1 },
  peopleRowNameSelected: { color: C.accentPurple, fontWeight: '600' },
  peopleRowCompany: { color: C.textDim, fontSize: 11, marginLeft: 'auto' },
  peopleRowExternal: { color: C.textDim, fontSize: 9, marginLeft: 6 },

  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 24, justifyContent: 'center' },
  cancelBtn: { flex: 0, minWidth: 120, paddingVertical: 14, paddingHorizontal: 24, borderRadius: 12, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  cancelText: { color: C.textSecondary, fontSize: 14 },
  confirmBtn: { flex: 0, minWidth: 120, paddingVertical: 14, paddingHorizontal: 24, borderRadius: 12, backgroundColor: C.accentPurple, alignItems: 'center' },
  confirmText: { color: '#ECEAF5', fontSize: 14, fontWeight: '600' },
  // 상세 패널 보기 모드의 답장/수정·삭제 버튼: 폭을 고정 동일값으로 맞추고 패널 기준 가운데 정렬
  pairRow: { flex: 1, flexDirection: 'row', gap: 12, justifyContent: 'center' },
  pairBtn: { width: 140, paddingVertical: 14, borderRadius: 12, alignItems: 'center' },
  pairBtnOutline: { borderWidth: 1, borderColor: C.border },
  pairBtnTeal: { backgroundColor: C.accentTeal },
  pairBtnPurple: { backgroundColor: C.accentPurple },

  closeBtn: { color: C.textSecondary, fontSize: 18, padding: 4 },

  historyEntry: { backgroundColor: C.surface, borderLeftWidth: 2, borderLeftColor: C.borderHigh, paddingLeft: 12, paddingVertical: 8, marginBottom: 8, borderRadius: 6 },
  historyMeta: { color: C.textDim, fontSize: 10, letterSpacing: 0.5, marginBottom: 4 },
  historySubject: { color: C.textSecondary, fontSize: 13, fontWeight: '400', marginBottom: 4 },
  historyContent: { color: C.textDim, fontSize: 13, lineHeight: 20 },

  cardSubjectUnread: { color: C.textPrimary },
  badgesRow: { flexDirection: 'row', gap: 8 },
  h120: { height: 120 },
  h100: { height: 100 },
  textRed: { color: C.red },

  // AI 채팅 (일정/거래처/프로젝트 탭과 동일한 중앙 카드형 패턴, 메세지 탭 색상은 accentPurple)
  aiBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: C.accentPurple + '22', borderWidth: 1, borderColor: C.accentPurple + '55', borderRadius: 20 },
  aiBtnText: { color: C.accentPurple, fontSize: 12, fontWeight: '600', letterSpacing: 1 },
  aiFab: { position: 'absolute', right: 24, width: 52, height: 52, borderRadius: 26, backgroundColor: C.accentPurple + '22', borderWidth: 1, borderColor: C.accentPurple + '55', alignItems: 'center', justifyContent: 'center' },
  aiFabText: { color: C.accentPurple, fontSize: 20 },
  aiGlyph: { color: C.accentPurple, fontSize: 14 },
  chatHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  chatHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  chatLog: { flex: 1 },
  chatLogContent: { gap: 10, paddingBottom: 10 },
  bubble: { maxWidth: '85%', borderRadius: 14, padding: 12 },
  bubbleAI: { alignSelf: 'flex-start', backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  bubbleUser: { alignSelf: 'flex-end', backgroundColor: C.accentPurple + '33', borderWidth: 1, borderColor: C.accentPurple + '55' },
  bubbleText: { fontSize: 13, lineHeight: 20 },
  bubbleTextAI: { color: C.textSecondary },
  bubbleTextUser: { color: C.textPrimary },
  chatInputRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  chatInput: { flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 24, color: C.textPrimary, fontSize: 14, paddingHorizontal: 18, paddingVertical: 12 },
  sendBtn: { width: 46, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', backgroundColor: C.accentPurple },
  sendBtnText: { color: '#fff', fontSize: 18 },
});
