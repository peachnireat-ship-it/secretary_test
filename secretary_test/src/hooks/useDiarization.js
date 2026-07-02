import { useState } from 'react';
import { Alert } from 'react-native';
import { diarizeSegments, diarizeWithPyannote, rediarizeTranscript } from '../services/groqStt';
import { askClaude, buildMeetingSummarySystem } from '../services/claude';
import { updateMeetingRecord } from '../services/storage';

function extractSpeakers(text) {
  const found = new Set();
  const regex = /(?:^|\n)\[([^\]\n]+)\]/g;
  let m;
  while ((m = regex.exec(text)) !== null) found.add(m[1]);
  return [...found];
}

export function applyNames(text, nameMap) {
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

export function parseTranscriptSegments(text) {
  if (!text) return [];
  const regex = /\[([^\]\n]+)\]([\s\S]*?)(?=\n*\[|$)/g;
  const segments = [];
  let m;
  while ((m = regex.exec(text)) !== null) {
    segments.push({ speaker: m[1], text: m[2].trim() });
  }
  if (segments.length > 0) return segments;

  // 대괄호 없는 "화자 N" 형식 폴백 (stripNonKorean 버그로 저장된 데이터 대응)
  const lines = text.split('\n');
  let currentSpeaker = null;
  let currentLines = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const sm = trimmed.match(/^(화자\s*\d+)\s*(.*)/);
    if (sm) {
      if (currentSpeaker !== null && currentLines.length > 0) {
        segments.push({ speaker: currentSpeaker, text: currentLines.join(' ').trim() });
      }
      currentSpeaker = sm[1];
      currentLines = sm[2] ? [sm[2]] : [];
    } else if (currentSpeaker !== null) {
      currentLines.push(trimmed);
    }
  }
  if (currentSpeaker !== null && currentLines.length > 0) {
    segments.push({ speaker: currentSpeaker, text: currentLines.join(' ').trim() });
  }
  return segments;
}

export function mergeConsecutiveSegments(segments) {
  if (segments.length === 0) return [];
  const merged = [{ ...segments[0] }];
  for (let i = 1; i < segments.length; i++) {
    const last = merged[merged.length - 1];
    if (last.speaker === segments[i].speaker) {
      last.text = last.text + '\n' + segments[i].text;
    } else {
      merged.push({ ...segments[i] });
    }
  }
  return merged;
}

function buildTranscriptFromSegments(segments) {
  return segments.map((s) => `[${s.speaker}]\n${s.text}`).join('\n\n');
}

/**
 * 회의록 화면의 화자 분리(diarization) 상태·로직 공통 훅.
 * 녹음/STT는 useAudioRecording이 담당하며, diarize/resetDiarization을 통해 연결한다.
 * @param {object} params
 * @param {Array} params.meetingRecords 저장된 회의록 목록 (읽기 전용, 화자 수정 대상 조회)
 * @param {(records: Array) => void} params.setMeetingRecords 회의록 목록 갱신 콜백
 * @param {(e: Error) => void} params.onError API 에러 처리 (handleApiError)
 */
