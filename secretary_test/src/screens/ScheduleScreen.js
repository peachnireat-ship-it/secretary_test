import {
  Text, View, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Modal, KeyboardAvoidingView, Platform, ActivityIndicator, Alert,
  Animated, PanResponder, Linking,
} from 'react-native';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { C } from '../theme';
import { getSchedules, addSchedule, deleteSchedule, updateSchedule, getProjects, getClients, getMeetingRecords, getCurrentUser, addClient } from '../services/storage';
import { askClaude, buildScheduleSystem, stripNonKorean } from '../services/claude';

const TAGS = ['회의', '업무', '영업', '개인', '기타'];
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];

function dateStr(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
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

function useSwipeClose(onClose) {
  const translateY = useRef(new Animated.Value(0)).current;
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gs) => gs.dy > 2,
      onPanResponderMove: (_, gs) => {
        if (gs.dy > 0) translateY.setValue(gs.dy);
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dy > 80 || (gs.vy > 0.8 && gs.dy > 10)) {
          Animated.timing(translateY, { toValue: 600, duration: 220, useNativeDriver: true }).start(() => {
            translateY.setValue(0);
            onClose();
          });
        } else {
          Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
        }
      },
    })
  ).current;
  return { panHandlers: panResponder.panHandlers, animStyle: { transform: [{ translateY }] } };
}

