import { useState } from 'react';
import { Alert } from 'react-native';
import { addProject, updateProject } from '../services/storage';

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

/**
 * 프로젝트 화면 생성/수정 모달 입력 상태·유효성 검사·저장 로직 공통 훅.
 * @param {object} params
 * @param {Array} params.meetingRecords 회의록 목록 (신규 프로젝트 추가 시 연결된 회의록 조회용, 읽기 전용)
 * @param {(projects: Array) => void} params.setProjects 프로젝트 목록 갱신 콜백
 */
export function useProjectForm({ meetingRecords, setProjects }) {
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newStartDate, setNewStartDate] = useState('');
  const [newStartTime, setNewStartTime] = useState('09:00');
  const [newStartAmPm, setNewStartAmPm] = useState('오전');
  const [newDeadline, setNewDeadline] = useState('');
  const [newDeadlineTime, setNewDeadlineTime] = useState('06:00');
  const [newDeadlineAmPm, setNewDeadlineAmPm] = useState('오후');
  const [newStatus, setNewStatus] = useState('진행중');
  const [newProgress, setNewProgress] = useState('0');
  const [newPriority, setNewPriority] = useState('보통');
  const [newNotes, setNewNotes] = useState('');
  const [pendingMeetingRecordId, setPendingMeetingRecordId] = useState(null);

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
  const [editPriority, setEditPriority] = useState('보통');
  const [editNotes, setEditNotes] = useState('');
  const [editClientIds, setEditClientIds] = useState([]);
  const [quickSlider, setQuickSlider] = useState(null);

  const [detailPersonPickerVisible, setDetailPersonPickerVisible] = useState(false);
  const [detailPersonPickerSearch, setDetailPersonPickerSearch] = useState('');

  async function handleAdd() {
    if (!newTitle.trim() || !newDeadline.trim()) return;
    if (!isValidDeadline(newDeadline.trim())) {
      Alert.alert('날짜 오류', '올바른 날짜를 입력하세요.\n월은 1~12, 일은 해당 달의 마지막 날 이내여야 합니다.');
      return;
    }
    const meetingRecord = pendingMeetingRecordId ? meetingRecords.find((r) => r.id === pendingMeetingRecordId) : null;
    const startDateNorm = normalizeDeadline(newStartDate.trim());
    const startDateStr = startDateNorm ? `${startDateNorm} ${to24h(newStartAmPm, newStartTime)}` : '';
    const deadlineStr = `${normalizeDeadline(newDeadline.trim())} ${to24h(newDeadlineAmPm, newDeadlineTime)}`;
    const updated = await addProject({
      title: newTitle.trim(),
      startDate: startDateStr,
      deadline: deadlineStr,
      status: newStatus,
      progress: parseInt(newProgress) || 0,
      priority: newPriority,
      notes: newNotes.trim(),
      meetingRecordIds: pendingMeetingRecordId ? [pendingMeetingRecordId] : [],
      clientIds: meetingRecord?.clientIds || [],
    });
    setProjects(updated);
    setShowAdd(false);
    setNewTitle(''); setNewStartDate(''); setNewStartTime('09:00'); setNewStartAmPm('오전');
    setNewDeadline(''); setNewDeadlineTime('06:00'); setNewDeadlineAmPm('오후');
    setNewStatus('진행중'); setNewProgress('0'); setNewPriority('보통'); setNewNotes('');
    setPendingMeetingRecordId(null);
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
    setEditPriority(project.priority);
    setEditNotes(project.notes || '');
    setEditClientIds(project.clientIds || []);
    setShowDetail(true);
  }

  async function handleEditSave() {
    if (!editTitle.trim() || !editDeadline.trim()) return;
    if (!isValidDeadline(editDeadline.trim())) {
      Alert.alert('날짜 오류', '올바른 날짜를 입력하세요.\n월은 1~12, 일은 해당 달의 마지막 날 이내여야 합니다.');
      return;
    }
    const startDateNorm = normalizeDeadline(editStartDate.trim());
    const startDateStr = startDateNorm ? `${startDateNorm} ${to24h(editStartAmPm, editStartTime)}` : '';
    const deadlineStr = `${normalizeDeadline(editDeadline.trim())} ${to24h(editDeadlineAmPm, editDeadlineTime)}`;
    const updated = await updateProject(detailProject.id, {
      title: editTitle.trim(),
      startDate: startDateStr,
      deadline: deadlineStr,
      status: editStatus,
      progress: editProgress,
      priority: editPriority,
      notes: editNotes.trim(),
      clientIds: editClientIds,
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

  function addClientToDetail(client) {
    if (client.id && !editClientIds.includes(client.id)) {
      setEditClientIds((prev) => [...prev, client.id]);
    }
    setDetailPersonPickerVisible(false);
    setDetailPersonPickerSearch('');
  }

  return {
    showAdd, setShowAdd, newTitle, setNewTitle, newStartDate, setNewStartDate,
    newStartTime, setNewStartTime, newStartAmPm, setNewStartAmPm, newDeadline, setNewDeadline,
    newDeadlineTime, setNewDeadlineTime, newDeadlineAmPm, setNewDeadlineAmPm, newStatus, setNewStatus,
    newProgress, setNewProgress, newPriority, setNewPriority, newNotes, setNewNotes,
    pendingMeetingRecordId, setPendingMeetingRecordId,

    showDetail, setShowDetail, detailProject, setDetailProject, showProjectView, setShowProjectView,
    viewProject, setViewProject, editTitle, setEditTitle, editStartDate, setEditStartDate,
    editStartTime, setEditStartTime, editStartAmPm, setEditStartAmPm, editDeadline, setEditDeadline,
    editDeadlineTime, setEditDeadlineTime, editDeadlineAmPm, setEditDeadlineAmPm, editStatus, setEditStatus,
    editProgress, setEditProgress, editPriority, setEditPriority, editNotes, setEditNotes,
    editClientIds, setEditClientIds, quickSlider, setQuickSlider,

    detailPersonPickerVisible, setDetailPersonPickerVisible,
    detailPersonPickerSearch, setDetailPersonPickerSearch,

    handleAdd, openDetail, handleEditSave, handleProgressUpdate, addClientToDetail,
  };
}