export function useDiarization({ meetingRecords, setMeetingRecords, onError }) {
  const [rawTranscript, setRawTranscript] = useState('');
  const [speakerNames, setSpeakerNames] = useState({});

  const [speakerEditRecordId, setSpeakerEditRecordId] = useState(null);
  const [speakerEditNames, setSpeakerEditNames] = useState({});
  const [speakerEditDeleted, setSpeakerEditDeleted] = useState(new Set());
  const [speakerEditCustom, setSpeakerEditCustom] = useState([]);
  const [speakerClientMap, setSpeakerClientMap] = useState({});
  const [speakerClientEditMap, setSpeakerClientEditMap] = useState({});

  const [segmentEditRecordId, setSegmentEditRecordId] = useState(null);
  const [editableSegments, setEditableSegments] = useState([]);
  const [segmentPickerIdx, setSegmentPickerIdx] = useState(null);
  const [segTextEditIdx, setSegTextEditIdx] = useState(null);
  const [segTextEditValue, setSegTextEditValue] = useState('');

  const [speakerCount, setSpeakerCount] = useState(null);
  const [rediarizingId, setRediarizingId] = useState(null);
  const [showRediarizeModal, setShowRediarizeModal] = useState(false);
  const [rediarizeTarget, setRediarizeTarget] = useState(null);
  const [rediarizeCountInput, setRediarizeCountInput] = useState('');

  function resetDiarization() {
    setRawTranscript('');
    setSpeakerNames({});
  }

  async function diarize(audioUri, audioMime, segments, fallbackText) {
    const pyResult = await diarizeWithPyannote(audioUri, audioMime, segments);
    const diarized = pyResult ?? await diarizeSegments(segments, speakerCount);
    const speakers = extractSpeakers(diarized);
    if (speakers.length > 0) {
      setRawTranscript(diarized);
      setSpeakerNames(Object.fromEntries(speakers.map((s) => [s, ''])));
    }
    return diarized;
  }

  function openSpeakerEditModal(item) {
    const speakers = extractSpeakers(item.transcript || '');
    setSpeakerEditRecordId(item.id);
    setSpeakerEditNames(Object.fromEntries(speakers.map((s) => [s, ''])));
    setSpeakerClientEditMap({});
    setSpeakerEditDeleted(new Set());
    setSpeakerEditCustom([]);
  }

  async function confirmSpeakerEdit() {
    const record = meetingRecords.find((r) => r.id === speakerEditRecordId);
    if (!record) return;
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
    const updated = await updateMeetingRecord(speakerEditRecordId, {
      transcript: updatedTranscript,
      summary: updatedSummary,
      clientIds: mergedClientIds,
    });
    setMeetingRecords(updated);
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
    setSegTextEditIdx(null);
    setSegTextEditValue('');
  }

  function openSegTextEdit(idx) {
    setSegmentPickerIdx(null);
    setSegTextEditIdx(idx);
    setSegTextEditValue(editableSegments[idx].text);
  }

  function confirmSegTextEdit() {
    const idx = segTextEditIdx;
    setSegTextEditIdx(null);
    const lines = segTextEditValue.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lines.length <= 1) {
      setEditableSegments((prev) => prev.map((s, i) => i === idx ? { ...s, text: segTextEditValue.trim() } : s));
    } else {
      const speaker = editableSegments[idx].speaker;
      const newSegs = lines.map((line) => ({ speaker, text: line }));
      setEditableSegments((prev) => [...prev.slice(0, idx), ...newSegs, ...prev.slice(idx + 1)]);
    }
    setSegTextEditValue('');
  }

  async function confirmSegmentEdit() {
    const record = meetingRecords.find((r) => r.id === segmentEditRecordId);
    if (!record) return;
    setSegmentEditRecordId(null);
    setSegTextEditIdx(null);
    setSegTextEditValue('');
    const updatedTranscript = buildTranscriptFromSegments(editableSegments);
    const updated = await updateMeetingRecord(segmentEditRecordId, { transcript: updatedTranscript });
    setMeetingRecords(updated);
    setEditableSegments([]);
    setSegmentPickerIdx(null);
  }

  function openRediarizeModal(item) {
    setRediarizeTarget(item);
    setRediarizeCountInput('');
    setShowRediarizeModal(true);
  }

  async function confirmRediarize() {
    const item = rediarizeTarget;
    const count = parseInt(rediarizeCountInput) || null;
    setShowRediarizeModal(false);
    setRediarizeTarget(null);
    setRediarizingId(item.id);
    try {
      const newTranscript = await rediarizeTranscript(item.transcript, count);
      const newSummary = await askClaude(
        [{ role: 'user', content: newTranscript }],
        buildMeetingSummarySystem(),
        { raw: true }
      );
      const updated = await updateMeetingRecord(item.id, {
        transcript: newTranscript,
        summary: newSummary,
      });
      setMeetingRecords(updated);
    } catch (e) {
      onError(e);
    } finally {
      setRediarizingId(null);
    }
  }

  return {
    rawTranscript, speakerNames, speakerEditRecordId, speakerEditNames, speakerEditDeleted,
    speakerEditCustom, speakerClientMap, speakerClientEditMap, segmentEditRecordId,
    editableSegments, segmentPickerIdx, segTextEditIdx, segTextEditValue, speakerCount,
    rediarizingId, showRediarizeModal, rediarizeTarget, rediarizeCountInput,
    setSpeakerNames, setSpeakerClientMap, setSpeakerEditRecordId, setSpeakerEditNames,
    setSpeakerEditDeleted, setSpeakerEditCustom, setSpeakerClientEditMap,
    setSegmentEditRecordId, setEditableSegments, setSegmentPickerIdx, setSegTextEditIdx,
    setSegTextEditValue, setSpeakerCount, setShowRediarizeModal, setRediarizeTarget,
    setRediarizeCountInput,
    diarize, resetDiarization,
    openSpeakerEditModal, confirmSpeakerEdit,
    openSegmentEditModal, openSegTextEdit, confirmSegTextEdit, confirmSegmentEdit,
    openRediarizeModal, confirmRediarize,
  };
}
