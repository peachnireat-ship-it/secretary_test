import {
  Text, View, ScrollView, TouchableOpacity, StyleSheet,
  TextInput, Modal, KeyboardAvoidingView, Platform, ActivityIndicator,
  Animated, Share,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Alert } from '../utils/alertCompat';
import Slider from '@react-native-community/slider';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { C } from '../theme';
import { commonStyles } from '../styles/common';
import { useUser } from '../context/UserContext';
import { getProjects, addProject, updateProject, deleteProject, getMeetingRecords, updateMeetingRecord, getClients, addClient, getHistories, getSchedules, getTopics, addTopic, getCompanyProjects, getCompanyDepartments, getProjectMirrorInfo } from '../services/storage';
import { buildDeptTree, flattenDeptTree, DEPT_INDENT } from '../utils/deptTree';
import { useSwipeClose } from '../hooks/useSwipeClose';
import { useProjectAI } from '../hooks/useProjectAI';
import { useProjectForm, formatDeadline, fmtTime12 } from '../hooks/useProjectForm';
import { statusColor, priorityColor } from '../utils/colors';
import { daysUntil, daysLabel, dateTimeFromTimestamp } from '../utils/dateUtils';
import { parseTranscriptSegments } from '../utils/transcript';

const SPEAKER_COLORS = ['#5B7FC4', '#4AADA0', '#8B6FC4', '#C4A35A', '#C45B5B', '#5BC48B', '#C47B5B'];
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

function extractSpeakers(text) {
  const found = new Set();
  const regex = /(?:^|\n)\[([^\]\n]+)\]/g;
  let m;
  while ((m = regex.exec(text)) !== null) found.add(m[1]);
  return [...found];
}

function applyNames(text, nameMap) {
  return Object.entries(nameMap).reduce((t, [orig, name]) => {
    const replacement = name.trim() || orig;
    return t.split(`[${orig}]`).join(`[${replacement}]`);
  }, text);
}

function deleteSpeakers(text, toDelete) {
  if (toDelete.length === 0) return text;
  const deleteSet = new Set(toDelete);
  const segments = parseTranscriptSegments(text);
  return segments
    .map((s) => (deleteSet.has(s.speaker) ? s.text : `[${s.speaker}]\n${s.text}`))
    .filter(Boolean)
    .join('\n\n');
}

function buildTranscriptFromSegments(segments) {
  return segments.map((s) => `[${s.speaker}]\n${s.text}`).join('\n\n');
}

const STATUSES = ['진행중', '위험', '지연', '완료', '취소'];
const PRIORITIES = ['높음', '보통', '낮음'];
const FILTERS = ['전체', '진행중', '위험', '지연', '완료'];

// "회사 전체" 보기 부서 사이드바(CompanyScreen.js와 동일 패턴). 사이드바 폭 범위는 가장 긴
// 부서명에 맞춰 이 범위 안에서 자동으로 늘어난다(SIDEBAR_MIN_WIDTH~SIDEBAR_MAX_WIDTH).
const ALL_KEY = '__all__';
const SIDEBAR_MIN_WIDTH = 90;
const SIDEBAR_MAX_WIDTH = 160;
const SIDEBAR_PADDING_H = 10;

function isAtRisk(project) {
  if (project.status === '완료' || project.status === '취소') return false;
  const days = daysUntil(project.deadline);
  return days <= 7 && project.progress < 80;
}

// ScheduleScreen.getUrgency와 동일 로직: 마감 7일 이내 = 1(gold), 3일 이내 = 2(red)
function getUrgency(deadlineStr, status) {
  if (status === '완료' || status === '취소') return 0;
  if (!deadlineStr) return 0;
  const days = daysUntil(deadlineStr);
  if (days < 0 || days > 7) return 0;
  if (days <= 3) return 2;
  return 1;
}

