import { useState, useEffect } from 'react';
import { Alert } from '../utils/alertCompat';
import { addProject, updateProject, updateClient, getTestAccounts } from '../services/storage';
import { dateTimeFromTimestamp, findOverlappingItems, formatOverlapMessage, isValidOptionalDateStr } from '../utils/dateUtils';
import { IS_PC } from '../utils/deviceType';

const TITLE_MAX_LENGTH = 200;
const NOTES_MAX_LENGTH = 2000;

function getDaysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

export function formatDeadline(text) {
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

export function fmtTime12(text) {
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

function findClientEmail(client, testAccounts) {
  if (client.linkedProfileId) {
    const linked = testAccounts.find((a) => a.id === client.linkedProfileId);
    if (linked?.email) return linked.email;
  }
  return client.email || '';
}
function findMissingEmailPeople(clientIds, clients) {
  const testAccounts = getTestAccounts();
  return clientIds
    .map((id) => clients.find((c) => c.id === id))
    .filter(Boolean)
    .filter((c) => !findClientEmail(c, testAccounts))
    .map((c) => ({ id: c.id, name: c.name }));
}

/**
 * 프로젝트 화면 생성/수정 모달 입력 상태·유효성 검사·저장 로직 공통 훅.
 * @param {object} params
 * @param {Array} params.meetingRecords 회의록 목록 (신규 프로젝트 추가 시 연결된 회의록 조회용, 읽기 전용)
 * @param {Array} params.projects 기존 프로젝트 목록 (기간 겹침 검사용, 읽기 전용)
 * @param {Array} params.schedules 기존 일정 목록 (기간 겹침 검사용, 읽기 전용)
 * @param {Array} params.clients 담당자 목록 (이메일 미등록 인물 확인용, 읽기 전용)
 * @param {(projects: Array) => void} params.setProjects 프로젝트 목록 갱신 콜백
 */
export function useProjectForm({ meetingRecords, projects = [], schedules = [], clients = [], setProjects }) {
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newStartDate, setNewStartDate] = useState('');
  const [newStartTime, setNewStartTime] = useState('09:00');
  const [newStartAmPm, setNewStartAmPm] = useState('오전');
  const [newDeadline, setNewDeadline] = useState('');
  const [newDeadlineTime, setNewDeadlineTime] = useState('06:00');
  const [newDeadlineAmPm, setNewDeadlineAmPm] = useState('오후');
  const [newStatus, setNewStatus] = useState('진행중');
  const [newProgress, setNewProgress] = useState(0);
  const [newKeepProgress, setNewKeepProgress] = useState(false);
  const [newPriority, setNewPriority] = useState('보통');
  const [newNotes, setNewNotes] = useState('');
  const [pendingMeetingRecordId, setPendingMeetingRecordId] = useState(null);
  const [newClientIds, setNewClientIds] = useState([]);
  const [newNotifyEmail, setNewNotifyEmail] = useState(true);

  const [showDetail, setShowDetail] = useState(false);
  const [detailProject, setDetailProject] = useState(null);
  const [showProjectView, setShowProjectView] = useState(false);
  const [viewProject, setViewProject] = useState(null);
  const [editTitle, setEditTitle] = useState('');
  const [editStartDate, setEditStartDate] = useState('');
  const [editStartTime, setEditStartTime] = useState('09:00');
  const [editStartAmPm, setEditStartAmPm] = useState('오전');
  const [editDeadline, setEditDeadline] = useState('');
  const [editDeadlineTime, setEditDeadlineTime] = useState('06:00');
  const [editDeadlineAmPm, setEditDeadlineAmPm] = useState('오후');
  const [editStatus, setEditStatus] = useState('진행중');
  const [editProgress, setEditProgress] = useState(0);
  const [editKeepProgress, setEditKeepProgress] = useState(false);
  const [editPriority, setEditPriority] = useState('보통');
  const [editNotes, setEditNotes] = useState('');
  const [editClientIds, setEditClientIds] = useState([]);
  const [editNotifyEmail, setEditNotifyEmail] = useState(true);

  const [detailPersonPickerVisible, setDetailPersonPickerVisible] = useState(false);
  const [detailPersonPickerSearch, setDetailPersonPickerSearch] = useState('');

  const [missingEmailModalVisible, setMissingEmailModalVisible] = useState(false);
  const [missingEmailPeople, setMissingEmailPeople] = useState([]);
  const [missingEmailDrafts, setMissingEmailDrafts] = useState({});
  const [pendingSave, setPendingSave] = useState(null);

  async function saveNewProject(startDateStr, deadlineStr) {
    const meetingRecord = pendingMeetingRecordId ? meetingRecords.find((r) => r.id === pendingMeetingRecordId) : null;
    const updated = await addProject({
      title: newTitle.trim(),
      startDate: startDateStr,
      deadline: deadlineStr,
      status: newStatus,
      progress: newProgress,
      priority: newPriority,
      notes: newNotes.trim(),
      meetingRecordIds: pendingMeetingRecordId ? [pendingMeetingRecordId] : [],
      clientIds: [...new Set([...(meetingRecord?.clientIds || []), ...newClientIds])],
      notifyEmail: newNotifyEmail,
      keepProgress: newKeepProgress,
    });
    setProjects(updated);
    setShowAdd(false);
    setNewTitle(''); setNewStartDate(''); setNewStartTime('09:00'); setNewStartAmPm('오전');
    setNewDeadline(''); setNewDeadlineTime('06:00'); setNewDeadlineAmPm('오후');
    setNewStatus('진행중'); setNewProgress(0); setNewKeepProgress(false); setNewPriority('보통'); setNewNotes('');
    setPendingMeetingRecordId(null);
    setNewClientIds([]);
    setNewNotifyEmail(true);
  }

  function proceedToSaveNew(startDateStr, deadlineStr) {
    const missing = findMissingEmailPeople(newClientIds, clients);
    if (missing.length > 0) {
      setMissingEmailPeople(missing);
      setMissingEmailDrafts({});
      setPendingSave({ startDateStr, deadlineStr, mode: 'new' });
      setMissingEmailModalVisible(true);
      return;
    }
    saveNewProject(startDateStr, deadlineStr);
  }

  async function handleAdd() {
    if (!newTitle.trim() || !newDeadline.trim()) {
      Alert.alert('입력 필요', '제목과 마감일시는 필수 입력 항목입니다.');
      return;
    }
    if (newTitle.trim().length > TITLE_MAX_LENGTH) {
      Alert.alert('입력 길이 초과', `제목은 최대 ${TITLE_MAX_LENGTH}자까지 입력 가능합니다.`);
      return;
    }
    if (newNotes.trim().length > NOTES_MAX_LENGTH) {
      Alert.alert('입력 길이 초과', `메모는 최대 ${NOTES_MAX_LENGTH}자까지 입력 가능합니다.`);
      return;
    }
    if (!isValidDeadline(newDeadline.trim())) {
      Alert.alert('날짜 오류', '올바른 날짜를 입력하세요.\n월은 1~12, 일은 해당 달의 마지막 날 이내여야 합니다.');
      return;
    }
    const startDateNorm = normalizeDeadline(newStartDate.trim());
    const deadlineDateNorm = normalizeDeadline(newDeadline.trim());
    if (!isValidOptionalDateStr(startDateNorm)) {
      Alert.alert('날짜 오류', '날짜를 YYYY-MM-DD 형식으로 완전히 입력해주세요.');
      return;
    }
    if (startDateNorm && isValidDeadline(startDateNorm) && deadlineDateNorm < startDateNorm) {
      Alert.alert('날짜 오류', '마감일시는 시작일시보다 빠를 수 없습니다.');
      return;
    }
    const startDateStr = startDateNorm ? `${startDateNorm} ${to24h(newStartAmPm, newStartTime)}` : dateTimeFromTimestamp(Date.now());
    const deadlineStr = `${deadlineDateNorm} ${to24h(newDeadlineAmPm, newDeadlineTime)}`;

    // 실제 저장될 startDate의 날짜 부분을 그대로 겹침 검사 기준으로 사용 (getProjectRange()와 동일한 방식)
    const rangeStart = startDateStr.split(' ')[0];
    const overlaps = findOverlappingItems({ start: rangeStart, end: deadlineDateNorm, schedules, projects, excludeType: 'project' });
    if (overlaps.length > 0) {
      Alert.alert(
        '기간 겹침',
        `다음 일정/프로젝트와 기간이 겹칩니다.\n\n${formatOverlapMessage(overlaps)}\n\n그래도 이 일자로 등록하시겠습니까?`,
        [
          { text: '취소', style: 'cancel' },
          { text: '그대로 등록', onPress: () => proceedToSaveNew(startDateStr, deadlineStr) },
        ]
      );
      return;
    }
    proceedToSaveNew(startDateStr, deadlineStr);
  }

  function openDetail(project) {
    setDetailProject(project);
    setEditTitle(project.title);

    const startParts = (project.startDate || '').split(' ');
    setEditStartDate(startParts[0] || '');
    if (startParts[1]) {
      const { ampm, time12 } = from24h(startParts[1]);
      setEditStartAmPm(ampm);
      setEditStartTime(time12);
    } else {
      setEditStartAmPm('오전');
      setEditStartTime('09:00');
    }

    const deadlineParts = (project.deadline || '').split(' ');
    setEditDeadline(deadlineParts[0] || '');
    if (deadlineParts[1]) {
      const { ampm, time12 } = from24h(deadlineParts[1]);
      setEditDeadlineAmPm(ampm);
      setEditDeadlineTime(time12);
    } else {
      setEditDeadlineAmPm('오후');
      setEditDeadlineTime('06:00');
    }

    setEditStatus(project.status);
    setEditProgress(project.progress ?? 0);
    setEditKeepProgress(false);
    setEditPriority(project.priority);
    setEditNotes(project.notes || '');
    setEditClientIds(project.clientIds || []);
    // 관련 인물이 없으면 알림메일은 어차피 의미가 없어(보낼 대상이 없음) false로 맞추고,
    // 있으면 실제 저장된 값을 그대로 반영한다 — 예전에는 이 초기화 자체가 없어서 아래
    // useEffect가 매번 clientIds 유무만으로 값을 덮어써, 저장된 notifyEmail이 화면에
    // 전혀 반영되지 않고 저장할 때마다 그 잘못된 값으로 다시 덮어써지는 버그가 있었다.
    setEditNotifyEmail((project.clientIds || []).length > 0 ? !!project.notifyEmail : false);
    setShowDetail(true);
  }

  // 관련 인물을 전부 제거하면 알림 보낼 대상이 없으므로 자동으로 꺼준다(체크박스 자체도
  // 이 상태에서는 토글이 막혀있다). 관련 인물이 있는 동안에는 사용자가 명시적으로 설정한
  // 값(또는 openDetail이 project.notifyEmail에서 읽어온 값)을 그대로 유지해야 하므로 건드리지
  // 않는다 — 예전처럼 "있으면 무조건 true"로 강제하면 사용자가 껐던 설정이나 저장된 값이
  // 매번 덮어써진다.
  useEffect(() => {
    if (!showAdd) return;
    if (newClientIds.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setNewNotifyEmail(false);
    }
  }, [newClientIds, showAdd]);

  useEffect(() => {
    if (!showDetail) return;
    if (editClientIds.length === 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setEditNotifyEmail(false);
    }
  }, [editClientIds, showDetail]);

  async function saveEditedProject(startDateStr, deadlineStr) {
    const updated = await updateProject(detailProject.id, {
      title: editTitle.trim(),
      startDate: startDateStr,
      deadline: deadlineStr,
      status: editStatus,
      progress: editProgress,
      priority: editPriority,
      notes: editNotes.trim(),
      clientIds: editClientIds,
      notifyEmail: editNotifyEmail,
      keepProgress: editKeepProgress,
    });
    setProjects(updated);
    const refreshed = updated.find((p) => p.id === detailProject.id);
    setDetailProject(refreshed);
    if (!IS_PC) setShowDetail(false);
  }

  function proceedToSaveEdit(startDateStr, deadlineStr) {
    const missing = findMissingEmailPeople(editClientIds, clients);
    if (missing.length > 0) {
      setMissingEmailPeople(missing);
      setMissingEmailDrafts({});
      setPendingSave({ startDateStr, deadlineStr, mode: 'edit' });
      setMissingEmailModalVisible(true);
      return;
    }
    saveEditedProject(startDateStr, deadlineStr);
  }

  async function handleEditSave() {
    if (!editTitle.trim() || !editDeadline.trim()) {
      Alert.alert('입력 필요', '제목과 마감일시는 필수 입력 항목입니다.');
      return;
    }
    if (editTitle.trim().length > TITLE_MAX_LENGTH) {
      Alert.alert('입력 길이 초과', `제목은 최대 ${TITLE_MAX_LENGTH}자까지 입력 가능합니다.`);
      return;
    }
    if (editNotes.trim().length > NOTES_MAX_LENGTH) {
      Alert.alert('입력 길이 초과', `메모는 최대 ${NOTES_MAX_LENGTH}자까지 입력 가능합니다.`);
      return;
    }
    if (!isValidDeadline(editDeadline.trim())) {
      Alert.alert('날짜 오류', '올바른 날짜를 입력하세요.\n월은 1~12, 일은 해당 달의 마지막 날 이내여야 합니다.');
      return;
    }
    const startDateNorm = normalizeDeadline(editStartDate.trim());
    const deadlineDateNorm = normalizeDeadline(editDeadline.trim());
    if (!isValidOptionalDateStr(startDateNorm)) {
      Alert.alert('날짜 오류', '날짜를 YYYY-MM-DD 형식으로 완전히 입력해주세요.');
      return;
    }
    if (startDateNorm && isValidDeadline(startDateNorm) && deadlineDateNorm < startDateNorm) {
      Alert.alert('날짜 오류', '마감일시는 시작일시보다 빠를 수 없습니다.');
      return;
    }
    const startDateStr = startDateNorm ? `${startDateNorm} ${to24h(editStartAmPm, editStartTime)}` : dateTimeFromTimestamp(detailProject.createdAt);
    const deadlineStr = `${deadlineDateNorm} ${to24h(editDeadlineAmPm, editDeadlineTime)}`;

    // 실제 저장될 startDate의 날짜 부분을 그대로 겹침 검사 기준으로 사용 (getProjectRange()와 동일한 방식)
    const rangeStart = startDateStr.split(' ')[0];
    const overlaps = findOverlappingItems({ start: rangeStart, end: deadlineDateNorm, schedules, projects, excludeId: detailProject.id, excludeType: 'project' });
    if (overlaps.length > 0) {
      Alert.alert(
        '기간 겹침',
        `다음 일정/프로젝트와 기간이 겹칩니다.\n\n${formatOverlapMessage(overlaps)}\n\n그래도 이 일자로 등록하시겠습니까?`,
        [
          { text: '취소', style: 'cancel' },
          { text: '그대로 등록', onPress: () => proceedToSaveEdit(startDateStr, deadlineStr) },
        ]
      );
      return;
    }
    proceedToSaveEdit(startDateStr, deadlineStr);
  }

  async function finishPendingSave() {
    setMissingEmailModalVisible(false);
    const p = pendingSave;
    setPendingSave(null);
    if (!p) return;
    if (p.mode === 'new') await saveNewProject(p.startDateStr, p.deadlineStr);
    else await saveEditedProject(p.startDateStr, p.deadlineStr);
  }
  async function confirmMissingEmailAndSave() {
    for (const person of missingEmailPeople) {
      const draft = (missingEmailDrafts[person.id] || '').trim();
      if (draft) await updateClient(person.id, { email: draft });
    }
    await finishPendingSave();
  }
  async function skipMissingEmailAndSave() {
    await finishPendingSave();
  }

  function addClientToDetail(client) {
    if (!client.id) return;
    setEditClientIds((prev) =>
      prev.includes(client.id) ? prev.filter((id) => id !== client.id) : [...prev, client.id]
    );
  }

  return {
    showAdd, setShowAdd, newTitle, setNewTitle, newStartDate, setNewStartDate,
    newStartTime, setNewStartTime, newStartAmPm, setNewStartAmPm, newDeadline, setNewDeadline,
    newDeadlineTime, setNewDeadlineTime, newDeadlineAmPm, setNewDeadlineAmPm, newStatus, setNewStatus,
    newProgress, setNewProgress, newKeepProgress, setNewKeepProgress, newPriority, setNewPriority, newNotes, setNewNotes,
    pendingMeetingRecordId, setPendingMeetingRecordId,
    newClientIds, setNewClientIds, newNotifyEmail, setNewNotifyEmail,

    showDetail, setShowDetail, detailProject, setDetailProject, showProjectView, setShowProjectView,
    viewProject, setViewProject, editTitle, setEditTitle, editStartDate, setEditStartDate,
    editStartTime, setEditStartTime, editStartAmPm, setEditStartAmPm, editDeadline, setEditDeadline,
    editDeadlineTime, setEditDeadlineTime, editDeadlineAmPm, setEditDeadlineAmPm, editStatus, setEditStatus,
    editProgress, setEditProgress, editKeepProgress, setEditKeepProgress, editPriority, setEditPriority, editNotes, setEditNotes,
    editClientIds, setEditClientIds, editNotifyEmail, setEditNotifyEmail,

    detailPersonPickerVisible, setDetailPersonPickerVisible,
    detailPersonPickerSearch, setDetailPersonPickerSearch,

    missingEmailModalVisible, setMissingEmailModalVisible,
    missingEmailPeople, missingEmailDrafts, setMissingEmailDrafts,
    confirmMissingEmailAndSave, skipMissingEmailAndSave,

    handleAdd, openDetail, handleEditSave, addClientToDetail,
  };
}
