import {
  Text, View, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Modal, KeyboardAvoidingView, Platform, Animated,
} from 'react-native';
import { Alert } from '../utils/alertCompat';
import { useState, useEffect } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '../theme';
import { commonStyles } from '../styles/common';
import { getMessages, addMessage, addMessageForUser, updateMessage, updateMessageForUser, deleteMessage, getTestAccounts, getClients } from '../services/storage';
import { useUser } from '../context/UserContext';
import { useSwipeClose } from '../hooks/useSwipeClose';
import { IS_PC } from '../utils/deviceType';

const PRIORITIES = ['긴급', '일반', '낮음'];
const STATUSES = ['미확인', '확인', '처리중', '완료'];
const FILTERS = ['전체', '미확인', '처리중', '완료'];
const BOXES = [
  { key: 'received', label: '받은 메세지함' },
  { key: 'sent', label: '보낸 메세지함' },
];
const SUBJECT_MAX_LENGTH = 200;
const CONTENT_MAX_LENGTH = 2000;

// window.open()의 창 이름을 호출마다 고유하게 만들기 위한 카운터. 이름이 고정돼 있으면 두 번째
// open()부터는 기존에 열려 있던(혹은 사용자가 리사이즈한) 같은 이름의 창을 재사용해 width/height가
// 무시된다 — Date.now() 등 impure global 대신 순수한 모듈 카운터로 매번 새 이름을 만든다.
let popupSeq = 0;

function priorityColor(p) {
  return { 긴급: C.red, 일반: C.accentBlue, 낮음: C.textDim }[p] || C.textDim;
}

