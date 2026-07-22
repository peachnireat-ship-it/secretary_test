import {
  Text, View, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Modal, KeyboardAvoidingView, Platform, ActivityIndicator,
  Animated, PanResponder, Linking,
} from 'react-native';
import { Alert } from '../utils/alertCompat';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { C } from '../theme';
import { commonStyles } from '../styles/common';
import { getSchedules, addSchedule, deleteSchedule, updateSchedule, getProjects, updateProject, getClients, getMeetingRecords, addClient } from '../services/storage';
import { askClaude, buildScheduleSystem, stripNonKorean } from '../services/claude';
import { useSwipeClose } from '../hooks/useSwipeClose';
import { useUser } from '../context/UserContext';
import { priorityColor, tagColor, statusColor } from '../utils/colors';
import { daysUntil, daysLabel, findOverlappingItems, formatOverlapMessage, isValidOptionalDateStr } from '../utils/dateUtils';

const TAGS = ['회의', '업무', '영업', '개인', '기타'];
const DAYS = ['일', '월', '화', '수', '목', '금', '토'];
const DELAY_EXEMPT_STATUSES = ['완료', '취소', '지연'];
const TITLE_MAX_LENGTH = 200;
const NOTES_MAX_LENGTH = 2000;
// 국내 전화번호 형식 검증: 010-1234-5678, 02-123-4567, 031-1234-5678 등. 하이픈은 선택.
const PHONE_REGEX = /^0\d{1,2}-?\d{3,4}-?\d{4}$/;

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

// 마감일이 지났는데도 완료/취소/지연 상태가 아닌 프로젝트를 '지연'으로 자동 전환하고 서버에 반영
async function autoMarkDelayedProjects(projectList) {
  const overdue = projectList.filter((p) => !DELAY_EXEMPT_STATUSES.includes(p.status) && daysUntil(p.deadline) < 0);
  if (!overdue.length) return projectList;
  await Promise.all(overdue.map((p) => updateProject(p.id, { status: '지연' })));
  const overdueIds = new Set(overdue.map((p) => p.id));
  return projectList.map((p) => (overdueIds.has(p.id) ? { ...p, status: '지연' } : p));
}

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

