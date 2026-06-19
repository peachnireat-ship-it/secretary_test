import {
  Text, View, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Modal, KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { C } from '../theme';
import { getSchedules, addSchedule, deleteSchedule, getProjects } from '../services/storage';
import { askClaude, buildScheduleSystem } from '../services/claude';

const TAGS = ['회의', '업무', '영업', '개인', '기타'];
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

function dateStr(d) {
  return d.toISOString().split('T')[0];
}

function formatDateKo(str) {
  const [y, m, d] = str.split('-');
  return `${y}년 ${parseInt(m)}월 ${parseInt(d)}일`;
}

const TODAY_STR = dateStr(new Date());

function buildMonthGrid(year, month) {
  // month: 1-based
  const firstDay = new Date(year, month - 1, 1).getDay();
  const daysInMonth = new Date(year, month, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    const dt = new Date(year, month - 1, d);
    cells.push({ str: dateStr(dt), date: d, day: DAYS[dt.getDay()] });
  }
  return cells;
}

export default function ScheduleScreen() {
  const insets = useSafeAreaInsets();
  const today = new Date();
  const [selectedDate, setSelectedDate] = useState(dateStr(today));
  const [schedules, setSchedules] = useState([]);
  const [projects, setProjects] = useState([]);
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth() + 1);

  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newTime, setNewTime] = useState('09:00');
  const [newTag, setNewTag] = useState('회의');
  const [newNotes, setNewNotes] = useState('');

  const [showAI, setShowAI] = useState(false);
  const [chatMessages, setChatMessages] = useState([
    { role: 'assistant', text: '안녕하세요! 일정 관련해서 무엇이든 물어보세요.\n\n예) "내일 오후 2시 클라이언트 미팅 잡아줘", "이번 주 바쁜 날이 언제야?", "오늘 일정 요약해줘"' },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const chatScrollRef = useRef(null);

  useEffect(() => { load(); }, []);

  useFocusEffect(useCallback(() => { load(); }, []));

  async function load() {
    const [allSchedules, allProjects] = await Promise.all([getSchedules(), getProjects()]);
    setSchedules(allSchedules);
    setProjects(allProjects);
  }

  const daySchedules = schedules
    .filter((s) => s.date === selectedDate)
    .sort((a, b) => a.time.localeCompare(b.time));

  const dayProjects = projects.filter((p) => p.deadline === selectedDate);

  function moveMonth(dir) {
    let m = calMonth + dir, y = calYear;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    setCalYear(y); setCalMonth(m);
  }

  async function handleAdd() {
    if (!newTitle.trim()) return;
    const updated = await addSchedule({ date: selectedDate, time: newTime, title: newTitle.trim(), tag: newTag, notes: newNotes.trim() });
    setSchedules(updated);
    setShowAdd(false);
    setNewTitle(''); setNewTime('09:00'); setNewTag('회의'); setNewNotes('');
  }

  async function handleDelete(id) {
    const updated = await deleteSchedule(id);
    setSchedules(updated);
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

      const systemPrompt = buildScheduleSystem(schedules);
      const reply = await askClaude(apiMessages, systemPrompt);

      // Check if AI wants to create a schedule
      const jsonMatch = reply.match(/\{[\s\S]*"action"\s*:\s*"create_schedule"[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.action === 'create_schedule' && parsed.data) {
            const updated = await addSchedule(parsed.data);
            setSchedules(updated);
            const confirmText = `일정을 추가했습니다.\n📅 ${parsed.data.date} ${parsed.data.time} — ${parsed.data.title} (${parsed.data.tag})`;
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

  return (
    <View style={s.root}>
      {/* ── 헤더 ── */}
      <View style={[s.header, { paddingTop: insets.top + 16 }]}>
        <Text style={s.headerTitle}>일정 관리</Text>
        <TouchableOpacity style={s.aiBtn} onPress={() => setShowAI(true)}>
          <Text style={s.aiBtnText}>✦ AI</Text>
        </TouchableOpacity>
      </View>

      {/* ── 월 네비게이션 ── */}
      <View style={s.monthNav}>
        <TouchableOpacity onPress={() => moveMonth(-1)} style={s.monthArrow}>
          <Text style={s.monthArrowText}>‹</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { setCalYear(today.getFullYear()); setCalMonth(today.getMonth() + 1); setSelectedDate(TODAY_STR); }}>
          <Text style={s.monthLabel}>{calYear}년 {calMonth}월</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => moveMonth(1)} style={s.monthArrow}>
          <Text style={s.monthArrowText}>›</Text>
        </TouchableOpacity>
      </View>

      {/* ── 요일 헤더 ── */}
      <View style={s.weekHeader}>
        {DAYS.map((d) => (
          <Text key={d} style={[s.weekDay, d === '일' && { color: '#C45B5B' }, d === '토' && { color: C.accentBlue }]}>{d}</Text>
        ))}
      </View>

      {/* ── 캘린더 그리드 ── */}
      <View style={s.grid}>
        {buildMonthGrid(calYear, calMonth).map((cell, i) => {
          if (!cell) return <View key={`e-${i}`} style={s.gridCell} />;
          const isSelected = selectedDate === cell.str;
          const isToday = cell.str === TODAY_STR;
          const hasSched = schedules.some((sc) => sc.date === cell.str) || projects.some((p) => p.deadline === cell.str);
          const isSun = i % 7 === 0;
          const isSat = i % 7 === 6;
          return (
            <TouchableOpacity key={cell.str} style={s.gridCell} onPress={() => setSelectedDate(cell.str)}>
              <View style={[s.gridNumWrap, isSelected && s.gridNumWrapActive]}>
                <Text style={[
                  s.gridNum,
                  isSelected && s.gridNumActive,
                  isToday && !isSelected && s.gridNumToday,
                  isSun && !isSelected && { color: '#C45B5B' },
                  isSat && !isSelected && { color: C.accentBlue },
                ]}>{cell.date}</Text>
              </View>
              {hasSched && <View style={[s.dot, isSelected && s.dotActive]} />}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* ── 선택 날짜 ── */}
      <View style={s.dateHeader}>
        <Text style={s.dateLabel}>{formatDateKo(selectedDate)}</Text>
        <Text style={s.dateCount}>{daySchedules.length + dayProjects.length}건</Text>
      </View>

      {/* ── 일정 목록 ── */}
      <ScrollView style={s.list} contentContainerStyle={s.listContent} showsVerticalScrollIndicator={false}>
        {daySchedules.length === 0 && dayProjects.length === 0 ? (
          <View style={s.emptyWrap}>
            <Text style={s.emptyText}>이 날의 일정이 없습니다</Text>
            <Text style={s.emptyHint}>하단 + 버튼으로 추가하거나 AI에게 부탁해보세요</Text>
          </View>
        ) : (
          <>
            {dayProjects.map((proj) => (
              <View key={proj.id} style={s.projectCard}>
                <Text style={s.projectDeadlineLabel}>마감</Text>
                <View style={s.scheduleDivider} />
                <View style={s.scheduleBody}>
                  <View style={s.scheduleTitleRow}>
                    <Text style={s.scheduleTitle}>{proj.title}</Text>
                    <View style={[s.tagBadge, { backgroundColor: statusColor(proj.status) + '22', borderColor: statusColor(proj.status) + '55' }]}>
                      <Text style={[s.tagText, { color: statusColor(proj.status) }]}>{proj.status}</Text>
                    </View>
                  </View>
                </View>
              </View>
            ))}
            {daySchedules.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={s.scheduleCard}
                activeOpacity={0.7}
                onLongPress={() => Alert.alert('삭제', `"${item.title}" 일정을 삭제할까요?`, [
                  { text: '취소', style: 'cancel' },
                  { text: '삭제', style: 'destructive', onPress: () => handleDelete(item.id) },
                ])}
              >
                <Text style={s.scheduleTime}>{item.time}</Text>
                <View style={s.scheduleDivider} />
                <View style={s.scheduleBody}>
                  <View style={s.scheduleTitleRow}>
                    <Text style={s.scheduleTitle}>{item.title}</Text>
                    <View style={[s.tagBadge, { backgroundColor: tagColor(item.tag) + '22', borderColor: tagColor(item.tag) + '55' }]}>
                      <Text style={[s.tagText, { color: tagColor(item.tag) }]}>{item.tag}</Text>
                    </View>
                  </View>
                  {item.notes ? <Text style={s.scheduleNotes}>{item.notes}</Text> : null}
                </View>
              </TouchableOpacity>
            ))}
          </>
        )}
      </ScrollView>

      {/* ── 추가 버튼 ── */}
      <TouchableOpacity style={s.fab} onPress={() => setShowAdd(true)}>
        <Text style={s.fabText}>+</Text>
      </TouchableOpacity>

      {/* ── 일정 추가 모달 ── */}
      <Modal visible={showAdd} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHandle} />
            <Text style={s.modalTitle}>일정 추가</Text>
            <Text style={s.modalDateLabel}>{formatDateKo(selectedDate)}</Text>

            <Text style={s.inputLabel}>제목</Text>
            <TextInput style={s.input} value={newTitle} onChangeText={setNewTitle} placeholder="일정 제목" placeholderTextColor={C.textDim} />

            <Text style={s.inputLabel}>시간</Text>
            <TextInput style={s.input} value={newTime} onChangeText={setNewTime} placeholder="09:00" placeholderTextColor={C.textDim} />

            <Text style={s.inputLabel}>분류</Text>
            <View style={s.tagRow}>
              {TAGS.map((t) => (
                <TouchableOpacity key={t} style={[s.tagOption, newTag === t && s.tagOptionActive]} onPress={() => setNewTag(t)}>
                  <Text style={[s.tagOptionText, newTag === t && s.tagOptionTextActive]}>{t}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={s.inputLabel}>메모 (선택)</Text>
            <TextInput style={[s.input, { height: 72 }]} value={newNotes} onChangeText={setNewNotes} placeholder="추가 메모" placeholderTextColor={C.textDim} multiline />

            <View style={s.modalBtns}>
              <TouchableOpacity style={s.modalCancel} onPress={() => setShowAdd(false)}>
                <Text style={s.modalCancelText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.modalConfirm} onPress={handleAdd}>
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
                <Text style={s.aiGlyph}>✦</Text>
                <Text style={s.modalTitle}>AI 일정 비서</Text>
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
                  <ActivityIndicator size="small" color={C.accentBlue} />
                </View>
              )}
            </ScrollView>

            <View style={s.chatInputRow}>
              <TextInput
                style={s.chatInput}
                value={chatInput}
                onChangeText={setChatInput}
                placeholder="일정에 대해 물어보세요..."
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
    </View>
  );
}

function tagColor(tag) {
  const map = { 회의: C.accentBlue, 업무: C.gold, 영업: C.accentTeal, 개인: C.accentPurple, 기타: C.textSecondary };
  return map[tag] || C.textSecondary;
}

function statusColor(status) {
  const map = { 진행중: C.accentBlue, 위험: '#C45B5B', 지연: C.gold, 완료: C.accentTeal, 취소: C.textSecondary };
  return map[status] || C.textSecondary;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 60, paddingHorizontal: 24, paddingBottom: 16 },
  headerTitle: { color: C.textPrimary, fontSize: 22, fontWeight: '300', letterSpacing: -0.5 },
  aiBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: C.accentBlue + '22', borderWidth: 1, borderColor: C.accentBlue + '55', borderRadius: 20 },
  aiBtnText: { color: C.accentBlue, fontSize: 12, fontWeight: '600', letterSpacing: 1 },
  monthNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingVertical: 8 },
  monthArrow: { padding: 8 },
  monthArrowText: { color: C.textSecondary, fontSize: 24, lineHeight: 28 },
  monthLabel: { color: C.textPrimary, fontSize: 15, fontWeight: '400' },
  weekHeader: { flexDirection: 'row', paddingHorizontal: 12, marginBottom: 4 },
  weekDay: { flex: 1, textAlign: 'center', color: C.textDim, fontSize: 10, letterSpacing: 0.5 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, marginBottom: 8 },
  gridCell: { width: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
  gridNumWrap: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  gridNumWrapActive: { backgroundColor: C.accentBlue, borderRadius: 15 },
  gridNum: { color: C.textSecondary, fontSize: 13, fontWeight: '300' },
  gridNumActive: { color: '#fff', fontWeight: '600' },
  gridNumToday: { color: C.gold, fontWeight: '600' },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: C.accentBlue, marginTop: 2 },
  dotActive: { backgroundColor: '#fff' },
  dateHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24, paddingVertical: 12 },
  dateLabel: { color: C.textSecondary, fontSize: 13 },
  dateCount: { color: C.textDim, fontSize: 12 },
  list: { flex: 1 },
  listContent: { paddingHorizontal: 24, paddingBottom: 100, gap: 10 },
  emptyWrap: { paddingTop: 60, alignItems: 'center', gap: 8 },
  emptyText: { color: C.textDim, fontSize: 14 },
  emptyHint: { color: C.textDim, fontSize: 11, textAlign: 'center' },
  scheduleCard: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14 },
  projectCard: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.gold + '55', borderRadius: 12, flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14 },
  projectDeadlineLabel: { color: C.gold, fontSize: 11, fontWeight: '600', width: 44, textAlign: 'center' },
  scheduleTime: { color: C.textSecondary, fontSize: 13, fontWeight: '500', width: 44 },
  scheduleDivider: { width: 1, height: 32, backgroundColor: C.borderHigh },
  scheduleBody: { flex: 1, gap: 4 },
  scheduleTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  scheduleTitle: { color: C.textPrimary, fontSize: 14, flex: 1 },
  scheduleNotes: { color: C.textDim, fontSize: 11 },
  tagBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  tagText: { fontSize: 10, fontWeight: '500' },
  fab: { position: 'absolute', bottom: 30, right: 24, width: 52, height: 52, borderRadius: 26, backgroundColor: C.accentBlue, alignItems: 'center', justifyContent: 'center' },
  fabText: { color: '#fff', fontSize: 26, lineHeight: 30 },

  // Modal
  modalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  modalSheet: { backgroundColor: C.surfaceHigh, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 24, paddingBottom: 40, paddingTop: 12 },
  modalHandle: { width: 36, height: 4, backgroundColor: C.borderHigh, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  modalTitle: { color: C.textPrimary, fontSize: 18, fontWeight: '400', marginBottom: 4 },
  modalDateLabel: { color: C.textDim, fontSize: 12, marginBottom: 20 },
  inputLabel: { color: C.textDim, fontSize: 10, letterSpacing: 1.5, marginBottom: 8, marginTop: 16 },
  input: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, color: C.textPrimary, fontSize: 14, paddingHorizontal: 14, paddingVertical: 12 },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tagOption: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  tagOptionActive: { borderColor: C.accentBlue + '88', backgroundColor: C.accentBlue + '22' },
  tagOptionText: { color: C.textDim, fontSize: 12 },
  tagOptionTextActive: { color: C.accentBlue },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 24 },
  modalCancel: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  modalCancelText: { color: C.textSecondary, fontSize: 14 },
  modalConfirm: { flex: 2, paddingVertical: 14, borderRadius: 12, backgroundColor: C.accentBlue, alignItems: 'center' },
  modalConfirmText: { color: '#fff', fontSize: 14, fontWeight: '600' },

  // AI Chat
  chatHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  chatHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  aiGlyph: { color: C.accentBlue, fontSize: 16 },
  closeBtn: { color: C.textSecondary, fontSize: 18, padding: 4 },
  chatLog: { flex: 1 },
  chatLogContent: { gap: 10, paddingBottom: 10 },
  bubble: { maxWidth: '85%', borderRadius: 14, padding: 12 },
  bubbleAI: { alignSelf: 'flex-start', backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  bubbleUser: { alignSelf: 'flex-end', backgroundColor: C.accentBlue + '33', borderWidth: 1, borderColor: C.accentBlue + '55' },
  bubbleText: { fontSize: 13, lineHeight: 20 },
  bubbleTextAI: { color: C.textSecondary },
  bubbleTextUser: { color: C.textPrimary },
  chatInputRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  chatInput: { flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 24, color: C.textPrimary, fontSize: 14, paddingHorizontal: 18, paddingVertical: 12 },
  sendBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: C.accentBlue, alignItems: 'center', justifyContent: 'center' },
  sendBtnText: { color: '#fff', fontSize: 18 },
});