function statusColor(s) {
  return { 미확인: C.gold, 확인: C.accentBlue, 처리중: C.accentTeal, 완료: C.textDim }[s] || C.textDim;
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

  const [showAdd, setShowAdd] = useState(false);
  const [newSender, setNewSender] = useState('');
  const [newCompany, setNewCompany] = useState('');
  const [newSubject, setNewSubject] = useState('');
  const [newContent, setNewContent] = useState('');
  const [newPriority, setNewPriority] = useState('일반');
  const [newStatus, setNewStatus] = useState('미확인');
  const [newDirection, setNewDirection] = useState('sent');
  const [newToId, setNewToId] = useState(null);
  const [clients, setClients] = useState([]);
  const internalAccounts = getTestAccounts().filter((a) => a.id !== user?.id);

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

  const swipeAdd = useSwipeClose(() => setShowAdd(false), showAdd);
  const swipeDetail = useSwipeClose(() => { setShowDetail(false); setEditMode(false); setReplyMode(false); }, showDetail);

  async function load() {
    setMessages(await getMessages());
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); getClients().then(setClients); }, []);

  // PC 웹은 메세지 추가를 실제 브라우저 새 창(팝업)으로 띄운다. 저장이 완료되면
  // 팝업이 postMessage로 알려오고, 여기서 목록을 새로고침한다. 팝업 차단 시 기존 모달로 대체.
  // (상세는 더 이상 팝업이 아니라 PC 우측 패널/모바일 모달로 처리되지만, message-updated 타입
  // 리스너는 과거 상세 팝업이 보내던 이벤트라 무해하게 남겨둔다.)
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    function handleMessage(e) {
      if (e.origin !== window.location.origin) return;
      if (e.data?.type === 'secretary:message-created' || e.data?.type === 'secretary:message-updated') load();
    }
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  function handleAddPress() {
    if (IS_PC && Platform.OS === 'web') {
      // 창 이름을 매번 고유하게 줘야 브라우저가 기존에 열려 있던(혹은 사용자가 리사이즈한) 같은 이름의
      // 창을 재사용하지 않고 매번 지정한 크기로 새로 연다. 이름이 고정돼 있으면 두 번째 open()부터는
      // width/height가 무시되고 기존 창이 그대로 포커스만 된다.
      const popup = window.open('?popup=message-new', `secretary-message-new-${++popupSeq}`, 'width=360,height=540,menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes');
      if (popup) return;
    }
    setShowAdd(true);
  }

  const STATUS_ORDER = { 미확인: 0, 처리중: 1, 확인: 2, 완료: 3 };
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
    if (!newSender.trim() || !newSubject.trim()) return;
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
    setMessages(await getMessages());
    setShowAdd(false);
    setBox(newDirection);
    setFilter('전체');
    setNewSender(''); setNewCompany(''); setNewSubject('');
    setNewContent(''); setNewPriority('일반'); setNewStatus('미확인');
    setNewDirection('sent'); setNewToId(null);
  }

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
              <TouchableOpacity style={s.cancelBtn} onPress={() => setReplyMode(false)}>
                <Text style={s.cancelText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.confirmBtn} onPress={handleReply}>
                <Text style={s.confirmText}>전송</Text>
              </TouchableOpacity>
            </>
          ) : !editMode ? (
            <>
              <TouchableOpacity style={s.cancelBtn} onPress={() => Alert.alert('삭제', `"${detailMsg.subject}" 메세지를 삭제할까요?`, [
                { text: '취소', style: 'cancel' },
                { text: '삭제', style: 'destructive', onPress: async () => { setMessages(await deleteMessage(detailMsg.id)); setShowDetail(false); } },
              ])}>
                <Text style={[s.cancelText, s.textRed]}>삭제</Text>
              </TouchableOpacity>
              {detailMsg.direction === 'received' && (
                <TouchableOpacity style={[s.confirmBtn, s.confirmBtnTeal]} onPress={() => startReply(detailMsg)}>
                  <Text style={s.confirmText}>답장</Text>
                </TouchableOpacity>
              )}
              {detailMsg.direction === 'sent' && (
                <TouchableOpacity style={s.confirmBtn} onPress={() => startEdit(detailMsg)}>
                  <Text style={s.confirmText}>수정</Text>
                </TouchableOpacity>
              )}
            </>
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

      {/* 받은/보낸 박스 탭 */}
      <View style={s.boxRow}>
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

      {/* 필터 탭 */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterWrap} contentContainerStyle={s.filterRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity key={f} style={[s.filterTab, filter === f && s.filterTabActive]} onPress={() => setFilter(f)}>
            <Text style={[s.filterText, filter === f && s.filterTextActive]}>{f}</Text>
            {f === '미확인' && unreadCount > 0 && (
              <View style={s.badge}><Text style={s.badgeText}>{unreadCount}</Text></View>
            )}
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* 메세지 목록 (PC: 좌측 목록+우측 상세패널 / 모바일: 세로 목록+하단시트) */}
      {showDetailPanel ? (
        <View style={s.bodyPC}>
          <View style={s.listColumn}>
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
            <TouchableOpacity style={s.fab} onPress={handleAddPress}>
              <Text style={s.fabText}>+</Text>
            </TouchableOpacity>
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

          {/* FAB */}
          <TouchableOpacity style={s.fab} onPress={handleAddPress}>
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

      {/* 추가 모달 */}
      <Modal visible={showAdd} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.overlay}>
          <Animated.View style={[s.sheet, swipeAdd.animStyle]}>
            <View style={s.handleWrap} {...swipeAdd.panHandlers}>
              <View style={s.handle} />
            </View>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={s.modalTitle}>메세지 추가</Text>

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

              <View style={s.modalBtns}>
                <TouchableOpacity style={s.cancelBtn} onPress={() => setShowAdd(false)}>
                  <Text style={s.cancelText}>취소</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.confirmBtn} onPress={handleAdd}>
                  <Text style={s.confirmText}>추가</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </Animated.View>
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
  boxTab: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 10, borderBottomWidth: 2, borderBottomColor: 'transparent' },
  boxTabActive: { borderBottomColor: C.accentPurple },
  boxText: { color: C.textDim, fontSize: 13, fontWeight: '500' },
  boxTextActive: { color: C.accentPurple, fontWeight: '600' },

  filterWrap: { maxHeight: 44 },
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

  // PC 마스터-디테일 레이아웃(ProjectScreen의 mineBodyPC/gridColumn/detailPanel과 동일 패턴)
  bodyPC: { flex: 1, flexDirection: 'row' },
  listColumn: { flex: 1 },
  detailPanel: { width: 400, borderLeftWidth: 1, borderLeftColor: C.border, paddingHorizontal: 20, paddingTop: 12 },
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

  fab: { position: 'absolute', bottom: 30, right: 24, width: 52, height: 52, borderRadius: 26, backgroundColor: C.accentPurple, alignItems: 'center', justifyContent: 'center' },
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

  directionRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  directionBtn: { flex: 1, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: C.border, alignItems: 'center', backgroundColor: C.surface },
  directionBtnActive: { borderColor: C.accentPurple + '88', backgroundColor: C.accentPurple + '18' },
  directionText: { color: C.textDim, fontSize: 13 },
  directionTextActive: { color: C.accentPurple, fontWeight: '600' },

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

  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 24 },
  cancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  cancelText: { color: C.textSecondary, fontSize: 14 },
  confirmBtn: { flex: 2, paddingVertical: 14, borderRadius: 12, backgroundColor: C.accentPurple, alignItems: 'center' },
  confirmText: { color: '#ECEAF5', fontSize: 14, fontWeight: '600' },

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
  confirmBtnTeal: { backgroundColor: C.accentTeal },
});
