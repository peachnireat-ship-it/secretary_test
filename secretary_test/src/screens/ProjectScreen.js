import {
  Text, View, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Modal, KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import Slider from '@react-native-community/slider';
import { useState, useEffect, useRef } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { C } from '../theme';
import { getProjects, addProject, updateProject, deleteProject, getMeetingRecords, updateMeetingRecord, getClients } from '../services/storage';
import { askClaude, buildProjectDelaySystem } from '../services/claude';

const STATUSES = ['진행중', '위험', '지연', '완료', '취소'];
const PRIORITIES = ['높음', '보통', '낮음'];
const FILTERS = ['전체', '진행중', '위험', '지연', '완료'];

function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

function formatDeadline(text) {
  const digits = text.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 4) return digits;

  const year = parseInt(digits.slice(0, 4), 10);

  if (digits.length <= 6) {
    if (digits.length === 6) {
      const month = Math.min(12, Math.max(1, parseInt(digits.slice(4), 10)));
      return `${digits.slice(0, 4)}-${String(month).padStart(2, '0')}`;
    }
    return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  }

  const month = Math.min(12, Math.max(1, parseInt(digits.slice(4, 6), 10)));
  if (digits.length === 8) {
    const maxDay = getDaysInMonth(year, month);
    const day = Math.min(maxDay, Math.max(1, parseInt(digits.slice(6), 10)));
    return `${digits.slice(0, 4)}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  return `${digits.slice(0, 4)}-${String(month).padStart(2, '0')}-${digits.slice(6)}`;
}

function isValidDeadline(str) {
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const [, y, m, d] = match.map(Number);
  if (m < 1 || m > 12) return false;
  const maxDay = getDaysInMonth(y, m);
  return d >= 1 && d <= maxDay;
}

function normalizeDeadline(str) {
  if (!str || str === '미정') return str;
  const match = str.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return str;
  const [, y, m, d] = match;
  return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

function daysUntil(deadlineStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const d = new Date(deadlineStr);
  return Math.round((d - today) / 86400000);
}

function daysLabel(days) {
  if (days > 0) return `${days}일 후 마감`;
  if (days === 0) return '오늘 마감';
  return `${Math.abs(days)}일 초과`;
}

function statusColor(status) {
  const map = {
    진행중: C.accentBlue,
    위험: C.gold,
    지연: C.red,
    완료: C.accentTeal,
    취소: C.textDim,
  };
  return map[status] || C.textSecondary;
}

function priorityColor(priority) {
  return { 높음: C.red, 보통: C.gold, 낮음: C.accentTeal }[priority] || C.textDim;
}

function isAtRisk(project) {
  if (project.status === '완료' || project.status === '취소') return false;
  const days = daysUntil(project.deadline);
  return days <= 7 && project.progress < 80;
}

export default function ProjectScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const [projects, setProjects] = useState([]);
  const [meetingRecords, setMeetingRecords] = useState([]);
  const [clients, setClients] = useState([]);
  const [pendingMeetingRecordId, setPendingMeetingRecordId] = useState(null);
  const [filter, setFilter] = useState('전체');

  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDeadline, setNewDeadline] = useState('');
  const [newStatus, setNewStatus] = useState('진행중');
  const [newProgress, setNewProgress] = useState('0');
  const [newPriority, setNewPriority] = useState('보통');
  const [newNotes, setNewNotes] = useState('');

  const [showDetail, setShowDetail] = useState(false);
  const [detailProject, setDetailProject] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDeadline, setEditDeadline] = useState('');
  const [editStatus, setEditStatus] = useState('진행중');
  const [editProgress, setEditProgress] = useState(0);
  const [quickSlider, setQuickSlider] = useState(null);

  const [showMeetingDetail, setShowMeetingDetail] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const [contentEditRecordId, setContentEditRecordId] = useState(null);
  const [contentEditSummary, setContentEditSummary] = useState('');
  const [contentEditTranscript, setContentEditTranscript] = useState('');
  const [editPriority, setEditPriority] = useState('보통');
  const [editNotes, setEditNotes] = useState('');

  const [showAI, setShowAI] = useState(false);
  const [chatMessages, setChatMessages] = useState([
    { role: 'assistant', text: '안녕하세요! 프로젝트 지연 분석 AI입니다.\n\n"전체 지연 분석해줘", "가장 위험한 프로젝트가 뭐야?", "이번 주 조치 계획 세워줘" 와 같이 물어보세요.' },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const chatScrollRef = useRef(null);

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    const addTask = route?.params?.addTask;
    if (!addTask) return;
    setNewTitle(addTask.title || '');
    setNewDeadline(addTask.deadline || '');
    setNewPriority(addTask.priority || '보통');
    setNewNotes(addTask.notes || '');
    setNewStatus('진행중');
    setNewProgress('0');
    setPendingMeetingRecordId(route?.params?.meetingRecordId || null);
    setShowAdd(true);
    navigation.setParams({ addTask: undefined, meetingRecordId: undefined });
  }, [route?.params?.addTask]);

  async function load() {
    const [all, records, clientList] = await Promise.all([getProjects(), getMeetingRecords(), getClients()]);
    setProjects(all);
    setMeetingRecords(records);
    setClients(clientList);
  }

  const filtered = projects.filter((p) => filter === '전체' || p.status === filter);

  const delayedCount = projects.filter((p) => p.status === '지연' || p.status === '위험').length;

  async function handleAdd() {
    if (!newTitle.trim() || !newDeadline.trim()) return;
    if (!isValidDeadline(newDeadline.trim())) {
      Alert.alert('날짜 오류', '올바른 날짜를 입력하세요.\n월은 1~12, 일은 해당 달의 마지막 날 이내여야 합니다.');
      return;
    }
    const meetingRecord = pendingMeetingRecordId ? meetingRecords.find((r) => r.id === pendingMeetingRecordId) : null;
    const updated = await addProject({
      title: newTitle.trim(),
      deadline: normalizeDeadline(newDeadline.trim()),
      status: newStatus,
      progress: parseInt(newProgress) || 0,
      priority: newPriority,
      notes: newNotes.trim(),
      meetingRecordIds: pendingMeetingRecordId ? [pendingMeetingRecordId] : [],
      clientIds: meetingRecord?.clientIds || [],
    });
    setProjects(updated);
    setShowAdd(false);
    setNewTitle(''); setNewDeadline(''); setNewStatus('진행중');
    setNewProgress('0'); setNewPriority('보통'); setNewNotes('');
    setPendingMeetingRecordId(null);
  }

  async function handleDelete(id, title) {
    Alert.alert('삭제', `"${title}" 프로젝트를 삭제할까요?`, [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: async () => { setProjects(await deleteProject(id)); } },
    ]);
  }

  function openDetail(project) {
    setDetailProject(project);
    setEditTitle(project.title);
    setEditDeadline(project.deadline);
    setEditStatus(project.status);
    setEditProgress(project.progress ?? 0);
    setEditPriority(project.priority);
    setEditNotes(project.notes || '');
    setShowDetail(true);
  }

  async function handleEditSave() {
    if (!editTitle.trim() || !editDeadline.trim()) return;
    if (!isValidDeadline(editDeadline.trim())) {
      Alert.alert('날짜 오류', '올바른 날짜를 입력하세요.\n월은 1~12, 일은 해당 달의 마지막 날 이내여야 합니다.');
      return;
    }
    const updated = await updateProject(detailProject.id, {
      title: editTitle.trim(),
      deadline: normalizeDeadline(editDeadline.trim()),
      status: editStatus,
      progress: editProgress,
      priority: editPriority,
      notes: editNotes.trim(),
    });
    setProjects(updated);
    const refreshed = updated.find((p) => p.id === detailProject.id);
    setDetailProject(refreshed);
    setShowDetail(false);
  }

  async function handleProgressUpdate(id, newProg) {
    const updated = await updateProject(id, { progress: newProg });
    setProjects(updated);
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
        .filter((m, i) => !(m.role === 'assistant' && i === 0))
        .map((m) => ({ role: m.role === 'assistant' ? 'assistant' : 'user', content: m.text }));

      const systemPrompt = buildProjectDelaySystem(projects, []);
      const reply = await askClaude(apiMessages, systemPrompt);

      const jsonMatch = reply.match(/\{[\s\S]*"action"\s*:\s*"update_project"[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.action === 'update_project' && parsed.id && parsed.changes) {
            const updated = await updateProject(parsed.id, parsed.changes);
            setProjects(updated);
            const target = updated.find((p) => p.id === parsed.id);
            const confirmText = `프로젝트를 업데이트했습니다.\n"${target?.title}" → ${JSON.stringify(parsed.changes)}`;
            setChatMessages([...history, { role: 'assistant', text: confirmText }]);
          }
        } catch {
          setChatMessages([...history, { role: 'assistant', text: reply }]);
        }
      } else {
        setChatMessages([...history, { role: 'assistant', text: reply }]);
      }
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

  async function handleQuickAnalysis() {
    setShowAI(true);
    if (chatMessages.length > 1) return;
    setChatInput('');
    const userMsg = { role: 'user', text: '전체 프로젝트 지연 원인을 분석하고 우선 조치 계획을 알려줘.' };
    const history = [...chatMessages, userMsg];
    setChatMessages(history);
    setAiLoading(true);

    try {
      const apiMessages = [{ role: 'user', content: userMsg.text }];
      const systemPrompt = buildProjectDelaySystem(projects, []);
      const reply = await askClaude(apiMessages, systemPrompt);
      setChatMessages([...history, { role: 'assistant', text: reply }]);
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

  function openContentEditModal(item) {
    setContentEditRecordId(item.id);
    setContentEditSummary(item.summary || '');
    setContentEditTranscript(item.transcript || '');
  }

  async function confirmContentEdit() {
    const updated = await updateMeetingRecord(contentEditRecordId, {
      summary: contentEditSummary,
      transcript: contentEditTranscript,
    });
    const updatedRecord = updated.find((r) => r.id === contentEditRecordId);
    if (updatedRecord) setSelectedMeeting(updatedRecord);
    setContentEditRecordId(null);
  }

  return (
    <View style={s.root}>
      {/* ── 헤더 ── */}
      <View style={[s.header, { paddingTop: insets.top + 16 }]}>
        <View>
          <Text style={s.headerTitle}>프로젝트</Text>
          {delayedCount > 0 && (
            <Text style={s.headerSub}>{delayedCount}건 지연·위험</Text>
          )}
        </View>
        <View style={s.headerBtns}>
          <TouchableOpacity style={s.analyzeBtn} onPress={handleQuickAnalysis}>
            <Text style={s.analyzeBtnText}>✦ 지연 분석</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.aiBtn} onPress={() => setShowAI(true)}>
            <Text style={s.aiBtnText}>AI</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── 필터 탭 ── */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.filterWrap} contentContainerStyle={s.filterRow}>
        {FILTERS.map((f) => (
          <TouchableOpacity
            key={f}
            style={[s.filterTab, filter === f && s.filterTabActive]}
            onPress={() => setFilter(f)}
          >
            <Text style={[s.filterText, filter === f && s.filterTextActive]}>{f}</Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {/* ── 프로젝트 목록 ── */}
      <ScrollView style={s.list} contentContainerStyle={s.listContent} showsVerticalScrollIndicator={false}>
        {filtered.length === 0 ? (
          <View style={s.emptyWrap}>
            <Text style={s.emptyText}>프로젝트가 없습니다</Text>
            <Text style={s.emptyHint}>+ 버튼으로 프로젝트를 추가하세요</Text>
          </View>
        ) : (
          filtered.map((item) => {
            const days = daysUntil(item.deadline);
            const risk = isAtRisk(item);
            const linkedMeetings = item.meetingRecordIds?.length > 0
              ? meetingRecords.filter((r) => item.meetingRecordIds.includes(r.id))
              : [];
            const linkedClients = item.clientIds?.length > 0
              ? item.clientIds.map((id) => clients.find((c) => c.id === id)).filter(Boolean)
              : [];
            return (
              <View key={item.id} style={[s.card, risk && s.cardRisk]}>
                <TouchableOpacity
                  activeOpacity={0.75}
                  onPress={() => openDetail(item)}
                  onLongPress={() => handleDelete(item.id, item.title)}
                >
                  {/* 타이틀 행 */}
                  <View style={s.cardTop}>
                    <View style={s.cardTitleRow}>
                      {risk && <Text style={s.riskIcon}>⚠ </Text>}
                      <Text style={s.cardTitle} numberOfLines={1}>{item.title}</Text>
                    </View>
                    <View style={[s.statusBadge, { borderColor: statusColor(item.status) + '66', backgroundColor: statusColor(item.status) + '18' }]}>
                      <Text style={[s.statusText, { color: statusColor(item.status) }]}>{item.status}</Text>
                    </View>
                  </View>

                  {/* 프로그레스 바 */}
                  <View style={s.progressTrack}>
                    <View style={[s.progressFill, { width: `${item.progress}%`, backgroundColor: statusColor(item.status) }]} />
                  </View>
                  <View style={s.progressRow}>
                    <Text style={s.progressLabel}>{item.progress}% 완료</Text>
                    <TouchableOpacity onPress={() => setQuickSlider({ id: item.id, value: item.progress })}>
                      <Text style={s.editProgress}>수정</Text>
                    </TouchableOpacity>
                  </View>

                  {/* 메타 정보 */}
                  <View style={s.cardMeta}>
                    <View style={[s.priorityBadge, { borderColor: priorityColor(item.priority) + '55' }]}>
                      <Text style={[s.priorityText, { color: priorityColor(item.priority) }]}>{item.priority}</Text>
                    </View>
                    <Text style={[s.deadlineText, days < 0 && { color: C.red }, days >= 0 && days <= 3 && { color: C.gold }]}>
                      {item.deadline} · {daysLabel(days)}
                    </Text>
                  </View>

                  {item.notes ? <Text style={s.cardNotes} numberOfLines={1}>{item.notes}</Text> : null}
                </TouchableOpacity>

                {linkedClients.length > 0 && (
                  <View style={s.clientChipRow}>
                    {linkedClients.map((c) => (
                      <View key={c.id} style={s.clientChip}>
                        <View style={s.clientChipDot} />
                        <Text style={s.clientChipText} numberOfLines={1}>
                          {c.name}{c.company ? ` · ${c.company}` : ''}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
                {linkedMeetings.length > 0 && (
                  <View style={s.meetingChipRow}>
                    {linkedMeetings.map((r) => (
                      <TouchableOpacity
                        key={r.id}
                        style={s.meetingChip}
                        activeOpacity={0.7}
                        onPress={() => { setSelectedMeeting(r); setShowMeetingDetail(true); }}
                      >
                        <Text style={s.meetingChipText} numberOfLines={1}>📋 {r.title || '회의록'}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>

      {/* ── 추가 버튼 ── */}
      <TouchableOpacity style={s.fab} onPress={() => setShowAdd(true)}>
        <Text style={s.fabText}>+</Text>
      </TouchableOpacity>

      {/* ── 프로젝트 상세 모달 ── */}
      <Modal visible={showDetail} animationType="slide" transparent onRequestClose={() => setShowDetail(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalOverlay}>
          <View style={[s.modalSheet, { maxHeight: '90%' }]}>
            <View style={s.modalHandle} />
            {detailProject && (
              <ScrollView showsVerticalScrollIndicator={false}>
                {/* 헤더: 제목 + 닫기 */}
                <View style={s.detailHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.inputLabel}>제목</Text>
                    <TextInput style={s.input} value={editTitle} onChangeText={setEditTitle} placeholderTextColor={C.textDim} />
                  </View>
                  <TouchableOpacity onPress={() => setShowDetail(false)} style={{ marginLeft: 12, marginTop: 20 }}>
                    <Text style={s.closeBtn}>✕</Text>
                  </TouchableOpacity>
                </View>

                {/* 상태 */}
                <Text style={s.inputLabel}>상태</Text>
                <View style={s.optionRow}>
                  {STATUSES.map((st) => (
                    <TouchableOpacity key={st} style={[s.optionBtn, editStatus === st && { borderColor: statusColor(st) + '88', backgroundColor: statusColor(st) + '18' }]} onPress={() => setEditStatus(st)}>
                      <Text style={[s.optionText, editStatus === st && { color: statusColor(st) }]}>{st}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* 우선순위 */}
                <Text style={s.inputLabel}>우선순위</Text>
                <View style={s.optionRow}>
                  {PRIORITIES.map((pr) => (
                    <TouchableOpacity key={pr} style={[s.optionBtn, editPriority === pr && { borderColor: priorityColor(pr) + '88', backgroundColor: priorityColor(pr) + '18' }]} onPress={() => setEditPriority(pr)}>
                      <Text style={[s.optionText, editPriority === pr && { color: priorityColor(pr) }]}>{pr}</Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {/* 진행률 */}
                <Text style={s.inputLabel}>진행률 (%)</Text>
                <View style={s.sliderWrap}>
                  <Text style={s.sliderVal}>{editProgress}%</Text>
                  <Slider
                    style={s.slider}
                    minimumValue={0}
                    maximumValue={100}
                    step={1}
                    value={editProgress}
                    onValueChange={(v) => setEditProgress(Math.round(v))}
                    minimumTrackTintColor={statusColor(editStatus)}
                    maximumTrackTintColor={C.border}
                    thumbTintColor={statusColor(editStatus)}
                  />
                </View>

                {/* 마감일 */}
                <Text style={s.inputLabel}>마감일 (YYYY-MM-DD)</Text>
                <TextInput
                  style={s.input}
                  value={editDeadline}
                  onChangeText={(t) => setEditDeadline(formatDeadline(t))}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={C.textDim}
                  keyboardType="numeric"
                  maxLength={10}
                />

                {/* 메모 */}
                <Text style={s.inputLabel}>메모 (선택)</Text>
                <TextInput
                  style={[s.input, { height: 80 }]}
                  value={editNotes}
                  onChangeText={setEditNotes}
                  multiline
                  placeholder="메모를 입력하세요"
                  placeholderTextColor={C.textDim}
                />

                {/* 버튼 */}
                <View style={s.modalBtns}>
                  <TouchableOpacity style={s.modalCancel} onPress={() => {
                    Alert.alert('삭제', `"${detailProject.title}" 프로젝트를 삭제할까요?`, [
                      { text: '취소', style: 'cancel' },
                      { text: '삭제', style: 'destructive', onPress: async () => { setProjects(await deleteProject(detailProject.id)); setShowDetail(false); } },
                    ]);
                  }}>
                    <Text style={[s.modalCancelText, { color: C.red }]}>삭제</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.modalConfirm} onPress={handleEditSave}>
                    <Text style={s.modalConfirmText}>저장</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── 프로젝트 추가 모달 ── */}
      <Modal visible={showAdd} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.modalOverlay}>
          <View style={[s.modalSheet, { maxHeight: '92%' }]}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>프로젝트 추가</Text>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

            <Text style={s.inputLabel}>제목</Text>
            <TextInput style={s.input} value={newTitle} onChangeText={setNewTitle} placeholder="프로젝트 이름" placeholderTextColor={C.textDim} />

            <Text style={s.inputLabel}>마감일 (YYYY-MM-DD)</Text>
            <TextInput style={s.input} value={newDeadline} onChangeText={(t) => setNewDeadline(formatDeadline(t))} placeholder="YYYY-MM-DD" placeholderTextColor={C.textDim} keyboardType="numeric" maxLength={10} />

            <Text style={s.inputLabel}>상태</Text>
            <View style={s.optionRow}>
              {STATUSES.map((st) => (
                <TouchableOpacity key={st} style={[s.optionBtn, newStatus === st && { borderColor: statusColor(st) + '88', backgroundColor: statusColor(st) + '18' }]} onPress={() => setNewStatus(st)}>
                  <Text style={[s.optionText, newStatus === st && { color: statusColor(st) }]}>{st}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.inputLabel}>우선순위</Text>
            <View style={s.optionRow}>
              {PRIORITIES.map((pr) => (
                <TouchableOpacity key={pr} style={[s.optionBtn, newPriority === pr && { borderColor: priorityColor(pr) + '88', backgroundColor: priorityColor(pr) + '18' }]} onPress={() => setNewPriority(pr)}>
                  <Text style={[s.optionText, newPriority === pr && { color: priorityColor(pr) }]}>{pr}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.inputLabel}>진행률 (%)</Text>
            <TextInput style={s.input} value={newProgress} onChangeText={setNewProgress} placeholder="0" placeholderTextColor={C.textDim} keyboardType="numeric" />

            <Text style={s.inputLabel}>메모 (선택)</Text>
            <TextInput style={[s.input, { height: 64 }]} value={newNotes} onChangeText={setNewNotes} placeholder="지연 원인, 진행 상황 등" placeholderTextColor={C.textDim} multiline />

            <View style={[s.modalBtns, { marginBottom: 8 }]}>
              <TouchableOpacity style={s.modalCancel} onPress={() => setShowAdd(false)}>
                <Text style={s.modalCancelText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.modalConfirm} onPress={handleAdd}>
                <Text style={s.modalConfirmText}>추가</Text>
              </TouchableOpacity>
            </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── AI 지연 분석 채팅 모달 ── */}
      <Modal visible={showAI} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalOverlay}>
          <View style={[s.modalSheet, { height: '88%' }]}>
            <View style={s.modalHandle} />
            <View style={s.chatHeader}>
              <View style={s.chatHeaderLeft}>
                <Text style={s.aiGlyph}>✦</Text>
                <View>
                  <Text style={s.modalTitle}>AI 지연 분석</Text>
                  <Text style={s.chatSubtitle}>프로젝트 지연 원인 · 개선 계획</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setShowAI(false)}>
                <Text style={s.closeBtn}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView
              ref={chatScrollRef}
              style={s.chatLog}
              contentContainerStyle={s.chatLogContent}
              showsVerticalScrollIndicator={false}
            >
              {chatMessages.map((m, i) => (
                <View key={i} style={[s.bubble, m.role === 'user' ? s.bubbleUser : s.bubbleAI]}>
                  <Text style={[s.bubbleText, m.role === 'user' ? s.bubbleTextUser : s.bubbleTextAI]}>{m.text}</Text>
                </View>
              ))}
              {aiLoading && (
                <View style={s.bubbleAI}>
                  <ActivityIndicator size="small" color={C.gold} />
                </View>
              )}
            </ScrollView>

            {/* 빠른 질문 버튼 */}
            {chatMessages.length <= 2 && !aiLoading && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.quickRow} contentContainerStyle={s.quickContent}>
                {['이번 주 위험 프로젝트 알려줘', '지연 패턴 분석해줘', '조치 계획 세워줘'].map((q) => (
                  <TouchableOpacity key={q} style={s.quickBtn} onPress={() => { setChatInput(q); }}>
                    <Text style={s.quickText}>{q}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}

            <View style={s.chatInputRow}>
              <TextInput
                style={s.chatInput}
                value={chatInput}
                onChangeText={setChatInput}
                placeholder="지연 분석 또는 개선 방안을 물어보세요..."
                placeholderTextColor={C.textDim}
                onSubmitEditing={handleAIChat}
                returnKeyType="send"
              />
              <TouchableOpacity style={[s.sendBtn, !chatInput.trim() && { opacity: 0.4 }]} onPress={handleAIChat} disabled={!chatInput.trim() || aiLoading}>
                <Text style={s.sendBtnText}>↑</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      {/* ── 회의록 상세 모달 ── */}
      <Modal visible={showMeetingDetail} animationType="slide" transparent onRequestClose={() => setShowMeetingDetail(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, { maxHeight: '90%' }]}>
            <View style={s.modalHandle} />
            {selectedMeeting && (
              <>
                <View style={s.meetingDetailHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.modalTitle, { marginBottom: 0 }]} numberOfLines={2}>{selectedMeeting.title || '회의록'}</Text>
                    {selectedMeeting.createdAt && (
                      <Text style={s.meetingDetailDate}>
                        {new Date(selectedMeeting.createdAt).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })}
                        {selectedMeeting.source ? ` · ${selectedMeeting.source}` : ''}
                      </Text>
                    )}
                  </View>
                  <TouchableOpacity onPress={() => openContentEditModal(selectedMeeting)} style={s.meetingEditBtn}>
                    <Text style={s.meetingEditBtnText}>내용 편집</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setShowMeetingDetail(false)} style={{ marginLeft: 8 }}>
                    <Text style={s.closeBtn}>✕</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView showsVerticalScrollIndicator={false} style={{ marginTop: 8 }}>
                  {selectedMeeting.summary ? (
                    <>
                      <Text style={s.inputLabel}>요약</Text>
                      <View style={s.meetingDetailSection}>
                        <Text style={s.meetingDetailText}>{selectedMeeting.summary}</Text>
                      </View>
                    </>
                  ) : null}
                  {selectedMeeting.tasks?.length > 0 ? (
                    <>
                      <Text style={s.inputLabel}>태스크</Text>
                      <View style={s.meetingDetailSection}>
                        {selectedMeeting.tasks.map((task, i) => (
                          <View key={i} style={[s.meetingTaskRow, i < selectedMeeting.tasks.length - 1 && s.meetingTaskRowBorder]}>
                            <Text style={s.meetingTaskContent}>{task.content}</Text>
                            <View style={s.meetingTaskMeta}>
                              {task.assignee ? <Text style={s.meetingTaskMetaText}>{task.assignee}</Text> : null}
                              {task.deadline && task.deadline !== '미정' ? <Text style={s.meetingTaskMetaText}>· {task.deadline}</Text> : null}
                              {task.priority ? <Text style={[s.meetingTaskMetaText, { color: priorityColor(task.priority) }]}>{task.priority}</Text> : null}
                            </View>
                          </View>
                        ))}
                      </View>
                    </>
                  ) : null}
                  {selectedMeeting.transcript ? (
                    <>
                      <Text style={s.inputLabel}>전문</Text>
                      <View style={s.meetingDetailSection}>
                        <Text style={s.meetingDetailText}>{selectedMeeting.transcript}</Text>
                      </View>
                    </>
                  ) : null}
                  {!selectedMeeting.summary && !selectedMeeting.transcript && !selectedMeeting.tasks?.length && (
                    <Text style={[s.emptyText, { marginTop: 20 }]}>저장된 내용이 없습니다.</Text>
                  )}
                  <View style={{ height: 20 }} />
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* ── 내용 편집 모달 ── */}
      <Modal visible={!!contentEditRecordId} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setContentEditRecordId(null)}>
        <KeyboardAvoidingView style={s.contentEditOverlay} behavior="padding">
          <ScrollView contentContainerStyle={s.contentEditScroll} keyboardShouldPersistTaps="handled">
            <View style={s.contentEditBox}>
              <Text style={s.modalTitle}>내용 편집</Text>
              <Text style={s.inputLabel}>요약 (SUMMARY)</Text>
              <TextInput
                style={s.contentEditInput}
                value={contentEditSummary}
                onChangeText={setContentEditSummary}
                placeholder="요약 내용을 입력하세요"
                placeholderTextColor={C.textDim}
                multiline
                textAlignVertical="top"
              />
              <Text style={s.inputLabel}>원문 (TRANSCRIPT)</Text>
              <TextInput
                style={s.contentEditInput}
                value={contentEditTranscript}
                onChangeText={setContentEditTranscript}
                placeholder="원문을 입력하세요"
                placeholderTextColor={C.textDim}
                multiline
                textAlignVertical="top"
              />
              <View style={s.modalBtns}>
                <TouchableOpacity style={s.modalCancel} onPress={() => setContentEditRecordId(null)} activeOpacity={0.7}>
                  <Text style={s.modalCancelText}>취소</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.modalConfirm} onPress={confirmContentEdit} activeOpacity={0.8}>
                  <Text style={s.modalConfirmText}>저장</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── 진행률 슬라이더 모달 ── */}
      {quickSlider && (
        <Modal visible animationType="fade" transparent onRequestClose={() => setQuickSlider(null)}>
          <TouchableOpacity style={s.qsOverlay} activeOpacity={1} onPress={() => setQuickSlider(null)}>
            <TouchableOpacity activeOpacity={1} style={s.qsSheet} onPress={() => {}}>
              <Text style={s.inputLabel}>진행률</Text>
              <Text style={s.qsValue}>{quickSlider.value}%</Text>
              <Slider
                style={s.qsSlider}
                minimumValue={0}
                maximumValue={100}
                step={1}
                value={quickSlider.value}
                onValueChange={(v) => setQuickSlider((q) => ({ ...q, value: Math.round(v) }))}
                minimumTrackTintColor={C.gold}
                maximumTrackTintColor={C.border}
                thumbTintColor={C.gold}
              />
              <View style={s.modalBtns}>
                <TouchableOpacity style={s.modalCancel} onPress={() => setQuickSlider(null)}>
                  <Text style={s.modalCancelText}>취소</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.modalConfirm} onPress={async () => {
                  await handleProgressUpdate(quickSlider.id, quickSlider.value);
                  setQuickSlider(null);
                }}>
                  <Text style={s.modalConfirmText}>저장</Text>
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </TouchableOpacity>
        </Modal>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 60, paddingHorizontal: 24, paddingBottom: 16 },
  headerTitle: { color: C.textPrimary, fontSize: 22, fontWeight: '300', letterSpacing: -0.5 },
  headerSub: { color: C.red, fontSize: 11, marginTop: 2 },
  headerBtns: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  analyzeBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 7, backgroundColor: C.gold + '22', borderWidth: 1, borderColor: C.gold + '55', borderRadius: 20 },
  analyzeBtnText: { color: C.gold, fontSize: 12, fontWeight: '600', letterSpacing: 0.5 },
  aiBtn: { paddingHorizontal: 12, paddingVertical: 7, backgroundColor: C.accentBlue + '22', borderWidth: 1, borderColor: C.accentBlue + '55', borderRadius: 20 },
  aiBtnText: { color: C.accentBlue, fontSize: 12, fontWeight: '600' },

  filterWrap: { maxHeight: 44 },
  filterRow: { paddingHorizontal: 20, gap: 8, alignItems: 'center' },
  filterTab: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16, borderWidth: 1, borderColor: C.border },
  filterTabActive: { borderColor: C.accentBlue + '88', backgroundColor: C.accentBlue + '18' },
  filterText: { color: C.textDim, fontSize: 12 },
  filterTextActive: { color: C.accentBlue },

  list: { flex: 1 },
  listContent: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 100, gap: 10 },
  emptyWrap: { paddingTop: 60, alignItems: 'center', gap: 8 },
  emptyText: { color: C.textDim, fontSize: 14 },
  emptyHint: { color: C.textDim, fontSize: 11 },

  card: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 14, padding: 16, gap: 10 },
  cardRisk: { borderColor: C.gold + '55' },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 10 },
  riskIcon: { color: C.gold, fontSize: 12 },
  cardTitle: { color: C.textPrimary, fontSize: 14, fontWeight: '500', flex: 1 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  statusText: { fontSize: 10, fontWeight: '600' },

  progressTrack: { height: 4, backgroundColor: C.border, borderRadius: 2, overflow: 'hidden' },
  progressFill: { height: '100%', borderRadius: 2 },
  progressRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progressLabel: { color: C.textDim, fontSize: 11 },
  editProgress: { color: C.accentBlue, fontSize: 11 },

  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  priorityBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, borderWidth: 1 },
  priorityText: { fontSize: 10, fontWeight: '500' },
  deadlineText: { color: C.textDim, fontSize: 11 },
  cardNotes: { color: C.textDim, fontSize: 11, fontStyle: 'italic' },
  clientChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  clientChip: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.accentTeal + '18', borderWidth: 1, borderColor: C.accentTeal + '44', borderRadius: 6, paddingVertical: 3, paddingHorizontal: 8 },
  clientChipDot: { width: 5, height: 5, borderRadius: 3, backgroundColor: C.accentTeal },
  clientChipText: { color: C.accentTeal, fontSize: 11, fontWeight: '500' },
  meetingChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  meetingChip: { backgroundColor: C.accentPurple + '18', borderWidth: 1, borderColor: C.accentPurple + '44', borderRadius: 6, paddingVertical: 3, paddingHorizontal: 8 },
  meetingChipText: { color: C.accentPurple, fontSize: 11, fontWeight: '500' },
  meetingDetailHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 },
  meetingEditBtn: { borderWidth: 1, borderColor: C.accentTeal + '55', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12, marginLeft: 12, marginTop: 2 },
  meetingEditBtnText: { color: C.accentTeal, fontSize: 12, fontWeight: '500' },
  contentEditOverlay: { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)', padding: 24 },
  contentEditScroll: { flexGrow: 1, justifyContent: 'center' },
  contentEditBox: { backgroundColor: C.surfaceHigh, borderRadius: 16, padding: 24 },
  contentEditInput: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderHigh, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, color: C.textPrimary, fontSize: 13, lineHeight: 20, minHeight: 100, maxHeight: 220 },
  meetingDetailDate: { color: C.textDim, fontSize: 11, marginTop: 4 },
  meetingDetailSection: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 14, marginBottom: 4 },
  meetingDetailText: { color: C.textSecondary, fontSize: 13, lineHeight: 20 },
  meetingTaskRow: { paddingVertical: 8 },
  meetingTaskRowBorder: { borderBottomWidth: 1, borderBottomColor: C.border },
  meetingTaskContent: { color: C.textSecondary, fontSize: 13, lineHeight: 18 },
  meetingTaskMeta: { flexDirection: 'row', gap: 6, marginTop: 3 },
  meetingTaskMetaText: { color: C.textDim, fontSize: 11 },

  fab: { position: 'absolute', bottom: 30, right: 24, width: 52, height: 52, borderRadius: 26, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center' },
  fabText: { color: '#09090E', fontSize: 26, lineHeight: 30, fontWeight: '300' },

  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  modalSheet: { backgroundColor: C.surfaceHigh, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 24, paddingBottom: 40, paddingTop: 12 },
  modalHandle: { width: 36, height: 4, backgroundColor: C.borderHigh, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  modalTitle: { color: C.textPrimary, fontSize: 18, fontWeight: '400', marginBottom: 2 },
  inputLabel: { color: C.textDim, fontSize: 10, letterSpacing: 1.5, marginBottom: 8, marginTop: 14 },
  input: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, color: C.textPrimary, fontSize: 14, paddingHorizontal: 14, paddingVertical: 12 },
  optionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  optionBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  optionText: { color: C.textDim, fontSize: 12 },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 20 },
  modalCancel: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  modalCancelText: { color: C.textSecondary, fontSize: 14 },
  modalConfirm: { flex: 2, paddingVertical: 14, borderRadius: 12, backgroundColor: C.gold, alignItems: 'center' },
  modalConfirmText: { color: '#09090E', fontSize: 14, fontWeight: '600' },

  detailHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 },
  detailTitle: { color: C.textPrimary, fontSize: 18, fontWeight: '500', flex: 1, marginRight: 12 },
  detailBadgeRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  detailSection: { marginTop: 18 },
  detailSectionLabel: { color: C.textDim, fontSize: 10, letterSpacing: 1.5, marginBottom: 6 },
  detailValue: { color: C.textSecondary, fontSize: 14, lineHeight: 20 },

  chatHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  chatHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  aiGlyph: { color: C.gold, fontSize: 18 },
  chatSubtitle: { color: C.textDim, fontSize: 11 },
  closeBtn: { color: C.textSecondary, fontSize: 18, padding: 4 },
  chatLog: { flex: 1 },
  chatLogContent: { gap: 10, paddingBottom: 10 },
  bubble: { maxWidth: '88%', borderRadius: 14, padding: 12 },
  bubbleAI: { alignSelf: 'flex-start', backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  bubbleUser: { alignSelf: 'flex-end', backgroundColor: C.gold + '28', borderWidth: 1, borderColor: C.gold + '44' },
  bubbleText: { fontSize: 13, lineHeight: 20 },
  bubbleTextAI: { color: C.textSecondary },
  bubbleTextUser: { color: C.textPrimary },
  quickRow: { maxHeight: 40, marginBottom: 8 },
  quickContent: { gap: 8, paddingHorizontal: 2 },
  quickBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  quickText: { color: C.textSecondary, fontSize: 11 },
  chatInputRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  chatInput: { flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 24, color: C.textPrimary, fontSize: 14, paddingHorizontal: 18, paddingVertical: 12 },
  sendBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center' },
  sendBtnText: { color: '#09090E', fontSize: 18, fontWeight: '600' },

  sliderWrap: { marginBottom: 4, alignItems: 'center' },
  slider: { width: '100%', height: 40 },
  sliderVal: { color: C.textPrimary, fontSize: 20, fontWeight: '200', textAlign: 'center', marginBottom: 2 },

  qsOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  qsSheet: { backgroundColor: C.surfaceHigh, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 24, paddingBottom: 40, paddingTop: 24, alignItems: 'center' },
  qsValue: { color: C.textPrimary, fontSize: 48, fontWeight: '200', letterSpacing: -2, marginBottom: 4 },
  qsSlider: { width: '100%', height: 44, marginBottom: 12 },
});