export default function ProjectScreen({ navigation, route }) {
  const insets = useSafeAreaInsets();
  const { user: currentUser } = useUser();
  const [projects, setProjects] = useState([]);
  const [meetingRecords, setMeetingRecords] = useState([]);
  const [clients, setClients] = useState([]);
  const [histories, setHistories] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [topics, setTopics] = useState([]);
  const [newProjectTopicName, setNewProjectTopicName] = useState('');
  const [showPersonDetail, setShowPersonDetail] = useState(false);
  const [personDetailClient, setPersonDetailClient] = useState(null);
  const [filter, setFilter] = useState('전체');

  // 회사 관리자 전용: '내 프로젝트'/'회사 전체' 보기 전환. 회사 전체 보기는 같은 회사 소속
  // 전체 부서의 프로젝트를(관련 인물로 태그된 직원에게 자동 생성된 사본 포함) 부서별로 보여준다.
  const [viewMode, setViewMode] = useState('mine'); // 'mine' | 'company'
  const [companyGroups, setCompanyGroups] = useState([]);
  const [companyLoading, setCompanyLoading] = useState(false);
  // 부서 트리 사이드바(CompanyScreen.js와 동일 패턴): 부서 원본 목록 + 현재 선택된 부서("전체" 기본값)
  const [departments, setDepartments] = useState([]);
  const [selectedDept, setSelectedDept] = useState(ALL_KEY);
  // 회사 전체 보기는 조회 전용이다 — 다른 부서 직원의 프로젝트를 수정/삭제할 수 없다.
  const [showCompanyDetail, setShowCompanyDetail] = useState(false);
  const [companyDetailProject, setCompanyDetailProject] = useState(null);

  const [copyTarget, setCopyTarget] = useState(null);
  const [copyTitleInput, setCopyTitleInput] = useState('');
  const [showCopyTitleModal, setShowCopyTitleModal] = useState(false);

  const [showMeetingDetail, setShowMeetingDetail] = useState(false);
  const [selectedMeeting, setSelectedMeeting] = useState(null);
  const [contentEditRecordId, setContentEditRecordId] = useState(null);
  const [contentEditSummary, setContentEditSummary] = useState('');
  const [contentEditTranscript, setContentEditTranscript] = useState('');

  const [speakerEditRecordId, setSpeakerEditRecordId] = useState(null);
  const [speakerEditNames, setSpeakerEditNames] = useState({});
  const [speakerEditDeleted, setSpeakerEditDeleted] = useState(new Set());
  const [speakerEditCustom, setSpeakerEditCustom] = useState([]);
  const [speakerClientEditMap, setSpeakerClientEditMap] = useState({});

  const [segmentEditRecordId, setSegmentEditRecordId] = useState(null);
  const [editableSegments, setEditableSegments] = useState([]);
  const [segmentPickerIdx, setSegmentPickerIdx] = useState(null);

  const [clientPickerSpeaker, setClientPickerSpeaker] = useState(null);
  const [clientPickerSearch, setClientPickerSearch] = useState('');

  const [showClientPicker, setShowClientPicker] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [pickerTempIds, setPickerTempIds] = useState([]);
  const pickerCallback = useRef(null);
  const [showPickerAddClient, setShowPickerAddClient] = useState(false);
  const [pickerNewName, setPickerNewName] = useState('');
  const [pickerNewCompany, setPickerNewCompany] = useState('');
  const [pickerNewRole, setPickerNewRole] = useState('');
  const [pickerNewContact, setPickerNewContact] = useState('');

  // "회사 전체" 보기에서는 companyGroups(다른 부서/직원 등록분 포함, ownerName/departmentName 포함)를
  // 평탄화해 AI에 넘긴다 — 본인 소유 프로젝트만 담긴 projects state 그대로 넘기면 다른 사람이 등록한
  // 프로젝트에 대한 질문(예: "등록한 사람이 누구야?")에 AI가 답할 데이터 자체가 없기 때문.
  const aiProjects = viewMode === 'company' ? companyGroups.flatMap((g) => g.projects) : projects;
  const {
    showAI, setShowAI, chatMessages, chatInput, setChatInput, aiLoading, chatScrollRef,
    handleAIChat, handleQuickAnalysis, resetChat: resetAiChat,
  } = useProjectAI({ projects: aiProjects, setProjects, readOnly: viewMode === 'company' });

  // AI 채팅 모달의 빠른 질문 칩 목록(가로 스크롤). 모바일은 터치 스와이프로 기본 지원되지만,
  // PC(웹)는 마우스 휠이 기본적으로 세로로만 동작해 좌우로 넘기지 못하므로 휠 이벤트를 가로
  // 스크롤로 변환해준다(react-native-web은 인식 못 하는 DOM 이벤트 prop을 그대로 밑단 엘리먼트에
  // 전달하므로 onWheel을 그대로 써도 된다).
  // 스크롤바를 노출하는 대신, 클릭한 채로 좌우로 끄는 "드래그 스크롤"도 지원한다(흔한 웹 캐러셀 패턴).
  // moved 플래그로 실제 드래그와 단순 클릭을 구분해 칩의 onPress가 드래그 도중에 실수로 실행되지
  // 않도록 막는다(칩 onPress 쪽에서 isQuickDragClick()으로 확인).
  const quickScrollRef = useRef(null);
  const quickDragRef = useRef({ dragging: false, moved: false, startX: 0, startScrollLeft: 0 });
  function handleQuickWheel(e) {
    if (Platform.OS !== 'web' || Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    e.preventDefault();
    quickScrollRef.current?.scrollTo({ x: e.currentTarget.scrollLeft + e.deltaY, animated: false });
  }
  function handleQuickMouseDown(e) {
    if (Platform.OS !== 'web') return;
    quickDragRef.current = { dragging: true, moved: false, startX: e.pageX, startScrollLeft: e.currentTarget.scrollLeft };
  }
  function handleQuickMouseMove(e) {
    if (Platform.OS !== 'web' || !quickDragRef.current.dragging) return;
    const delta = e.pageX - quickDragRef.current.startX;
    if (Math.abs(delta) > 4) quickDragRef.current.moved = true;
    if (quickDragRef.current.moved) {
      e.preventDefault();
      quickScrollRef.current?.scrollTo({ x: quickDragRef.current.startScrollLeft - delta, animated: false });
    }
  }
  function handleQuickMouseUp() {
    if (Platform.OS === 'web') quickDragRef.current.dragging = false;
  }
  function isQuickDragClick() {
    return Platform.OS === 'web' && quickDragRef.current.moved;
  }

  // viewMode 전환 시 이전 컨텍스트 기준 대화가 새 컨텍스트와 뒤섞이지 않도록 초기화.
  useEffect(() => {
    resetAiChat();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewMode]);

  const {
    showAdd, setShowAdd, newTitle, setNewTitle, newStartDate, setNewStartDate,
    newStartTime, setNewStartTime, newStartAmPm, setNewStartAmPm, newDeadline, setNewDeadline,
    newDeadlineTime, setNewDeadlineTime, newDeadlineAmPm, setNewDeadlineAmPm, newStatus, setNewStatus,
    newProgress, setNewProgress, newKeepProgress, setNewKeepProgress, newPriority, setNewPriority, newNotes, setNewNotes,
    setPendingMeetingRecordId,
    newClientIds, setNewClientIds, newNotifyEmail, setNewNotifyEmail,

    showDetail, setShowDetail, detailProject, showProjectView, setShowProjectView,
    viewProject, setViewProject, editTitle, setEditTitle, editStartDate, setEditStartDate,
    editStartTime, setEditStartTime, editStartAmPm, setEditStartAmPm, editDeadline, setEditDeadline,
    editDeadlineTime, setEditDeadlineTime, editDeadlineAmPm, setEditDeadlineAmPm, editStatus, setEditStatus,
    editProgress, setEditProgress, editKeepProgress, setEditKeepProgress, editPriority, setEditPriority, editNotes, setEditNotes,
    editClientIds, setEditClientIds, editNotifyEmail, setEditNotifyEmail,

    detailPersonPickerVisible, setDetailPersonPickerVisible,
    detailPersonPickerSearch, setDetailPersonPickerSearch,

    missingEmailModalVisible, missingEmailPeople, missingEmailDrafts, setMissingEmailDrafts,
    confirmMissingEmailAndSave, skipMissingEmailAndSave,

    handleAdd, openDetail, handleEditSave, addClientToDetail,
  } = useProjectForm({ meetingRecords, projects, schedules, clients, setProjects });

  const swipeDetail = useSwipeClose(() => setShowDetail(false), showDetail);
  const swipeAdd = useSwipeClose(() => setShowAdd(false), showAdd);
  const swipeProjectView = useSwipeClose(() => setShowProjectView(false), showProjectView);
  const swipeMeetingDetail = useSwipeClose(() => setShowMeetingDetail(false), showMeetingDetail);
  const swipePersonDetail = useSwipeClose(() => setShowPersonDetail(false), showPersonDetail);
  const swipeCompanyDetail = useSwipeClose(() => setShowCompanyDetail(false), showCompanyDetail);

  const urgencyAnim = useRef(new Animated.Value(0)).current;

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
    const addTask = route?.params?.addTask;
    if (!addTask) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setNewTitle(addTask.title || '');
    setNewDeadline(addTask.deadline || '');
    setNewPriority(addTask.priority || '보통');
    setNewNotes(addTask.notes || '');
    setNewStatus('진행중');
    setNewProgress(0);
    setPendingMeetingRecordId(route?.params?.meetingRecordId || null);
    setShowAdd(true);
    /* eslint-enable react-hooks/set-state-in-effect */
    navigation.setParams({ addTask: undefined, meetingRecordId: undefined });
  }, [route?.params?.addTask]);

  useEffect(() => {
    const openProjectId = route?.params?.openProjectId;
    if (!openProjectId || projects.length === 0) return;
    const target = projects.find((p) => p.id === openProjectId);
    if (target) {
      if (target.originProjectId) {
        openMirrorDetail(target);
      } else {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setViewProject(target);
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setShowProjectView(true);
      }
      navigation.setParams({ openProjectId: undefined });
    }
  }, [route?.params?.openProjectId, projects]);

  useEffect(() => {
    if (!route?.params?.openQuickAnalysis) return;
    handleQuickAnalysis();
    navigation.setParams({ openQuickAnalysis: undefined });
  }, [route?.params?.openQuickAnalysis]);

  useEffect(() => {
    if (showDetail) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNewProjectTopicName('');
    }
  }, [showDetail, detailProject?.id]);

  async function load() {
    const [all, records, clientList, histList, scheduleList, topicList] = await Promise.all([getProjects(), getMeetingRecords(), getClients(), getHistories(), getSchedules(), getTopics()]);
    // 시작일자가 비어있는 기존 프로젝트는 등록일(createdAt)로 채워서 저장 (최초 1회만 실제 쓰기 발생)
    // 백필 실패(네트워크 오류 등)가 이미 정상 조회된 all 데이터 표시까지 막지 않도록 개별 실패는 무시한다.
    const missingStartDate = all.filter((p) => !p.startDate);
    let finalProjects = all;
    for (const p of missingStartDate) {
      try {
        finalProjects = await updateProject(p.id, { startDate: dateTimeFromTimestamp(p.createdAt) });
      } catch {
        // 백필은 best-effort: 실패해도 이미 조회된 all 데이터 표시는 막지 않는다.
      }
    }
    setProjects(finalProjects);
    setMeetingRecords(records);
    setClients(clientList);
    setHistories(histList);
    setSchedules(scheduleList);
    setTopics(topicList);
  }

  useFocusEffect(useCallback(() => { load(); }, []));

  async function loadCompanyProjects() {
    setCompanyLoading(true);
    try {
      const [groups, depts] = await Promise.all([getCompanyProjects(), getCompanyDepartments()]);
      setCompanyGroups(groups);
      setDepartments(depts);
    } catch (e) {
      console.warn('getCompanyProjects 실패:', e.message);
      Alert.alert('오류', '회사 프로젝트를 불러오지 못했습니다.');
    } finally {
      setCompanyLoading(false);
    }
  }

  const canViewCompanyProjects = currentUser?.isCompanyAdmin || currentUser?.canViewCompanyProjects;

  useFocusEffect(useCallback(() => {
    if (canViewCompanyProjects && viewMode === 'company') loadCompanyProjects();
  }, [viewMode, canViewCompanyProjects]));

  function openCompanyDetail(project) {
    // 회사 전체 목록에는 관리자 본인의 프로젝트도 포함된다(같은 회사 소속 전체를 보여주므로).
    // 본인 소유(= "내 프로젝트" 목록에도 있는 항목)는 조회 전용이 아니라 평소처럼 수정 가능한
    // 상세 모달로 열어야 한다 — 다른 직원의 프로젝트만 조회 전용으로 제한. 단, 본인 소유라도
    // 그게 관리자 자신의 프로젝트 사본(originProjectId 있음)이면 원본 등록자가 따로 있는 것이므로
    // 수정 모달로 보내지 않고 조회 전용(openMirrorDetail)으로 열어야 한다.
    const own = projects.find((p) => p.id === project.id);
    if (own && !own.originProjectId) {
      openDetail(own);
      return;
    }
    if (own && own.originProjectId) {
      openMirrorDetail(own);
      return;
    }
    setCompanyDetailProject(project);
    setShowCompanyDetail(true);
  }

  // 프로젝트 사본(mirror) 조회 전용 상세: 원본 등록자 이름/팀/부서, 원본의 관련 인물을
  // get_project_mirror_info() RPC로 가져와 item과 합친 뒤, 기존 회사뷰 조회 전용 모달
  // (showCompanyDetail/companyDetailProject)을 그대로 재사용한다.
  async function openMirrorDetail(item) {
    try {
      const info = await getProjectMirrorInfo(item.id);
      setCompanyDetailProject({
        ...item,
        ownerName: info?.ownerName || '',
        ownerTeam: info?.ownerTeam || '',
        departmentName: info?.departmentName || '',
        relatedPeople: info?.relatedPeople || [],
      });
      setShowCompanyDetail(true);
    } catch {
      Alert.alert('오류', '프로젝트 정보를 불러오지 못했습니다.');
    }
  }

  const companyProjectCount = companyGroups.reduce((sum, g) => sum + g.projects.length, 0);

  // "회사 전체" 부서 사이드바(CompanyScreen.js와 동일 패턴)
  const deptTree = buildDeptTree(departments);
  const flatDeptTree = flattenDeptTree(deptTree);
  // 선택된 부서가 최신 부서 트리에 더 이상 없으면(삭제 등) "전체"로 자동 복귀.
  const effectiveSelectedDept = selectedDept !== ALL_KEY && flatDeptTree.some((d) => d.name === selectedDept)
    ? selectedDept
    : ALL_KEY;
  const showAllDepts = effectiveSelectedDept === ALL_KEY;
  // "미배정"(부서 없는 프로젝트) 그룹은 트리에 없으므로 사이드바에서 개별 선택이 불가능하다 —
  // "전체" 선택 시에만 companyGroups의 일부로 자연스럽게 표시된다(CompanyScreen과 동일한 제약).
  const selectedDeptGroup = showAllDepts ? null : companyGroups.find((g) => g.departmentName === effectiveSelectedDept);

  // "회사 전체" 보기 프로젝트 카드 렌더링. "전체"/특정 부서 선택 두 목록에서 공용으로 사용(중복 코드 방지).
  function renderCompanyProjectCard(item) {
    const days = daysUntil(item.deadline);
    const isCompleted = item.status === '완료';
    return (
      <TouchableOpacity key={item.id} style={s.card} activeOpacity={0.75} onPress={() => openCompanyDetail(item)}>
        <View style={s.cardTop}>
          <View style={s.cardTitleRow}>
            <Text style={s.cardTitle} numberOfLines={1}>{item.title}</Text>
          </View>
          <View style={[s.statusBadge, { borderColor: statusColor(item.status) + '66', backgroundColor: statusColor(item.status) + '18' }]}>
            <Text style={[s.statusText, { color: statusColor(item.status) }]}>{item.status}</Text>
          </View>
        </View>

        <View style={s.progressTrack}>
          <View style={[s.progressFill, { width: `${item.progress}%`, backgroundColor: statusColor(item.status) }]} />
        </View>

        <View style={s.cardMeta}>
          <View style={s.ownerChip}>
            <Text style={s.ownerChipText}>{item.ownerName}</Text>
          </View>
          <View style={[s.priorityBadge, { borderColor: priorityColor(item.priority) + '55' }]}>
            <Text style={[s.priorityText, { color: priorityColor(item.priority) }]}>{item.priority}</Text>
          </View>
          <Text style={[s.deadlineText, days < 0 && !isCompleted && { color: C.red }, days >= 0 && days <= 3 && { color: C.gold }]}>
            {item.deadline}{isCompleted && days < 0 ? '' : ` · ${daysLabel(days)}`}
          </Text>
        </View>
      </TouchableOpacity>
    );
  }

  const filtered = projects.filter((p) => filter === '전체' || p.status === filter);

  const delayedCount = projects.filter((p) => p.status === '지연' || p.status === '위험').length;

  // DB의 토픽 이름 유니크 제약은 담당자(client_id) 단위이므로, name이 관련 인물 중 누구와도
  // 충돌하지 않을 때까지 " (2)", " (3)" ... 접미사를 붙여 대체 이름을 만들어준다.
  function findAvailableTopicName(name, relatedClientIds) {
    const conflicts = (candidate) => relatedClientIds.some((cid) =>
      topics.some((t) => t.clientId === cid && t.name.trim().toLowerCase() === candidate.trim().toLowerCase())
    );
    if (!conflicts(name)) return name;
    let suffix = 2;
    let candidate = `${name} (${suffix})`;
    while (conflicts(candidate)) {
      suffix += 1;
      candidate = `${name} (${suffix})`;
    }
    return candidate;
  }

  async function createProjectTopic(name, clientId) {
    const id = Date.now().toString();
    try {
      const updated = await addTopic({ id, clientId, projectId: detailProject.id, name });
      setTopics(updated);
      return id;
    } catch {
      Alert.alert('토픽 생성 실패', '토픽을 생성하지 못했습니다. 다른 이름을 입력해주세요.');
      return null;
    }
  }

  // 프로젝트 상세의 "관련 토픽"에서 새 토픽을 만든다. 프로젝트의 관련 인물(직접 추가 + 연결된
  // 회의록을 통한 인물) 중 아무나의 client_id로 생성되며, 같은 프로젝트에 이미 같은 이름의
  // 토픽이 있으면 그 토픽을 재사용한다. 관련 인물 중 누군가 이미 같은 이름의 토픽을 가지고 있으면
  // (DB 유니크 제약과 충돌) 조용히 다른 사람에게 떠넘기지 않고, 대체 이름을 제안해 사용자가
  // 확인 후 저장하도록 한다.
  async function handleCreateProjectTopic(name) {
    const trimmed = name.trim();
    if (!trimmed || !detailProject) return null;
    const linkedMeetings = detailProject.meetingRecordIds?.length
      ? meetingRecords.filter((r) => detailProject.meetingRecordIds.includes(r.id))
      : [];
    const meetingClientIds = linkedMeetings.flatMap((r) => r.clientIds || []);
    const relatedClientIds = [...new Set([...editClientIds, ...meetingClientIds])];
    if (relatedClientIds.length === 0) return null;

    const projectTopics = topics.filter((t) => t.projectId === detailProject.id);
    const existing = projectTopics.find((t) => t.name.trim().toLowerCase() === trimmed.toLowerCase());
    if (existing) {
      Alert.alert('이미 있는 토픽입니다', `"${existing.name}" 토픽을 그대로 사용합니다.`);
      return existing.id;
    }

    const altName = findAvailableTopicName(trimmed, relatedClientIds);
    if (altName === trimmed) {
      return createProjectTopic(trimmed, relatedClientIds[0]);
    }

    return new Promise((resolve) => {
      Alert.alert(
        '이미 있는 토픽 이름입니다',
        `관련 인물 중 이미 "${trimmed}" 토픽을 가진 담당자가 있습니다.\n"${altName}"(으)로 저장할까요?`,
        [
          { text: '취소', style: 'cancel', onPress: () => resolve(null) },
          { text: '저장', onPress: async () => resolve(await createProjectTopic(altName, relatedClientIds[0])) },
        ]
      );
    });
  }

  async function handleAddProjectTopic() {
    const id = await handleCreateProjectTopic(newProjectTopicName);
    if (id) setNewProjectTopicName('');
  }

  async function handleDelete(id, title) {
    Alert.alert('삭제', `"${title}" 프로젝트를 삭제할까요?`, [
      { text: '취소', style: 'cancel' },
      { text: '삭제', style: 'destructive', onPress: async () => { setProjects(await deleteProject(id)); } },
    ]);
  }

  async function handleCopy(project, titleOverride) {
    const { id, createdAt, updatedAt, ...rest } = project;
    const copied = { ...rest, title: titleOverride || `${project.title} (복사본)` };
    setProjects(await addProject(copied));
    setShowDetail(false);
  }

  function confirmCopy(project) {
    Alert.alert('', '해당 프로젝트를 복사하시겠습니까?', [
      { text: '아니오', style: 'cancel', onPress: () => handleCopy(project) },
      { text: '예', onPress: () => { setCopyTarget(project); setCopyTitleInput(''); setShowCopyTitleModal(true); } },
    ]);
  }

  async function handleShare(project) {
    const lines = ['[Your Secretary]', `📁 ${project.title}`];
    lines.push(`마감일: ${project.deadline}`);
    lines.push(`상태: ${project.status}`);
    lines.push(`진행률: ${project.progress}% 완료`);
    lines.push(`우선순위: ${project.priority}`);
    if (project.notes) lines.push(`메모: ${project.notes}`);
    const people = (project.clientIds || []).map((id) => clients.find((c) => c.id === id)).filter(Boolean);
    if (people.length > 0) lines.push(`관련 인물: ${people.map((c) => c.name).join(', ')}`);
    const text = lines.join('\n');
    if (Platform.OS === 'web') {
      try {
        await Clipboard.setStringAsync(text);
        Alert.alert('복사 완료', '프로젝트 내용이 클립보드에 복사되었습니다. 원하는 곳에 붙여넣으세요.');
      } catch {
        Alert.alert('복사 실패', '클립보드 복사 중 오류가 발생했습니다.');
      }
      return;
    }
    try {
      await Share.share({ message: text });
    } catch {
      Alert.alert('공유 실패', '공유 중 오류가 발생했습니다.');
    }
  }

  function openClientPicker(speaker) {
    setClientPickerSpeaker(speaker);
    setClientPickerSearch('');
  }

  function openRelatedClientPicker(currentIds, onConfirm) {
    setPickerTempIds([...new Set(currentIds)]);
    setPickerSearch('');
    pickerCallback.current = onConfirm;
    setShowClientPicker(true);
  }

  function confirmRelatedClientPicker() {
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

  async function addAndSelectClient() {
    const name = clientPickerSearch.trim();
    if (!name) return;
    const updated = await addClient({ name });
    setClients(updated);
    selectClient({ name });
  }

  function selectClient(client) {
    setSpeakerEditNames((prev) => ({ ...prev, [clientPickerSpeaker]: client.name }));
    if (client.id) setSpeakerClientEditMap((prev) => ({ ...prev, [clientPickerSpeaker]: client.id }));
    setClientPickerSpeaker(null);
  }

  function openSpeakerEditModal(item) {
    const speakers = extractSpeakers(item.transcript || '');
    setSpeakerEditRecordId(item.id);
    setSpeakerEditNames(Object.fromEntries(speakers.map((sp) => [sp, ''])));
    setSpeakerClientEditMap({});
    setSpeakerEditDeleted(new Set());
    setSpeakerEditCustom([]);
  }

  async function confirmSpeakerEdit() {
    const record = meetingRecords.find((r) => r.id === speakerEditRecordId);
    if (!record) return;
    const recordId = speakerEditRecordId;
    setSpeakerEditRecordId(null);

    const renames = Object.fromEntries(
      Object.entries(speakerEditNames).filter(([k]) => !speakerEditDeleted.has(k))
    );
    let updatedTranscript = applyNames(record.transcript || '', renames);
    let updatedSummary = applyNames(record.summary || '', renames);

    const customRenames = Object.fromEntries(
      speakerEditCustom
        .filter((c) => c.origKey.trim())
        .map((c) => [c.origKey.trim(), c.newName.trim()])
    );
    updatedTranscript = applyNames(updatedTranscript, customRenames);
    updatedSummary = applyNames(updatedSummary, customRenames);

    updatedTranscript = deleteSpeakers(updatedTranscript, [...speakerEditDeleted]);
    updatedSummary = deleteSpeakers(updatedSummary, [...speakerEditDeleted]);

    const newClientIds = Object.values(speakerClientEditMap).filter(Boolean);
    const mergedClientIds = [...new Set([...(record.clientIds || []), ...newClientIds])];
    const updated = await updateMeetingRecord(recordId, {
      transcript: updatedTranscript,
      summary: updatedSummary,
      clientIds: mergedClientIds,
    });
    setMeetingRecords(updated);
    const updatedRecord = updated.find((r) => r.id === recordId);
    if (updatedRecord) setSelectedMeeting(updatedRecord);
    setSpeakerEditNames({});
    setSpeakerClientEditMap({});
    setSpeakerEditDeleted(new Set());
    setSpeakerEditCustom([]);
  }

  function openSegmentEditModal(item) {
    const segments = parseTranscriptSegments(item.transcript || '');
    if (segments.length === 0) {
      Alert.alert('수정 불가', '화자가 구분된 회의록이 아닙니다.');
      return;
    }
    setEditableSegments(segments);
    setSegmentEditRecordId(item.id);
    setSegmentPickerIdx(null);
  }

  async function confirmSegmentEdit() {
    const record = meetingRecords.find((r) => r.id === segmentEditRecordId);
    if (!record) return;
    const recordId = segmentEditRecordId;
    setSegmentEditRecordId(null);
    const updatedTranscript = buildTranscriptFromSegments(editableSegments);
    const updated = await updateMeetingRecord(recordId, { transcript: updatedTranscript });
    setMeetingRecords(updated);
    const updatedRecord = updated.find((r) => r.id === recordId);
    if (updatedRecord) setSelectedMeeting(updatedRecord);
    setEditableSegments([]);
    setSegmentPickerIdx(null);
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
    setMeetingRecords(updated);
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
          {viewMode === 'company' ? (
            <Text style={s.headerSubDim}>부서별 프로젝트 {companyProjectCount}건</Text>
          ) : delayedCount > 0 ? (
            <Text style={s.headerSub}>{delayedCount}건 지연·위험</Text>
          ) : null}
        </View>
        <View style={s.headerBtns}>
          <TouchableOpacity style={s.aiBtn} onPress={() => setShowAI(true)}>
            <Text style={s.aiBtnText}>AI</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── 회사 관리자, 또는 "본인 이하 직급 프로젝트 조회"가 허용된 직책의 직원: 내 프로젝트 / 회사 전체 보기 전환 ── */}
      {canViewCompanyProjects && (
        <View style={s.viewModeRow}>
          <TouchableOpacity
            style={[s.viewModeBtn, viewMode === 'mine' && s.viewModeBtnActive]}
            onPress={() => setViewMode('mine')}
          >
            <Text style={[s.viewModeText, viewMode === 'mine' && s.viewModeTextActive]}>내 프로젝트</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[s.viewModeBtn, viewMode === 'company' && s.viewModeBtnActive]}
            onPress={() => setViewMode('company')}
          >
            <Text style={[s.viewModeText, viewMode === 'company' && s.viewModeTextActive]}>회사 전체</Text>
          </TouchableOpacity>
        </View>
      )}

      {viewMode === 'company' ? (
      <>
      {/* ── 회사 전체 프로젝트 (부서 트리 사이드바 + 우측 목록, CompanyScreen.js와 동일 패턴) ── */}
      <View style={s.body}>
        <ScrollView style={s.sidebar} contentContainerStyle={s.sidebarContent} showsVerticalScrollIndicator={false}>
          <TouchableOpacity style={s.sidebarItem} onPress={() => setSelectedDept(ALL_KEY)} activeOpacity={0.6}>
            <Text style={[s.sidebarItemText, showAllDepts && s.sidebarItemTextActive]} numberOfLines={1}>전체</Text>
          </TouchableOpacity>
          {flatDeptTree.map((dept) => {
            const active = !showAllDepts && effectiveSelectedDept === dept.name;
            return (
              <TouchableOpacity
                key={dept.id}
                style={[s.sidebarItem, { marginLeft: dept.depth * DEPT_INDENT }]}
                onPress={() => setSelectedDept(dept.name)}
                activeOpacity={0.6}
              >
                <Text style={[s.sidebarItemText, active && s.sidebarItemTextActive]} numberOfLines={2}>
                  {dept.depth > 0 && <Text style={s.treePrefix}>{'└ '}</Text>}
                  {dept.name}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <ScrollView style={s.list} contentContainerStyle={s.listContent} showsVerticalScrollIndicator={false}>
          {showAllDepts ? (
            !companyLoading && companyGroups.length === 0 ? (
              <View style={s.emptyWrap}>
                <Text style={s.emptyText}>회사 프로젝트가 없습니다</Text>
              </View>
            ) : (
              companyGroups.map((group) => (
                <View key={group.departmentName} style={s.deptSection}>
                  <View style={s.deptHeaderRow}>
                    <Text style={s.deptName}>{group.departmentName}</Text>
                    <Text style={s.deptMeta}>{group.projects.length}건</Text>
                  </View>
                  {group.projects.map(renderCompanyProjectCard)}
                </View>
              ))
            )
          ) : (
            !companyLoading && (!selectedDeptGroup || selectedDeptGroup.projects.length === 0) ? (
              <View style={s.emptyWrap}>
                <Text style={s.emptyText}>이 부서에 프로젝트가 없습니다</Text>
              </View>
            ) : (
              selectedDeptGroup.projects.map(renderCompanyProjectCard)
            )
          )}
        </ScrollView>
      </View>
      </>
      ) : (
      <>
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
          // eslint-disable-next-line react-hooks/refs -- urgencyAnim은 최초 렌더에서 한 번만 생성되는 Animated.Value ref
          filtered.map((item) => {
            const days = daysUntil(item.deadline);
            const isCompleted = item.status === '완료';
            const risk = isAtRisk(item);
            const urgency = getUrgency(item.deadline, item.status);
            const urgencyColor = urgency === 2 ? '#C45B5B' : C.gold;
            const linkedMeetings = item.meetingRecordIds?.length > 0
              ? meetingRecords.filter((r) => item.meetingRecordIds.includes(r.id))
              : [];
            const meetingClientIds = [...new Set(linkedMeetings.flatMap((r) => r.clientIds || []))];
            const allRelatedClientIds = [...new Set([...(item.clientIds || []), ...meetingClientIds])];
            const allRelatedPeople = allRelatedClientIds.map((id) => clients.find((c) => c.id === id)).filter(Boolean);
            // 프로젝트 사본(관련 인물로 태그되어 자동 생성된 다른 사람 프로젝트의 사본)은 조회
            // 전용이다 — 수정 모달로 보내지 않고, 롱프레스 삭제도 걸지 않는다.
            const isMirror = !!item.originProjectId;
            return (
              <View key={item.id} style={[s.card, risk && s.cardRisk]}>
                <TouchableOpacity
                  activeOpacity={0.75}
                  onPress={() => (isMirror ? openMirrorDetail(item) : openDetail(item))}
                  onLongPress={isMirror ? undefined : () => handleDelete(item.id, item.title)}
                >
                  {/* 타이틀 행 */}
                  <View style={s.cardTop}>
                    <View style={s.cardTitleRow}>
                      {risk && <Text style={s.riskIcon}>⚠ </Text>}
                      <Text style={s.cardTitle} numberOfLines={1}>{item.title}</Text>
                    </View>
                    <View style={s.cardTopRight}>
                      <View style={[s.statusBadge, { borderColor: statusColor(item.status) + '66', backgroundColor: statusColor(item.status) + '18' }]}>
                        <Text style={[s.statusText, { color: statusColor(item.status) }]}>{item.status}</Text>
                      </View>
                      {isMirror ? (
                        <View style={s.readOnlyChip}>
                          <Text style={s.readOnlyChipText}>조회 전용</Text>
                        </View>
                      ) : (
                        <TouchableOpacity style={s.editProgressChip} onPress={() => openDetail(item)}>
                          <Text style={s.editProgress}>수정</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>

                  {/* 프로그레스 바 */}
                  <View style={s.progressTrack}>
                    <View style={[s.progressFill, { width: `${item.progress}%`, backgroundColor: statusColor(item.status) }]} />
                  </View>
                  <View style={s.progressRow}>
                    <Text style={s.progressLabel}>{item.progress}% 완료</Text>
                  </View>

                  {/* 메타 정보 */}
                  <View style={s.cardMeta}>
                    <View style={[s.priorityBadge, { borderColor: priorityColor(item.priority) + '55' }]}>
                      <Text style={[s.priorityText, { color: priorityColor(item.priority) }]}>{item.priority}</Text>
                    </View>
                    <View style={s.deadlineWrap}>
                      {item.startDate ? (
                        <Text style={s.startDateText}>{item.startDate} 시작</Text>
                      ) : null}
                      <Text style={[s.deadlineText, days < 0 && !isCompleted && { color: C.red }, days >= 0 && days <= 3 && { color: C.gold }]}>
                        {item.deadline}{isCompleted && days < 0 ? '' : ` · ${daysLabel(days)}`}
                      </Text>
                    </View>
                  </View>

                  {item.notes ? <Text style={s.cardNotes} numberOfLines={1}>{item.notes}</Text> : null}
                </TouchableOpacity>

                {allRelatedPeople.length > 0 && (
                  <View style={s.cardRelatedPeopleWrap}>
                    <Text style={s.cardRelatedPeopleLabel}>관련 인물</Text>
                    <View style={s.cardRelatedPeopleRow}>
                      {allRelatedPeople.map((c) => (
                        <TouchableOpacity
                          key={c.id}
                          style={s.cardPersonChip}
                          activeOpacity={0.7}
                          onPress={() => { setPersonDetailClient(c); setShowPersonDetail(true); }}
                        >
                          <View style={s.cardPersonAvatar}>
                            <Text style={s.cardPersonAvatarText}>{c.name[0]}</Text>
                          </View>
                          <View style={commonStyles.flex1}>
                            <Text style={s.cardPersonName} numberOfLines={1}>{c.name}</Text>
                            {c.company ? <Text style={s.cardPersonCompany} numberOfLines={1}>{c.company}{c.role ? ` · ${c.role}` : ''}</Text> : null}
                          </View>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                )}
                {linkedMeetings.length > 0 && (
                  <View style={s.meetingChipRow}>
                    {linkedMeetings.map((r) => (
                      <TouchableOpacity
                        key={r.id}
                        style={s.meetingChip}
                        activeOpacity={0.7}
                        onPress={() => {
                          const latest = meetingRecords.find((rec) => rec.id === r.id) || r;
                          setSelectedMeeting(latest);
                          setShowMeetingDetail(true);
                        }}
                      >
                        <Text style={s.meetingChipText} numberOfLines={1}>📋 {r.title || '회의록'}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                {urgency > 0 && (
                  <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, s.urgencyBorder, { borderColor: urgencyColor, opacity: urgencyAnim }]} />
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
      </>
      )}

      {/* ── 프로젝트 상세 모달 ── */}
      <Modal visible={showDetail} animationType="slide" transparent onRequestClose={() => setShowDetail(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalOverlay}>
          <Animated.View style={[s.modalSheet, commonStyles.maxH90pct, swipeDetail.animStyle]}>
            <View style={s.modalHandleWrap} {...swipeDetail.panHandlers}>
              <View style={s.modalHandle} />
            </View>
            {detailProject && (
              <ScrollView showsVerticalScrollIndicator={false}>
                {/* 헤더: 제목 + 닫기 */}
                <View style={s.detailHeader}>
                  <View style={commonStyles.flex1}>
                    <Text style={s.inputLabel}>제목</Text>
                    <TextInput style={s.input} value={editTitle} onChangeText={setEditTitle} placeholderTextColor={C.textDim} />
                  </View>
                  <TouchableOpacity onPress={() => setShowDetail(false)} style={s.closeBtnOffset}>
                    <Text style={s.closeBtn}>✕</Text>
                  </TouchableOpacity>
                </View>
                {currentUser?.name ? <Text style={s.registrantText}>등록자: {currentUser.name}</Text> : null}

                {/* 상태 */}
                <Text style={s.inputLabel}>상태</Text>
                <View style={s.optionRow}>
                  {STATUSES.map((st) => (
                    <TouchableOpacity key={st} style={[s.optionBtn, editStatus === st && { borderColor: statusColor(st) + '88', backgroundColor: statusColor(st) + '18' }]} onPress={() => {
                      if (st === '완료' && editProgress !== 100) {
                        Alert.alert('상태 변경', "상태를 '완료'로 변경하시겠습니까?", [
                          { text: '아니오', style: 'cancel' },
                          { text: '예', onPress: () => { setEditStatus('완료'); setEditKeepProgress(true); } },
                        ]);
                        return;
                      }
                      setEditKeepProgress(false);
                      setEditStatus(st);
                      if (st === '완료') setEditProgress(100);
                    }}>
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
                    onValueChange={(v) => {
                      setEditKeepProgress(false);
                      const rounded = Math.round(v);
                      setEditProgress(rounded);
                      if (rounded === 100) setEditStatus('완료');
                      else if (editStatus === '완료') setEditStatus('진행중');
                    }}
                    minimumTrackTintColor={statusColor(editStatus)}
                    maximumTrackTintColor={C.border}
                    thumbTintColor={statusColor(editStatus)}
                  />
                </View>

                {/* 시작일시 */}
                <Text style={s.inputLabel}>시작일시 (선택)</Text>
                <TextInput
                  style={[s.input, commonStyles.mb8]}
                  value={editStartDate}
                  onChangeText={(t) => setEditStartDate(formatDeadline(t))}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={C.textDim}
                  keyboardType="numeric"
                  maxLength={10}
                />
                <View style={s.timeRow}>
                  <TouchableOpacity style={[s.ampmBtn, editStartAmPm === '오전' && s.ampmBtnActive]} onPress={() => setEditStartAmPm('오전')}>
                    <Text style={[s.ampmBtnText, editStartAmPm === '오전' && s.ampmBtnTextActive]}>오전</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.ampmBtn, editStartAmPm === '오후' && s.ampmBtnActive]} onPress={() => setEditStartAmPm('오후')}>
                    <Text style={[s.ampmBtnText, editStartAmPm === '오후' && s.ampmBtnTextActive]}>오후</Text>
                  </TouchableOpacity>
                  <TextInput style={[s.input, commonStyles.flex1]} value={editStartTime} onChangeText={(t) => setEditStartTime(fmtTime12(t))} placeholder="09:00" placeholderTextColor={C.textDim} keyboardType="numeric" maxLength={5} />
                </View>

                {/* 마감일시 */}
                <Text style={s.inputLabel}>마감일시</Text>
                <TextInput
                  style={[s.input, commonStyles.mb8]}
                  value={editDeadline}
                  onChangeText={(t) => setEditDeadline(formatDeadline(t))}
                  placeholder="YYYY-MM-DD"
                  placeholderTextColor={C.textDim}
                  keyboardType="numeric"
                  maxLength={10}
                />
                <View style={s.timeRow}>
                  <TouchableOpacity style={[s.ampmBtn, editDeadlineAmPm === '오전' && s.ampmBtnActive]} onPress={() => setEditDeadlineAmPm('오전')}>
                    <Text style={[s.ampmBtnText, editDeadlineAmPm === '오전' && s.ampmBtnTextActive]}>오전</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.ampmBtn, editDeadlineAmPm === '오후' && s.ampmBtnActive]} onPress={() => setEditDeadlineAmPm('오후')}>
                    <Text style={[s.ampmBtnText, editDeadlineAmPm === '오후' && s.ampmBtnTextActive]}>오후</Text>
                  </TouchableOpacity>
                  <TextInput style={[s.input, commonStyles.flex1]} value={editDeadlineTime} onChangeText={(t) => setEditDeadlineTime(fmtTime12(t))} placeholder="06:00" placeholderTextColor={C.textDim} keyboardType="numeric" maxLength={5} />
                </View>

                {/* 메모 */}
                <Text style={s.inputLabel}>메모 (선택)</Text>
                <TextInput
                  style={[s.input, s.h80]}
                  value={editNotes}
                  onChangeText={setEditNotes}
                  multiline
                  placeholder="메모를 입력하세요"
                  placeholderTextColor={C.textDim}
                />

                {/* 관련 인물 / 관련 토픽 */}
                {(() => {
                  const linkedMeetings = detailProject?.meetingRecordIds?.length
                    ? meetingRecords.filter((r) => detailProject.meetingRecordIds.includes(r.id))
                    : [];
                  const meetingClientIds = [...new Set(linkedMeetings.flatMap((r) => r.clientIds || []))];
                  const allClientIds = [...new Set([...editClientIds, ...meetingClientIds])];
                  const people = allClientIds.map((id) => clients.find((c) => c.id === id)).filter(Boolean);
                  return (
                    <>
                      <View style={s.relatedPeopleHeaderRow}>
                        <Text style={[s.inputLabel, s.inputLabelInline]}>관련 인물</Text>
                        <TouchableOpacity
                          onPress={() => { setDetailPersonPickerVisible(true); setDetailPersonPickerSearch(''); }}
                          style={s.addPersonBtn}
                        >
                          <Text style={s.addPersonBtnText}>+ 추가</Text>
                        </TouchableOpacity>
                      </View>
                      {people.length > 0 && (
                        <View style={s.relatedPeopleRow}>
                          {people.map((c) => {
                            const isDirect = editClientIds.includes(c.id);
                            return (
                              <View key={c.id} style={s.relatedPersonChip}>
                                <TouchableOpacity
                                  style={s.personChipInner}
                                  activeOpacity={0.7}
                                  onPress={() => { setPersonDetailClient(c); setShowPersonDetail(true); }}
                                >
                                  <View style={s.relatedPersonAvatar}>
                                    <Text style={s.relatedPersonAvatarText}>{c.name[0]}</Text>
                                  </View>
                                  <View style={commonStyles.flex1}>
                                    <Text style={s.relatedPersonName}>{c.name}</Text>
                                    {c.company ? <Text style={s.relatedPersonCompany}>{c.company}{c.role ? ` · ${c.role}` : ''}</Text> : null}
                                  </View>
                                </TouchableOpacity>
                                {isDirect ? (
                                  <TouchableOpacity
                                    onPress={() => setEditClientIds((prev) => prev.filter((id) => id !== c.id))}
                                    hitSlop={{ top: 8, bottom: 8, left: 12, right: 4 }}
                                  >
                                    <Text style={s.removePersonIcon}>✕</Text>
                                  </TouchableOpacity>
                                ) : (
                                  <Text style={s.personChevron}>›</Text>
                                )}
                              </View>
                            );
                          })}
                        </View>
                      )}

                      {/* 관련 토픽: 관련 인물이 한 명이라도 있으면 생성 가능. 이름 중복은 담당자
                          단위로 검사되므로(handleCreateProjectTopic), 특정 "소속 회사" 지정 없이도
                          관련 인물 중 이름이 겹치지 않는 사람 아래에 자동으로 생성된다. */}
                      {people.length > 0 && (
                        <>
                          <Text style={s.inputLabel}>관련 토픽</Text>
                          {topics.filter((t) => t.projectId === detailProject?.id).length === 0 ? (
                            <Text style={s.projectTopicEmptyText}>등록된 토픽이 없습니다</Text>
                          ) : (
                            topics.filter((t) => t.projectId === detailProject?.id).map((t) => (
                              <View key={t.id} style={s.projectTopicRow}>
                                <Text style={s.projectTopicName} numberOfLines={1}>{t.name}</Text>
                              </View>
                            ))
                          )}
                          <View style={s.topicCreateRow}>
                            <TextInput
                              style={[s.input, commonStyles.flex1]}
                              value={newProjectTopicName}
                              onChangeText={setNewProjectTopicName}
                              placeholder="새 토픽 이름"
                              placeholderTextColor={C.textDim}
                            />
                            <TouchableOpacity style={s.topicCreateBtn} onPress={handleAddProjectTopic}>
                              <Text style={s.topicCreateBtnText}>추가</Text>
                            </TouchableOpacity>
                          </View>
                        </>
                      )}
                    </>
                  );
                })()}

                {/* 알림 메일 발송 여부 */}
                <TouchableOpacity
                  style={s.notifyEmailRow}
                  activeOpacity={0.7}
                  onPress={() => {
                    if (editClientIds.length === 0) {
                      Alert.alert('안내', '선택된 관련 인물이 없습니다.');
                      return;
                    }
                    setEditNotifyEmail((prev) => !prev);
                  }}
                >
                  <View style={[s.notifyEmailCheckbox, editNotifyEmail && s.notifyEmailCheckboxChecked]}>
                    {editNotifyEmail && <Text style={s.notifyEmailCheckmark}>✓</Text>}
                  </View>
                  <Text style={s.notifyEmailLabel}>관련 인물에게 알림 메일 발송</Text>
                </TouchableOpacity>

                {/* 버튼 */}
                <View style={s.modalBtns}>
                  <TouchableOpacity style={s.modalCancel} onPress={() => {
                    Alert.alert('삭제', `"${detailProject.title}" 프로젝트를 삭제할까요?`, [
                      { text: '취소', style: 'cancel' },
                      { text: '삭제', style: 'destructive', onPress: async () => { setProjects(await deleteProject(detailProject.id)); setShowDetail(false); } },
                    ]);
                  }}>
                    <Text style={[s.modalCancelText, s.textRed]}>삭제</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.modalCancel} onPress={() => confirmCopy(detailProject)}>
                    <Text style={s.modalCancelText}>복사</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.modalCancel} onPress={() => handleShare(detailProject)}>
                    <Text style={[s.modalCancelText, s.textBlue]}>공유</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={s.modalConfirm} onPress={handleEditSave}>
                    <Text style={s.modalConfirmText}>저장</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            )}
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── 복사본 이름 입력 모달 ── */}
      <Modal visible={showCopyTitleModal} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShowCopyTitleModal(false)}>
        <KeyboardAvoidingView style={s.modalOverlay} behavior="padding">
          <ScrollView contentContainerStyle={s.speakerModalScroll} keyboardShouldPersistTaps="handled">
            <View style={s.speakerModalBox}>
              <Text style={s.speakerModalTitle}>새 이름으로 저장</Text>
              <TextInput
                style={s.input}
                value={copyTitleInput}
                onChangeText={setCopyTitleInput}
                placeholder={copyTarget?.title}
                placeholderTextColor={C.textDim}
                autoFocus
              />
              <View style={s.speakerModalBtns}>
                <TouchableOpacity style={s.speakerCancelBtn} onPress={() => { setShowCopyTitleModal(false); setCopyTarget(null); }}>
                  <Text style={s.speakerCancelText}>취소</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.speakerSaveBtn} onPress={() => {
                  const trimmed = copyTitleInput.trim();
                  if (!trimmed) { Alert.alert('알림', '이름을 입력해주세요.'); return; }
                  if (trimmed === copyTarget?.title) { Alert.alert('알림', '기존 이름과 다른 이름을 입력해주세요.'); return; }
                  handleCopy(copyTarget, trimmed);
                  setShowCopyTitleModal(false);
                  setCopyTarget(null);
                }}>
                  <Text style={s.speakerSaveText}>저장</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── 프로젝트 추가 모달 ── */}
      <Modal visible={showAdd} animationType="slide" transparent onRequestClose={() => setShowAdd(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.modalOverlay}>
          <Animated.View style={[s.modalSheet, s.maxH92pct, swipeAdd.animStyle]}>
            <View style={s.modalHandleWrap} {...swipeAdd.panHandlers}>
              <View style={s.modalHandle} />
            </View>
            <Text style={s.modalTitle}>프로젝트 추가</Text>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

            <Text style={s.inputLabel}>제목</Text>
            <TextInput style={s.input} value={newTitle} onChangeText={setNewTitle} placeholder="프로젝트 이름" placeholderTextColor={C.textDim} />

            <Text style={s.inputLabel}>시작일시 (선택)</Text>
            <TextInput style={[s.input, commonStyles.mb8]} value={newStartDate} onChangeText={(t) => setNewStartDate(formatDeadline(t))} placeholder="YYYY-MM-DD" placeholderTextColor={C.textDim} keyboardType="numeric" maxLength={10} />
            <View style={s.timeRow}>
              <TouchableOpacity style={[s.ampmBtn, newStartAmPm === '오전' && s.ampmBtnActive]} onPress={() => setNewStartAmPm('오전')}>
                <Text style={[s.ampmBtnText, newStartAmPm === '오전' && s.ampmBtnTextActive]}>오전</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.ampmBtn, newStartAmPm === '오후' && s.ampmBtnActive]} onPress={() => setNewStartAmPm('오후')}>
                <Text style={[s.ampmBtnText, newStartAmPm === '오후' && s.ampmBtnTextActive]}>오후</Text>
              </TouchableOpacity>
              <TextInput style={[s.input, commonStyles.flex1]} value={newStartTime} onChangeText={(t) => setNewStartTime(fmtTime12(t))} placeholder="09:00" placeholderTextColor={C.textDim} keyboardType="numeric" maxLength={5} />
            </View>

            <Text style={s.inputLabel}>마감일시</Text>
            <TextInput style={[s.input, commonStyles.mb8]} value={newDeadline} onChangeText={(t) => setNewDeadline(formatDeadline(t))} placeholder="YYYY-MM-DD" placeholderTextColor={C.textDim} keyboardType="numeric" maxLength={10} />
            <View style={s.timeRow}>
              <TouchableOpacity style={[s.ampmBtn, newDeadlineAmPm === '오전' && s.ampmBtnActive]} onPress={() => setNewDeadlineAmPm('오전')}>
                <Text style={[s.ampmBtnText, newDeadlineAmPm === '오전' && s.ampmBtnTextActive]}>오전</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[s.ampmBtn, newDeadlineAmPm === '오후' && s.ampmBtnActive]} onPress={() => setNewDeadlineAmPm('오후')}>
                <Text style={[s.ampmBtnText, newDeadlineAmPm === '오후' && s.ampmBtnTextActive]}>오후</Text>
              </TouchableOpacity>
              <TextInput style={[s.input, commonStyles.flex1]} value={newDeadlineTime} onChangeText={(t) => setNewDeadlineTime(fmtTime12(t))} placeholder="06:00" placeholderTextColor={C.textDim} keyboardType="numeric" maxLength={5} />
            </View>

            <Text style={s.inputLabel}>상태</Text>
            <View style={s.optionRow}>
              {STATUSES.map((st) => (
                <TouchableOpacity key={st} style={[s.optionBtn, newStatus === st && { borderColor: statusColor(st) + '88', backgroundColor: statusColor(st) + '18' }]} onPress={() => {
                  if (st === '완료' && newProgress !== 100) {
                    Alert.alert('상태 변경', "상태를 '완료'로 변경하시겠습니까?", [
                      { text: '아니오', style: 'cancel' },
                      { text: '예', onPress: () => { setNewStatus('완료'); setNewKeepProgress(true); } },
                    ]);
                    return;
                  }
                  setNewKeepProgress(false);
                  setNewStatus(st);
                  if (st === '완료') setNewProgress(100);
                }}>
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
            <View style={s.sliderWrap}>
              <Text style={s.sliderVal}>{newProgress}%</Text>
              <Slider
                style={s.slider}
                minimumValue={0}
                maximumValue={100}
                step={1}
                value={newProgress}
                onValueChange={(v) => {
                  setNewKeepProgress(false);
                  const rounded = Math.round(v);
                  setNewProgress(rounded);
                  if (rounded === 100) setNewStatus('완료');
                  else if (newStatus === '완료') setNewStatus('진행중');
                }}
                minimumTrackTintColor={statusColor(newStatus)}
                maximumTrackTintColor={C.border}
                thumbTintColor={statusColor(newStatus)}
              />
            </View>

            <Text style={s.inputLabel}>메모 (선택)</Text>
            <TextInput style={[s.input, s.h64]} value={newNotes} onChangeText={setNewNotes} placeholder="지연 원인, 진행 상황 등" placeholderTextColor={C.textDim} multiline />

            {/* 관련 인물 */}
            <Text style={s.inputLabel}>관련 인물 · 담당자 (선택)</Text>
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
            <TouchableOpacity style={s.pickerTrigger} onPress={() => openRelatedClientPicker(newClientIds, setNewClientIds)}>
              <Text style={[s.pickerTriggerText, newClientIds.length > 0 && s.pickerTriggerTextActive]}>
                {newClientIds.length > 0 ? `${newClientIds.length}명 선택됨 · 변경` : '담당자 인원 선택'}
              </Text>
              <Text style={s.pickerTriggerIcon}>›</Text>
            </TouchableOpacity>

            {/* 알림 메일 발송 여부 */}
            <TouchableOpacity
              style={s.notifyEmailRow}
              activeOpacity={0.7}
              onPress={() => {
                if (newClientIds.length === 0) {
                  Alert.alert('안내', '선택된 관련 인물이 없습니다.');
                  return;
                }
                setNewNotifyEmail((prev) => !prev);
              }}
            >
              <View style={[s.notifyEmailCheckbox, newNotifyEmail && s.notifyEmailCheckboxChecked]}>
                {newNotifyEmail && <Text style={s.notifyEmailCheckmark}>✓</Text>}
              </View>
              <Text style={s.notifyEmailLabel}>관련 인물에게 알림 메일 발송</Text>
            </TouchableOpacity>

            <View style={[s.modalBtns, commonStyles.mb8]}>
              <TouchableOpacity style={s.modalCancel} onPress={() => { setShowAdd(false); setNewClientIds([]); setNewNotifyEmail(true); }}>
                <Text style={s.modalCancelText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.modalConfirm} onPress={handleAdd}>
                <Text style={s.modalConfirmText}>추가</Text>
              </TouchableOpacity>
            </View>
            </ScrollView>
          </Animated.View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── AI 지연 분석 채팅 모달 ── */}
      <Modal visible={showAI} animationType="slide" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalOverlay}>
          <View style={[s.modalSheet, s.h88pct]}>
            <View style={s.modalHandle} />
            <View style={s.chatHeader}>
              <View style={s.chatHeaderLeft}>
                <Text style={s.aiGlyph}>✦</Text>
                <View>
                  <Text style={s.modalTitle}>AI 도우미</Text>
                  <Text style={s.chatSubtitle}>프로젝트 정보 문의 · 현황 요약</Text>
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
              <ScrollView
                ref={quickScrollRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                style={[s.quickRow, Platform.OS === 'web' && s.quickRowWeb]}
                contentContainerStyle={s.quickContent}
                {...(Platform.OS === 'web' ? {
                  onWheel: handleQuickWheel,
                  onMouseDown: handleQuickMouseDown,
                  onMouseMove: handleQuickMouseMove,
                  onMouseUp: handleQuickMouseUp,
                  onMouseLeave: handleQuickMouseUp,
                } : {})}
              >
                {chatMessages.length === 1 && (
                  <TouchableOpacity style={s.quickBtn} onPress={() => { if (!isQuickDragClick()) handleQuickAnalysis(); }}>
                    <Text style={s.quickText}>⚡ 전체 현황 요약</Text>
                  </TouchableOpacity>
                )}
                {['등록자가 누구야?', '관련인물이 누구야?', '마감일이 언제야?'].map((q) => (
                  <TouchableOpacity key={q} style={s.quickBtn} onPress={() => { if (!isQuickDragClick()) setChatInput(q); }}>
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
                placeholder="프로젝트에 대해 무엇이든 물어보세요..."
                placeholderTextColor={C.textDim}
                onSubmitEditing={handleAIChat}
                returnKeyType="send"
              />
              <TouchableOpacity style={[s.sendBtn, !chatInput.trim() && commonStyles.opacity40]} onPress={handleAIChat} disabled={!chatInput.trim() || aiLoading}>
                <Text style={s.sendBtnText}>↑</Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      {/* ── 회의록 상세 모달 ── */}
      <Modal visible={showMeetingDetail} animationType="slide" transparent onRequestClose={() => setShowMeetingDetail(false)}>
        <View style={s.modalOverlay}>
          <Animated.View style={[s.modalSheet, commonStyles.maxH90pct, swipeMeetingDetail.animStyle]}>
            <View style={s.modalHandleWrap} {...swipeMeetingDetail.panHandlers}>
              <View style={s.modalHandle} />
            </View>
            {selectedMeeting && (
              <>
                <View style={s.meetingDetailHeader}>
                  <View style={commonStyles.flex1}>
                    <Text style={[s.modalTitle, commonStyles.mb0]} numberOfLines={2}>{selectedMeeting.title || '회의록'}</Text>
                    {selectedMeeting.createdAt && (
                      <Text style={s.meetingDetailDate}>
                        {new Date(selectedMeeting.createdAt).toLocaleDateString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit' })}
                        {selectedMeeting.source ? ` · ${selectedMeeting.source}` : ''}
                      </Text>
                    )}
                  </View>
                  <TouchableOpacity onPress={() => openSpeakerEditModal(selectedMeeting)} style={s.speakerEditBtn}>
                    <Text style={s.speakerEditBtnText}>화자 변경</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => openSegmentEditModal(selectedMeeting)} style={s.segmentEditBtn}>
                    <Text style={s.segmentEditBtnText}>화자 수정</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => openContentEditModal(selectedMeeting)} style={s.meetingEditBtn}>
                    <Text style={s.meetingEditBtnText}>내용 편집</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setShowMeetingDetail(false)} style={commonStyles.ml8}>
                    <Text style={s.closeBtn}>✕</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView showsVerticalScrollIndicator={false} style={commonStyles.mt8}>
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
                        {(() => {
                          const segs = parseTranscriptSegments(selectedMeeting.transcript);
                          if (segs.length === 0) return <Text style={s.meetingDetailText}>{selectedMeeting.transcript}</Text>;
                          const allSpkrs = [...new Set(segs.map((sg) => sg.speaker))];
                          return (
                            <View style={commonStyles.gap12}>
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
                  {!selectedMeeting.summary && !selectedMeeting.transcript && !selectedMeeting.tasks?.length && (
                    <Text style={[s.emptyText, commonStyles.mt20]}>저장된 내용이 없습니다.</Text>
                  )}
                  <View style={commonStyles.spacerH20} />
                </ScrollView>
              </>
            )}
          </Animated.View>
        </View>
      </Modal>

      {/* ── 화자 관리 모달 ── */}
      <Modal visible={!!speakerEditRecordId} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setSpeakerEditRecordId(null)}>
        <KeyboardAvoidingView style={s.modalOverlay} behavior="padding">
          <ScrollView contentContainerStyle={[s.speakerModalScroll, { paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled">
            <View style={s.speakerModalBox}>
              <Text style={s.speakerModalTitle}>화자 관리</Text>
              {Object.keys(speakerEditNames).length > 0 && (
                <Text style={s.speakerModalSubtitle}>이름 변경 또는 삭제 (빈칸이면 원래 이름 유지)</Text>
              )}
              {Object.keys(speakerEditNames).map((speaker, idx) => {
                const isDeleted = speakerEditDeleted.has(speaker);
                const linked = clients.find((c) => c.name === speakerEditNames[speaker]);
                const color = SPEAKER_COLORS[idx % SPEAKER_COLORS.length];
                return (
                  <View key={speaker} style={[s.speakerRow, isDeleted && s.speakerRowDeleted]}>
                    <View style={[s.speakerColorDot, { backgroundColor: color }, isDeleted && commonStyles.opacity40]} />
                    <Text style={[s.speakerOrigLabel, { color }, isDeleted && s.speakerOrigLabelDeleted]}>{speaker}</Text>
                    <Text style={s.speakerArrow}>→</Text>
                    <TextInput
                      style={[s.speakerInput, isDeleted && s.speakerInputDeleted]}
                      value={speakerEditNames[speaker]}
                      onChangeText={(v) => setSpeakerEditNames((prev) => ({ ...prev, [speaker]: v }))}
                      placeholder={isDeleted ? '(삭제됨)' : speaker}
                      placeholderTextColor={C.textDim}
                      editable={!isDeleted}
                    />
                    {!isDeleted && (
                      <TouchableOpacity
                        style={[s.clientRegBtn, !!linked && s.clientRegBtnActive]}
                        onPress={() => openClientPicker(speaker)}
                        activeOpacity={0.7}
                      >
                        <Text style={[s.clientRegBtnText, !!linked && s.clientRegBtnTextActive]}>
                          {linked ? linked.name : '담당자'}
                        </Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      style={[s.speakerDeleteBtn, isDeleted && s.speakerDeleteBtnActive]}
                      onPress={() => setSpeakerEditDeleted((prev) => {
                        const next = new Set(prev);
                        next.has(speaker) ? next.delete(speaker) : next.add(speaker);
                        return next;
                      })}
                      activeOpacity={0.7}
                    >
                      <Text style={[s.speakerDeleteBtnText, isDeleted && s.speakerDeleteBtnTextActive]}>
                        {isDeleted ? '복원' : '✕'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                );
              })}
              {speakerEditCustom.map((item, idx) => (
                <View key={`custom-${idx}`} style={s.speakerRow}>
                  <TextInput
                    style={[s.speakerInput, s.speakerInputFixed]}
                    value={item.origKey}
                    onChangeText={(v) => setSpeakerEditCustom((prev) => prev.map((c, i) => i === idx ? { ...c, origKey: v } : c))}
                    placeholder="원본 ID"
                    placeholderTextColor={C.textDim}
                  />
                  <Text style={s.speakerArrow}>→</Text>
                  <TextInput
                    style={s.speakerInput}
                    value={item.newName}
                    onChangeText={(v) => setSpeakerEditCustom((prev) => prev.map((c, i) => i === idx ? { ...c, newName: v } : c))}
                    placeholder="새 이름"
                    placeholderTextColor={C.textDim}
                  />
                  <TouchableOpacity
                    style={s.speakerDeleteBtn}
                    onPress={() => setSpeakerEditCustom((prev) => prev.filter((_, i) => i !== idx))}
                    activeOpacity={0.7}
                  >
                    <Text style={s.speakerDeleteBtnText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
              <TouchableOpacity
                style={s.speakerAddBtn}
                onPress={() => setSpeakerEditCustom((prev) => [...prev, { origKey: '', newName: '' }])}
                activeOpacity={0.8}
              >
                <Text style={s.speakerAddBtnText}>+ 화자 추가</Text>
              </TouchableOpacity>
              <View style={s.speakerModalBtns}>
                <TouchableOpacity style={s.speakerCancelBtn} onPress={() => setSpeakerEditRecordId(null)} activeOpacity={0.7}>
                  <Text style={s.speakerCancelText}>취소</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.speakerSaveBtn} onPress={confirmSpeakerEdit} activeOpacity={0.8}>
                  <Text style={s.speakerSaveText}>변경</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── 화자 수동 수정 모달 ── */}
      <Modal visible={!!segmentEditRecordId} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setSegmentEditRecordId(null)}>
        <View style={s.segModalOverlay}>
          <View style={s.segModalBox}>
            <View style={s.segModalHeader}>
              <Text style={s.speakerModalTitle}>화자 수동 수정</Text>
              <Text style={s.speakerModalSubtitle}>화자 레이블을 탭해 변경하세요</Text>
            </View>
            <ScrollView style={s.segModalScroll} keyboardShouldPersistTaps="handled">
              {(() => {
                const allSpeakers = [...new Set(editableSegments.map((seg) => seg.speaker))];
                return editableSegments.map((seg, idx) => {
                  const isPicking = segmentPickerIdx === idx;
                  const color = SPEAKER_COLORS[allSpeakers.indexOf(seg.speaker) % SPEAKER_COLORS.length];
                  return (
                    <View key={idx} style={s.segRow}>
                      <TouchableOpacity
                        style={[s.segSpeakerBadge, { backgroundColor: color + '22', borderColor: color + '55' }, isPicking && { backgroundColor: color + '44', borderColor: color }]}
                        onPress={() => setSegmentPickerIdx(isPicking ? null : idx)}
                        activeOpacity={0.7}
                      >
                        <Text style={[s.segSpeakerText, { color }]}>{seg.speaker}</Text>
                      </TouchableOpacity>
                      <Text style={s.segContent} numberOfLines={isPicking ? undefined : 3}>{seg.text}</Text>
                      {isPicking && (
                        <View style={s.segPickerBox}>
                          {allSpeakers.map((sp) => {
                            const chipColor = SPEAKER_COLORS[allSpeakers.indexOf(sp) % SPEAKER_COLORS.length];
                            return (
                              <TouchableOpacity
                                key={sp}
                                style={[s.segPickerChip, { borderColor: chipColor + '55' }, seg.speaker === sp && { backgroundColor: chipColor + '22', borderColor: chipColor + '66' }]}
                                onPress={() => {
                                  setEditableSegments((prev) => prev.map((s, i) => i === idx ? { ...s, speaker: sp } : s));
                                  setSegmentPickerIdx(null);
                                }}
                                activeOpacity={0.7}
                              >
                                <Text style={[s.segPickerChipText, { color: chipColor }, seg.speaker === sp && s.segPickerChipTextActive]}>{sp}</Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      )}
                    </View>
                  );
                });
              })()}
            </ScrollView>
            <View style={[s.speakerModalBtns, s.segModalFooter, { paddingBottom: insets.bottom + 16 }]}>
              <TouchableOpacity style={s.speakerCancelBtn} onPress={() => setSegmentEditRecordId(null)} activeOpacity={0.7}>
                <Text style={s.speakerCancelText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.speakerSaveBtn} onPress={confirmSegmentEdit} activeOpacity={0.8}>
                <Text style={s.speakerSaveText}>저장</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── 담당자 선택 모달 ── */}
      <Modal visible={!!clientPickerSpeaker} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setClientPickerSpeaker(null)}>
        <View style={[s.modalOverlay, s.modalOverlayCentered]}>
          <View style={[s.speakerModalBox, s.clientPickerBox]}>
            <Text style={s.speakerModalTitle}>담당자 선택</Text>
            <TextInput
              style={s.clientPickerInput}
              value={clientPickerSearch}
              onChangeText={setClientPickerSearch}
              placeholder="이름 또는 회사 검색"
              placeholderTextColor={C.textDim}
              autoFocus
            />
            <ScrollView style={s.clientPickerList} keyboardShouldPersistTaps="handled">
              {clients
                .filter((c) => !clientPickerSearch || c.name.includes(clientPickerSearch) || (c.company || '').includes(clientPickerSearch))
                .map((c) => (
                  <TouchableOpacity key={c.id} style={s.clientPickerItem} onPress={() => selectClient(c)} activeOpacity={0.7}>
                    <Text style={s.clientPickerName}>{c.name}</Text>
                    {!!c.company && <Text style={s.clientPickerCompany}>{c.company}{c.role ? ` · ${c.role}` : ''}</Text>}
                  </TouchableOpacity>
                ))
              }
              {clients.filter((c) => !clientPickerSearch || c.name.includes(clientPickerSearch) || (c.company || '').includes(clientPickerSearch)).length === 0 && (
                <Text style={s.clientPickerEmpty}>검색 결과가 없습니다</Text>
              )}
            </ScrollView>
            {!!clientPickerSearch.trim() && (
              <TouchableOpacity style={s.clientAddBtn} onPress={addAndSelectClient} activeOpacity={0.8}>
                <Text style={s.clientAddBtnText}>{`'${clientPickerSearch.trim()}' 새로 추가`}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={s.speakerCancelBtn} onPress={() => setClientPickerSpeaker(null)} activeOpacity={0.7}>
              <Text style={s.speakerCancelText}>취소</Text>
            </TouchableOpacity>
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

      {/* ── 인물 상세 모달 ── */}
      <Modal visible={showPersonDetail} animationType="slide" transparent onRequestClose={() => setShowPersonDetail(false)}>
        <View style={s.modalOverlay}>
          <Animated.View style={[s.modalSheet, commonStyles.maxH85pct, swipePersonDetail.animStyle]}>
            <View style={s.modalHandleWrap} {...swipePersonDetail.panHandlers}>
              <View style={s.modalHandle} />
            </View>
            {personDetailClient && (
              <>
                <View style={s.personDetailHeader}>
                  <View style={s.personDetailAvatar}>
                    <Text style={s.relatedPersonAvatarText}>{personDetailClient.name[0]}</Text>
                  </View>
                  <View style={commonStyles.flex1}>
                    <Text style={s.personDetailName}>{personDetailClient.name}</Text>
                    {personDetailClient.company ? (
                      <Text style={s.personDetailCompany}>{personDetailClient.company}{personDetailClient.role ? ` · ${personDetailClient.role}` : ''}</Text>
                    ) : null}
                    {personDetailClient.contact ? (
                      <Text style={s.personDetailContact}>{personDetailClient.contact}</Text>
                    ) : null}
                  </View>
                  <TouchableOpacity onPress={() => setShowPersonDetail(false)}>
                    <Text style={s.closeBtn}>✕</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView showsVerticalScrollIndicator={false}>
                  {personDetailClient.notes ? (
                    <>
                      <Text style={s.inputLabel}>메모</Text>
                      <View style={s.meetingDetailSection}>
                        <Text style={s.meetingDetailText}>{personDetailClient.notes}</Text>
                      </View>
                    </>
                  ) : null}
                  {(() => {
                    const personHistories = histories.filter((h) => h.clientId === personDetailClient.id).sort((a, b) => b.createdAt - a.createdAt);
                    if (!personHistories.length) return null;
                    return (
                      <>
                        <Text style={s.inputLabel}>히스토리 {personHistories.length}건</Text>
                        {personHistories.map((h, i) => (
                          <View key={h.id} style={[s.personHistoryItem, i < personHistories.length - 1 && commonStyles.borderBottom]}>
                            <Text style={s.personHistoryDate}>{h.date}</Text>
                            <Text style={s.personHistoryTitle}>{h.title}</Text>
                            {h.content ? <Text style={s.personHistoryContent}>{h.content}</Text> : null}
                          </View>
                        ))}
                      </>
                    );
                  })()}
                  {!personDetailClient.notes && !histories.filter((h) => h.clientId === personDetailClient.id).length && (
                    <Text style={[s.emptyText, commonStyles.mt20]}>저장된 정보가 없습니다.</Text>
                  )}
                  <View style={commonStyles.spacerH20} />
                </ScrollView>
              </>
            )}
          </Animated.View>
        </View>
      </Modal>

      {/* ── 인물 추가 피커 모달 (프로젝트 상세) ── */}
      <Modal visible={detailPersonPickerVisible} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setDetailPersonPickerVisible(false)}>
        <View style={[s.modalOverlay, s.modalOverlayCentered]}>
          <View style={[s.speakerModalBox, s.clientPickerBox]}>
            <Text style={s.speakerModalTitle}>인물 추가</Text>
            <TextInput
              style={s.clientPickerInput}
              value={detailPersonPickerSearch}
              onChangeText={setDetailPersonPickerSearch}
              placeholder="이름 또는 회사 검색"
              placeholderTextColor={C.textDim}
              autoFocus
            />
            <ScrollView style={s.clientPickerList} keyboardShouldPersistTaps="handled">
              {clients
                .filter((c) => !editClientIds.includes(c.id))
                .filter((c) => !detailPersonPickerSearch || c.name.includes(detailPersonPickerSearch) || (c.company || '').includes(detailPersonPickerSearch))
                .map((c) => (
                  <TouchableOpacity key={c.id} style={s.clientPickerItem} onPress={() => addClientToDetail(c)} activeOpacity={0.7}>
                    <Text style={s.clientPickerName}>{c.name}</Text>
                    {!!c.company && <Text style={s.clientPickerCompany}>{c.company}{c.role ? ` · ${c.role}` : ''}</Text>}
                  </TouchableOpacity>
                ))
              }
              {clients
                .filter((c) => !editClientIds.includes(c.id))
                .filter((c) => !detailPersonPickerSearch || c.name.includes(detailPersonPickerSearch) || (c.company || '').includes(detailPersonPickerSearch))
                .length === 0 && (
                <Text style={s.clientPickerEmpty}>검색 결과가 없습니다</Text>
              )}
            </ScrollView>
            <TouchableOpacity style={s.speakerCancelBtn} onPress={() => setDetailPersonPickerVisible(false)} activeOpacity={0.7}>
              <Text style={s.speakerCancelText}>취소</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── 담당자 인원 피커 팝업 (프로젝트 추가) ── */}
      <Modal visible={showClientPicker} animationType="slide" transparent onRequestClose={() => setShowClientPicker(false)}>
        <View style={s.modalOverlay}>
          <View style={[s.pickerSheetBase, s.pickerSheet]}>
            <View style={s.pickerHeader}>
              <TouchableOpacity onPress={() => setShowClientPicker(false)} style={s.pickerHeaderBtn}>
                <Text style={s.pickerCancelText}>취소</Text>
              </TouchableOpacity>
              <Text style={s.pickerTitle}>담당자 인원 선택</Text>
              <TouchableOpacity onPress={confirmRelatedClientPicker} style={s.pickerHeaderBtn}>
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
                <Text style={s.pickerAddNewText}>+ 신규 담당자 인원 등록</Text>
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

      {/* ── 신규 담당자 인원 등록 (피커에서 진입) ── */}
      <Modal visible={showPickerAddClient} animationType="slide" transparent onRequestClose={() => setShowPickerAddClient(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={s.modalOverlay}>
          <View style={[s.pickerSheetBase, s.pickerSheet]}>
            <View style={s.pickerHeader}>
              <TouchableOpacity onPress={() => setShowPickerAddClient(false)} style={s.pickerHeaderBtn}>
                <Text style={s.pickerCancelText}>취소</Text>
              </TouchableOpacity>
              <Text style={s.pickerTitle}>신규 담당자 인원 등록</Text>
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

      {/* ── 이메일 미등록 인물 모달 (프로젝트 추가/수정 저장 직전) ── */}
      <Modal visible={missingEmailModalVisible} transparent animationType="fade" statusBarTranslucent onRequestClose={skipMissingEmailAndSave}>
        <View style={[s.modalOverlay, s.modalOverlayCentered]}>
          <View style={s.speakerModalBox}>
            <Text style={s.speakerModalTitle}>이메일 미등록 인물</Text>
            <Text style={s.speakerModalSubtitle}>
              다음 관련 인물은 이메일이 등록되어 있지 않아 알림 메일을 받을 수 없습니다. 지금 입력하면 저장 시 함께 등록됩니다.
            </Text>
            <ScrollView style={s.clientPickerList} keyboardShouldPersistTaps="handled">
              {missingEmailPeople.map((p) => (
                <View key={p.id} style={s.missingEmailRow}>
                  <Text style={s.clientPickerName}>{p.name}</Text>
                  <TextInput
                    style={s.clientPickerInput}
                    value={missingEmailDrafts[p.id] || ''}
                    onChangeText={(t) => setMissingEmailDrafts((prev) => ({ ...prev, [p.id]: t }))}
                    placeholder="이메일 (선택)"
                    placeholderTextColor={C.textDim}
                    keyboardType="email-address"
                    autoCapitalize="none"
                  />
                </View>
              ))}
            </ScrollView>
            <View style={s.modalBtns}>
              <TouchableOpacity style={s.speakerCancelBtn} onPress={skipMissingEmailAndSave} activeOpacity={0.7}>
                <Text style={s.speakerCancelText}>그대로 등록</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.modalConfirm} onPress={confirmMissingEmailAndSave} activeOpacity={0.8}>
                <Text style={s.modalConfirmText}>저장하고 등록</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── 프로젝트 보기 모달 (읽기 전용) ── */}
      <Modal visible={showProjectView} animationType="slide" transparent onRequestClose={() => setShowProjectView(false)}>
        <View style={s.modalOverlay}>
          <Animated.View style={[s.modalSheet, commonStyles.maxH80pct, swipeProjectView.animStyle]}>
            <View style={s.modalHandleWrap} {...swipeProjectView.panHandlers}>
              <View style={s.modalHandle} />
            </View>
            {viewProject && (() => {
              const days = daysUntil(viewProject.deadline);
              const isCompleted = viewProject.status === '완료';
              const linkedMeetings = viewProject.meetingRecordIds?.length
                ? meetingRecords.filter((r) => viewProject.meetingRecordIds.includes(r.id))
                : [];
              const meetingClientIds = [...new Set(linkedMeetings.flatMap((r) => r.clientIds || []))];
              const allClientIds = [...new Set([...(viewProject.clientIds || []), ...meetingClientIds])];
              const people = allClientIds.map((id) => clients.find((c) => c.id === id)).filter(Boolean);
              return (
                <ScrollView showsVerticalScrollIndicator={false}>
                  <View style={s.detailHeader}>
                    <Text style={[s.modalTitle, commonStyles.flex1]} numberOfLines={2}>{viewProject.title}</Text>
                    <TouchableOpacity onPress={() => setShowProjectView(false)} style={commonStyles.ml12}>
                      <Text style={s.closeBtn}>✕</Text>
                    </TouchableOpacity>
                  </View>
                  {currentUser?.name ? <Text style={s.registrantText}>등록자: {currentUser.name}</Text> : null}

                  <View style={s.viewBadgeRow}>
                    <View style={[s.statusBadge, { borderColor: statusColor(viewProject.status) + '66', backgroundColor: statusColor(viewProject.status) + '18' }]}>
                      <Text style={[s.statusText, { color: statusColor(viewProject.status) }]}>{viewProject.status}</Text>
                    </View>
                    <View style={[s.priorityBadge, { borderColor: priorityColor(viewProject.priority) + '55' }]}>
                      <Text style={[s.priorityText, { color: priorityColor(viewProject.priority) }]}>{viewProject.priority}</Text>
                    </View>
                  </View>

                  <Text style={s.inputLabel}>진행률</Text>
                  <View style={s.progressTrack}>
                    <View style={[s.progressFill, { width: `${viewProject.progress}%`, backgroundColor: statusColor(viewProject.status) }]} />
                  </View>
                  <Text style={[s.progressLabel, s.progressLabelSpacing]}>{viewProject.progress}% 완료</Text>

                  <Text style={s.inputLabel}>마감일</Text>
                  <Text style={[s.viewText, days < 0 && !isCompleted && { color: C.red }, days >= 0 && days <= 3 && { color: C.gold }]}>
                    {viewProject.deadline}{isCompleted && days < 0 ? '' : `  ·  ${daysLabel(days)}`}
                  </Text>

                  {viewProject.notes ? (
                    <>
                      <Text style={s.inputLabel}>메모</Text>
                      <Text style={s.viewText}>{viewProject.notes}</Text>
                    </>
                  ) : null}

                  {people.length > 0 && (
                    <>
                      <Text style={s.inputLabel}>관련 인물</Text>
                      <View style={s.relatedPeopleRow}>
                        {people.map((c) => (
                          <View key={c.id} style={s.relatedPersonChip}>
                            <View style={s.personChipInner}>
                              <View style={s.relatedPersonAvatar}>
                                <Text style={s.relatedPersonAvatarText}>{c.name[0]}</Text>
                              </View>
                              <View style={commonStyles.flex1}>
                                <Text style={s.relatedPersonName}>{c.name}</Text>
                                {c.company ? <Text style={s.relatedPersonCompany}>{c.company}{c.role ? ` · ${c.role}` : ''}</Text> : null}
                              </View>
                            </View>
                          </View>
                        ))}
                      </View>
                    </>
                  )}

                  <TouchableOpacity style={[s.modalConfirm, s.confirmBtnBlock]} onPress={() => { setShowProjectView(false); openDetail(viewProject); }}>
                    <Text style={s.modalConfirmText}>수정하기</Text>
                  </TouchableOpacity>
                  <View style={s.spacerH8} />
                </ScrollView>
              );
            })()}
          </Animated.View>
        </View>
      </Modal>

      {/* ── 회사 전체 보기: 프로젝트 상세 (조회 전용 — 회사 관리자도 다른 부서 프로젝트는 수정 불가) ── */}
      <Modal visible={showCompanyDetail} animationType="slide" transparent onRequestClose={() => setShowCompanyDetail(false)}>
        <View style={s.modalOverlay}>
          <Animated.View style={[s.modalSheet, commonStyles.maxH80pct, swipeCompanyDetail.animStyle]}>
            <View style={s.modalHandleWrap} {...swipeCompanyDetail.panHandlers}>
              <View style={s.modalHandle} />
            </View>
            {companyDetailProject && (() => {
              const days = daysUntil(companyDetailProject.deadline);
              const isCompleted = companyDetailProject.status === '완료';
              return (
                <ScrollView showsVerticalScrollIndicator={false}>
                  <View style={s.detailHeader}>
                    <Text style={[s.modalTitle, commonStyles.flex1]} numberOfLines={2}>{companyDetailProject.title}</Text>
                    <TouchableOpacity onPress={() => setShowCompanyDetail(false)} style={commonStyles.ml12}>
                      <Text style={s.closeBtn}>✕</Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={s.inputLabel}>담당 부서 · 담당자</Text>
                  <Text style={s.viewText}>{companyDetailProject.ownerTeam} · {companyDetailProject.departmentName || '부서 미배정'} · {companyDetailProject.ownerName}</Text>

                  <View style={s.viewBadgeRow}>
                    <View style={[s.statusBadge, { borderColor: statusColor(companyDetailProject.status) + '66', backgroundColor: statusColor(companyDetailProject.status) + '18' }]}>
                      <Text style={[s.statusText, { color: statusColor(companyDetailProject.status) }]}>{companyDetailProject.status}</Text>
                    </View>
                    <View style={[s.priorityBadge, { borderColor: priorityColor(companyDetailProject.priority) + '55' }]}>
                      <Text style={[s.priorityText, { color: priorityColor(companyDetailProject.priority) }]}>{companyDetailProject.priority}</Text>
                    </View>
                  </View>

                  <Text style={s.inputLabel}>진행률</Text>
                  <View style={s.progressTrack}>
                    <View style={[s.progressFill, { width: `${companyDetailProject.progress}%`, backgroundColor: statusColor(companyDetailProject.status) }]} />
                  </View>
                  <Text style={[s.progressLabel, s.progressLabelSpacing]}>{companyDetailProject.progress}% 완료</Text>

                  {companyDetailProject.startDate ? (
                    <>
                      <Text style={s.inputLabel}>시작일</Text>
                      <Text style={s.viewText}>{companyDetailProject.startDate}</Text>
                    </>
                  ) : null}

                  <Text style={s.inputLabel}>마감일</Text>
                  <Text style={[s.viewText, days < 0 && !isCompleted && { color: C.red }, days >= 0 && days <= 3 && { color: C.gold }]}>
                    {companyDetailProject.deadline}{isCompleted && days < 0 ? '' : `  ·  ${daysLabel(days)}`}
                  </Text>

                  {companyDetailProject.notes ? (
                    <>
                      <Text style={s.inputLabel}>메모</Text>
                      <Text style={s.viewText}>{companyDetailProject.notes}</Text>
                    </>
                  ) : null}

                  {companyDetailProject.relatedPeople?.length > 0 && (
                    <>
                      <Text style={s.inputLabel}>관련 인물</Text>
                      <View style={s.relatedPeopleRow}>
                        {companyDetailProject.relatedPeople.map((c) => (
                          <View key={c.id} style={s.relatedPersonChip}>
                            <View style={s.personChipInner}>
                              <View style={s.relatedPersonAvatar}>
                                <Text style={s.relatedPersonAvatarText}>{c.name[0]}</Text>
                              </View>
                              <View style={commonStyles.flex1}>
                                <Text style={s.relatedPersonName}>{c.name}</Text>
                                {c.company ? <Text style={s.relatedPersonCompany}>{c.company}{c.role ? ` · ${c.role}` : ''}</Text> : null}
                              </View>
                            </View>
                          </View>
                        ))}
                      </View>
                    </>
                  )}

                  <View style={s.spacerH8} />
                </ScrollView>
              );
            })()}
          </Animated.View>
        </View>
      </Modal>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingTop: 60, paddingHorizontal: 24, paddingBottom: 16 },
  headerTitle: { color: C.textPrimary, fontSize: 22, fontWeight: '300', letterSpacing: -0.5 },
  headerSub: { color: C.red, fontSize: 11, marginTop: 2 },
  headerSubDim: { color: C.textSecondary, fontSize: 11, marginTop: 2 },
  headerBtns: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  aiBtn: { paddingHorizontal: 12, paddingVertical: 7, backgroundColor: C.accentBlue + '22', borderWidth: 1, borderColor: C.accentBlue + '55', borderRadius: 20 },
  aiBtnText: { color: C.accentBlue, fontSize: 12, fontWeight: '600' },

  viewModeRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingBottom: 12 },
  viewModeBtn: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface, alignItems: 'center' },
  viewModeBtnActive: { borderColor: C.companyIndigo + '88', backgroundColor: C.companyIndigo + '18' },
  viewModeText: { color: C.textDim, fontSize: 13, fontWeight: '500' },
  viewModeTextActive: { color: C.companyIndigo },

  deptSection: { gap: 10, marginBottom: 20 },
  deptHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2, marginBottom: 4 },
  deptName: { color: C.companyIndigo, fontSize: 15, fontWeight: '600' },
  deptMeta: { color: C.textDim, fontSize: 11 },
  ownerChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, backgroundColor: C.companyIndigo + '18', borderWidth: 1, borderColor: C.companyIndigo + '44' },
  ownerChipText: { color: C.companyIndigo, fontSize: 10, fontWeight: '500' },

  // "회사 전체" 부서 트리 사이드바 (CompanyScreen.js와 동일 패턴)
  body: { flex: 1, flexDirection: 'row' },
  sidebar: { flexGrow: 0, flexShrink: 0, flexBasis: 'auto', minWidth: SIDEBAR_MIN_WIDTH, maxWidth: SIDEBAR_MAX_WIDTH, borderRightWidth: 1, borderRightColor: C.border },
  sidebarContent: { paddingHorizontal: SIDEBAR_PADDING_H, paddingTop: 12, paddingBottom: 100, gap: 8 },
  sidebarItem: { alignSelf: 'flex-start', maxWidth: '100%', paddingVertical: 6, paddingHorizontal: 4 },
  sidebarItemText: { color: C.textDim, fontSize: 12, fontWeight: '500' },
  sidebarItemTextActive: { color: C.companyIndigo, fontWeight: '600' },
  treePrefix: { color: C.textDim, fontWeight: '400' },

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
  urgencyBorder: { borderRadius: 14, borderWidth: 2 },
  cardTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  cardTopRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 10 },
  riskIcon: { color: C.gold, fontSize: 12 },
  cardTitle: { color: C.textPrimary, fontSize: 14, fontWeight: '500', flex: 1 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1 },
  statusText: { fontSize: 10, fontWeight: '600' },

  progressTrack: { height: 4, backgroundColor: C.border, borderRadius: 2, overflow: 'hidden', marginTop: 10 },
  progressFill: { height: '100%', borderRadius: 2 },
  progressRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  progressLabel: { color: C.textDim, fontSize: 11 },
  viewText: { color: C.textSecondary, fontSize: 14, paddingHorizontal: 4, marginBottom: 12, lineHeight: 20 },
  viewBadgeRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 4, marginBottom: 16 },
  registrantText: { color: C.textDim, fontSize: 12, paddingHorizontal: 4, marginBottom: 8 },
  editProgressChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, borderColor: '#2E7D5E99', backgroundColor: '#2E7D5E22', alignItems: 'center', justifyContent: 'center' },
  editProgress: { color: '#2E7D5E', fontSize: 10, fontWeight: '600', textAlign: 'center' },
  readOnlyChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, borderColor: C.textSecondary + '55', backgroundColor: C.textSecondary + '18', alignItems: 'center', justifyContent: 'center' },
  readOnlyChipText: { color: C.textSecondary, fontSize: 10, fontWeight: '600', textAlign: 'center' },

  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 8 },
  priorityBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, borderWidth: 1 },
  priorityText: { fontSize: 10, fontWeight: '500' },
  startDateText: { color: C.textDim, fontSize: 11 },
  deadlineText: { color: C.textDim, fontSize: 11 },
  cardNotes: { color: C.textDim, fontSize: 11, fontStyle: 'italic' },
  cardRelatedPeopleWrap: { marginTop: 10, gap: 5 },
  cardRelatedPeopleLabel: { color: C.textDim, fontSize: 10, fontWeight: '500', letterSpacing: 0.4 },
  cardRelatedPeopleRow: { gap: 6 },
  cardPersonChip: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.accentTeal + '12', borderWidth: 1, borderColor: C.accentTeal + '33', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 8 },
  cardPersonAvatar: { width: 26, height: 26, borderRadius: 13, backgroundColor: C.accentTeal + '2A', borderWidth: 1, borderColor: C.accentTeal + '44', alignItems: 'center', justifyContent: 'center' },
  cardPersonAvatarText: { color: C.accentTeal, fontSize: 11, fontWeight: '600' },
  cardPersonName: { color: C.textSecondary, fontSize: 12, fontWeight: '500' },
  cardPersonCompany: { color: C.textDim, fontSize: 10, marginTop: 1 },
  meetingChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  meetingChip: { backgroundColor: C.accentPurple + '18', borderWidth: 1, borderColor: C.accentPurple + '44', borderRadius: 6, paddingVertical: 3, paddingHorizontal: 8 },
  meetingChipText: { color: C.accentPurple, fontSize: 11, fontWeight: '500' },
  meetingDetailHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 4 },
  meetingEditBtn: { borderWidth: 1, borderColor: C.accentTeal + '55', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 8, marginLeft: 6, marginTop: 2 },
  meetingEditBtnText: { color: C.accentTeal, fontSize: 12, fontWeight: '500' },
  speakerEditBtn: { borderWidth: 1, borderColor: C.accentPurple + '55', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 8, marginLeft: 6, marginTop: 2 },
  speakerEditBtnText: { color: C.accentPurple, fontSize: 12, fontWeight: '500' },
  segmentEditBtn: { borderWidth: 1, borderColor: C.gold + '55', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 8, marginLeft: 6, marginTop: 2 },
  segmentEditBtnText: { color: C.gold, fontSize: 12, fontWeight: '500' },

  speakerModalScroll: Platform.OS === 'web'
    ? { flexGrow: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32, paddingVertical: 40 }
    : { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 32, paddingVertical: 40 },
  speakerModalBox: Platform.OS === 'web'
    ? { backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderHigh, borderRadius: 16, padding: 24, gap: 16, width: '100%', maxWidth: 480 }
    : { backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderHigh, borderRadius: 16, padding: 24, gap: 16 },
  speakerModalTitle: { color: C.textPrimary, fontSize: 16, fontWeight: '500', letterSpacing: 0.3 },
  speakerModalSubtitle: { color: C.textDim, fontSize: 12, letterSpacing: 0.3, marginTop: -8 },
  speakerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  speakerColorDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  speakerOrigLabel: { fontSize: 13, fontWeight: '500', width: 58 },
  speakerArrow: { color: C.textDim, fontSize: 12 },
  speakerInput: { flex: 1, backgroundColor: C.bg, borderWidth: 1, borderColor: C.borderHigh, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, color: C.textPrimary, fontSize: 13 },
  speakerRowDeleted: { opacity: 0.45 },
  speakerOrigLabelDeleted: { textDecorationLine: 'line-through' },
  speakerInputDeleted: { backgroundColor: C.bg + '80' },
  speakerDeleteBtn: { borderWidth: 1, borderColor: C.red + '55', borderRadius: 6, paddingVertical: 6, paddingHorizontal: 8, minWidth: 36, alignItems: 'center' },
  speakerDeleteBtnActive: { backgroundColor: C.accentTeal + '22', borderColor: C.accentTeal + '66' },
  speakerDeleteBtnText: { color: C.red, fontSize: 11, fontWeight: '600' },
  speakerDeleteBtnTextActive: { color: C.accentTeal },
  speakerAddBtn: { backgroundColor: C.accentPurple + '18', borderWidth: 1, borderColor: C.accentPurple + '44', borderRadius: 8, paddingVertical: 10, alignItems: 'center' },
  speakerAddBtnText: { color: C.accentPurple, fontSize: 13, fontWeight: '500' },
  speakerModalBtns: { flexDirection: 'row', gap: 10, marginTop: 4 },
  speakerCancelBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: C.border, borderRadius: 10 },
  speakerCancelText: { color: C.textSecondary, fontSize: 14 },
  speakerSaveBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', backgroundColor: C.accentTeal + '22', borderWidth: 1, borderColor: C.accentTeal + '66', borderRadius: 10 },
  speakerSaveText: { color: C.accentTeal, fontSize: 14, fontWeight: '600' },
  clientRegBtn: { borderWidth: 1, borderColor: C.borderHigh, borderRadius: 6, paddingVertical: 6, paddingHorizontal: 8, maxWidth: 72 },
  clientRegBtnActive: { backgroundColor: C.accentTeal + '22', borderColor: C.accentTeal + '66' },
  clientRegBtnText: { color: C.textDim, fontSize: 11, fontWeight: '500' },
  clientRegBtnTextActive: { color: C.accentTeal, fontSize: 11, fontWeight: '500' },

  segModalOverlay: Platform.OS === 'web'
    ? { flex: 1, backgroundColor: '#000000AA', justifyContent: 'flex-end', alignItems: 'center' }
    : { flex: 1, backgroundColor: '#000000AA', justifyContent: 'flex-end' },
  segModalBox: Platform.OS === 'web'
    ? { backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, borderColor: C.borderHigh, maxHeight: '88%', paddingTop: 20, width: '100%', maxWidth: 480 }
    : { backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, borderColor: C.borderHigh, maxHeight: '88%', paddingTop: 20 },
  segModalHeader: { paddingHorizontal: 24, paddingBottom: 16, gap: 6 },
  segModalScroll: { flexGrow: 0 },
  segModalFooter: { paddingHorizontal: 24, paddingVertical: 16, borderTopWidth: 1, borderTopColor: C.border },
  segRow: { paddingHorizontal: 24, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border, gap: 8 },
  segSpeakerBadge: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 6, paddingVertical: 4, paddingHorizontal: 10 },
  segSpeakerText: { fontSize: 12, fontWeight: '600' },
  segContent: { color: C.textSecondary, fontSize: 13, lineHeight: 20 },
  segPickerBox: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  segPickerChip: { borderWidth: 1, borderRadius: 6, paddingVertical: 6, paddingHorizontal: 14 },
  segPickerChipText: { fontSize: 13 },
  segPickerChipTextActive: { fontWeight: '600' },

  clientPickerBox: { maxHeight: '70%', gap: 12 },
  clientPickerInput: { backgroundColor: C.bg, borderWidth: 1, borderColor: C.borderHigh, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, color: C.textPrimary, fontSize: 14 },
  clientPickerList: { maxHeight: 280 },
  clientPickerItem: { paddingVertical: 12, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: C.border },
  clientPickerName: { color: C.textPrimary, fontSize: 14, fontWeight: '500' },
  clientPickerCompany: { color: C.textDim, fontSize: 12, marginTop: 2 },
  clientPickerEmpty: { color: C.textDim, fontSize: 13, textAlign: 'center', paddingVertical: 24 },
  clientAddBtn: { backgroundColor: C.accentBlue + '22', borderWidth: 1, borderColor: C.accentBlue + '55', borderRadius: 8, paddingVertical: 11, alignItems: 'center' },
  clientAddBtnText: { color: C.accentBlue, fontSize: 13, fontWeight: '500' },
  missingEmailRow: { gap: 6, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  contentEditOverlay: Platform.OS === 'web'
    ? { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)', padding: 24 }
    : { flex: 1, justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)', padding: 24 },
  contentEditScroll: Platform.OS === 'web'
    ? { flexGrow: 1, justifyContent: 'center', alignItems: 'center' }
    : { flexGrow: 1, justifyContent: 'center' },
  contentEditBox: Platform.OS === 'web'
    ? { backgroundColor: C.surfaceHigh, borderRadius: 16, padding: 24, width: '100%', maxWidth: 480 }
    : { backgroundColor: C.surfaceHigh, borderRadius: 16, padding: 24 },
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

  // 웹에서 Modal은 document.body로 포탈되어 App.js의 480px 폭 제한을 벗어나므로 여기서 다시 맞춘다
  modalOverlay: Platform.OS === 'web'
    ? { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center' }
    : { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  modalSheet: Platform.OS === 'web'
    ? { backgroundColor: C.surfaceHigh, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 24, paddingBottom: 40, paddingTop: 12, width: '100%', maxWidth: 480 }
    : { backgroundColor: C.surfaceHigh, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 24, paddingBottom: 40, paddingTop: 12 },
  modalHandleWrap: { alignSelf: 'center', paddingVertical: 10, paddingHorizontal: 40, marginBottom: 10 },
  modalHandle: { width: 36, height: 4, backgroundColor: C.borderHigh, borderRadius: 2, alignSelf: 'center' },
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

  notifyEmailRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 16 },
  notifyEmailCheckbox: {
    width: 20, height: 20, borderRadius: 5,
    borderWidth: 1.5, borderColor: C.borderHigh,
    alignItems: 'center', justifyContent: 'center',
  },
  notifyEmailCheckboxChecked: { backgroundColor: C.red, borderColor: C.red },
  notifyEmailCheckmark: { color: '#fff', fontSize: 12, fontWeight: '700', lineHeight: 14 },
  notifyEmailLabel: { color: C.textSecondary, fontSize: 13 },

  projectTopicRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 8 },
  projectTopicName: { color: C.textPrimary, fontSize: 13, flex: 1 },
  projectTopicEmptyText: { color: C.textDim, fontSize: 12, marginBottom: 8 },
  topicCreateRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  topicCreateBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 8, backgroundColor: C.gold },
  topicCreateBtnText: { color: '#09090E', fontSize: 13, fontWeight: '600' },

  relatedPeopleHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, marginBottom: 8 },
  addPersonBtn: { paddingHorizontal: 10, paddingVertical: 4, backgroundColor: C.accentTeal + '18', borderWidth: 1, borderColor: C.accentTeal + '44', borderRadius: 6 },
  addPersonBtnText: { color: C.accentTeal, fontSize: 11, fontWeight: '500' },
  relatedPeopleRow: { gap: 8 },
  relatedPersonChip: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: C.accentTeal + '15', borderWidth: 1, borderColor: C.accentTeal + '44', borderRadius: 10, padding: 10 },
  relatedPersonAvatar: { width: 32, height: 32, borderRadius: 16, backgroundColor: C.accentTeal + '33', borderWidth: 1, borderColor: C.accentTeal + '55', alignItems: 'center', justifyContent: 'center' },
  relatedPersonAvatarText: { color: C.accentTeal, fontSize: 13, fontWeight: '500' },
  relatedPersonName: { color: C.textPrimary, fontSize: 13, fontWeight: '500' },
  relatedPersonCompany: { color: C.textDim, fontSize: 11, marginTop: 1 },

  // 관련 인물 선택 (프로젝트 추가 — 일정 등록 화면과 동일한 트리거+피커 패턴)
  selectedPeopleRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  selectedPersonChip: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 5, backgroundColor: C.red + '22', borderWidth: 1, borderColor: C.red + '55', borderRadius: 12 },
  selectedPersonChipText: { color: C.red, fontSize: 12, fontWeight: '500' },
  selectedPersonChipX: { color: C.red, fontSize: 11 },
  clientSearchEmpty: { color: C.textDim, fontSize: 12, padding: 12, textAlign: 'center' },
  pickerTrigger: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12 },
  pickerTriggerText: { color: C.textDim, fontSize: 14, flex: 1 },
  pickerTriggerTextActive: { color: C.red, fontWeight: '500' },
  pickerTriggerIcon: { color: C.textDim, fontSize: 18 },
  pickerSheetBase: Platform.OS === 'web'
    ? { backgroundColor: C.surfaceHigh, borderTopLeftRadius: 20, borderTopRightRadius: 20, width: '100%', maxWidth: 480, alignSelf: 'center' }
    : { backgroundColor: C.surfaceHigh, borderTopLeftRadius: 20, borderTopRightRadius: 20 },
  pickerSheet: { height: '80%' },
  pickerHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: C.border },
  pickerHeaderBtn: { minWidth: 52 },
  pickerTitle: { color: C.textPrimary, fontSize: 16, fontWeight: '500' },
  pickerCancelText: { color: C.textSecondary, fontSize: 15 },
  pickerConfirmText: { color: C.red, fontSize: 15, fontWeight: '600', textAlign: 'right' },
  pickerSearchWrap: { paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border },
  pickerSearchInput: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, color: C.textPrimary, fontSize: 14, paddingHorizontal: 14, paddingVertical: 10 },
  pickerList: { flex: 1 },
  pickerRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border },
  pickerRowSelected: { backgroundColor: C.red + '0D' },
  pickerAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.border, alignItems: 'center', justifyContent: 'center' },
  pickerAvatarSelected: { backgroundColor: C.red + '33' },
  pickerAvatarText: { color: C.textDim, fontSize: 14, fontWeight: '600' },
  pickerAvatarTextSelected: { color: C.red },
  pickerNameWrap: { flex: 1 },
  pickerName: { color: C.textPrimary, fontSize: 14 },
  pickerNameSelected: { color: C.red, fontWeight: '500' },
  pickerSub: { color: C.textDim, fontSize: 11, marginTop: 2 },
  pickerCheck: { width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: C.border, alignItems: 'center', justifyContent: 'center' },
  pickerCheckSelected: { backgroundColor: C.red, borderColor: C.red },
  pickerCheckMark: { color: '#fff', fontSize: 12, fontWeight: '700' },
  pickerAddNewBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border, backgroundColor: C.red + '0A' },
  pickerAddNewText: { color: C.red, fontSize: 14, fontWeight: '500' },
  pickerAddForm: { flex: 1, paddingHorizontal: 20 },
  spacerH40: { height: 40 },

  personDetailHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 4 },
  personDetailAvatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.accentTeal + '33', borderWidth: 1, borderColor: C.accentTeal + '55', alignItems: 'center', justifyContent: 'center' },
  personDetailName: { color: C.textPrimary, fontSize: 16, fontWeight: '500' },
  personDetailCompany: { color: C.textDim, fontSize: 12, marginTop: 2 },
  personDetailContact: { color: C.accentTeal, fontSize: 12, marginTop: 2 },
  personHistoryItem: { paddingVertical: 10, gap: 3 },
  personHistoryDate: { color: C.textDim, fontSize: 11 },
  personHistoryTitle: { color: C.textSecondary, fontSize: 13, fontWeight: '500' },
  personHistoryContent: { color: C.textDim, fontSize: 12, lineHeight: 18 },

  detailHeader: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 12 },

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
  quickRowWeb: { cursor: 'grab' },
  quickContent: { gap: 8, paddingLeft: 2, paddingRight: 20 },
  quickBtn: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border },
  quickText: { color: C.textSecondary, fontSize: 11 },
  chatInputRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  chatInput: { flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 24, color: C.textPrimary, fontSize: 14, paddingHorizontal: 18, paddingVertical: 12 },
  sendBtn: { width: 46, height: 46, borderRadius: 23, backgroundColor: C.gold, alignItems: 'center', justifyContent: 'center' },
  sendBtnText: { color: '#09090E', fontSize: 18, fontWeight: '600' },

  sliderWrap: { marginBottom: 4, alignItems: 'center' },
  slider: { width: '100%', height: 40 },
  sliderVal: { color: C.textPrimary, fontSize: 20, fontWeight: '200', textAlign: 'center', marginBottom: 2 },

  timeRow: { flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 4 },
  ampmBtn: { paddingHorizontal: 12, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: C.border, backgroundColor: C.surface },
  ampmBtnActive: { borderColor: C.gold + '88', backgroundColor: C.gold + '22' },
  ampmBtnText: { color: C.textDim, fontSize: 13 },
  ampmBtnTextActive: { color: C.gold, fontWeight: '600' },

  deadlineWrap: { flex: 1, gap: 2 },
  closeBtnOffset: { marginLeft: 12, marginTop: 20 },
  h80: { height: 80 },
  h64: { height: 64 },
  h88pct: { height: '88%' },
  inputLabelInline: { marginTop: 0, marginBottom: 0 },
  personChipInner: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
  removePersonIcon: { color: C.textDim, fontSize: 13 },
  personChevron: { color: C.textDim, fontSize: 16, paddingLeft: 4 },
  textRed: { color: C.red },
  textBlue: { color: C.accentBlue },
  speakerInputFixed: { width: 64, flex: 0 },
  modalOverlayCentered: Platform.OS === 'web'
    ? { justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }
    : { justifyContent: 'center', paddingHorizontal: 32 },
  progressLabelSpacing: { marginTop: 4, marginBottom: 12 },
  confirmBtnBlock: { marginTop: 16, marginHorizontal: 0, marginBottom: 8 },
  spacerH8: { height: 8 },
  maxH92pct: { maxHeight: '92%' },
});