export default function ScheduleScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const today = new Date();
  const [selectedDate, setSelectedDate] = useState(dateStr(today));
  const [schedules, setSchedules] = useState([]);
  const [projects, setProjects] = useState([]);
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth() + 1);

  const [clients, setClients] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [meetingRecords, setMeetingRecords] = useState([]);
  const [showProjectView, setShowProjectView] = useState(false);
  const [viewProject, setViewProject] = useState(null);
  const [showPersonView, setShowPersonView] = useState(false);
  const [viewPerson, setViewPerson] = useState(null);

  const [showScheduleView, setShowScheduleView] = useState(false);
  const [viewSchedule, setViewSchedule] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editTag, setEditTag] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editClientIds, setEditClientIds] = useState([]);
  const [editStartDate, setEditStartDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');

  const [showClientPicker, setShowClientPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerTempIds, setPickerTempIds] = useState([]);
  const pickerCallback = useRef(null);

  const [showPickerAddClient, setShowPickerAddClient] = useState(false);
  const [pickerNewName, setPickerNewName] = useState('');
  const [pickerNewCompany, setPickerNewCompany] = useState('');
  const [pickerNewRole, setPickerNewRole] = useState('');
  const [pickerNewContact, setPickerNewContact] = useState('');

  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newTime, setNewTime] = useState('09:00');
  const [newTag, setNewTag] = useState('회의');
  const [newNotes, setNewNotes] = useState('');
  const [newClientIds, setNewClientIds] = useState([]);
  const [newStartDate, setNewStartDate] = useState('');
  const [newStartTime, setNewStartTime] = useState('09:00');
  const [newStartAmPm, setNewStartAmPm] = useState('오전');
  const [newEndDate, setNewEndDate] = useState('');
  const [newEndTime, setNewEndTime] = useState('06:00');
  const [newEndAmPm, setNewEndAmPm] = useState('오후');
  const [newAmPm, setNewAmPm] = useState('오전');
  const [editAmPm, setEditAmPm] = useState('오전');
  const [editStartTime, setEditStartTime] = useState('09:00');
  const [editStartAmPm, setEditStartAmPm] = useState('오전');
  const [editEndTime, setEditEndTime] = useState('06:00');
  const [editEndAmPm, setEditEndAmPm] = useState('오후');

  const [showAI, setShowAI] = useState(false);
  const [chatMessages, setChatMessages] = useState([
    { role: 'assistant', text: '안녕하세요! 일정 관련해서 무엇이든 물어보세요.\n\n예) "내일 오후 2시 클라이언트 미팅 잡아줘", "이번 주 바쁜 날이 언제야?", "오늘 일정 요약해줘"' },
  ]);
  const [chatInput, setChatInput] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const chatScrollRef = useRef(null);

  const swipeAdd = useSwipeClose(() => setShowAdd(false));
  const swipeAI = useSwipeClose(() => setShowAI(false));
  const swipeProject = useSwipeClose(() => setShowProjectView(false));
  const swipePerson = useSwipeClose(() => setShowPersonView(false));
  const swipeSchedule = useSwipeClose(() => { setShowScheduleView(false); setEditMode(false); });

  const calTranslateX = useRef(new Animated.Value(0)).current;
  const moveMonthRef = useRef(null);
  const calPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5 && Math.abs(gs.dx) > 8,
      onPanResponderMove: (_, gs) => { calTranslateX.setValue(gs.dx); },
      onPanResponderRelease: (_, gs) => {
        const THRESHOLD = 60;
        if (gs.dx < -THRESHOLD || (gs.vx < -0.4 && gs.dx < -10)) {
          Animated.timing(calTranslateX, { toValue: -500, duration: 180, useNativeDriver: true }).start(() => {
            moveMonthRef.current(1);
            calTranslateX.setValue(500);
            Animated.timing(calTranslateX, { toValue: 0, duration: 180, useNativeDriver: true }).start();
          });
        } else if (gs.dx > THRESHOLD || (gs.vx > 0.4 && gs.dx > 10)) {
          Animated.timing(calTranslateX, { toValue: 500, duration: 180, useNativeDriver: true }).start(() => {
            moveMonthRef.current(-1);
            calTranslateX.setValue(-500);
            Animated.timing(calTranslateX, { toValue: 0, duration: 180, useNativeDriver: true }).start();
          });
        } else {
          Animated.spring(calTranslateX, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
        }
      },
      onPanResponderTerminate: () => {
        Animated.spring(calTranslateX, { toValue: 0, useNativeDriver: true, bounciness: 4 }).start();
      },
    })
  ).current;

  async function load() {
    const [allSchedules, allProjects, allClients, allRecords, user] = await Promise.all([getSchedules(), getProjects(), getClients(), getMeetingRecords(), getCurrentUser()]);
    setSchedules(allSchedules);
    setProjects(allProjects);
    setClients(allClients);
    setMeetingRecords(allRecords);
    setCurrentUser(user);
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, []);

  useEffect(() => {
    if (!route?.params?.openAI) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowAI(true);
    navigation.setParams({ openAI: undefined });
  }, [route?.params?.openAI]);

  useFocusEffect(useCallback(() => { load(); }, []));

  const monthPrefix = `${calYear}-${String(calMonth).padStart(2, '0')}`;
  const daySchedules = selectedDate
    ? schedules.filter((s) => s.date === selectedDate).sort((a, b) => getScheduleTime(a).localeCompare(getScheduleTime(b)))
    : schedules.filter((s) => s.date.startsWith(monthPrefix)).sort((a, b) => a.date.localeCompare(b.date) || getScheduleTime(a).localeCompare(getScheduleTime(b)));

  const monthEnd = `${monthPrefix}-${String(new Date(calYear, calMonth, 0).getDate()).padStart(2, '0')}`;
  const dayProjects = selectedDate
    ? projects.filter((p) => {
        const sd = (p.startDate || '').split(' ')[0];
        const dl = (p.deadline || '').split(' ')[0];
        return sd ? sd <= selectedDate && dl >= selectedDate : dl === selectedDate;
      })
    : projects.filter((p) => {
        const sd = (p.startDate || '').split(' ')[0];
        const dl = (p.deadline || '').split(' ')[0];
        return sd ? sd <= monthEnd && dl >= `${monthPrefix}-01` : dl >= `${monthPrefix}-01` && dl <= monthEnd;
      });

  function moveMonth(dir) {
    let m = calMonth + dir, y = calYear;
    if (m < 1) { m = 12; y -= 1; }
    if (m > 12) { m = 1; y += 1; }
    setCalYear(y); setCalMonth(m);
    if (selectedDate) {
      const [sy, sm] = selectedDate.split('-').map(Number);
      if (sy !== y || sm !== m) setSelectedDate(null);
    }
  }
  moveMonthRef.current = moveMonth;

  async function handleAdd() {
    if (!newTitle.trim()) return;
    const scheduleDate = newStartDate.trim().length === 10 ? newStartDate.trim() : selectedDate;
    const startDateStr = newStartDate.trim() ? `${newStartDate.trim()} ${to24h(newStartAmPm, newStartTime)}` : '';
    const endDateStr = newEndDate.trim() ? `${newEndDate.trim()} ${to24h(newEndAmPm, newEndTime)}` : '';
    const updated = await addSchedule({ date: scheduleDate, time: to24h(newStartAmPm, newStartTime), title: newTitle.trim(), tag: newTag, notes: newNotes.trim(), clientIds: newClientIds, startDate: startDateStr, endDate: endDateStr });
    setSchedules(updated);
    setShowAdd(false);
    setNewTitle(''); setNewTime('09:00'); setNewTag('회의'); setNewNotes(''); setNewClientIds([]);
    setNewStartDate(''); setNewStartTime('09:00'); setNewStartAmPm('오전');
    setNewEndDate(''); setNewEndTime('06:00'); setNewEndAmPm('오후'); setNewAmPm('오전');
  }

  function openClientPicker(currentIds, onConfirm) {
    setPickerTempIds([...new Set(currentIds)]);
    setPickerSearch('');
    pickerCallback.current = onConfirm;
    setShowClientPicker(true);
  }

  function confirmClientPicker() {
    if (pickerCallback.current) pickerCallback.current(pickerTempIds);
    setShowClientPicker(false);
  }

  async function handlePickerAddClient() {
    if (!pickerNewName.trim() || !pickerNewCompany.trim() || !pickerNewContact.trim()) {
      Alert.alert('필수 항목 누락', '이름, 회사명, 연락처는 필수입니다.');
      return;
    }
    const updated = await addClient({ name: pickerNewName.trim(), company: pickerNewCompany.trim(), role: pickerNewRole.trim(), contact: pickerNewContact.trim(), notes: '' });
    setClients(updated);
    const newClient = updated[0]; // addClient prepends, so index 0 is the new entry
    if (newClient) setPickerTempIds((prev) => prev.includes(newClient.id) ? prev : [...prev, newClient.id]);
    setPickerNewName(''); setPickerNewCompany(''); setPickerNewRole(''); setPickerNewContact('');
    setShowPickerAddClient(false);
  }

  async function handleDelete(id) {
    const updated = await deleteSchedule(id);
    setSchedules(updated);
  }

  async function handleEditSave() {
    if (!editTitle.trim()) return;
    const scheduleDate = editStartDate.trim().length === 10 ? editStartDate.trim() : viewSchedule.date;
    const saved24h = editStartDate.trim() ? to24h(editStartAmPm, editStartTime) : to24h(editAmPm, editTime);
    const startDateStr = editStartDate.trim() ? `${editStartDate.trim()} ${to24h(editStartAmPm, editStartTime)}` : '';
    const endDateStr = editEndDate.trim() ? `${editEndDate.trim()} ${to24h(editEndAmPm, editEndTime)}` : '';
    const updated = await updateSchedule(viewSchedule.id, {
      date: scheduleDate,
      title: editTitle.trim(),
      time: saved24h,
      tag: editTag,
      notes: editNotes.trim(),
      clientIds: editClientIds,
      startDate: startDateStr,
      endDate: endDateStr,
    });
    setSchedules(updated);
    setViewSchedule((prev) => ({ ...prev, date: scheduleDate, title: editTitle.trim(), time: saved24h, tag: editTag, notes: editNotes.trim(), clientIds: editClientIds, startDate: startDateStr, endDate: endDateStr }));
    setEditMode(false);
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
      const reply = await askClaude(apiMessages, systemPrompt, { raw: true });

      // Check if AI wants to create a schedule
      const jsonMatch = reply.match(/\{[\s\S]*"action"\s*:\s*"create_schedule"[\s\S]*\}/);
      if (jsonMatch) {
        try {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed.action === 'create_schedule' && parsed.data) {
            if (parsed.data.title) parsed.data.title = stripNonKorean(parsed.data.title).trim();
            if (parsed.data.notes) parsed.data.notes = stripNonKorean(parsed.data.notes).trim();
            if (!parsed.data.startDate && parsed.data.date) parsed.data.startDate = parsed.data.date;
            if (!parsed.data.endDate && parsed.data.date) parsed.data.endDate = parsed.data.date;
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
        <TouchableOpacity onPress={() => setSelectedDate(null)}>
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
      <View style={s.gridClip}>
        <Animated.View style={[s.grid, { transform: [{ translateX: calTranslateX }] }]} {...calPanResponder.panHandlers}>
        {buildMonthGrid(calYear, calMonth).map((cell, i) => {
          if (!cell) return <View key={`e-${i}`} style={s.gridCell} />;
          const isSelected = selectedDate === cell.str;
          const isToday = cell.str === TODAY_STR;
          const isSun = i % 7 === 0;
          const isSat = i % 7 === 6;
          const rangeProjs = projects.filter((p) => {
            const sd = (p.startDate || '').split(' ')[0];
            const dl = (p.deadline || '').split(' ')[0];
            return sd && sd <= cell.str && dl >= cell.str;
          });
          const cellSchedules = schedules.filter((sc) => sc.date === cell.str);
          const deadlineProjs = projects.filter((p) => {
            const dl = (p.deadline || '').split(' ')[0];
            return !p.startDate && dl === cell.str;
          });
          const cellDots = [
            ...cellSchedules.map((sc) => tagColor(sc.tag)),
            ...deadlineProjs.map(() => C.gold),
          ];
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
              {rangeProjs.map((proj) => {
                const sd = (proj.startDate || '').split(' ')[0];
                const dl = (proj.deadline || '').split(' ')[0];
                return (
                  <View key={proj.id} style={[
                    s.projBar,
                    {
                      marginLeft: cell.str === sd ? 4 : 0,
                      marginRight: cell.str === dl ? 4 : 0,
                      backgroundColor: statusColor(proj.status) + 'CC',
                      borderTopLeftRadius: cell.str === sd ? 4 : 0,
                      borderBottomLeftRadius: cell.str === sd ? 4 : 0,
                      borderTopRightRadius: cell.str === dl ? 4 : 0,
                      borderBottomRightRadius: cell.str === dl ? 4 : 0,
                    },
                  ]} />
                );
              })}
              {cellDots.length > 0 && (
                <View style={s.dotRow}>
                  {cellDots.map((color, di) => (
                    <View key={di} style={[s.dot, { backgroundColor: isSelected ? '#fff' : color }]} />
                  ))}
                </View>
              )}
            </TouchableOpacity>
          );
        })}
        </Animated.View>
      </View>

      {/* ── 선택 날짜 ── */}
      <View style={s.dateHeader}>
        <Text style={s.dateLabel}>{selectedDate ? formatDateKo(selectedDate) : `${calYear}년 ${calMonth}월 전체`}</Text>
        <Text style={s.dateCount}>{daySchedules.length + dayProjects.length}건</Text>
      </View>

      {/* ── 일정 목록 ── */}
      <ScrollView style={s.list} contentContainerStyle={s.listContent} showsVerticalScrollIndicator={false}>
        {daySchedules.length === 0 && dayProjects.length === 0 ? (
          <View style={s.emptyWrap}>
            <Text style={s.emptyText}>{selectedDate ? '이 날의 일정이 없습니다' : '이 달의 일정이 없습니다'}</Text>
            <Text style={s.emptyHint}>하단 + 버튼으로 추가하거나 AI에게 부탁해보세요</Text>
          </View>
        ) : selectedDate ? (
          <>
            {dayProjects.map((proj) => {
              const dayLabel = projDayLabel(proj, selectedDate);
              return (
                <TouchableOpacity key={proj.id} style={[s.projectCard, { borderColor: dayLabel.color + '55' }]} activeOpacity={0.7} onPress={() => { setViewProject(proj); setShowProjectView(true); }}>
                  <Text style={[s.projectDeadlineLabel, { color: dayLabel.color }]}>{dayLabel.text}</Text>
                  <View style={s.scheduleDivider} />
                  <View style={s.scheduleBody}>
                    <View style={s.scheduleTitleRow}>
                      <Text style={s.scheduleTitle}>{proj.title}</Text>
                      <View style={[s.tagBadge, { backgroundColor: statusColor(proj.status) + '22', borderColor: statusColor(proj.status) + '55' }]}>
                        <Text style={[s.tagText, { color: statusColor(proj.status) }]}>{proj.status}</Text>
                      </View>
                    </View>
                    {proj.startDate && (
                      <Text style={s.scheduleNotes}>{proj.startDate} ~ {proj.deadline}</Text>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
            {daySchedules.map((item) => (
              <TouchableOpacity
                key={item.id}
                style={s.scheduleCard}
                activeOpacity={0.7}
                onPress={() => { setViewSchedule(item); setEditMode(false); setShowScheduleView(true); }}
                onLongPress={() => Alert.alert('삭제', `"${item.title}" 일정을 삭제할까요?`, [
                  { text: '취소', style: 'cancel' },
                  { text: '삭제', style: 'destructive', onPress: () => handleDelete(item.id) },
                ])}
              >
                <View>
                  <Text style={s.scheduleTime}>{displayTime(getScheduleTime(item))}</Text>
                </View>
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
        ) : (
          [
            ...dayProjects.map((p) => ({ _type: 'project', _date: p.startDate || p.deadline, _time: '00:00', ...p })),
            ...daySchedules.map((sc) => ({ _type: 'schedule', _date: sc.date, _time: sc.time, ...sc })),
          ]
            .sort((a, b) => a._date.localeCompare(b._date) || a._time.localeCompare(b._time))
            .map((item) => {
              if (item._type === 'project') {
                const dayLabel = { text: item.deadline.slice(5).replace('-', '/'), color: C.gold };
                return (
                  <TouchableOpacity key={`p-${item.id}`} style={[s.projectCard, { borderColor: dayLabel.color + '55' }]} activeOpacity={0.7} onPress={() => { setViewProject(item); setShowProjectView(true); }}>
                    <Text style={[s.projectDeadlineLabel, { color: dayLabel.color }]}>{dayLabel.text}</Text>
                    <View style={s.scheduleDivider} />
                    <View style={s.scheduleBody}>
                      <View style={s.scheduleTitleRow}>
                        <Text style={s.scheduleTitle}>{item.title}</Text>
                        <View style={[s.tagBadge, { backgroundColor: statusColor(item.status) + '22', borderColor: statusColor(item.status) + '55' }]}>
                          <Text style={[s.tagText, { color: statusColor(item.status) }]}>{item.status}</Text>
                        </View>
                      </View>
                      {item.startDate && (
                        <Text style={s.scheduleNotes}>{item.startDate} ~ {item.deadline}</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              }
              return (
                <TouchableOpacity
                  key={`s-${item.id}`}
                  style={s.scheduleCard}
                  activeOpacity={0.7}
                  onPress={() => { setViewSchedule(item); setEditMode(false); setShowScheduleView(true); }}
                  onLongPress={() => Alert.alert('삭제', `"${item.title}" 일정을 삭제할까요?`, [
                    { text: '취소', style: 'cancel' },
                    { text: '삭제', style: 'destructive', onPress: () => handleDelete(item.id) },
                  ])}
                >
                  <View>
                    <Text style={s.scheduleDateSmall}>{item.date.slice(5).replace('-', '/')}</Text>
                    <Text style={s.scheduleTime}>{displayTime(getScheduleTime(item))}</Text>
                  </View>
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
              );
            })
        )}
      </ScrollView>

      {/* ── 추가 버튼 ── */}
      <TouchableOpacity style={s.fab} onPress={() => {
        const defaultDate = selectedDate || (calYear === today.getFullYear() && calMonth === today.getMonth() + 1
          ? TODAY_STR
          : `${calYear}-${String(calMonth).padStart(2, '0')}-01`);
        setNewStartDate(defaultDate); setNewEndDate(''); setShowAdd(true);
      }}>
        <Text style={s.fabText}>+</Text>
      </TouchableOpacity>

      {/* ── 일정 추가 모달 ── */}
      <Modal visible={showAdd} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalOverlay}>
          <Animated.View style={[s.modalSheet, { maxHeight: '90%' }, swipeAdd.animStyle]}>
            <View style={s.modalHandleWrap} {...swipeAdd.panHandlers}>
              <View style={s.modalHandle} />
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={s.modalTitle}>일정 추가</Text>
              <Text style={s.modalDateLabel}>{selectedDate ? formatDateKo(selectedDate) : `${calYear}년 ${calMonth}월`}</Text>

              <Text style={s.inputLabel}>제목</Text>
              <TextInput style={s.input} value={newTitle} onChangeText={setNewTitle} placeholder="일정 제목" placeholderTextColor={C.textDim} />

              <Text style={s.inputLabel}>시작일시</Text>
              <TextInput style={[s.input, { marginBottom: 8 }]} value={newStartDate} onChangeText={(t) => setNewStartDate(fmtDate(t))} placeholder="YYYY-MM-DD" placeholderTextColor={C.textDim} keyboardType="numeric" maxLength={10} />
              <View style={s.timeRow}>
                <TouchableOpacity style={[s.ampmBtn, newStartAmPm === '오전' && s.ampmBtnActive]} onPress={() => setNewStartAmPm('오전')}>
                  <Text style={[s.ampmBtnText, newStartAmPm === '오전' && s.ampmBtnTextActive]}>오전</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.ampmBtn, newStartAmPm === '오후' && s.ampmBtnActive]} onPress={() => setNewStartAmPm('오후')}>
                  <Text style={[s.ampmBtnText, newStartAmPm === '오후' && s.ampmBtnTextActive]}>오후</Text>
                </TouchableOpacity>
                <TextInput style={[s.input, { flex: 1 }]} value={newStartTime} onChangeText={(t) => setNewStartTime(fmtTime12(t))} placeholder="09:00" placeholderTextColor={C.textDim} keyboardType="numeric" maxLength={5} />
              </View>

              <Text style={s.inputLabel}>마감일시 (선택)</Text>
              <TextInput style={[s.input, { marginBottom: 8 }]} value={newEndDate} onChangeText={(t) => setNewEndDate(fmtDate(t))} placeholder="YYYY-MM-DD" placeholderTextColor={C.textDim} keyboardType="numeric" maxLength={10} />
              <View style={s.timeRow}>
                <TouchableOpacity style={[s.ampmBtn, newEndAmPm === '오전' && s.ampmBtnActive]} onPress={() => setNewEndAmPm('오전')}>
                  <Text style={[s.ampmBtnText, newEndAmPm === '오전' && s.ampmBtnTextActive]}>오전</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.ampmBtn, newEndAmPm === '오후' && s.ampmBtnActive]} onPress={() => setNewEndAmPm('오후')}>
                  <Text style={[s.ampmBtnText, newEndAmPm === '오후' && s.ampmBtnTextActive]}>오후</Text>
                </TouchableOpacity>
                <TextInput style={[s.input, { flex: 1 }]} value={newEndTime} onChangeText={(t) => setNewEndTime(fmtTime12(t))} placeholder="06:00" placeholderTextColor={C.textDim} keyboardType="numeric" maxLength={5} />
              </View>

              <Text style={s.inputLabel}>분류</Text>
              <View style={s.tagRow}>
                {TAGS.map((t) => (
                  <TouchableOpacity key={t} style={[s.tagOption, newTag === t && s.tagOptionActive]} onPress={() => setNewTag(t)}>
                    <Text style={[s.tagOptionText, newTag === t && s.tagOptionTextActive]}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={s.inputLabel}>관련 인물 · 거래처 (선택)</Text>
              {newClientIds.length > 0 && (
                <View style={s.selectedPeopleRow}>
                  {newClientIds.map((id) => {
                    const c = clients.find((cl) => cl.id === id);
                    if (!c) return null;
                    return (
                      <TouchableOpacity key={id} style={s.selectedPersonChip} onPress={() => setNewClientIds((prev) => prev.filter((x) => x !== id))}>
                        <Text style={s.selectedPersonChipText}>{c.name}</Text>
                        <Text style={s.selectedPersonChipX}> ✕</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
              <TouchableOpacity style={s.pickerTrigger} onPress={() => openClientPicker(newClientIds, setNewClientIds)}>
                <Text style={newClientIds.length > 0 ? s.pickerTriggerTextActive : s.pickerTriggerText}>
                  {newClientIds.length > 0 ? `${newClientIds.length}명 선택됨 · 변경` : '거래처 인원 선택'}
                </Text>
                <Text style={s.pickerTriggerIcon}>›</Text>
              </TouchableOpacity>

              <Text style={s.inputLabel}>메모 (선택)</Text>
              <TextInput style={[s.input, { height: 72 }]} value={newNotes} onChangeText={setNewNotes} placeholder="추가 메모" placeholderTextColor={C.textDim} multiline />

              <View style={s.modalBtns}>
                <TouchableOpacity style={s.modalCancel} onPress={() => { setShowAdd(false); setNewClientIds([]); setNewStartDate(''); setNewStartTime('09:00'); setNewStartAmPm('오전'); setNewEndDate(''); setNewEndTime('06:00'); setNewEndAmPm('오후'); setNewAmPm('오전'); }}>
                  <Text style={s.modalCancelText}>취소</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.modalConfirm} onPress={handleAdd}>
                  <Text style={s.modalConfirmText}>추가</Text>
                </TouchableOpacity>
              </View>
              <View style={{ height: 20 }} />
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── AI 채팅 모달 ── */}
      <Modal visible={showAI} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalOverlay}>
          <Animated.View style={[s.modalSheet, { height: '85%' }, swipeAI.animStyle]}>
            <View style={s.modalHandleWrap} {...swipeAI.panHandlers}>
              <View style={s.modalHandle} />
            </View>
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
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── 프로젝트 보기 모달 ── */}
      <Modal visible={showProjectView} animationType="slide" transparent onRequestClose={() => setShowProjectView(false)}>
        <View style={s.modalOverlay}>
          <Animated.View style={[s.modalSheet, { maxHeight: '80%' }, swipeProject.animStyle]}>
            <View style={s.modalHandleWrap} {...swipeProject.panHandlers}>
              <View style={s.modalHandle} />
            </View>
            {viewProject && (() => {
              const days = daysUntil(viewProject.deadline);
              const linkedMeetings = viewProject.meetingRecordIds?.length > 0
                ? meetingRecords.filter((r) => viewProject.meetingRecordIds.includes(r.id))
                : [];
              const meetingClientIds = [...new Set(linkedMeetings.flatMap((r) => r.clientIds || []))];
              const allRelatedClientIds = [...new Set([...(viewProject.clientIds || []), ...meetingClientIds])];
              const relatedPeople = allRelatedClientIds.map((id) => clients.find((c) => c.id === id)).filter(Boolean);
              return (
                <ScrollView showsVerticalScrollIndicator={false}>
                  <View style={s.modalTitleRow}>
                    <Text style={[s.modalTitle, { flex: 1 }]} numberOfLines={2}>{viewProject.title}</Text>
                    <TouchableOpacity onPress={() => setShowProjectView(false)} style={{ marginLeft: 12 }}>
                      <Text style={s.closeBtn}>✕</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={s.viewBadgeRow}>
                    <View style={[s.viewBadge, { borderColor: statusColor(viewProject.status) + '66', backgroundColor: statusColor(viewProject.status) + '18' }]}>
                      <Text style={[s.viewBadgeText, { color: statusColor(viewProject.status) }]}>{viewProject.status}</Text>
                    </View>
                    <View style={[s.viewBadge, { borderColor: priorityColor(viewProject.priority) + '55' }]}>
                      <Text style={[s.viewBadgeText, { color: priorityColor(viewProject.priority) }]}>{viewProject.priority}</Text>
                    </View>
                  </View>

                  <Text style={s.viewLabel}>진행률</Text>
                  <View style={s.viewProgressTrack}>
                    <View style={[s.viewProgressFill, { width: `${viewProject.progress}%`, backgroundColor: statusColor(viewProject.status) }]} />
                  </View>
                  <Text style={s.viewProgressText}>{viewProject.progress}% 완료</Text>

                  {viewProject.startDate ? (
                    <>
                      <Text style={s.viewLabel}>시작일</Text>
                      <Text style={s.viewText}>{viewProject.startDate}</Text>
                    </>
                  ) : null}

                  <Text style={s.viewLabel}>마감일</Text>
                  <Text style={[s.viewText, days < 0 && { color: '#C45B5B' }, days >= 0 && days <= 3 && { color: C.gold }]}>
                    {viewProject.deadline}  ·  {daysLabel(days)}
                  </Text>

                  {viewProject.notes ? (
                    <>
                      <Text style={s.viewLabel}>메모</Text>
                      <Text style={s.viewText}>{viewProject.notes}</Text>
                    </>
                  ) : null}

                  {relatedPeople.length > 0 && (
                    <>
                      <Text style={s.viewLabel}>관련 인물</Text>
                      <View style={s.viewPeopleList}>
                        {relatedPeople.map((c) => (
                          <TouchableOpacity key={c.id} style={s.viewPersonRow} activeOpacity={0.7} onPress={() => { setViewPerson(c); setShowPersonView(true); }}>
                            <View style={s.viewPersonAvatar}>
                              <Text style={s.viewPersonAvatarText}>{c.name[0]}</Text>
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={s.viewPersonName}>{c.name}</Text>
                              {c.company ? <Text style={s.viewPersonSub}>{c.company}{c.role ? ` · ${c.role}` : ''}</Text> : null}
                            </View>
                            <Text style={s.viewPersonChevron}>›</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </>
                  )}

                  <View style={{ height: 16 }} />
                </ScrollView>
              );
            })()}
          </Animated.View>
        </View>
      </Modal>

      {/* ── 일정 상세 모달 ── */}
      <Modal visible={showScheduleView} animationType="slide" transparent onRequestClose={() => { setShowScheduleView(false); setEditMode(false); }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalOverlay}>
          <Animated.View style={[s.modalSheet, { maxHeight: '80%' }, swipeSchedule.animStyle]}>
            <View style={s.modalHandleWrap} {...swipeSchedule.panHandlers}>
              <View style={s.modalHandle} />
            </View>
            {viewSchedule && (
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <View style={s.modalTitleRow}>
                  <Text style={[s.modalTitle, { flex: 1 }]} numberOfLines={2}>
                    {editMode ? '일정 수정' : viewSchedule.title}
                  </Text>
                  <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                    {!editMode && (
                      <>
                        <TouchableOpacity onPress={() => {
                          const { ampm, time12 } = from24h(viewSchedule.time);
                          setEditTitle(viewSchedule.title); setEditTime(time12); setEditAmPm(ampm);
                          setEditTag(viewSchedule.tag); setEditNotes(viewSchedule.notes || ''); setEditClientIds(viewSchedule.clientIds || []);
                          const sp = (viewSchedule.startDate || '').split(' ');
                          setEditStartDate(sp[0] || '');
                          if (sp[1]) { const r = from24h(sp[1]); setEditStartAmPm(r.ampm); setEditStartTime(r.time12); } else { setEditStartAmPm('오전'); setEditStartTime('09:00'); }
                          const ep = (viewSchedule.endDate || '').split(' ');
                          setEditEndDate(ep[0] || '');
                          if (ep[1]) { const r = from24h(ep[1]); setEditEndAmPm(r.ampm); setEditEndTime(r.time12); } else { setEditEndAmPm('오후'); setEditEndTime('06:00'); }
                          setEditMode(true);
                        }}>
                          <Text style={s.editBtn}>수정</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => Alert.alert('삭제', `"${viewSchedule.title}" 일정을 삭제할까요?`, [
                          { text: '취소', style: 'cancel' },
                          { text: '삭제', style: 'destructive', onPress: async () => { const updated = await deleteSchedule(viewSchedule.id); setSchedules(updated); setShowScheduleView(false); } },
                        ])}>
                          <Text style={s.deleteBtn}>삭제</Text>
                        </TouchableOpacity>
                      </>
                    )}
                    <TouchableOpacity onPress={() => { setShowScheduleView(false); setEditMode(false); }}>
                      <Text style={s.closeBtn}>✕</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {editMode ? (
                  <>
                    <Text style={s.inputLabel}>제목</Text>
                    <TextInput style={s.input} value={editTitle} onChangeText={setEditTitle} placeholder="일정 제목" placeholderTextColor={C.textDim} />

                    <Text style={s.inputLabel}>시작일시</Text>
                    <TextInput style={[s.input, { marginBottom: 8 }]} value={editStartDate} onChangeText={(t) => setEditStartDate(fmtDate(t))} placeholder="YYYY-MM-DD" placeholderTextColor={C.textDim} keyboardType="numeric" maxLength={10} />
                    <View style={s.timeRow}>
                      <TouchableOpacity style={[s.ampmBtn, editStartAmPm === '오전' && s.ampmBtnActive]} onPress={() => setEditStartAmPm('오전')}>
                        <Text style={[s.ampmBtnText, editStartAmPm === '오전' && s.ampmBtnTextActive]}>오전</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[s.ampmBtn, editStartAmPm === '오후' && s.ampmBtnActive]} onPress={() => setEditStartAmPm('오후')}>
                        <Text style={[s.ampmBtnText, editStartAmPm === '오후' && s.ampmBtnTextActive]}>오후</Text>
                      </TouchableOpacity>
                      <TextInput style={[s.input, { flex: 1 }]} value={editStartTime} onChangeText={(t) => setEditStartTime(fmtTime12(t))} placeholder="09:00" placeholderTextColor={C.textDim} keyboardType="numeric" maxLength={5} />
                    </View>

                    <Text style={s.inputLabel}>마감일시 (선택)</Text>
                    <TextInput style={[s.input, { marginBottom: 8 }]} value={editEndDate} onChangeText={(t) => setEditEndDate(fmtDate(t))} placeholder="YYYY-MM-DD" placeholderTextColor={C.textDim} keyboardType="numeric" maxLength={10} />
                    <View style={s.timeRow}>
                      <TouchableOpacity style={[s.ampmBtn, editEndAmPm === '오전' && s.ampmBtnActive]} onPress={() => setEditEndAmPm('오전')}>
                        <Text style={[s.ampmBtnText, editEndAmPm === '오전' && s.ampmBtnTextActive]}>오전</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[s.ampmBtn, editEndAmPm === '오후' && s.ampmBtnActive]} onPress={() => setEditEndAmPm('오후')}>
                        <Text style={[s.ampmBtnText, editEndAmPm === '오후' && s.ampmBtnTextActive]}>오후</Text>
                      </TouchableOpacity>
                      <TextInput style={[s.input, { flex: 1 }]} value={editEndTime} onChangeText={(t) => setEditEndTime(fmtTime12(t))} placeholder="06:00" placeholderTextColor={C.textDim} keyboardType="numeric" maxLength={5} />
                    </View>

                    <Text style={s.inputLabel}>분류</Text>
                    <View style={s.tagRow}>
                      {TAGS.map((t) => (
                        <TouchableOpacity key={t} style={[s.tagOption, editTag === t && s.tagOptionActive]} onPress={() => setEditTag(t)}>
                          <Text style={[s.tagOptionText, editTag === t && s.tagOptionTextActive]}>{t}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>

                    <Text style={s.inputLabel}>관련 인물 · 거래처 (선택)</Text>
                    {editClientIds.length > 0 && (
                      <View style={s.selectedPeopleRow}>
                        {editClientIds.map((id) => {
                          const c = clients.find((cl) => cl.id === id);
                          if (!c) return null;
                          return (
                            <TouchableOpacity key={id} style={s.selectedPersonChip} onPress={() => setEditClientIds((prev) => prev.filter((x) => x !== id))}>
                              <Text style={s.selectedPersonChipText}>{c.name}</Text>
                              <Text style={s.selectedPersonChipX}> ✕</Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                    <TouchableOpacity style={s.pickerTrigger} onPress={() => openClientPicker(editClientIds, setEditClientIds)}>
                      <Text style={editClientIds.length > 0 ? s.pickerTriggerTextActive : s.pickerTriggerText}>
                        {editClientIds.length > 0 ? `${editClientIds.length}명 선택됨 · 변경` : '거래처 인원 선택'}
                      </Text>
                      <Text style={s.pickerTriggerIcon}>›</Text>
                    </TouchableOpacity>

                    <Text style={s.inputLabel}>메모 (선택)</Text>
                    <TextInput style={[s.input, { height: 72 }]} value={editNotes} onChangeText={setEditNotes} placeholder="추가 메모" placeholderTextColor={C.textDim} multiline />

                    <View style={s.modalBtns}>
                      <TouchableOpacity style={s.modalCancel} onPress={() => setEditMode(false)}>
                        <Text style={s.modalCancelText}>취소</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={s.modalConfirm} onPress={handleEditSave}>
                        <Text style={s.modalConfirmText}>저장</Text>
                      </TouchableOpacity>
                    </View>
                  </>
                ) : (
                  <>
                    <Text style={s.modalDateLabel}>{formatDateKo(viewSchedule.date)}</Text>

                    <Text style={s.viewLabel}>시작일시</Text>
                    <Text style={s.viewText}>{formatStartDateTime(viewSchedule)}</Text>

                    {viewSchedule.endDate ? (
                      <>
                        <Text style={s.viewLabel}>마감일시</Text>
                        <Text style={s.viewText}>{formatDateTimeKo(viewSchedule.endDate)}</Text>
                      </>
                    ) : null}

                    <Text style={s.viewLabel}>분류</Text>
                    <View style={[s.tagBadge, { alignSelf: 'flex-start', marginBottom: 16, backgroundColor: tagColor(viewSchedule.tag) + '22', borderColor: tagColor(viewSchedule.tag) + '55' }]}>
                      <Text style={[s.tagText, { color: tagColor(viewSchedule.tag) }]}>{viewSchedule.tag}</Text>
                    </View>

                    {viewSchedule.notes ? (
                      <>
                        <Text style={s.viewLabel}>메모</Text>
                        <Text style={s.viewText}>{viewSchedule.notes}</Text>
                      </>
                    ) : null}

                    {(viewSchedule.clientIds?.length > 0) && (() => {
                      const people = viewSchedule.clientIds.map((id) => clients.find((c) => c.id === id)).filter(Boolean);
                      if (people.length === 0) return null;
                      return (
                        <>
                          <Text style={s.viewLabel}>관련 인물</Text>
                          <View style={s.viewPeopleList}>
                            {people.map((c) => (
                              <TouchableOpacity key={c.id} style={s.viewPersonRow} activeOpacity={0.7} onPress={() => { setViewPerson(c); setShowPersonView(true); }}>
                                <View style={s.viewPersonAvatar}>
                                  <Text style={s.viewPersonAvatarText}>{c.name[0]}</Text>
                                </View>
                                <View style={{ flex: 1 }}>
                                  <Text style={s.viewPersonName}>{c.name}</Text>
                                  {c.company ? <Text style={s.viewPersonSub}>{c.company}{c.role ? ` · ${c.role}` : ''}</Text> : null}
                                </View>
                                <Text style={s.viewPersonChevron}>›</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        </>
                      );
                    })()}
                  </>
                )}
                <View style={{ height: 16 }} />
              </ScrollView>
            )}
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── 인물 상세 모달 ── */}
      <Modal visible={showPersonView} animationType="slide" transparent onRequestClose={() => setShowPersonView(false)}>
        <View style={s.modalOverlay}>
          <Animated.View style={[s.modalSheet, { maxHeight: '70%' }, swipePerson.animStyle]}>
            <View style={s.modalHandleWrap} {...swipePerson.panHandlers}>
              <View style={s.modalHandle} />
            </View>
            {viewPerson && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={s.personHeader}>
                  <View style={s.personAvatar}>
                    <Text style={s.personAvatarText}>{viewPerson.name[0]}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.personName}>{viewPerson.name}</Text>
                    {viewPerson.company ? (
                      <Text style={s.personSub}>{viewPerson.company}{viewPerson.role ? ` · ${viewPerson.role}` : ''}</Text>
                    ) : null}
                  </View>
                  <TouchableOpacity onPress={() => setShowPersonView(false)}>
                    <Text style={s.closeBtn}>✕</Text>
                  </TouchableOpacity>
                </View>

                {viewPerson.contact ? (
                  <>
                    <Text style={s.viewLabel}>연락처</Text>
                    <TouchableOpacity onPress={() => Alert.alert(
                      '전화 걸기',
                      `${viewPerson.name}(${viewPerson.contact})에게 전화하시겠습니까?`,
                      [
                        { text: '취소', style: 'cancel' },
                        { text: '전화 걸기', onPress: () => Linking.openURL(`tel:${viewPerson.contact.replace(/[^0-9+]/g, '')}`) },
                      ]
                    )}>
                      <Text style={[s.viewText, s.contactLink]}>{viewPerson.contact}</Text>
                    </TouchableOpacity>
                  </>
                ) : null}

                {viewPerson.notes ? (
                  <>
                    <Text style={s.viewLabel}>메모</Text>
                    <Text style={s.viewText}>{viewPerson.notes}</Text>
                  </>
                ) : null}

                <View style={{ height: 16 }} />
              </ScrollView>
            )}
          </Animated.View>
        </View>
      </Modal>

      {/* ── 거래처 인원 피커 팝업 ── */}
      <Modal visible={showClientPicker} animationType="slide" transparent onRequestClose={() => setShowClientPicker(false)}>
        <View style={s.pickerOverlay}>
          <View style={s.pickerSheet}>
            <View style={s.pickerHeader}>
              <TouchableOpacity onPress={() => setShowClientPicker(false)} style={s.pickerHeaderBtn}>
                <Text style={s.pickerCancelText}>취소</Text>
              </TouchableOpacity>
              <Text style={s.pickerTitle}>거래처 인원 선택</Text>
              <TouchableOpacity onPress={confirmClientPicker} style={s.pickerHeaderBtn}>
                <Text style={s.pickerConfirmText}>
                  확인{pickerTempIds.length > 0 ? ` (${pickerTempIds.length})` : ''}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={s.pickerSearchWrap}>
              <TextInput
                style={s.pickerSearchInput}
                value={pickerSearch}
                onChangeText={setPickerSearch}
                placeholder="이름 또는 회사 검색"
                placeholderTextColor={C.textDim}
              />
            </View>

            <ScrollView style={s.pickerList} showsVerticalScrollIndicator={false}>
              <TouchableOpacity style={s.pickerAddNewBtn} onPress={() => setShowPickerAddClient(true)}>
                <Text style={s.pickerAddNewText}>+ 신규 거래처 인원 등록</Text>
              </TouchableOpacity>
              {(() => {
                const isSelf = (c) =>
                  currentUser &&
                  c.name === currentUser.name &&
                  (c.role || '') === (currentUser.role || '') &&
                  (c.company || '') === (currentUser.team || '');
                const filtered = clients.filter((c) =>
                  !isSelf(c) &&
                  (pickerSearch.trim() === '' ||
                    c.name.includes(pickerSearch.trim()) ||
                    (c.company || '').includes(pickerSearch.trim()))
                );
                if (filtered.length === 0) {
                  return <Text style={s.clientSearchEmpty}>검색 결과 없음</Text>;
                }
                return filtered.map((c) => {
                  const selected = pickerTempIds.includes(c.id);
                  return (
                    <TouchableOpacity
                      key={c.id}
                      style={[s.pickerRow, selected && s.pickerRowSelected]}
                      onPress={() => setPickerTempIds((prev) =>
                        selected ? prev.filter((x) => x !== c.id) : prev.includes(c.id) ? prev : [...prev, c.id]
                      )}
                      activeOpacity={0.7}
                    >
                      <View style={[s.pickerAvatar, selected && s.pickerAvatarSelected]}>
                        <Text style={[s.pickerAvatarText, selected && s.pickerAvatarTextSelected]}>{c.name[0]}</Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={[s.pickerName, selected && s.pickerNameSelected]}>{c.name}</Text>
                        {c.company ? <Text style={s.pickerSub}>{c.company}{c.role ? ` · ${c.role}` : ''}</Text> : null}
                      </View>
                      <View style={[s.pickerCheck, selected && s.pickerCheckSelected]}>
                        {selected && <Text style={s.pickerCheckMark}>✓</Text>}
                      </View>
                    </TouchableOpacity>
                  );
                });
              })()}
              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── 신규 거래처 인원 등록 (피커에서 진입) ── */}
      <Modal visible={showPickerAddClient} animationType="slide" transparent onRequestClose={() => setShowPickerAddClient(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.pickerOverlay}>
          <View style={s.pickerSheet}>
            <View style={s.pickerHeader}>
              <TouchableOpacity onPress={() => setShowPickerAddClient(false)} style={s.pickerHeaderBtn}>
                <Text style={s.pickerCancelText}>취소</Text>
              </TouchableOpacity>
              <Text style={s.pickerTitle}>신규 거래처 인원 등록</Text>
              <TouchableOpacity onPress={handlePickerAddClient} style={s.pickerHeaderBtn}>
                <Text style={s.pickerConfirmText}>추가</Text>
              </TouchableOpacity>
            </View>
            <ScrollView style={s.pickerAddForm} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={s.inputLabel}>이름 *</Text>
              <TextInput style={s.input} value={pickerNewName} onChangeText={setPickerNewName} placeholder="홍길동" placeholderTextColor={C.textDim} />
              <Text style={s.inputLabel}>회사명 *</Text>
              <TextInput style={s.input} value={pickerNewCompany} onChangeText={setPickerNewCompany} placeholder="(주)ABC" placeholderTextColor={C.textDim} />
              <Text style={s.inputLabel}>직책</Text>
              <TextInput style={s.input} value={pickerNewRole} onChangeText={setPickerNewRole} placeholder="구매팀장" placeholderTextColor={C.textDim} />
              <Text style={s.inputLabel}>연락처 *</Text>
              <TextInput style={s.input} value={pickerNewContact} onChangeText={setPickerNewContact} placeholder="010-0000-0000" placeholderTextColor={C.textDim} keyboardType="phone-pad" />
              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

function to24h(ampm, time12) {
  const parts = time12.split(':');
  let h = parseInt(parts[0], 10) || 0;
  const m = parseInt(parts[1], 10) || 0;
  if (ampm === '오후' && h !== 12) h += 12;
  if (ampm === '오전' && h === 12) h = 0;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function from24h(time24) {
  const parts = (time24 || '09:00').split(':');
  const h = parseInt(parts[0], 10) || 0;
  const mStr = parts[1] || '00';
  const ampm = h < 12 ? '오전' : '오후';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return { ampm, time12: `${String(h12).padStart(2, '0')}:${mStr}` };
}

function displayTime(time24) {
  const { ampm, time12 } = from24h(time24);
  return `${ampm} ${time12}`;
}

function getScheduleTime(item) {
  if (item.startDate && item.startDate.includes(' ')) return item.startDate.split(' ')[1];
  return item.time;
}

function formatDateTimeKo(dateTimeStr) {
  if (!dateTimeStr) return '';
  const [datePart, timePart] = dateTimeStr.split(' ');
  const [y, m, d] = datePart.split('-');
  const dateKo = `${y}년 ${parseInt(m)}월 ${parseInt(d)}일`;
  if (!timePart) return dateKo;
  const { ampm, time12 } = from24h(timePart);
  return `${dateKo} ${ampm} ${time12}`;
}

function formatStartDateTime(schedule) {
  if (schedule.startDate && schedule.startDate.includes(' ')) {
    return formatDateTimeKo(schedule.startDate);
  }
  const datePart = schedule.startDate || schedule.date;
  return formatDateTimeKo(`${datePart} ${schedule.time || '00:00'}`);
}

function fmtTime12(text) {
  const d = text.replace(/\D/g, '').slice(0, 4);
  if (d.length <= 1) return d;
  const hRaw = parseInt(d.slice(0, 2), 10);
  const h = Math.min(Math.max(hRaw, 1), 12);
  const hStr = String(h).padStart(2, '0');
  if (d.length === 2) return hStr;
  const mStr = d.slice(2);
  if (d.length === 3) return `${hStr}:${mStr}`;
  const mRaw = parseInt(mStr, 10);
  return `${hStr}:${String(Math.min(mRaw, 59)).padStart(2, '0')}`;
}

function fmtDate(text) {
  const d = text.replace(/\D/g, '').slice(0, 8);
  if (d.length <= 4) return d;
  if (d.length <= 6) return `${d.slice(0, 4)}-${d.slice(4)}`;
  return `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6)}`;
}

function fmtTime(text) {
  const d = text.replace(/\D/g, '').slice(0, 4);
  if (d.length <= 2) return d;
  return `${d.slice(0, 2)}:${d.slice(2)}`;
}

function projDayLabel(proj, date) {
  const sd = (proj.startDate || '').split(' ')[0];
  const dl = (proj.deadline || '').split(' ')[0];
  if (sd === date) return { text: '시작', color: C.accentTeal };
  if (dl === date) return { text: '마감', color: C.gold };
  const days = daysUntil(proj.deadline);
  return { text: `D-${days}`, color: C.accentBlue };
}

function daysUntil(deadlineStr) {
  const t = new Date();
  t.setHours(0, 0, 0, 0);
  const datePart = (deadlineStr || '').split(' ')[0];
  return Math.round((new Date(datePart) - t) / 86400000);
}

function daysLabel(days) {
  if (days > 0) return `${days}일 후 마감`;
  if (days === 0) return '오늘 마감';
  return `${Math.abs(days)}일 초과`;
}

function priorityColor(priority) {
  return { 높음: '#C45B5B', 보통: C.gold, 낮음: C.accentTeal }[priority] || C.textDim;
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
  gridClip: { overflow: 'hidden' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 12, marginBottom: 8 },
  gridCell: { width: '14.28%', minHeight: 52, alignItems: 'center', justifyContent: 'flex-start', paddingVertical: 4 },
  gridNumWrap: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  gridNumWrapActive: { backgroundColor: C.accentBlue, borderRadius: 15 },
  gridNum: { color: C.textSecondary, fontSize: 13, fontWeight: '300' },
  gridNumActive: { color: '#fff', fontWeight: '600' },
  gridNumToday: { color: C.gold, fontWeight: '600' },
  dot: { width: 4, height: 4, borderRadius: 2, backgroundColor: C.accentBlue, marginTop: 2 },
  dotActive: { backgroundColor: '#fff' },
  projBar: { width: '100%', height: 4, marginTop: 2 },
  dotRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 2, marginTop: 2, justifyContent: 'center', maxWidth: '90%' },
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
  modalTitleRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
  viewBadgeRow: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  viewBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, borderWidth: 1 },
  viewBadgeText: { fontSize: 12, fontWeight: '500' },
  viewLabel: { color: C.textDim, fontSize: 11, fontWeight: '500', letterSpacing: 0.5, marginBottom: 6 },
  viewProgressTrack: { height: 4, backgroundColor: C.border, borderRadius: 2, marginBottom: 4 },
  viewProgressFill: { height: 4, borderRadius: 2 },
  viewProgressText: { color: C.textDim, fontSize: 11, marginBottom: 16 },
  viewText: { color: C.textSecondary, fontSize: 14, lineHeight: 20, marginBottom: 16 },
  viewPeopleList: { gap: 8, marginBottom: 16 },
  viewPersonRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  viewPersonAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.accentBlue + '33', alignItems: 'center', justifyContent: 'center' },
  viewPersonAvatarText: { color: C.accentBlue, fontSize: 13, fontWeight: '600' },
  viewPersonName: { color: C.textPrimary, fontSize: 13, fontWeight: '400' },
  viewPersonSub: { color: C.textDim, fontSize: 11 },
  viewPersonChevron: { color: C.textDim, fontSize: 18 },
  personHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 20 },
  personAvatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: C.accentBlue + '33', alignItems: 'center', justifyContent: 'center' },
  personAvatarText: { color: C.accentBlue, fontSize: 20, fontWeight: '600' },
  personName: { color: C.textPrimary, fontSize: 18, fontWeight: '400' },
  personSub: { color: C.textDim, fontSize: 13, marginTop: 2 },
  contactLink: { color: C.accentBlue, textDecorationLine: 'underline' },
  projectDeadlineLabel: { color: C.gold, fontSize: 11, fontWeight: '600', width: 44, textAlign: 'center' },
  scheduleTime: { color: C.textSecondary, fontSize: 12, fontWeight: '500', width: 64 },
  scheduleDateSmall: { color: C.textDim, fontSize: 9, fontWeight: '500', marginBottom: 2 },
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
  modalHandleWrap: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 40, marginBottom: 10 },
  modalHandle: { width: 36, height: 4, backgroundColor: C.borderHigh, borderRadius: 2 },
  modalTitle: { color: C.textPrimary, fontSize: 18, fontWeight: '400', marginBottom: 4 },
  modalDateLabel: { color: C.textDim, fontSize: 12, marginBottom: 20 },
  inputLabel: { color: C.textDim, fontSize: 10, letterSpacing: 1.5, marginBottom: 8, marginTop: 16 },
  input: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, color: C.textPrimary, fontSize: 14, paddingHorizontal: 14, paddingVertical: 12 },
  timeRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  ampmBtn: { paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  ampmBtnActive: { borderColor: C.accentBlue + '88', backgroundColor: C.accentBlue + '22' },
  ampmBtnText: { color: C.textDim, fontSize: 14 },
  ampmBtnTextActive: { color: C.accentBlue, fontWeight: '500' },
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
  editBtn: { color: C.accentBlue, fontSize: 14, fontWeight: '500', padding: 4 },
  deleteBtn: { color: '#C45B5B', fontSize: 14, fontWeight: '500', padding: 4 },
  selectedPeopleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  selectedPersonChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, backgroundColor: C.accentBlue + '22', borderWidth: 1, borderColor: C.accentBlue + '55', borderRadius: 12 },
  selectedPersonChipText: { color: C.accentBlue, fontSize: 12, fontWeight: '500' },
  selectedPersonChipX: { color: C.accentBlue, fontSize: 11 },
  clientSearchEmpty: { color: C.textDim, fontSize: 12, padding: 12, textAlign: 'center' },

  // Client picker trigger
  pickerTrigger: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12 },
  pickerTriggerText: { color: C.textDim, fontSize: 14, flex: 1 },
  pickerTriggerTextActive: { color: C.accentBlue, fontSize: 14, fontWeight: '500', flex: 1 },
  pickerTriggerIcon: { color: C.textDim, fontSize: 18 },

  // Client picker modal
  pickerOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  pickerSheet: { backgroundColor: C.surfaceHigh, borderTopLeftRadius: 20, borderTopRightRadius: 20, height: '80%' },
  pickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  pickerHeaderBtn: { minWidth: 52 },
  pickerTitle: { color: C.textPrimary, fontSize: 16, fontWeight: '500' },
  pickerCancelText: { color: C.textSecondary, fontSize: 15 },
  pickerConfirmText: { color: C.accentBlue, fontSize: 15, fontWeight: '600', textAlign: 'right' },
  pickerSearchWrap: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  pickerSearchInput: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, color: C.textPrimary, fontSize: 14, paddingHorizontal: 14, paddingVertical: 10 },
  pickerList: { flex: 1 },
  pickerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  pickerRowSelected: { backgroundColor: C.accentBlue + '0D' },
  pickerAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.border, alignItems: 'center', justifyContent: 'center' },
  pickerAvatarSelected: { backgroundColor: C.accentBlue + '33' },
  pickerAvatarText: { color: C.textDim, fontSize: 14, fontWeight: '600' },
  pickerAvatarTextSelected: { color: C.accentBlue },
  pickerName: { color: C.textPrimary, fontSize: 14 },
  pickerNameSelected: { color: C.accentBlue, fontWeight: '500' },
  pickerSub: { color: C.textDim, fontSize: 11, marginTop: 2 },
  pickerCheck: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  pickerCheckSelected: { backgroundColor: C.accentBlue, borderColor: C.accentBlue },
  pickerCheckMark: { color: '#fff', fontSize: 12, fontWeight: '700' },
  pickerAddNewBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.accentBlue + '0A' },
  pickerAddNewText: { color: C.accentBlue, fontSize: 14, fontWeight: '500' },
  pickerAddForm: { flex: 1, paddingHorizontal: 20 },

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