export default function ScheduleScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const today = new Date();
  const [selectedDate, setSelectedDate] = useState(dateStr(today));
  const [schedules, setSchedules] = useState([]);
  const [projects, setProjects] = useState([]);
  const [calYear, setCalYear] = useState(today.getFullYear());
  const [calMonth, setCalMonth] = useState(today.getMonth() + 1);

  const [clients, setClients] = useState([]);
  const { user: currentUser } = useUser();
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
  const [editNotifyEmail, setEditNotifyEmail] = useState(true);

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
  const [newNotifyEmail, setNewNotifyEmail] = useState(true);
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

  const swipeAdd = useSwipeClose(() => setShowAdd(false), showAdd);
  const swipeAI = useSwipeClose(() => setShowAI(false), showAI);
  const swipeProject = useSwipeClose(() => setShowProjectView(false), showProjectView);
  const swipePerson = useSwipeClose(() => setShowPersonView(false), showPersonView);
  const swipeSchedule = useSwipeClose(() => { setShowScheduleView(false); setEditMode(false); }, showScheduleView);

  // eslint-disable-next-line react-hooks/refs -- Animated.Value는 최초 렌더에서 한 번만 생성되는 안전한 패턴
  const calTranslateX = useRef(new Animated.Value(0)).current;
  const urgencyAnim = useRef(new Animated.Value(0)).current;
  const moveMonthRef = useRef(null);
  const calPanResponder = useRef(
    // eslint-disable-next-line react-hooks/refs -- PanResponder는 마운트 시 한 번만 생성됨
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
    const [allSchedules, allProjects, allClients, allRecords] = await Promise.all([getSchedules(), getProjects(), getClients(), getMeetingRecords()]);
    setSchedules(allSchedules);
    setProjects(await autoMarkDelayedProjects(allProjects));
    setClients(allClients);
    setMeetingRecords(allRecords);
  }

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(urgencyAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
        Animated.timing(urgencyAnim, { toValue: 0.1, duration: 600, useNativeDriver: true }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, []);

  useEffect(() => {
    if (!route?.params?.openAI) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setShowAI(true);
    navigation.setParams({ openAI: undefined });
  }, [route?.params?.openAI]);

  useFocusEffect(useCallback(() => { load(); }, []));

  const monthPrefix = `${calYear}-${String(calMonth).padStart(2, '0')}`;
  const monthEnd = `${monthPrefix}-${String(new Date(calYear, calMonth, 0).getDate()).padStart(2, '0')}`;
  const monthStart = `${monthPrefix}-01`;

  // 선택 날짜/월에 해당하는 일정 목록 — schedules나 selectedDate가 바뀔 때만 재계산 (매 렌더 재필터링 방지)
  const daySchedules = useMemo(() => (
    selectedDate
      ? schedules.filter((s) => {
          const sd = (s.startDate || '').split(' ')[0] || s.date;
          const ed = (s.endDate || '').split(' ')[0] || s.date;
          return sd <= selectedDate && ed >= selectedDate;
        }).sort((a, b) => getScheduleTime(a).localeCompare(getScheduleTime(b)))
      : schedules.filter((s) => {
          const sd = (s.startDate || '').split(' ')[0] || s.date;
          const ed = (s.endDate || '').split(' ')[0] || s.date;
          return sd <= monthEnd && ed >= monthStart;
        }).sort((a, b) => a.date.localeCompare(b.date) || getScheduleTime(a).localeCompare(getScheduleTime(b)))
  ), [schedules, selectedDate, monthStart, monthEnd]);

  // 선택 날짜/월에 해당하는 프로젝트 목록 — projects나 selectedDate가 바뀔 때만 재계산
  const dayProjects = useMemo(() => (
    selectedDate
      ? projects.filter((p) => {
          const sd = (p.startDate || '').split(' ')[0];
          const dl = (p.deadline || '').split(' ')[0];
          return sd ? sd <= selectedDate && dl >= selectedDate : dl === selectedDate;
        })
      : projects.filter((p) => {
          const sd = (p.startDate || '').split(' ')[0];
          const dl = (p.deadline || '').split(' ')[0];
          return sd ? sd <= monthEnd && dl >= monthStart : dl >= monthStart && dl <= monthEnd;
        })
  ), [projects, selectedDate, monthStart, monthEnd]);

  // 달력 그리드 — calYear/calMonth가 바뀔 때만 재계산 (매 렌더 재계산 방지)
  const monthGrid = useMemo(() => buildMonthGrid(calYear, calMonth), [calYear, calMonth]);

  // 프로젝트/일정을 날짜별로 사전 인덱싱 — 캘린더 셀(최대 42개)마다 전체 배열을 재순회하지 않도록 함
  const { rangeProjectList, deadlineProjectsByDate, rangeScheduleList, scheduleListByDate } = useMemo(() => {
    const deadlineMap = new Map(); // date -> project[] (startDate 없는 프로젝트의 마감일 표시용)
    const rangeProjects = [];
    for (const p of projects) {
      if (p.startDate) {
        rangeProjects.push(p);
      } else {
        const dl = (p.deadline || '').split(' ')[0];
        if (dl) {
          const arr = deadlineMap.get(dl);
          if (arr) arr.push(p); else deadlineMap.set(dl, [p]);
        }
      }
    }
    const scheduleMap = new Map(); // date -> schedule[] (sc.date 기준)
    const rangeSchedules = [];
    for (const sc of schedules) {
      const sd = (sc.startDate || '').split(' ')[0];
      const ed = (sc.endDate || '').split(' ')[0];
      if (sd && ed && sd !== ed) rangeSchedules.push(sc);
      const arr = scheduleMap.get(sc.date);
      if (arr) arr.push(sc); else scheduleMap.set(sc.date, [sc]);
    }
    return { rangeProjectList: rangeProjects, deadlineProjectsByDate: deadlineMap, rangeScheduleList: rangeSchedules, scheduleListByDate: scheduleMap };
  }, [projects, schedules]);

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
  // eslint-disable-next-line react-hooks/refs -- 렌더마다 최신 moveMonth를 ref에 동기화하는 안전한 패턴(panResponder 콜백에서 최신 함수 참조용)
  moveMonthRef.current = moveMonth;

  async function saveNewSchedule(scheduleDate, startDateStr, endDateStr) {
    const updated = await addSchedule({ date: scheduleDate, time: to24h(newStartAmPm, newStartTime), title: newTitle.trim(), tag: newTag, notes: newNotes.trim(), clientIds: newClientIds, startDate: startDateStr, endDate: endDateStr, notifyEmail: newNotifyEmail });
    setSchedules(updated);
    setShowAdd(false);
    setNewTitle(''); setNewTime('09:00'); setNewTag('회의'); setNewNotes(''); setNewClientIds([]);
    setNewStartDate(''); setNewStartTime('09:00'); setNewStartAmPm('오전');
    setNewEndDate(''); setNewEndTime('06:00'); setNewEndAmPm('오후'); setNewAmPm('오전');
    setNewNotifyEmail(true);
  }

  async function handleAdd() {
    if (!newTitle.trim()) return;
    if (newTitle.trim().length > TITLE_MAX_LENGTH) {
      Alert.alert('입력 길이 초과', `제목은 최대 ${TITLE_MAX_LENGTH}자까지 입력 가능합니다.`);
      return;
    }
    if (newNotes.trim().length > NOTES_MAX_LENGTH) {
      Alert.alert('입력 길이 초과', `메모는 최대 ${NOTES_MAX_LENGTH}자까지 입력 가능합니다.`);
      return;
    }
    const startTrim = newStartDate.trim();
    const endTrim = newEndDate.trim();
    if (!isValidOptionalDateStr(startTrim)) {
      Alert.alert('날짜 오류', '날짜를 YYYY-MM-DD 형식으로 완전히 입력해주세요.');
      return;
    }
    if (!isValidOptionalDateStr(endTrim)) {
      Alert.alert('날짜 오류', '날짜를 YYYY-MM-DD 형식으로 완전히 입력해주세요.');
      return;
    }
    if (startTrim.length === 10 && endTrim.length === 10 && endTrim < startTrim) {
      Alert.alert('날짜 오류', '마감일시는 시작일시보다 빠를 수 없습니다.');
      return;
    }
    const scheduleDate = startTrim.length === 10 ? startTrim : selectedDate;
    const startDateStr = startTrim ? `${startTrim} ${to24h(newStartAmPm, newStartTime)}` : '';
    const endDateStr = endTrim ? `${endTrim} ${to24h(newEndAmPm, newEndTime)}` : '';

    const rangeEnd = endTrim.length === 10 ? endTrim : scheduleDate;
    const overlaps = findOverlappingItems({ start: scheduleDate, end: rangeEnd, schedules, projects, excludeType: 'schedule' });
    if (overlaps.length > 0) {
      Alert.alert(
        '일정 겹침',
        `다음 일정/프로젝트와 기간이 겹칩니다.\n\n${formatOverlapMessage(overlaps)}\n\n그래도 이 일자로 등록하시겠습니까?`,
        [
          { text: '취소', style: 'cancel' },
          { text: '그대로 등록', onPress: () => saveNewSchedule(scheduleDate, startDateStr, endDateStr) },
        ]
      );
      return;
    }
    await saveNewSchedule(scheduleDate, startDateStr, endDateStr);
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
    if (!PHONE_REGEX.test(pickerNewContact.trim())) {
      Alert.alert('연락처 형식 오류', '올바른 전화번호 형식이 아닙니다. (예: 010-1234-5678)');
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

  async function handleCopy(schedule) {
    const { id, createdAt, ...rest } = schedule;
    const copied = { ...rest, title: `${schedule.title} (복사본)` };
    const updated = await addSchedule(copied);
    setSchedules(updated);
  }

  async function saveEditedSchedule(scheduleDate, saved24h, startDateStr, endDateStr) {
    const updated = await updateSchedule(viewSchedule.id, {
      date: scheduleDate,
      title: editTitle.trim(),
      time: saved24h,
      tag: editTag,
      notes: editNotes.trim(),
      clientIds: editClientIds,
      startDate: startDateStr,
      endDate: endDateStr,
      notifyEmail: editNotifyEmail,
    });
    setSchedules(updated);
    setViewSchedule((prev) => ({ ...prev, date: scheduleDate, title: editTitle.trim(), time: saved24h, tag: editTag, notes: editNotes.trim(), clientIds: editClientIds, startDate: startDateStr, endDate: endDateStr, notifyEmail: editNotifyEmail }));
    setEditMode(false);
  }

  async function handleEditSave() {
    if (!editTitle.trim()) return;
    if (editTitle.trim().length > TITLE_MAX_LENGTH) {
      Alert.alert('입력 길이 초과', `제목은 최대 ${TITLE_MAX_LENGTH}자까지 입력 가능합니다.`);
      return;
    }
    if (editNotes.trim().length > NOTES_MAX_LENGTH) {
      Alert.alert('입력 길이 초과', `메모는 최대 ${NOTES_MAX_LENGTH}자까지 입력 가능합니다.`);
      return;
    }
    const editStartTrim = editStartDate.trim();
    const editEndTrim = editEndDate.trim();
    if (!isValidOptionalDateStr(editStartTrim)) {
      Alert.alert('날짜 오류', '날짜를 YYYY-MM-DD 형식으로 완전히 입력해주세요.');
      return;
    }
    if (!isValidOptionalDateStr(editEndTrim)) {
      Alert.alert('날짜 오류', '날짜를 YYYY-MM-DD 형식으로 완전히 입력해주세요.');
      return;
    }
    if (editStartTrim.length === 10 && editEndTrim.length === 10 && editEndTrim < editStartTrim) {
      Alert.alert('날짜 오류', '마감일시는 시작일시보다 빠를 수 없습니다.');
      return;
    }
    const scheduleDate = editStartTrim.length === 10 ? editStartTrim : viewSchedule.date;
    const saved24h = editStartTrim ? to24h(editStartAmPm, editStartTime) : to24h(editAmPm, editTime);
    const startDateStr = editStartTrim ? `${editStartTrim} ${to24h(editStartAmPm, editStartTime)}` : '';
    const endDateStr = editEndTrim ? `${editEndTrim} ${to24h(editEndAmPm, editEndTime)}` : '';

    const rangeEnd = editEndTrim.length === 10 ? editEndTrim : scheduleDate;
    const overlaps = findOverlappingItems({ start: scheduleDate, end: rangeEnd, schedules, projects, excludeId: viewSchedule.id, excludeType: 'schedule' });
    if (overlaps.length > 0) {
      Alert.alert(
        '일정 겹침',
        `다음 일정/프로젝트와 기간이 겹칩니다.\n\n${formatOverlapMessage(overlaps)}\n\n그래도 이 일자로 등록하시겠습니까?`,
        [
          { text: '취소', style: 'cancel' },
          { text: '그대로 등록', onPress: () => saveEditedSchedule(scheduleDate, saved24h, startDateStr, endDateStr) },
        ]
      );
      return;
    }
    await saveEditedSchedule(scheduleDate, saved24h, startDateStr, endDateStr);
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
        {/* eslint-disable-next-line react-hooks/refs -- calPanResponder/calTranslateX는 최초 렌더에서 한 번만 생성되는 안전한 ref */}
        <Animated.View style={[s.grid, { transform: [{ translateX: calTranslateX }] }]} {...calPanResponder.panHandlers}>
        {monthGrid.map((cell, i) => {
          if (!cell) return <View key={`e-${i}`} style={s.gridCell} />;
          const isSelected = selectedDate === cell.str;
          const isToday = cell.str === TODAY_STR;
          const isSun = i % 7 === 0;
          const isSat = i % 7 === 6;
          const rangeProjs = rangeProjectList.filter((p) => {
            const sd = (p.startDate || '').split(' ')[0];
            const dl = (p.deadline || '').split(' ')[0];
            return sd <= cell.str && dl >= cell.str;
          });
          const rangeSchedules = rangeScheduleList.filter((sc) => {
            const sd = (sc.startDate || '').split(' ')[0];
            const ed = (sc.endDate || '').split(' ')[0];
            return sd <= cell.str && ed >= cell.str;
          });
          const rangeScheduleIds = new Set(rangeSchedules.map((sc) => sc.id));
          const cellSchedules = (scheduleListByDate.get(cell.str) || []).filter((sc) => !rangeScheduleIds.has(sc.id));
          const deadlineProjs = deadlineProjectsByDate.get(cell.str) || [];
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
              {rangeSchedules.map((sc) => {
                const sd = (sc.startDate || '').split(' ')[0];
                const ed = (sc.endDate || '').split(' ')[0];
                return (
                  <View key={sc.id} style={[
                    s.projBar,
                    {
                      marginLeft: cell.str === sd ? 4 : 0,
                      marginRight: cell.str === ed ? 4 : 0,
                      backgroundColor: tagColor(sc.tag) + 'CC',
                      borderTopLeftRadius: cell.str === sd ? 4 : 0,
                      borderBottomLeftRadius: cell.str === sd ? 4 : 0,
                      borderTopRightRadius: cell.str === ed ? 4 : 0,
                      borderBottomRightRadius: cell.str === ed ? 4 : 0,
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
            {/* eslint-disable-next-line react-hooks/refs -- urgencyAnim은 최초 렌더에서 한 번만 생성되는 Animated.Value ref */}
            {dayProjects.map((proj) => {
              const urgency = getUrgency(proj.deadline, proj.status);
              const urgencyColor = urgency === 2 ? '#C45B5B' : C.gold;
              return (
                <View key={proj.id}>
                  <TouchableOpacity style={s.itemCard} activeOpacity={0.7} onPress={() => { setViewProject(proj); setShowProjectView(true); }}>
                    <Text style={[s.projectDeadlineLabel, s.projectLabelTeal]}>프로젝트</Text>
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
                  {urgency > 0 && (
                    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, s.urgencyBorder, { borderColor: urgencyColor, opacity: urgencyAnim }]} />
                  )}
                </View>
              );
            })}
            {/* eslint-disable-next-line react-hooks/refs -- urgencyAnim은 최초 렌더에서 한 번만 생성되는 Animated.Value ref */}
            {daySchedules.map((item) => {
              const urgency = getUrgency(item.endDate || item.date);
              const urgencyColor = urgency === 2 ? '#C45B5B' : C.gold;
              return (
                <View key={item.id}>
                  <TouchableOpacity
                    style={s.itemCard}
                    activeOpacity={0.7}
                    onPress={() => { setViewSchedule(item); setEditMode(false); setShowScheduleView(true); }}
                    onLongPress={() => Alert.alert('삭제', `"${item.title}" 일정을 삭제할까요?`, [
                      { text: '취소', style: 'cancel' },
                      { text: '삭제', style: 'destructive', onPress: () => handleDelete(item.id) },
                    ])}
                  >
                    <Text style={[s.projectDeadlineLabel, s.projectLabelBlue]}>일정</Text>
                    <View style={s.scheduleDivider} />
                    <View style={s.scheduleBody}>
                      <View style={s.scheduleTitleRow}>
                        <Text style={s.scheduleTitle}>{item.title}</Text>
                        <View style={[s.tagBadge, { backgroundColor: tagColor(item.tag) + '22', borderColor: tagColor(item.tag) + '55' }]}>
                          <Text style={[s.tagText, { color: tagColor(item.tag) }]}>{item.tag}</Text>
                        </View>
                      </View>
                      {scheduleDateRange(item) ? <Text style={s.scheduleNotes}>{scheduleDateRange(item)}</Text> : null}
                      {item.notes ? <Text style={s.scheduleNotes}>{item.notes}</Text> : null}
                    </View>
                  </TouchableOpacity>
                  {urgency > 0 && (
                    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, s.urgencyBorder, { borderColor: urgencyColor, opacity: urgencyAnim }]} />
                  )}
                </View>
              );
            })}
          </>
        ) : (
          [
            ...dayProjects.map((p) => ({ _type: 'project', _date: p.startDate || p.deadline, _time: '00:00', ...p })),
            ...daySchedules.map((sc) => ({ _type: 'schedule', _date: sc.date, _time: sc.time, ...sc })),
          ]
            .sort((a, b) => a._date.localeCompare(b._date) || a._time.localeCompare(b._time))
            // eslint-disable-next-line react-hooks/refs -- urgencyAnim은 최초 렌더에서 한 번만 생성되는 Animated.Value ref
            .map((item) => {
              if (item._type === 'project') {
                const urgency = getUrgency(item.deadline, item.status);
                const urgencyColor = urgency === 2 ? '#C45B5B' : C.gold;
                return (
                  <View key={`p-${item.id}`}>
                    <TouchableOpacity style={s.itemCard} activeOpacity={0.7} onPress={() => { setViewProject(item); setShowProjectView(true); }}>
                      <Text style={[s.projectDeadlineLabel, s.projectLabelTeal]}>프로젝트</Text>
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
                    {urgency > 0 && (
                      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, s.urgencyBorder, { borderColor: urgencyColor, opacity: urgencyAnim }]} />
                    )}
                  </View>
                );
              }
              const urgency = getUrgency(item.endDate || item.date);
              const urgencyColor = urgency === 2 ? '#C45B5B' : C.gold;
              return (
                <View key={`s-${item.id}`}>
                  <TouchableOpacity
                    style={s.itemCard}
                    activeOpacity={0.7}
                    onPress={() => { setViewSchedule(item); setEditMode(false); setShowScheduleView(true); }}
                    onLongPress={() => Alert.alert('삭제', `"${item.title}" 일정을 삭제할까요?`, [
                      { text: '취소', style: 'cancel' },
                      { text: '삭제', style: 'destructive', onPress: () => handleDelete(item.id) },
                    ])}
                  >
                    <Text style={[s.projectDeadlineLabel, s.projectLabelBlue]}>일정</Text>
                    <View style={s.scheduleDivider} />
                    <View style={s.scheduleBody}>
                      <View style={s.scheduleTitleRow}>
                        <Text style={s.scheduleTitle}>{item.title}</Text>
                        <View style={[s.tagBadge, { backgroundColor: tagColor(item.tag) + '22', borderColor: tagColor(item.tag) + '55' }]}>
                          <Text style={[s.tagText, { color: tagColor(item.tag) }]}>{item.tag}</Text>
                        </View>
                      </View>
                      {scheduleDateRange(item) ? <Text style={s.scheduleNotes}>{scheduleDateRange(item)}</Text> : null}
                      {item.notes ? <Text style={s.scheduleNotes}>{item.notes}</Text> : null}
                    </View>
                  </TouchableOpacity>
                  {urgency > 0 && (
                    <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, s.urgencyBorder, { borderColor: urgencyColor, opacity: urgencyAnim }]} />
                  )}
                </View>
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
          <Animated.View style={[s.sheetBase, s.modalSheet, commonStyles.maxH90pct, swipeAdd.animStyle]}>
            <View style={s.modalHandleWrap} {...swipeAdd.panHandlers}>
              <View style={s.modalHandle} />
            </View>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={s.modalTitle}>일정 추가</Text>
              <Text style={s.modalDateLabel}>{selectedDate ? formatDateKo(selectedDate) : `${calYear}년 ${calMonth}월`}</Text>

              <Text style={s.inputLabel}>제목</Text>
              <TextInput style={s.input} value={newTitle} onChangeText={setNewTitle} placeholder="일정 제목" placeholderTextColor={C.textDim} />

              <Text style={s.inputLabel}>시작일시</Text>
              <TextInput style={[s.input, commonStyles.mb8]} value={newStartDate} onChangeText={(t) => setNewStartDate(fmtDate(t))} placeholder="YYYY-MM-DD" placeholderTextColor={C.textDim} keyboardType="numeric" maxLength={10} />
              <View style={s.timeRow}>
                <TouchableOpacity style={[s.ampmBtn, newStartAmPm === '오전' && s.optionActive]} onPress={() => setNewStartAmPm('오전')}>
                  <Text style={[s.ampmBtnText, newStartAmPm === '오전' && s.ampmBtnTextActive]}>오전</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.ampmBtn, newStartAmPm === '오후' && s.optionActive]} onPress={() => setNewStartAmPm('오후')}>
                  <Text style={[s.ampmBtnText, newStartAmPm === '오후' && s.ampmBtnTextActive]}>오후</Text>
                </TouchableOpacity>
                <TextInput style={[s.input, commonStyles.flex1]} value={newStartTime} onChangeText={(t) => setNewStartTime(fmtTime12(t))} placeholder="09:00" placeholderTextColor={C.textDim} keyboardType="numeric" maxLength={5} />
              </View>

              <Text style={s.inputLabel}>마감일시 (선택)</Text>
              <TextInput style={[s.input, commonStyles.mb8]} value={newEndDate} onChangeText={(t) => setNewEndDate(fmtDate(t))} placeholder="YYYY-MM-DD" placeholderTextColor={C.textDim} keyboardType="numeric" maxLength={10} />
              <View style={s.timeRow}>
                <TouchableOpacity style={[s.ampmBtn, newEndAmPm === '오전' && s.optionActive]} onPress={() => setNewEndAmPm('오전')}>
                  <Text style={[s.ampmBtnText, newEndAmPm === '오전' && s.ampmBtnTextActive]}>오전</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.ampmBtn, newEndAmPm === '오후' && s.optionActive]} onPress={() => setNewEndAmPm('오후')}>
                  <Text style={[s.ampmBtnText, newEndAmPm === '오후' && s.ampmBtnTextActive]}>오후</Text>
                </TouchableOpacity>
                <TextInput style={[s.input, commonStyles.flex1]} value={newEndTime} onChangeText={(t) => setNewEndTime(fmtTime12(t))} placeholder="06:00" placeholderTextColor={C.textDim} keyboardType="numeric" maxLength={5} />
              </View>

              <Text style={s.inputLabel}>분류</Text>
              <View style={s.tagRow}>
                {TAGS.map((t) => (
                  <TouchableOpacity key={t} style={[s.tagOption, newTag === t && s.optionActive]} onPress={() => setNewTag(t)}>
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
                <Text style={[s.pickerTriggerText, newClientIds.length > 0 && s.pickerTriggerTextActive]}>
                  {newClientIds.length > 0 ? `${newClientIds.length}명 선택됨 · 변경` : '거래처 인원 선택'}
                </Text>
                <Text style={s.pickerTriggerIcon}>›</Text>
              </TouchableOpacity>

              <Text style={s.inputLabel}>메모 (선택)</Text>
              <TextInput style={[s.input, s.h72]} value={newNotes} onChangeText={setNewNotes} placeholder="추가 메모" placeholderTextColor={C.textDim} multiline />

              {/* 알림 메일 발송 여부 */}
              <TouchableOpacity
                style={s.notifyEmailRow}
                activeOpacity={0.7}
                onPress={() => setNewNotifyEmail((prev) => !prev)}
              >
                <View style={[s.notifyEmailCheckbox, newNotifyEmail && s.notifyEmailCheckboxChecked]}>
                  {newNotifyEmail && <Text style={s.notifyEmailCheckmark}>✓</Text>}
                </View>
                <Text style={s.notifyEmailLabel}>관련 인물에게 알림 메일 발송</Text>
              </TouchableOpacity>

              <View style={s.modalBtns}>
                <TouchableOpacity style={s.modalCancel} onPress={() => { setShowAdd(false); setNewClientIds([]); setNewStartDate(''); setNewStartTime('09:00'); setNewStartAmPm('오전'); setNewEndDate(''); setNewEndTime('06:00'); setNewEndAmPm('오후'); setNewAmPm('오전'); setNewNotifyEmail(true); }}>
                  <Text style={s.modalCancelText}>취소</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.modalConfirm} onPress={handleAdd}>
                  <Text style={s.modalConfirmText}>추가</Text>
                </TouchableOpacity>
              </View>
              <View style={commonStyles.spacerH20} />
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── AI 채팅 모달 ── */}
      <Modal visible={showAI} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalOverlay}>
          <Animated.View style={[s.sheetBase, s.modalSheet, commonStyles.h85pct, swipeAI.animStyle]}>
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
              <TouchableOpacity style={[s.sendBtn, !chatInput.trim() && commonStyles.opacity40]} onPress={handleAIChat} disabled={!chatInput.trim() || aiLoading}>
                <Text style={s.sendBtnText}>↑</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── 프로젝트 보기 모달 ── */}
      <Modal visible={showProjectView} animationType="slide" transparent onRequestClose={() => setShowProjectView(false)}>
        <View style={s.modalOverlay}>
          <Animated.View style={[s.sheetBase, s.modalSheet, commonStyles.maxH80pct, swipeProject.animStyle]}>
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
                    <Text style={[s.modalTitle, commonStyles.flex1]} numberOfLines={2}>{viewProject.title}</Text>
                    <TouchableOpacity onPress={() => setShowProjectView(false)} style={commonStyles.ml12}>
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
                            <View style={commonStyles.flex1}>
                              <Text style={s.viewPersonName}>{c.name}</Text>
                              {c.company ? <Text style={s.viewPersonSub}>{c.company}{c.role ? ` · ${c.role}` : ''}</Text> : null}
                            </View>
                            <Text style={s.viewPersonChevron}>›</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </>
                  )}

                  <View style={s.spacerH16} />
                </ScrollView>
              );
            })()}
          </Animated.View>
        </View>
      </Modal>

      {/* ── 일정 상세 모달 ── */}
      <Modal visible={showScheduleView} animationType="slide" transparent onRequestClose={() => { setShowScheduleView(false); setEditMode(false); }}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalOverlay}>
          <Animated.View style={[s.sheetBase, s.modalSheet, commonStyles.maxH80pct, swipeSchedule.animStyle]}>
            <View style={s.modalHandleWrap} {...swipeSchedule.panHandlers}>
              <View style={s.modalHandle} />
            </View>
            {viewSchedule && (
              <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <View style={s.modalTitleRow}>
                  <Text style={[s.modalTitle, commonStyles.flex1]} numberOfLines={2}>
                    {editMode ? '일정 수정' : viewSchedule.title}
                  </Text>
                  <View style={s.titleActionRow}>
                    {!editMode && (
                      <>
                        <TouchableOpacity onPress={() => {
                          const { ampm, time12 } = from24h(viewSchedule.time);
                          setEditTitle(viewSchedule.title); setEditTime(time12); setEditAmPm(ampm);
                          setEditTag(viewSchedule.tag); setEditNotes(viewSchedule.notes || ''); setEditClientIds(viewSchedule.clientIds || []);
                          setEditNotifyEmail(viewSchedule.notifyEmail !== false);
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
                        <TouchableOpacity onPress={async () => { await handleCopy(viewSchedule); setShowScheduleView(false); }}>
                          <Text style={s.copyBtn}>복사</Text>
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
                    <TextInput style={[s.input, commonStyles.mb8]} value={editStartDate} onChangeText={(t) => setEditStartDate(fmtDate(t))} placeholder="YYYY-MM-DD" placeholderTextColor={C.textDim} keyboardType="numeric" maxLength={10} />
                    <View style={s.timeRow}>
                      <TouchableOpacity style={[s.ampmBtn, editStartAmPm === '오전' && s.optionActive]} onPress={() => setEditStartAmPm('오전')}>
                        <Text style={[s.ampmBtnText, editStartAmPm === '오전' && s.ampmBtnTextActive]}>오전</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[s.ampmBtn, editStartAmPm === '오후' && s.optionActive]} onPress={() => setEditStartAmPm('오후')}>
                        <Text style={[s.ampmBtnText, editStartAmPm === '오후' && s.ampmBtnTextActive]}>오후</Text>
                      </TouchableOpacity>
                      <TextInput style={[s.input, commonStyles.flex1]} value={editStartTime} onChangeText={(t) => setEditStartTime(fmtTime12(t))} placeholder="09:00" placeholderTextColor={C.textDim} keyboardType="numeric" maxLength={5} />
                    </View>

                    <Text style={s.inputLabel}>마감일시 (선택)</Text>
                    <TextInput style={[s.input, commonStyles.mb8]} value={editEndDate} onChangeText={(t) => setEditEndDate(fmtDate(t))} placeholder="YYYY-MM-DD" placeholderTextColor={C.textDim} keyboardType="numeric" maxLength={10} />
                    <View style={s.timeRow}>
                      <TouchableOpacity style={[s.ampmBtn, editEndAmPm === '오전' && s.optionActive]} onPress={() => setEditEndAmPm('오전')}>
                        <Text style={[s.ampmBtnText, editEndAmPm === '오전' && s.ampmBtnTextActive]}>오전</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[s.ampmBtn, editEndAmPm === '오후' && s.optionActive]} onPress={() => setEditEndAmPm('오후')}>
                        <Text style={[s.ampmBtnText, editEndAmPm === '오후' && s.ampmBtnTextActive]}>오후</Text>
                      </TouchableOpacity>
                      <TextInput style={[s.input, commonStyles.flex1]} value={editEndTime} onChangeText={(t) => setEditEndTime(fmtTime12(t))} placeholder="06:00" placeholderTextColor={C.textDim} keyboardType="numeric" maxLength={5} />
                    </View>

                    <Text style={s.inputLabel}>분류</Text>
                    <View style={s.tagRow}>
                      {TAGS.map((t) => (
                        <TouchableOpacity key={t} style={[s.tagOption, editTag === t && s.optionActive]} onPress={() => setEditTag(t)}>
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
                            <View key={id} style={s.selectedPersonChip}>
                              <TouchableOpacity onPress={() => { setViewPerson(c); setShowPersonView(true); }}>
                                <Text style={s.selectedPersonChipText}>{c.name}</Text>
                              </TouchableOpacity>
                              <TouchableOpacity onPress={() => setEditClientIds((prev) => prev.filter((x) => x !== id))}>
                                <Text style={s.selectedPersonChipX}> ✕</Text>
                              </TouchableOpacity>
                            </View>
                          );
                        })}
                      </View>
                    )}
                    <TouchableOpacity style={s.pickerTrigger} onPress={() => openClientPicker(editClientIds, setEditClientIds)}>
                      <Text style={[s.pickerTriggerText, editClientIds.length > 0 && s.pickerTriggerTextActive]}>
                        {editClientIds.length > 0 ? `${editClientIds.length}명 선택됨 · 변경` : '거래처 인원 선택'}
                      </Text>
                      <Text style={s.pickerTriggerIcon}>›</Text>
                    </TouchableOpacity>

                    <Text style={s.inputLabel}>메모 (선택)</Text>
                    <TextInput style={[s.input, s.h72]} value={editNotes} onChangeText={setEditNotes} placeholder="추가 메모" placeholderTextColor={C.textDim} multiline />

                    {/* 알림 메일 발송 여부 */}
                    <TouchableOpacity
                      style={s.notifyEmailRow}
                      activeOpacity={0.7}
                      onPress={() => setEditNotifyEmail((prev) => !prev)}
                    >
                      <View style={[s.notifyEmailCheckbox, editNotifyEmail && s.notifyEmailCheckboxChecked]}>
                        {editNotifyEmail && <Text style={s.notifyEmailCheckmark}>✓</Text>}
                      </View>
                      <Text style={s.notifyEmailLabel}>관련 인물에게 알림 메일 발송</Text>
                    </TouchableOpacity>

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
                                <View style={commonStyles.flex1}>
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
                <View style={s.spacerH16} />
              </ScrollView>
            )}
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── 인물 상세 모달 ── */}
      <Modal visible={showPersonView} animationType="slide" transparent onRequestClose={() => setShowPersonView(false)}>
        <View style={s.modalOverlay}>
          <Animated.View style={[s.sheetBase, s.modalSheet, s.maxH70pct, swipePerson.animStyle]}>
            <View style={s.modalHandleWrap} {...swipePerson.panHandlers}>
              <View style={s.modalHandle} />
            </View>
            {viewPerson && (
              <ScrollView showsVerticalScrollIndicator={false}>
                <View style={s.personHeader}>
                  <View style={s.personAvatar}>
                    <Text style={s.personAvatarText}>{viewPerson.name[0]}</Text>
                  </View>
                  <View style={commonStyles.flex1}>
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

                {viewPerson.email ? (
                  <>
                    <Text style={s.viewLabel}>이메일</Text>
                    <TouchableOpacity onPress={() => Linking.openURL(`mailto:${viewPerson.email}`)}>
                      <Text style={[s.viewText, s.contactLink]}>{viewPerson.email}</Text>
                    </TouchableOpacity>
                  </>
                ) : null}

                {viewPerson.notes ? (
                  <>
                    <Text style={s.viewLabel}>메모</Text>
                    <Text style={s.viewText}>{viewPerson.notes}</Text>
                  </>
                ) : null}

                <View style={s.spacerH16} />
              </ScrollView>
            )}
          </Animated.View>
        </View>
      </Modal>

      {/* ── 거래처 인원 피커 팝업 ── */}
      <Modal visible={showClientPicker} animationType="slide" transparent onRequestClose={() => setShowClientPicker(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.sheetBase, s.pickerSheet]}>
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
                      <View style={s.pickerNameWrap}>
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
              <View style={s.spacerH40} />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── 신규 거래처 인원 등록 (피커에서 진입) ── */}
      <Modal visible={showPickerAddClient} animationType="slide" transparent onRequestClose={() => setShowPickerAddClient(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalOverlay}>
          <View style={[s.sheetBase, s.pickerSheet]}>
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
              <TextInput style={s.input} value={pickerNewContact} onChangeText={(v) => setPickerNewContact(fmtPhone(v))} placeholder="010-0000-0000" placeholderTextColor={C.textDim} keyboardType="phone-pad" />
              <View style={s.spacerH40} />
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

function projDayLabel(proj, date) {
  const sd = (proj.startDate || '').split(' ')[0];
  const dl = (proj.deadline || '').split(' ')[0];
  if (sd === date) return { text: '시작', color: C.accentTeal };
  if (dl === date) return { text: '마감', color: C.gold };
  const days = daysUntil(proj.deadline);
  return { text: `D-${days}`, color: C.accentBlue };
}

function getUrgency(deadlineStr, status) {
  if (status === '완료' || status === '취소') return 0;
  if (!deadlineStr) return 0;
  const days = daysUntil(deadlineStr);
  if (days < 0 || days > 7) return 0;
  if (days <= 3) return 2;
  return 1;
}

function scheduleDateRange(item) {
  const sd = (item.startDate || '').split(' ')[0];
  const ed = (item.endDate || '').split(' ')[0];
  if (!sd || !ed || sd === ed) return null;
  return `${sd.slice(5).replace('-', '/')} ~ ${ed.slice(5).replace('-', '/')}`;
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
  itemCard: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14 },
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
  scheduleDivider: { width: 1, height: 32, backgroundColor: C.borderHigh },
  scheduleBody: { flex: 1, gap: 4 },
  scheduleTitleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  scheduleTitle: { color: C.textPrimary, fontSize: 14, flex: 1 },
  scheduleNotes: { color: C.textDim, fontSize: 11 },
  tagBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  tagText: { fontSize: 10, fontWeight: '500' },
  urgencyBorder: { borderRadius: 12, borderWidth: 2 },
  fab: { position: 'absolute', bottom: 30, right: 24, width: 52, height: 52, borderRadius: 26, backgroundColor: C.accentBlue, alignItems: 'center', justifyContent: 'center' },
  fabText: { color: '#fff', fontSize: 26, lineHeight: 30 },

  // Modal
  // 웹에서 Modal은 document.body로 포탈되어 App.js의 480px 폭 제한을 벗어나므로 여기서 다시 맞춘다
  modalOverlay: Platform.OS === 'web'
    ? { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center' }
    : { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  sheetBase: Platform.OS === 'web'
    ? { backgroundColor: C.surfaceHigh, borderTopLeftRadius: 20, borderTopRightRadius: 20, width: '100%', maxWidth: 480 }
    : { backgroundColor: C.surfaceHigh, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  modalSheet: { paddingHorizontal: 24, paddingBottom: 40, paddingTop: 12 },
  modalHandleWrap: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 40, marginBottom: 10 },
  modalHandle: { width: 36, height: 4, backgroundColor: C.borderHigh, borderRadius: 2 },
  modalTitle: { color: C.textPrimary, fontSize: 18, fontWeight: '400', marginBottom: 4 },
  modalDateLabel: { color: C.textDim, fontSize: 12, marginBottom: 20 },
  inputLabel: { color: C.textDim, fontSize: 10, letterSpacing: 1.5, marginBottom: 8, marginTop: 16 },
  input: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, color: C.textPrimary, fontSize: 14, paddingHorizontal: 14, paddingVertical: 12 },
  timeRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  ampmBtn: { paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  optionActive: { borderColor: C.accentBlue + '88', backgroundColor: C.accentBlue + '22' },
  ampmBtnText: { color: C.textDim, fontSize: 14 },
  ampmBtnTextActive: { color: C.accentBlue, fontWeight: '500' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tagOption: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  tagOptionText: { color: C.textDim, fontSize: 12 },
  tagOptionTextActive: { color: C.accentBlue },
  modalBtns: { flexDirection: 'row', gap: 12, marginTop: 24 },
  modalCancel: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  modalCancelText: { color: C.textSecondary, fontSize: 14 },
  modalConfirm: { flex: 2, paddingVertical: 14, borderRadius: 12, backgroundColor: C.accentBlue, alignItems: 'center' },
  modalConfirmText: { color: '#fff', fontSize: 14, fontWeight: '600' },

  notifyEmailRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
  notifyEmailCheckbox: {
    width: 20, height: 20, borderRadius: 5,
    borderWidth: 1.5, borderColor: C.borderHigh,
    alignItems: 'center', justifyContent: 'center',
  },
  notifyEmailCheckboxChecked: { backgroundColor: C.accentBlue, borderColor: C.accentBlue },
  notifyEmailCheckmark: { color: '#fff', fontSize: 12, fontWeight: '700', lineHeight: 14 },
  notifyEmailLabel: { color: C.textSecondary, fontSize: 13 },

  // AI Chat
  chatHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  chatHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  aiGlyph: { color: C.accentBlue, fontSize: 16 },
  closeBtn: { color: C.textSecondary, fontSize: 18, padding: 4 },
  editBtn: { color: C.accentBlue, fontSize: 14, fontWeight: '500', padding: 4 },
  deleteBtn: { color: '#C45B5B', fontSize: 14, fontWeight: '500', padding: 4 },
  copyBtn: { color: C.textSecondary, fontSize: 14, fontWeight: '500', padding: 4 },
  selectedPeopleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  selectedPersonChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, backgroundColor: C.accentBlue + '22', borderWidth: 1, borderColor: C.accentBlue + '55', borderRadius: 12 },
  selectedPersonChipText: { color: C.accentBlue, fontSize: 12, fontWeight: '500' },
  selectedPersonChipX: { color: C.accentBlue, fontSize: 11 },
  clientSearchEmpty: { color: C.textDim, fontSize: 12, padding: 12, textAlign: 'center' },

  // Client picker trigger
  pickerTrigger: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12 },
  pickerTriggerText: { color: C.textDim, fontSize: 14, flex: 1 },
  pickerTriggerTextActive: { color: C.accentBlue, fontWeight: '500' },
  pickerTriggerIcon: { color: C.textDim, fontSize: 18 },

  // Client picker modal
  pickerSheet: { height: '80%' },
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
  pickerNameWrap: { flex: 1 },
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

  projectLabelTeal: { color: C.accentTeal },
  projectLabelBlue: { color: C.accentBlue },
  h72: { height: 72 },
  maxH70pct: { maxHeight: '70%' },
  spacerH16: { height: 16 },
  spacerH40: { height: 40 },
  titleActionRow: { flexDirection: 'row', gap: 12, alignItems: 'center' },
});
