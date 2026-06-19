import {
  Text, View, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, Clipboard, Alert, FlatList,
  Modal, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useAudioRecorder, AudioModule, RecordingPresets } from 'expo-audio';
import * as DocumentPicker from 'expo-document-picker';
import { C } from '../theme';
import * as FileSystem from 'expo-file-system';
import { transcribeAudio, diarizeSegments, diarizeWithPyannote, convertToMonoViaServer } from '../services/groqStt';
import { askClaude, buildTaskExtractionSystem, fixForeignWordsInText } from '../services/claude';
import { getMeetingRecords, addMeetingRecord, updateMeetingRecord, deleteMeetingRecord, getWorkTopics, saveWorkTopics, getClients, addClient, getProjects, getHistories } from '../services/storage';

function formatTime(sec) {
  const m = String(Math.floor(sec / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function formatDate(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

function formatDateTime(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
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

function parseTranscriptSegments(text) {
  if (!text) return [];
  const regex = /\[([^\]\n]+)\]([\s\S]*?)(?=\n*\[|$)/g;
  const segments = [];
  let m;
  while ((m = regex.exec(text)) !== null) {
    segments.push({ speaker: m[1], text: m[2].trim() });
  }
  return segments;
}

function buildTranscriptFromSegments(segments) {
  return segments.map((s) => `[${s.speaker}]\n${s.text}`).join('\n\n');
}

const SPEAKER_COLORS = ['#5B7FC4', '#4AADA0', '#8B6FC4', '#C4A35A', '#C45B5B', '#5BC48B', '#C47B5B'];

export default function MeetingScreen({ navigation }) {
  const insets = useSafeAreaInsets();
  const [activeTab, setActiveTab] = useState('record');
  const [elapsed, setElapsed] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [transcript, setTranscript] = useState('');
  const [summary, setSummary] = useState('');
  const [transcriptSource, setTranscriptSource] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [pickedFile, setPickedFile] = useState(null);
  const [recording, setRecording] = useState(false);
  const [saved, setSaved] = useState(false);

  const [meetingRecords, setMeetingRecords] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [titleInput, setTitleInput] = useState('');
  const [editingRecordId, setEditingRecordId] = useState(null);

  const [rawTranscript, setRawTranscript] = useState('');
  const [speakerNames, setSpeakerNames] = useState({});

  const [tasks, setTasks] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [selectedTaskIndices, setSelectedTaskIndices] = useState(new Set());
  const [historySelectedTasks, setHistorySelectedTasks] = useState({});

  const [speakerEditRecordId, setSpeakerEditRecordId] = useState(null);
  const [speakerEditNames, setSpeakerEditNames] = useState({});
  const [speakerEditDeleted, setSpeakerEditDeleted] = useState(new Set());
  const [speakerEditCustom, setSpeakerEditCustom] = useState([]);
  const [speakerClientMap, setSpeakerClientMap] = useState({});

  const [segmentEditRecordId, setSegmentEditRecordId] = useState(null);
  const [editableSegments, setEditableSegments] = useState([]);
  const [segmentPickerIdx, setSegmentPickerIdx] = useState(null);
  const [speakerClientEditMap, setSpeakerClientEditMap] = useState({});

  const [contentEditRecordId, setContentEditRecordId] = useState(null);
  const [contentEditSummary, setContentEditSummary] = useState('');
  const [contentEditTranscript, setContentEditTranscript] = useState('');

  const [projects, setProjects] = useState([]);
  const [clients, setClients] = useState([]);
  const [histories, setHistories] = useState([]);
  const [selectedPersonClient, setSelectedPersonClient] = useState(null);
  const [clientPickerSpeaker, setClientPickerSpeaker] = useState(null);
  const [clientPickerContext, setClientPickerContext] = useState(null);
  const [clientPickerSearch, setClientPickerSearch] = useState('');
  const [addPersonRecordId, setAddPersonRecordId] = useState(null);
  const [addPersonSelectedIds, setAddPersonSelectedIds] = useState(new Set());

  const [showNewClientModal, setShowNewClientModal] = useState(false);
  const [newClientName, setNewClientName] = useState('');
  const [newClientCompany, setNewClientCompany] = useState('');
  const [newClientRole, setNewClientRole] = useState('');
  const [newClientContact, setNewClientContact] = useState('');
  const [newClientNotes, setNewClientNotes] = useState('');

  const [workTopics, setWorkTopics] = useState('');
  const [workTopicsLoading, setWorkTopicsLoading] = useState(false);

  const [pickedAfterTranscript, setPickedAfterTranscript] = useState(false);
  const [fixingForeignId, setFixingForeignId] = useState(null);

  const timerRef = useRef(null);
  const scrollRef = useRef(null);
  const scrollToTopOnPickRef = useRef(false);
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const loadRecords = useCallback(async () => {
    const records = await getMeetingRecords();
    setMeetingRecords(records);
  }, []);

  useEffect(() => {
    if (activeTab === 'history') loadRecords();
  }, [activeTab, loadRecords]);

  useFocusEffect(useCallback(() => {
    if (activeTab === 'history') loadRecords();
  }, [activeTab, loadRecords]));

  useEffect(() => {
    getWorkTopics().then((v) => { if (v) setWorkTopics(v); });
  }, []);

  useEffect(() => {
    getClients().then(setClients);
  }, []);

  useEffect(() => {
    getProjects().then(setProjects);
  }, []);

  useEffect(() => {
    getHistories().then(setHistories);
  }, []);

  useEffect(() => {
    if (loading && activeTab === 'record') {
      setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }
  }, [loading]);

  useEffect(() => {
    if (pickedFile) {
      if (scrollToTopOnPickRef.current) {
        scrollToTopOnPickRef.current = false;
        setTimeout(() => scrollRef.current?.scrollTo({ x: 0, y: 0, animated: true }), 100);
      } else {
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
      }
    }
  }, [pickedFile]);

  async function startRecording() {
    setErrorMsg('');
    setTranscript('');
    setSummary('');
    setTranscriptSource('');
    setSaved(false);
    const perm = await AudioModule.requestRecordingPermissionsAsync();
    if (!perm.granted) {
      setErrorMsg('마이크 권한이 필요합니다.');
      return;
    }
    setElapsed(0);
    await audioRecorder.prepareToRecordAsync();
    audioRecorder.record();
    setRecording(true);
    timerRef.current = setInterval(() => setElapsed((p) => p + 1), 1000);
  }

  async function stopAndTranscribe() {
    setRecording(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    await audioRecorder.stop();
    let uri = audioRecorder.uri;
    if (!uri) {
      await new Promise((r) => setTimeout(r, 500));
      uri = audioRecorder.uri;
    }
    if (!uri) {
      setErrorMsg('녹음 파일을 찾을 수 없습니다.');
      return;
    }
    await runTranscribe(uri, 'audio/m4a', '직접 녹음');
  }

  const AUDIO_EXTS = ['mp3', 'mp4', 'm4a', 'wav', 'aac', 'ogg', 'flac', 'wma', 'opus', 'webm', 'amr', '3gp'];

  async function pickFile() {
    setErrorMsg('');
    const result = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
    if (result.canceled) return;
    const asset = result.assets[0];
    const mime = asset.mimeType ?? '';
    const ext = (asset.name ?? '').split('.').pop().toLowerCase();
    if (!mime.startsWith('audio/') && !AUDIO_EXTS.includes(ext)) {
      setErrorMsg('오디오 파일을 선택해 주세요.');
      return;
    }
    if (transcript) {
      setTranscript('');
      setSummary('');
      setTasks([]);
      setSelectedTaskIndices(new Set());
      setSaved(false);
      setRawTranscript('');
      setSpeakerNames({});
      setPickedAfterTranscript(true);
      scrollToTopOnPickRef.current = true;
    }
    setPickedFile(asset);
  }

  async function transcribeFile() {
    if (!pickedFile) return;
    await runTranscribe(pickedFile.uri, pickedFile.mimeType || 'audio/m4a', pickedFile.name);
  }

  function handleApiError(e) {
    if (e.message === 'API_KEY_MISSING') {
      Alert.alert(
        'API 키 없음',
        '설정에서 Groq API 키를 입력해 주세요.',
        [
          { text: '취소', style: 'cancel' },
          { text: '설정으로', onPress: () => navigation.navigate('설정') },
        ]
      );
    } else {
      setErrorMsg(e.message);
    }
  }

  async function runSummarize(text) {
    setLoading(true);
    setLoadingMsg('회의 내용 요약 중…');
    try {
      const sum = await askClaude(
        [{ role: 'user', content: text }],
        `[언어 규칙] 반드시 한국어로만 응답하세요. 한자·일본어·영어 문장은 절대 사용하지 마세요.

회의 내용을 아래 형식으로 간결하게 요약하세요.
화자가 구분된 경우, 주요 논의 내용·결정 사항·액션 아이템에 화자 이름을 명시하세요.

## 핵심 주제
(회의의 주요 목적이나 주제)

## 주요 논의 내용
(핵심 포인트를 간결하게 bullet로, 화자 이름 포함)

## 결정 사항
(회의에서 결정된 사항 및 주도한 화자, 없으면 "없음")

## 액션 아이템
(후속 조치 및 담당자/기한, 없으면 "없음")`
      );
      setSummary(sum);
    } catch (e) {
      handleApiError(e);
    } finally {
      setLoading(false);
      setLoadingMsg('');
    }
  }

  function toggleHistoryTask(recordId, index) {
    setHistorySelectedTasks((prev) => {
      const set = new Set(prev[recordId] || []);
      set.has(index) ? set.delete(index) : set.add(index);
      return { ...prev, [recordId]: set };
    });
  }

  function toggleTaskSelect(i) {
    setSelectedTaskIndices((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }

  async function runExtractTasks(text) {
    setTasksLoading(true);
    setTasks([]);
    try {
      const raw = await askClaude(
        [{ role: 'user', content: text }],
        buildTaskExtractionSystem()
      );
      const jsonStr = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(jsonStr);
      setTasks(Array.isArray(parsed) ? parsed : []);
    } catch (e) {
      if (e.message === 'API_KEY_MISSING') {
        handleApiError(e);
      } else {
        setTasks([]);
      }
    } finally {
      setTasksLoading(false);
    }
  }

  async function runTranscribe(uri, mimeType, source) {
    setLoading(true);
    setErrorMsg('');
    setTranscript('');
    setSummary('');
    setSaved(false);
    setRawTranscript('');
    setSpeakerNames({});
    setTasks([]);
    setSelectedTaskIndices(new Set());
    setPickedAfterTranscript(false);
    setTranscriptSource(source);
    let monoUri = null;
    try {
      setLoadingMsg('오디오 전처리 중…');
      monoUri = await convertToMonoViaServer(uri, mimeType);
      const audioUri = monoUri ?? uri;
      const audioMime = monoUri ? 'audio/wav' : mimeType;

      setLoadingMsg('음성 변환 중…');
      const { text, segments } = await transcribeAudio(audioUri, audioMime);

      let diarized = text;
      if (segments.length > 0) {
        setLoadingMsg('화자 구분 분석 중…');
        const pyResult = await diarizeWithPyannote(audioUri, audioMime, segments);
        diarized = pyResult ?? await diarizeSegments(segments);
      }

      const speakers = extractSpeakers(diarized);
      if (speakers.length > 0) {
        setRawTranscript(diarized);
        setSpeakerNames(Object.fromEntries(speakers.map((s) => [s, ''])));
      }
      setTranscript(diarized);
      runSummarize(diarized);
    } catch (e) {
      handleApiError(e);
    } finally {
      if (monoUri) FileSystem.deleteAsync(monoUri, { idempotent: true }).catch(() => {});
      setLoading(false);
      setLoadingMsg('');
    }
  }

  function openClientPicker(speaker, context) {
    setClientPickerSpeaker(speaker);
    setClientPickerContext(context);
    setClientPickerSearch('');
  }

  function openAddPersonPicker(recordId) {
    setAddPersonRecordId(recordId);
    setClientPickerSpeaker('__add__');
    setClientPickerContext('addPerson');
    setClientPickerSearch('');
    setAddPersonSelectedIds(new Set());
  }

  async function handleNewClientRegister() {
    if (!newClientName.trim() || !newClientCompany.trim() || !newClientContact.trim()) {
      Alert.alert('필수 항목 누락', '담당자 이름, 회사명, 연락처는 필수 입력 항목입니다.');
      return;
    }
    const updated = await addClient({
      name: newClientName.trim(),
      company: newClientCompany.trim(),
      role: newClientRole.trim(),
      contact: newClientContact.trim(),
      notes: newClientNotes.trim(),
    });
    setClients(updated);
    setShowNewClientModal(false);
    setNewClientName(''); setNewClientCompany(''); setNewClientRole(''); setNewClientContact(''); setNewClientNotes('');
    selectClient(updated[0]);
  }

  async function addAndSelectClient() {
    const name = clientPickerSearch.trim();
    if (!name) return;
    const updated = await addClient({ name });
    setClients(updated);
    selectClient({ name });
  }

  async function selectClient(client) {
    if (clientPickerContext === 'save') {
      setSpeakerNames((prev) => ({ ...prev, [clientPickerSpeaker]: client.name }));
      if (client.id) setSpeakerClientMap((prev) => ({ ...prev, [clientPickerSpeaker]: client.id }));
    } else if (clientPickerContext === 'edit') {
      setSpeakerEditNames((prev) => ({ ...prev, [clientPickerSpeaker]: client.name }));
      if (client.id) setSpeakerClientEditMap((prev) => ({ ...prev, [clientPickerSpeaker]: client.id }));
    }
    setClientPickerSpeaker(null);
  }

  function toggleAddPersonClient(clientId) {
    setAddPersonSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });
  }

  async function confirmAddPersonClients() {
    if (addPersonRecordId && addPersonSelectedIds.size > 0) {
      const record = meetingRecords.find((r) => r.id === addPersonRecordId);
      if (record) {
        const mergedIds = [...new Set([...(record.clientIds || []), ...addPersonSelectedIds])];
        const updated = await updateMeetingRecord(addPersonRecordId, { clientIds: mergedIds });
        setMeetingRecords(updated);
      }
    }
    setAddPersonRecordId(null);
    setClientPickerSpeaker(null);
    setAddPersonSelectedIds(new Set());
  }

  async function removePersonFromRecord(recordId, clientId) {
    const record = meetingRecords.find((r) => r.id === recordId);
    if (!record) return;
    const filtered = (record.clientIds || []).filter((id) => id !== clientId);
    const updated = await updateMeetingRecord(recordId, { clientIds: filtered });
    setMeetingRecords(updated);
  }

  function openSaveModal() {
    setEditingRecordId(null);
    setTitleInput(`${formatDate(Date.now())} · ${transcriptSource}`);
    setSpeakerClientMap({});
    setShowSaveModal(true);
  }

  function openEditModal(item) {
    setEditingRecordId(item.id);
    setTitleInput(item.title || '');
    setShowSaveModal(true);
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
    setContentEditRecordId(null);
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
  }

  async function confirmSegmentEdit() {
    const record = meetingRecords.find((r) => r.id === segmentEditRecordId);
    if (!record) return;
    setSegmentEditRecordId(null);
    const updatedTranscript = buildTranscriptFromSegments(editableSegments);
    const updated = await updateMeetingRecord(segmentEditRecordId, { transcript: updatedTranscript });
    setMeetingRecords(updated);
    setEditableSegments([]);
    setSegmentPickerIdx(null);
  }

  async function confirmSave() {
    const title = titleInput.trim();
    setShowSaveModal(false);
    if (editingRecordId) {
      const updated = await updateMeetingRecord(editingRecordId, { title });
      setMeetingRecords(updated);
      setEditingRecordId(null);
    } else {
      let finalTranscript = transcript;
      let finalSummary = summary;
      if (rawTranscript) {
        finalTranscript = applyNames(rawTranscript, speakerNames);
        finalSummary = applyNames(summary, speakerNames);
        setTranscript(finalTranscript);
        setSummary(finalSummary);
      }
      const clientIds = [...new Set(Object.values(speakerClientMap).filter(Boolean))];
      await addMeetingRecord({ title: title || `${formatDate(Date.now())} · ${transcriptSource}`, source: transcriptSource, summary: finalSummary, transcript: finalTranscript, tasks, clientIds });
      setSaved(true);
    }
  }

  function copyToClipboard(text) {
    Clipboard.setString(text);
    Alert.alert('복사 완료', '클립보드에 복사되었습니다.');
  }

  async function runFixForeignWords(item) {
    setFixingForeignId(item.id);
    try {
      const [fixedTranscript, fixedSummary] = await Promise.all([
        item.transcript ? fixForeignWordsInText(item.transcript) : null,
        item.summary ? fixForeignWordsInText(item.summary) : null,
      ]);
      const changes = {};
      if (fixedTranscript !== null) changes.transcript = fixedTranscript;
      if (fixedSummary !== null) changes.summary = fixedSummary;
      const updated = await updateMeetingRecord(item.id, changes);
      setMeetingRecords(updated);
    } catch (e) {
      handleApiError(e);
    } finally {
      setFixingForeignId(null);
    }
  }

  async function handleDelete(id) {
    Alert.alert('삭제', '이 회의록을 삭제하시겠습니까?', [
      { text: '취소', style: 'cancel' },
      {
        text: '삭제', style: 'destructive',
        onPress: async () => {
          const updated = await deleteMeetingRecord(id);
          setMeetingRecords(updated);
          if (expandedId === id) setExpandedId(null);
        },
      },
    ]);
  }

  function toggleExpand(id) {
    setExpandedId((prev) => (prev === id ? null : id));
  }

  async function analyzeWorkTopics() {
    const withSummary = meetingRecords.filter((r) => r.summary).slice(0, 20);
    if (withSummary.length === 0) return;
    setWorkTopicsLoading(true);
    setWorkTopics('');
    try {
      const summaries = withSummary
        .map((r, i) => `[회의 ${i + 1}] ${r.title || '제목 없음'}\n${r.summary}`)
        .join('\n\n---\n\n');
      const result = await askClaude(
        [{ role: 'user', content: summaries }],
        `[언어 규칙] 반드시 한국어로만 응답하세요. 한자·일본어·영어 문장은 절대 사용하지 마세요.

다음은 여러 회의의 요약입니다. 이 회의들에서 반복·공통으로 등장하는 업무 주제와 키워드를 추출해주세요.

## 주요 업무 주제
(반복 논의된 업무 영역을 bullet로 나열)

## 핵심 키워드
(자주 언급된 주제어, 프로젝트명, 이슈 등)

## 인사이트
(전체 회의를 통해 파악할 수 있는 업무 패턴이나 특이사항, 1~2문장)`
      );
      setWorkTopics(result);
      await saveWorkTopics(result);
    } catch (e) {
      handleApiError(e);
    } finally {
      setWorkTopicsLoading(false);
    }
  }

  return (
    <View style={[s.root, { paddingTop: insets.top }]}>
      <Modal visible={showSaveModal} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setShowSaveModal(false)}>
        <KeyboardAvoidingView style={s.modalOverlay} behavior="padding">
          <ScrollView contentContainerStyle={s.modalScrollContent} keyboardShouldPersistTaps="handled">
            <View style={s.modalBox}>
              <Text style={s.modalTitle}>{editingRecordId ? '제목 변경' : '회의록 저장'}</Text>
              {!editingRecordId && !!rawTranscript && (
                <>
                  <Text style={s.speakerModalSubtitle}>화자 이름 지정 (선택)</Text>
                  {Object.keys(speakerNames).map((speaker, idx) => {
                    const linked = clients.find((c) => c.name === speakerNames[speaker]);
                    const color = SPEAKER_COLORS[idx % SPEAKER_COLORS.length];
                    return (
                      <View key={speaker} style={s.speakerRow}>
                        <View style={[s.speakerColorDot, { backgroundColor: color }]} />
                        <Text style={[s.speakerOrigLabel, { color }]}>{speaker}</Text>
                        <Text style={s.speakerArrow}>→</Text>
                        <TextInput
                          style={s.speakerInput}
                          value={speakerNames[speaker]}
                          onChangeText={(v) => setSpeakerNames((prev) => ({ ...prev, [speaker]: v }))}
                          placeholder={speaker}
                          placeholderTextColor={C.textDim}
                        />
                        <TouchableOpacity
                          style={[s.clientRegBtn, !!linked && s.clientRegBtnActive]}
                          onPress={() => openClientPicker(speaker, 'save')}
                          activeOpacity={0.7}
                        >
                          <Text style={[s.clientRegBtnText, !!linked && s.clientRegBtnTextActive]}>
                            {linked ? linked.name : '거래처'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </>
              )}
              <TextInput
                style={s.modalInput}
                value={titleInput}
                onChangeText={setTitleInput}
                placeholder="제목을 입력하세요"
                placeholderTextColor={C.textDim}
                autoFocus={!rawTranscript}
                selectTextOnFocus
              />
              <View style={s.modalBtns}>
                <TouchableOpacity style={s.modalCancelBtn} onPress={() => setShowSaveModal(false)} activeOpacity={0.7}>
                  <Text style={s.modalCancelText}>취소</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.modalSaveBtn} onPress={confirmSave} activeOpacity={0.8}>
                  <Text style={s.modalSaveText}>저장</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
      <Modal visible={!!speakerEditRecordId} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setSpeakerEditRecordId(null)}>
        <KeyboardAvoidingView style={s.modalOverlay} behavior="padding">
          <ScrollView contentContainerStyle={[s.modalScrollContent, { paddingBottom: insets.bottom + 40 }]} keyboardShouldPersistTaps="handled">
            <View style={s.modalBox}>
              <Text style={s.modalTitle}>화자 관리</Text>
              {Object.keys(speakerEditNames).length > 0 && (
                <Text style={s.speakerModalSubtitle}>이름 변경 또는 삭제 (빈칸이면 원래 이름 유지)</Text>
              )}
              {Object.keys(speakerEditNames).map((speaker, idx) => {
                const isDeleted = speakerEditDeleted.has(speaker);
                const linked = clients.find((c) => c.name === speakerEditNames[speaker]);
                const color = SPEAKER_COLORS[idx % SPEAKER_COLORS.length];
                return (
                  <View key={speaker} style={[s.speakerRow, isDeleted && s.speakerRowDeleted]}>
                    <View style={[s.speakerColorDot, { backgroundColor: color }, isDeleted && { opacity: 0.4 }]} />
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
                        onPress={() => openClientPicker(speaker, 'edit')}
                        activeOpacity={0.7}
                      >
                        <Text style={[s.clientRegBtnText, !!linked && s.clientRegBtnTextActive]}>
                          {linked ? linked.name : '거래처'}
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
                    style={[s.speakerInput, { width: 64, flex: 0 }]}
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
              <View style={s.modalBtns}>
                <TouchableOpacity style={s.modalCancelBtn} onPress={() => setSpeakerEditRecordId(null)} activeOpacity={0.7}>
                  <Text style={s.modalCancelText}>취소</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.modalSaveBtn} onPress={confirmSpeakerEdit} activeOpacity={0.8}>
                  <Text style={s.modalSaveText}>변경</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={!!contentEditRecordId} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setContentEditRecordId(null)}>
        <KeyboardAvoidingView style={s.modalOverlay} behavior="padding">
          <ScrollView contentContainerStyle={s.modalScrollContent} keyboardShouldPersistTaps="handled">
            <View style={s.modalBox}>
              <Text style={s.modalTitle}>내용 편집</Text>
              <Text style={s.speakerModalSubtitle}>요약 (SUMMARY)</Text>
              <TextInput
                style={s.contentEditInput}
                value={contentEditSummary}
                onChangeText={setContentEditSummary}
                placeholder="요약 내용을 입력하세요"
                placeholderTextColor={C.textDim}
                multiline
                textAlignVertical="top"
              />
              <Text style={s.speakerModalSubtitle}>원문 (TRANSCRIPT)</Text>
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
                <TouchableOpacity style={s.modalCancelBtn} onPress={() => setContentEditRecordId(null)} activeOpacity={0.7}>
                  <Text style={s.modalCancelText}>취소</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.modalSaveBtn} onPress={confirmContentEdit} activeOpacity={0.8}>
                  <Text style={s.modalSaveText}>저장</Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={!!segmentEditRecordId} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setSegmentEditRecordId(null)}>
        <View style={s.segModalOverlay}>
          <View style={s.segModalBox}>
            <View style={s.segModalHeader}>
              <Text style={s.modalTitle}>화자 수동 수정</Text>
              <Text style={s.speakerModalSubtitle}>화자 레이블을 탭해 변경하세요</Text>
            </View>
            <ScrollView style={s.segModalScroll} keyboardShouldPersistTaps="handled">
              {(() => {
                const allSpeakers = [...new Set(editableSegments.map((s) => s.speaker))];
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
            <View style={[s.modalBtns, s.segModalFooter, { paddingBottom: insets.bottom + 16 }]}>
              <TouchableOpacity style={s.modalCancelBtn} onPress={() => setSegmentEditRecordId(null)} activeOpacity={0.7}>
                <Text style={s.modalCancelText}>취소</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.modalSaveBtn} onPress={confirmSegmentEdit} activeOpacity={0.8}>
                <Text style={s.modalSaveText}>저장</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal visible={!!clientPickerSpeaker} transparent animationType="fade" statusBarTranslucent onRequestClose={() => { setClientPickerSpeaker(null); setAddPersonRecordId(null); }}>
        <View style={[s.modalOverlay, { justifyContent: 'center', paddingHorizontal: 32 }]}>
          <View style={[s.modalBox, s.clientPickerBox]}>
            <Text style={s.modalTitle}>거래처 선택</Text>
            <TextInput
              style={[s.modalInput, { marginBottom: 4 }]}
              value={clientPickerSearch}
              onChangeText={setClientPickerSearch}
              placeholder="이름 또는 회사 검색"
              placeholderTextColor={C.textDim}
              autoFocus
            />
            <ScrollView style={s.clientPickerList} keyboardShouldPersistTaps="handled">
              {clients
                .filter((c) => !clientPickerSearch || c.name.includes(clientPickerSearch) || (c.company || '').includes(clientPickerSearch))
                .map((c) => {
                  const isSelected = clientPickerContext === 'addPerson' && addPersonSelectedIds.has(c.id);
                  return (
                    <TouchableOpacity
                      key={c.id}
                      style={[s.clientPickerItem, isSelected && s.clientPickerItemSelected]}
                      onPress={() => clientPickerContext === 'addPerson' ? toggleAddPersonClient(c.id) : selectClient(c)}
                      activeOpacity={0.7}
                    >
                      <View style={s.clientPickerItemRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={[s.clientPickerName, isSelected && s.clientPickerNameSelected]}>{c.name}</Text>
                          {!!c.company && <Text style={s.clientPickerCompany}>{c.company}{c.role ? ` · ${c.role}` : ''}</Text>}
                        </View>
                        {clientPickerContext === 'addPerson' && (
                          <View style={[s.clientPickerCheck, isSelected && s.clientPickerCheckSelected]}>
                            {isSelected && <Text style={s.clientPickerCheckMark}>✓</Text>}
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })
              }
              {clients.filter((c) => !clientPickerSearch || c.name.includes(clientPickerSearch) || (c.company || '').includes(clientPickerSearch)).length === 0 && (
                <Text style={s.clientPickerEmpty}>검색 결과가 없습니다</Text>
              )}
            </ScrollView>
            {!!clientPickerSearch.trim() && clientPickerContext !== 'addPerson' && (
              <TouchableOpacity style={s.clientAddBtn} onPress={addAndSelectClient} activeOpacity={0.8}>
                <Text style={s.clientAddBtnText}>'{clientPickerSearch.trim()}' 새로 추가</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={s.newClientRegBtn}
              onPress={() => setShowNewClientModal(true)}
              activeOpacity={0.8}
            >
              <Text style={s.newClientRegBtnText}>+ 거래처 신규 등록</Text>
            </TouchableOpacity>
            {clientPickerContext === 'addPerson' ? (
              <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
                <TouchableOpacity
                  style={[s.newClientRegBtn, addPersonSelectedIds.size > 0 && s.clientConfirmBtn, { flex: 1 }]}
                  onPress={confirmAddPersonClients}
                  activeOpacity={0.8}
                >
                  <Text style={[s.newClientRegBtnText, addPersonSelectedIds.size > 0 && s.clientConfirmBtnText]}>
                    {addPersonSelectedIds.size > 0 ? `${addPersonSelectedIds.size}명 추가` : '확인'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.newClientRegBtn, { flex: 1 }]}
                  onPress={() => { setClientPickerSpeaker(null); setAddPersonRecordId(null); setAddPersonSelectedIds(new Set()); }}
                  activeOpacity={0.7}
                >
                  <Text style={s.newClientRegBtnText}>취소</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={[s.modalCancelBtn, { flex: 0, marginTop: 4 }]} onPress={() => { setClientPickerSpeaker(null); setAddPersonRecordId(null); setAddPersonSelectedIds(new Set()); }} activeOpacity={0.7}>
                <Text style={s.modalCancelText}>취소</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>

      {/* ── 거래처 신규 등록 모달 ── */}
      <Modal visible={showNewClientModal} animationType="slide" transparent onRequestClose={() => setShowNewClientModal(false)}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={s.newClientModalOverlay}>
          <View style={s.newClientModalSheet}>
            <View style={s.newClientModalHandle} />
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <Text style={s.newClientModalTitle}>거래처 추가</Text>
              <View style={s.newClientInputLabelRow}>
                <Text style={s.newClientInputLabel}>담당자 이름</Text>
                <Text style={s.newClientRequiredMark}>*</Text>
              </View>
              <TextInput style={s.newClientInput} value={newClientName} onChangeText={setNewClientName} placeholder="홍길동" placeholderTextColor={C.textDim} />
              <View style={s.newClientInputLabelRow}>
                <Text style={s.newClientInputLabel}>회사명</Text>
                <Text style={s.newClientRequiredMark}>*</Text>
              </View>
              <TextInput style={s.newClientInput} value={newClientCompany} onChangeText={setNewClientCompany} placeholder="(주)ABC" placeholderTextColor={C.textDim} />
              <Text style={s.newClientInputLabel}>직책</Text>
              <TextInput style={s.newClientInput} value={newClientRole} onChangeText={setNewClientRole} placeholder="구매팀장" placeholderTextColor={C.textDim} />
              <View style={s.newClientInputLabelRow}>
                <Text style={s.newClientInputLabel}>연락처</Text>
                <Text style={s.newClientRequiredMark}>*</Text>
              </View>
              <TextInput style={s.newClientInput} value={newClientContact} onChangeText={setNewClientContact} placeholder="010-0000-0000" placeholderTextColor={C.textDim} keyboardType="phone-pad" />
              <Text style={s.newClientInputLabel}>메모</Text>
              <TextInput style={s.newClientInput} value={newClientNotes} onChangeText={setNewClientNotes} placeholder="특이사항" placeholderTextColor={C.textDim} />
              <View style={s.newClientModalBtns}>
                <TouchableOpacity style={s.newClientCancelBtn} onPress={() => setShowNewClientModal(false)} activeOpacity={0.7}>
                  <Text style={s.newClientCancelText}>취소</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.newClientConfirmBtn} onPress={handleNewClientRegister} activeOpacity={0.8}>
                  <Text style={s.newClientConfirmText}>추가</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── 인물 상세 모달 ── */}
      <Modal visible={!!selectedPersonClient} animationType="slide" transparent onRequestClose={() => setSelectedPersonClient(null)}>
        <View style={s.personModalOverlay}>
          <View style={s.personModalSheet}>
            <View style={s.personModalHandle} />
            {selectedPersonClient && (() => {
              const personHistories = histories.filter((h) => h.clientId === selectedPersonClient.id).sort((a, b) => b.createdAt - a.createdAt);
              const linkedProjects = projects.filter((p) => p.clientIds?.includes(selectedPersonClient.id));
              const linkedMeetings = meetingRecords.filter((r) => r.clientIds?.includes(selectedPersonClient.id));
              return (
                <>
                  {/* 헤더 - ScrollView 밖 고정 */}
                  <View style={s.personDetailHeader}>
                    <View style={s.personDetailAvatar}>
                      <Text style={s.personDetailAvatarText}>{selectedPersonClient.name[0]}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={s.personDetailName}>{selectedPersonClient.name}</Text>
                      {selectedPersonClient.company ? (
                        <Text style={s.personDetailCompany}>{selectedPersonClient.company}{selectedPersonClient.role ? ` · ${selectedPersonClient.role}` : ''}</Text>
                      ) : null}
                      {selectedPersonClient.contact ? (
                        <Text style={s.personDetailContact}>{selectedPersonClient.contact}</Text>
                      ) : null}
                    </View>
                    <TouchableOpacity onPress={() => setSelectedPersonClient(null)}>
                      <Text style={s.personCloseBtn}>✕</Text>
                    </TouchableOpacity>
                  </View>

                  {/* 연결된 프로젝트 - ScrollView 밖 고정 */}
                  {linkedProjects.length > 0 && (
                    <View style={s.personLinkedSection}>
                      <Text style={s.personSectionLabel}>연결된 프로젝트</Text>
                      <View style={s.personChipRow}>
                        {linkedProjects.map((p) => (
                          <View key={p.id} style={[s.personProjectChip, { borderColor: statusColor(p.status) + '55', backgroundColor: statusColor(p.status) + '15' }]}>
                            <View style={[s.personProjectChipDot, { backgroundColor: statusColor(p.status) }]} />
                            <Text style={[s.personProjectChipText, { color: statusColor(p.status) }]} numberOfLines={1}>{p.title}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  )}

                  {/* 히스토리 헤더 - ScrollView 밖 고정 */}
                  <View style={s.personHistoryHeader}>
                    <Text style={s.personSectionLabel}>히스토리 {personHistories.length}건</Text>
                  </View>

                  {/* 스크롤 영역 */}
                  <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                    {selectedPersonClient.notes ? (
                      <View style={s.personNotesBox}>
                        <Text style={s.personNotesText}>{selectedPersonClient.notes}</Text>
                      </View>
                    ) : null}

                    {personHistories.length === 0 ? (
                      <Text style={s.personEmptyText}>기록된 히스토리가 없습니다</Text>
                    ) : (
                      personHistories.map((h, i) => (
                        <View key={h.id} style={s.personHistoryItem}>
                          <View style={s.personHistoryLeft}>
                            <Text style={s.personHistoryDate}>{h.date}</Text>
                            {i < personHistories.length - 1 && <View style={s.personHistoryLine} />}
                          </View>
                          <View style={s.personHistoryRight}>
                            <View style={s.personHistoryMeta}>
                              <View style={[s.personTypeBadge, { backgroundColor: histTypeColor(h.type) + '22', borderColor: histTypeColor(h.type) + '55' }]}>
                                <Text style={[s.personTypeText, { color: histTypeColor(h.type) }]}>{h.type}</Text>
                              </View>
                              <Text style={s.personHistoryTitle}>{h.title}</Text>
                            </View>
                            {h.content ? <Text style={s.personHistoryContent}>{h.content}</Text> : null}
                            {h.result ? (
                              <View style={s.personResultRow}>
                                <Text style={s.personResultLabel}>결과</Text>
                                <Text style={s.personResultText}>{h.result}</Text>
                              </View>
                            ) : null}
                          </View>
                        </View>
                      ))
                    )}

                    {linkedMeetings.length > 0 && (
                      <View style={[s.personLinkedSection, { marginTop: 16 }]}>
                        <Text style={s.personSectionLabel}>연결된 회의록 {linkedMeetings.length}건</Text>
                        {linkedMeetings.map((r) => (
                          <View key={r.id} style={s.personMeetingItem}>
                            <Text style={s.personMeetingTitle} numberOfLines={1}>📋 {r.title || '회의록'}</Text>
                            {r.summary ? <Text style={s.personMeetingSummary} numberOfLines={2}>{r.summary}</Text> : null}
                          </View>
                        ))}
                      </View>
                    )}
                  </ScrollView>
                </>
              );
            })()}
          </View>
        </View>
      </Modal>

      {/* 상단 탭 */}
      <View style={s.topTab}>
        <TouchableOpacity
          style={[s.topTabBtn, activeTab === 'record' && s.topTabBtnActive]}
          onPress={() => setActiveTab('record')}
          activeOpacity={0.7}
        >
          <Text style={[s.topTabText, activeTab === 'record' && s.topTabTextActive]}>녹음</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[s.topTabBtn, activeTab === 'history' && s.topTabBtnActive]}
          onPress={() => setActiveTab('history')}
          activeOpacity={0.7}
        >
          <Text style={[s.topTabText, activeTab === 'history' && s.topTabTextActive]}>저장된 기록</Text>
          {meetingRecords.length > 0 && activeTab !== 'history' && (
            <View style={s.countBadge}>
              <Text style={s.countBadgeText}>{meetingRecords.length}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {activeTab === 'record' ? (
        <ScrollView ref={scrollRef} style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>

          {/* 변환 완료 후: 파일 업로드 최상단 */}
          {!!pickedFile && (!!transcript || pickedAfterTranscript) && (
            <View style={s.section}>
              <Text style={s.sectionLabel}>FILE UPLOAD</Text>
              <View style={s.card}>
                <TouchableOpacity style={s.filePickBtn} onPress={pickFile} activeOpacity={0.7} disabled={loading}>
                  <Text style={s.filePickIcon}>◈</Text>
                  <Text style={s.filePickText}>파일 다시 선택</Text>
                </TouchableOpacity>
                <View style={s.fileInfo}>
                  <View style={s.fileDivider} />
                  <Text style={s.fileInfoLabel}>선택된 파일</Text>
                  <Text style={s.fileInfoName} numberOfLines={2}>{pickedFile.name}</Text>
                  <TouchableOpacity
                    style={[s.transcribeBtn, loading && s.transcribeBtnDisabled]}
                    onPress={transcribeFile}
                    activeOpacity={0.8}
                    disabled={loading}
                  >
                    <Text style={s.transcribeBtnText}>변환하기</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}

          {/* 변환 전: 헤더, 녹음, 파일 업로드 */}
          {!transcript && (
            <>
              <View style={s.header}>
                <View style={s.headerBadge}>
                  <View style={s.headerBadgeDot} />
                  <Text style={s.headerBadgeText}>MEETING</Text>
                </View>
                <Text style={s.title}>회의 녹음</Text>
                <Text style={s.subtitle}>음성을 텍스트로 변환합니다</Text>
              </View>

              <View style={s.rule} />

              {/* 직접 녹음 */}
              <View style={s.section}>
                <Text style={s.sectionLabel}>RECORDING</Text>
                <View style={s.card}>
                  <View style={s.recordCenter}>
                    {recording ? (
                      <>
                        <View style={s.recBadge}>
                          <View style={s.recBadgeDot} />
                          <Text style={s.recBadgeText}>녹음 중</Text>
                        </View>
                        <Text style={[s.timerText, s.timerActive]}>{formatTime(elapsed)}</Text>
                        <TouchableOpacity style={s.stopBtn} onPress={stopAndTranscribe} activeOpacity={0.8}>
                          <View style={s.stopSquare} />
                          <Text style={s.stopBtnText}>녹음 중지</Text>
                        </TouchableOpacity>
                        <Text style={s.recordHint}>중지하면 텍스트 변환이 자동으로 시작됩니다</Text>
                      </>
                    ) : (
                      <>
                        <Text style={s.timerText}>{formatTime(elapsed)}</Text>
                        <TouchableOpacity style={s.recordBtn} onPress={startRecording} activeOpacity={0.8}>
                          <View style={s.recordDot} />
                        </TouchableOpacity>
                        <Text style={s.recordHint}>버튼을 눌러 녹음을 시작하세요</Text>
                        <Text style={s.recordInfo}>녹음 파일은 저장되지 않으며{'\n'}중지 후 바로 텍스트로 변환됩니다</Text>
                      </>
                    )}
                  </View>
                </View>
              </View>

              {/* 파일 업로드 */}
              <View style={s.section}>
                <Text style={s.sectionLabel}>FILE UPLOAD</Text>
                <View style={s.card}>
                  <TouchableOpacity style={s.filePickBtn} onPress={pickFile} activeOpacity={0.7} disabled={loading}>
                    <Text style={s.filePickIcon}>◈</Text>
                    <Text style={s.filePickText}>
                      {pickedFile ? '파일 다시 선택' : '오디오 파일 선택'}
                    </Text>
                  </TouchableOpacity>
                  {pickedFile && (
                    <View style={s.fileInfo}>
                      <View style={s.fileDivider} />
                      <Text style={s.fileInfoLabel}>선택된 파일</Text>
                      <Text style={s.fileInfoName} numberOfLines={2}>{pickedFile.name}</Text>
                      <TouchableOpacity
                        style={[s.transcribeBtn, loading && s.transcribeBtnDisabled]}
                        onPress={transcribeFile}
                        activeOpacity={0.8}
                        disabled={loading}
                      >
                        <Text style={s.transcribeBtnText}>변환하기</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              </View>
            </>
          )}

          {/* 로딩 */}
          {loading && (
            <View style={s.loadingBox}>
              <ActivityIndicator color={C.accentBlue} size="small" />
              <Text style={s.loadingText}>{loadingMsg || '처리 중…'}</Text>
            </View>
          )}

          {/* 에러 */}
          {!!errorMsg && (
            <View style={s.errorBox}>
              <Text style={s.errorText}>{errorMsg}</Text>
            </View>
          )}

          {/* 요약 결과 */}
          {!!summary && (
            <View style={[s.section, { marginBottom: 16 }]}>
              <View style={s.transcriptHeader}>
                <View>
                  <Text style={s.sectionLabel}>SUMMARY</Text>
                  {!!transcriptSource && (
                    <Text style={s.transcriptSource}>{transcriptSource}</Text>
                  )}
                </View>
                <TouchableOpacity onPress={() => copyToClipboard(summary)} activeOpacity={0.7}>
                  <Text style={s.copyBtn}>복사</Text>
                </TouchableOpacity>
              </View>
              <View style={s.card}>
                <Text style={s.transcriptText}>{summary}</Text>
              </View>
            </View>
          )}

          {/* 원본 텍스트 */}
          {!!transcript && (
            <View style={[s.section, { marginBottom: 16 }]}>
              <View style={s.transcriptHeader}>
                <Text style={s.sectionLabel}>TRANSCRIPT</Text>
                <TouchableOpacity onPress={() => copyToClipboard(transcript)} activeOpacity={0.7}>
                  <Text style={s.copyBtn}>복사</Text>
                </TouchableOpacity>
              </View>
              <View style={s.card}>
                <Text style={[s.transcriptText, { color: C.textSecondary }]}>{transcript}</Text>
              </View>
            </View>
          )}

          {/* 태스크 목록 */}
          {!!transcript && !loading && (tasks.length > 0 || tasksLoading) && (
            <View style={[s.section, { marginBottom: 16 }]}>
              <Text style={s.sectionLabel}>TASKS</Text>
              {tasksLoading && (
                <View style={s.loadingBox}>
                  <ActivityIndicator color={C.accentPurple} size="small" />
                  <Text style={s.loadingText}>태스크 추출 중…</Text>
                </View>
              )}
              {tasks.length > 0 && (
                <View style={s.card}>
                  {tasks.map((task, i) => {
                    const selected = selectedTaskIndices.has(i);
                    return (
                      <TouchableOpacity
                        key={i}
                        style={[s.taskRow, i < tasks.length - 1 && s.taskRowBorder]}
                        activeOpacity={0.7}
                        onPress={() => toggleTaskSelect(i)}
                      >
                        <View style={[s.taskCheckbox, selected && s.taskCheckboxSelected]}>
                          {selected && <Text style={s.taskCheckmark}>✓</Text>}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.taskContent}>{task.content}</Text>
                          <View style={s.taskMeta}>
                            <Text style={s.taskMetaText}>{task.assignee}</Text>
                            {task.deadline !== '미정' && (
                              <Text style={s.taskMetaText}>· {task.deadline}</Text>
                            )}
                            <Text style={[s.taskPriorityLabel, { color: priorityColor(task.priority) }]}>{task.priority}</Text>
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
              {tasks.length > 0 && (
                <TouchableOpacity
                  style={[s.bundleBtn, selectedTaskIndices.size === 0 && s.bundleBtnDisabled]}
                  onPress={() => {
                    const selected = [...selectedTaskIndices].map((i) => tasks[i]);
                    navigation.navigate('프로젝트', { addTask: bundleTasksToProject(selected) });
                    setSelectedTaskIndices(new Set());
                  }}
                  activeOpacity={0.8}
                  disabled={selectedTaskIndices.size === 0}
                >
                  <Text style={s.bundleBtnText}>
                    {selectedTaskIndices.size > 0
                      ? `${selectedTaskIndices.size}개 선택 · 프로젝트로 묶기`
                      : '태스크를 선택하세요'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* 태스크 추출 + 저장 버튼 */}
          {(!!summary || !!transcript) && !loading && (
            <View style={[s.saveRow, { marginBottom: 48 }]}>
              {saved ? (
                <View style={s.savedBadge}>
                  <Text style={s.savedText}>✓ 기록에 저장됨</Text>
                </View>
              ) : (
                <>
                  <TouchableOpacity
                    style={[s.actionBtn, s.taskExtractBtn, tasksLoading && s.actionBtnDisabled]}
                    onPress={() => runExtractTasks(transcript)}
                    activeOpacity={0.8}
                    disabled={tasksLoading}
                  >
                    {tasksLoading
                      ? <ActivityIndicator color={C.accentPurple} size="small" />
                      : <Text style={s.taskExtractBtnText}>{tasks.length > 0 ? '다시 추출' : '태스크 추출'}</Text>
                    }
                  </TouchableOpacity>
                  <TouchableOpacity style={[s.actionBtn, s.saveBtnNew]} onPress={openSaveModal} activeOpacity={0.8}>
                    <Text style={s.saveBtnText}>기록 저장</Text>
                  </TouchableOpacity>
                </>
              )}
            </View>
          )}
        </ScrollView>
      ) : (
        /* 기록 탭 */
        <FlatList
          data={meetingRecords}
          extraData={meetingRecords}
          keyExtractor={(item) => item.id}
          contentContainerStyle={s.historyContent}
          ListHeaderComponent={meetingRecords.length > 0 ? (
            <View style={s.topicSection}>
              <TouchableOpacity
                style={[s.topicBtn, workTopicsLoading && s.topicBtnDisabled]}
                onPress={analyzeWorkTopics}
                activeOpacity={0.8}
                disabled={workTopicsLoading}
              >
                {workTopicsLoading ? (
                  <ActivityIndicator color={C.gold} size="small" />
                ) : (
                  <Text style={s.topicBtnText}>업무 주제 분석</Text>
                )}
              </TouchableOpacity>
              {!!workTopics && (
                <View style={s.topicResultBox}>
                  <View style={s.topicResultHeader}>
                    <Text style={s.topicResultLabel}>WORK TOPICS</Text>
                    <TouchableOpacity onPress={() => copyToClipboard(workTopics)} activeOpacity={0.7}>
                      <Text style={s.copyBtn}>복사</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={s.topicResultText}>{workTopics}</Text>
                </View>
              )}
            </View>
          ) : null}
          ListEmptyComponent={
            <View style={s.emptyBox}>
              <Text style={s.emptyText}>저장된 회의록이 없습니다</Text>
              <Text style={s.emptyHint}>녹음 후 "기록 저장" 버튼을 눌러 저장하세요</Text>
            </View>
          }
          renderItem={({ item }) => {
            const isExpanded = expandedId === item.id;
            return (
              <TouchableOpacity
                style={s.historyItem}
                onPress={() => toggleExpand(item.id)}
                activeOpacity={0.85}
              >
                <View style={s.historyMeta}>
                  <View style={s.historyMetaRow}>
                    <Text style={s.historyDate} numberOfLines={1}>{item.title || formatDateTime(item.createdAt)}</Text>
                    <Text style={s.historyChevron}>{isExpanded ? '▲' : '▼'}</Text>
                  </View>
                  <View style={s.historyBtnRow}>
                    <TouchableOpacity style={s.editTitleBtn} onPress={() => openEditModal(item)} activeOpacity={0.7}>
                      <Text style={s.editTitleBtnText}>제목 변경</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.contentEditBtn} onPress={() => openContentEditModal(item)} activeOpacity={0.7}>
                      <Text style={s.contentEditBtnText}>내용 편집</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.speakerEditBtn} onPress={() => openSpeakerEditModal(item)} activeOpacity={0.7}>
                      <Text style={s.speakerEditBtnText}>화자 변경</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.segmentEditBtn} onPress={() => openSegmentEditModal(item)} activeOpacity={0.7}>
                      <Text style={s.segmentEditBtnText}>화자 수정</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[s.fixForeignBtn, !!fixingForeignId && s.fixForeignBtnDisabled]}
                      onPress={() => runFixForeignWords(item)}
                      activeOpacity={0.7}
                      disabled={!!fixingForeignId}
                    >
                      <Text style={s.fixForeignBtnText}>
                        {fixingForeignId === item.id ? '수정 중…' : '외국어 수정'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.deleteBtn} onPress={() => handleDelete(item.id)} activeOpacity={0.7}>
                      <Text style={s.deleteBtnText}>삭제</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={[s.historySource, { marginTop: 6 }]}>{formatDateTime(item.createdAt)} · {item.source}</Text>
                </View>
                {!isExpanded && !!item.summary && (
                  <Text style={s.historyPreview} numberOfLines={2}>{item.summary}</Text>
                )}
                {isExpanded && (
                  <View style={s.historyDetail}>
                    {!!item.summary && (
                      <View style={s.historySection}>
                        <View style={s.historySectionHeader}>
                          <Text style={s.historySectionLabel}>SUMMARY</Text>
                          <TouchableOpacity onPress={() => copyToClipboard(item.summary)} activeOpacity={0.7}>
                            <Text style={s.copyBtn}>복사</Text>
                          </TouchableOpacity>
                        </View>
                        <Text style={s.historyBody}>{item.summary}</Text>
                      </View>
                    )}
                    {!!item.transcript && (
                      <View style={s.historySection}>
                        <View style={s.historySectionHeader}>
                          <Text style={s.historySectionLabel}>TRANSCRIPT</Text>
                          <TouchableOpacity onPress={() => copyToClipboard(item.transcript)} activeOpacity={0.7}>
                            <Text style={s.copyBtn}>복사</Text>
                          </TouchableOpacity>
                        </View>
                        {(() => {
                          const segs = parseTranscriptSegments(item.transcript);
                          if (segs.length === 0) return <Text style={[s.historyBody, { color: C.textSecondary }]}>{item.transcript}</Text>;
                          const allSpkrs = [...new Set(segs.map((sg) => sg.speaker))];
                          return (
                            <View style={{ gap: 12 }}>
                              {segs.map((seg, i) => {
                                const color = SPEAKER_COLORS[allSpkrs.indexOf(seg.speaker) % SPEAKER_COLORS.length];
                                return (
                                  <View key={i}>
                                    <Text style={{ color, fontSize: 11, fontWeight: '600', letterSpacing: 0.5, marginBottom: 4 }}>{seg.speaker}</Text>
                                    <Text style={[s.historyBody, { color: C.textSecondary }]}>{seg.text}</Text>
                                  </View>
                                );
                              })}
                            </View>
                          );
                        })()}
                      </View>
                    )}
					{(() => {
                      const linked = (item.clientIds || []).map((id) => clients.find((c) => c.id === id)).filter(Boolean);
                      return (
                        <View style={s.historySection}>
                          <View style={s.historySectionHeader}>
                            <Text style={s.historySectionLabel}>관련 인물</Text>
                            <TouchableOpacity onPress={() => openAddPersonPicker(item.id)} activeOpacity={0.7}>
                              <Text style={s.copyBtn}>+ 추가</Text>
                            </TouchableOpacity>
                          </View>
                          {linked.map((c) => (
                            <TouchableOpacity key={c.id} style={s.linkedPersonRow} activeOpacity={0.7} onPress={() => setSelectedPersonClient(c)}>
                              <View style={s.linkedPersonAvatar}>
                                <Text style={s.linkedPersonAvatarText}>{c.name[0]}</Text>
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={s.linkedClientName} numberOfLines={1}>{c.name}</Text>
                                {!!c.company && (
                                  <Text style={s.linkedClientCompany} numberOfLines={1}>
                                    {c.company}{c.role ? ` · ${c.role}` : ''}
                                  </Text>
                                )}
                              </View>
                              <TouchableOpacity
                                style={s.linkedPersonDeleteBtn}
                                onPress={() => removePersonFromRecord(item.id, c.id)}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                activeOpacity={0.6}
                              >
                                <Text style={s.linkedPersonDeleteText}>×</Text>
                              </TouchableOpacity>
                            </TouchableOpacity>
                          ))}
                          {linked.length === 0 && (
                            <Text style={{ color: C.textDim, fontSize: 12, paddingVertical: 4 }}>등록된 인물이 없습니다</Text>
                          )}
                        </View>
                      );
                    })()}
					{(() => {
                      const linked = projects.filter((p) => p.meetingRecordIds?.includes(item.id));
                      if (!linked.length) return null;
                      return (
                        <View style={s.historySection}>
                          <Text style={s.historySectionLabel}>관련 프로젝트</Text>
                          {linked.map((p) => (
                            <View key={p.id} style={s.linkedProjectRow}>
                              <View style={[s.linkedProjectDot, { backgroundColor: statusColor(p.status) }]} />
                              <Text style={s.linkedProjectTitle} numberOfLines={1}>{p.title}</Text>
                              <Text style={[s.linkedProjectStatus, { color: statusColor(p.status) }]}>{p.status}</Text>
                            </View>
                          ))}
                        </View>
                      );
                    })()}
					{!!item.tasks?.length && (() => {
                      const selected = historySelectedTasks[item.id] || new Set();
                      return (
                        <View style={s.historySection}>
                          <Text style={s.historySectionLabel}>TASKS</Text>
                          <View style={s.card}>
                            {item.tasks.map((task, i) => {
                              const isSelected = selected.has(i);
                              return (
                                <TouchableOpacity
                                  key={i}
                                  style={[s.taskRow, i < item.tasks.length - 1 && s.taskRowBorder]}
                                  activeOpacity={0.7}
                                  onPress={() => toggleHistoryTask(item.id, i)}
                                >
                                  <View style={[s.taskCheckbox, isSelected && s.taskCheckboxSelected]}>
                                    {isSelected && <Text style={s.taskCheckmark}>✓</Text>}
                                  </View>
                                  <View style={{ flex: 1 }}>
                                    <Text style={s.taskContent}>{task.content}</Text>
                                    <View style={s.taskMeta}>
                                      <Text style={s.taskMetaText}>{task.assignee}</Text>
                                      {task.deadline !== '미정' && (
                                        <Text style={s.taskMetaText}>· {task.deadline}</Text>
                                      )}
                                      <Text style={[s.taskPriorityLabel, { color: priorityColor(task.priority) }]}>{task.priority}</Text>
                                    </View>
                                  </View>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                          <TouchableOpacity
                            style={[s.bundleBtn, selected.size === 0 && s.bundleBtnDisabled]}
                            onPress={() => {
                              const selectedTasks = [...selected].map((i) => item.tasks[i]);
                              navigation.navigate('프로젝트', { addTask: bundleTasksToProject(selectedTasks), meetingRecordId: item.id });
                              setHistorySelectedTasks((prev) => ({ ...prev, [item.id]: new Set() }));
                            }}
                            activeOpacity={0.8}
                            disabled={selected.size === 0}
                          >
                            <Text style={s.bundleBtnText}>
                              {selected.size > 0
                                ? `${selected.size}개 선택 · 프로젝트로 묶기`
                                : '태스크를 선택하세요'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      );
                    })()}
                  </View>
                )}
              </TouchableOpacity>
            );
          }}
        />
      )}
    </View>
  );
}

function bundleTasksToProject(selectedTasks) {
  const RANK = { '높음': 0, '보통': 1, '낮음': 2 };
  const topPriority = selectedTasks.reduce(
    (best, t) => (RANK[t.priority] < RANK[best] ? t.priority : best),
    '낮음'
  );
  const deadlines = selectedTasks
    .map((t) => t.deadline)
    .filter((d) => d && d !== '미정')
    .sort();
  const notes = selectedTasks
    .map((t) => `• ${t.content}${t.assignee && t.assignee !== '미지정' ? ` (${t.assignee})` : ''}`)
    .join('\n');
  return { title: '', deadline: deadlines[0] || '', priority: topPriority, notes };
}

function taskToProject(task) {
  return {
    title: task.content,
    deadline: task.deadline === '미정' ? '' : task.deadline,
    priority: task.priority,
    notes: task.assignee && task.assignee !== '미지정' ? `담당자: ${task.assignee}` : '',
  };
}

function statusColor(status) {
  const map = { 진행중: C.accentBlue, 위험: C.gold, 지연: C.red, 완료: C.accentTeal, 취소: C.textDim };
  return map[status] || C.textDim;
}

function histTypeColor(type) {
  const map = { 미팅: C.accentBlue, 통화: C.gold, 이메일: C.accentTeal, 계약: C.accentPurple, 기타: C.textSecondary };
  return map[type] || C.textSecondary;
}

function priorityColor(priority) {
  if (priority === '높음') return C.red;
  if (priority === '낮음') return C.textDim;
  return C.accentBlue;
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  // 상단 탭
  topTab: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: C.border },
  topTabBtn: { flex: 1, paddingVertical: 14, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 },
  topTabBtnActive: { borderBottomWidth: 2, borderBottomColor: C.accentTeal },
  topTabText: { color: C.textDim, fontSize: 13, fontWeight: '500', letterSpacing: 0.5 },
  topTabTextActive: { color: C.accentTeal },
  countBadge: { backgroundColor: C.accentTeal + '33', borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 },
  countBadgeText: { color: C.accentTeal, fontSize: 10, fontWeight: '700' },
  // 녹음 탭
  scroll: { flex: 1 },
  scrollContent: { paddingTop: 24, paddingHorizontal: 24 },
  header: { marginBottom: 32 },
  headerBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 28 },
  headerBadgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.gold },
  headerBadgeText: { color: C.goldDim, fontSize: 10, letterSpacing: 3, fontWeight: '600' },
  title: { color: C.textPrimary, fontSize: 32, fontWeight: '200', letterSpacing: -1 },
  subtitle: { color: C.textDim, fontSize: 12, marginTop: 6, letterSpacing: 0.5 },
  rule: { height: 1, backgroundColor: C.border, marginBottom: 32 },
  section: { marginBottom: 28 },
  sectionLabel: { color: C.textDim, fontSize: 10, letterSpacing: 2.5, fontWeight: '600', marginBottom: 14 },
  card: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, overflow: 'hidden' },
  recordCenter: { alignItems: 'center', paddingVertical: 40, gap: 16 },
  timerText: { color: C.textPrimary, fontSize: 48, fontWeight: '200', letterSpacing: -1 },
  timerActive: { color: C.red },
  recBadge: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    backgroundColor: C.red + '22', borderWidth: 1, borderColor: C.red + '55',
    paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20,
  },
  recBadgeDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.red },
  recBadgeText: { color: C.red, fontSize: 11, fontWeight: '600', letterSpacing: 1.5 },
  recordBtn: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: C.surface, borderWidth: 2, borderColor: C.red,
    alignItems: 'center', justifyContent: 'center',
  },
  recordDot: { width: 28, height: 28, borderRadius: 14, backgroundColor: C.red },
  stopBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    borderWidth: 2, borderColor: C.textSecondary, borderRadius: 28,
    paddingVertical: 13, paddingHorizontal: 24,
  },
  stopSquare: { width: 14, height: 14, borderRadius: 3, backgroundColor: C.textSecondary },
  stopBtnText: { color: C.textSecondary, fontSize: 15, fontWeight: '500', letterSpacing: 0.3 },
  recordHint: { color: C.textDim, fontSize: 12, letterSpacing: 0.3 },
  recordInfo: { color: C.textDim, fontSize: 11, letterSpacing: 0.2, textAlign: 'center', lineHeight: 17 },
  filePickBtn: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 20, justifyContent: 'center' },
  filePickIcon: { color: C.accentBlue, fontSize: 18 },
  filePickText: { color: C.accentBlue, fontSize: 14, fontWeight: '500' },
  fileInfo: { paddingHorizontal: 20, paddingBottom: 20 },
  fileDivider: { height: 1, backgroundColor: C.border, marginBottom: 16 },
  fileInfoLabel: { color: C.textDim, fontSize: 10, letterSpacing: 2, fontWeight: '600', marginBottom: 6 },
  fileInfoName: { color: C.textPrimary, fontSize: 13, marginBottom: 16 },
  transcribeBtn: {
    backgroundColor: C.accentBlue + '22', borderWidth: 1,
    borderColor: C.accentBlue + '55', borderRadius: 8,
    paddingVertical: 12, alignItems: 'center',
  },
  transcribeBtnDisabled: { opacity: 0.4 },
  transcribeBtnText: { color: C.accentBlue, fontSize: 14, fontWeight: '500' },
  loadingBox: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20, justifyContent: 'center' },
  loadingText: { color: C.textSecondary, fontSize: 13 },
  errorBox: { backgroundColor: C.red + '18', borderWidth: 1, borderColor: C.red + '44', borderRadius: 10, padding: 14, marginBottom: 20 },
  errorText: { color: C.red, fontSize: 13 },
  saveRow: { flexDirection: 'row', gap: 12, marginBottom: 20 },
  actionBtn: {
    flex: 1, paddingVertical: 13, alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderRadius: 10,
  },
  actionBtnDisabled: { opacity: 0.5 },
  taskExtractBtn: { backgroundColor: C.accentPurple + '22', borderColor: C.accentPurple + '55' },
  taskExtractBtnText: { color: C.accentPurple, fontSize: 14, fontWeight: '500' },
  saveBtnNew: { backgroundColor: C.accentTeal + '22', borderColor: C.accentTeal + '55' },
  saveBtn: {
    backgroundColor: C.accentTeal + '22', borderWidth: 1,
    borderColor: C.accentTeal + '55', borderRadius: 20,
    paddingVertical: 10, paddingHorizontal: 28,
  },
  saveBtnText: { color: C.accentTeal, fontSize: 14, fontWeight: '500' },
  savedBadge: {
    backgroundColor: C.accentTeal + '18', borderWidth: 1,
    borderColor: C.accentTeal + '44', borderRadius: 20,
    paddingVertical: 8, paddingHorizontal: 20,
  },
  savedText: { color: C.accentTeal, fontSize: 13, fontWeight: '500' },
  transcriptHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  transcriptSource: { color: C.textDim, fontSize: 11, marginTop: 2 },
  copyBtn: { color: C.accentBlue, fontSize: 12, fontWeight: '500' },
  transcriptText: { color: C.textPrimary, fontSize: 14, lineHeight: 24, padding: 18 },
  // 제목 입력 모달
  modalOverlay: { flex: 1, backgroundColor: '#000000AA' },
  modalScrollContent: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 32, paddingVertical: 40 },
  modalBox: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.borderHigh, borderRadius: 16, padding: 24, gap: 16 },
  modalTitle: { color: C.textPrimary, fontSize: 16, fontWeight: '500', letterSpacing: 0.3 },
  modalInput: {
    backgroundColor: C.bg, borderWidth: 1, borderColor: C.borderHigh,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    color: C.textPrimary, fontSize: 14,
  },
  modalBtns: { flexDirection: 'row', gap: 10, marginTop: 4 },
  modalCancelBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: C.border, borderRadius: 10 },
  modalCancelText: { color: C.textSecondary, fontSize: 14 },
  modalSaveBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', backgroundColor: C.accentTeal + '22', borderWidth: 1, borderColor: C.accentTeal + '66', borderRadius: 10 },
  modalSaveText: { color: C.accentTeal, fontSize: 14, fontWeight: '600' },
  speakerModalSubtitle: { color: C.textDim, fontSize: 12, letterSpacing: 0.3, marginTop: -8 },
  speakerRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  speakerColorDot: { width: 8, height: 8, borderRadius: 4, flexShrink: 0 },
  speakerOrigLabel: { fontSize: 13, fontWeight: '500', width: 58 },
  speakerArrow: { color: C.textDim, fontSize: 12 },
  speakerInput: {
    flex: 1, backgroundColor: C.bg, borderWidth: 1, borderColor: C.borderHigh,
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
    color: C.textPrimary, fontSize: 13,
  },
  clientRegBtn: {
    borderWidth: 1, borderColor: C.borderHigh, borderRadius: 6,
    paddingVertical: 6, paddingHorizontal: 8, maxWidth: 72,
  },
  clientRegBtnActive: { backgroundColor: C.accentTeal + '22', borderColor: C.accentTeal + '66' },
  clientRegBtnText: { color: C.textDim, fontSize: 11, fontWeight: '500' },
  clientRegBtnTextActive: { color: C.accentTeal, fontSize: 11, fontWeight: '500' },
  clientPickerBox: { maxHeight: '70%', gap: 12 },
  clientPickerList: { maxHeight: 280 },
  clientPickerItem: {
    paddingVertical: 12, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: C.border,
  },
  clientPickerItemSelected: { backgroundColor: C.accentTeal + '15' },
  clientPickerItemRow: { flexDirection: 'row', alignItems: 'center' },
  clientPickerName: { color: C.textPrimary, fontSize: 14, fontWeight: '500' },
  clientPickerNameSelected: { color: C.accentTeal },
  clientPickerCompany: { color: C.textDim, fontSize: 12, marginTop: 2 },
  clientPickerEmpty: { color: C.textDim, fontSize: 13, textAlign: 'center', paddingVertical: 24 },
  clientPickerCheck: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 1.5, borderColor: C.border,
    alignItems: 'center', justifyContent: 'center', marginLeft: 8,
  },
  clientPickerCheckSelected: { borderColor: C.accentTeal, backgroundColor: C.accentTeal },
  clientPickerCheckMark: { color: '#fff', fontSize: 12, fontWeight: '700' },
  clientConfirmBtn: { backgroundColor: C.accentTeal, borderColor: C.accentTeal },
  clientConfirmBtnText: { color: '#fff', fontWeight: '700' },
  linkedClientRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  linkedClientDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: C.accentPurple },
  linkedClientName: { color: C.textPrimary, fontSize: 13, fontWeight: '500' },
  linkedClientCompany: { flex: 1, color: C.textDim, fontSize: 11 },
  linkedPersonRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7, backgroundColor: C.accentTeal + '10', borderWidth: 1, borderColor: C.accentTeal + '33', borderRadius: 10, paddingHorizontal: 10, marginBottom: 6 },
  linkedPersonAvatar: { width: 28, height: 28, borderRadius: 14, backgroundColor: C.accentTeal + '2A', borderWidth: 1, borderColor: C.accentTeal + '44', alignItems: 'center', justifyContent: 'center' },
  linkedPersonAvatarText: { color: C.accentTeal, fontSize: 12, fontWeight: '600' },
  linkedPersonDeleteBtn: { width: 22, height: 22, borderRadius: 11, backgroundColor: C.border, alignItems: 'center', justifyContent: 'center' },
  linkedPersonDeleteText: { color: C.textDim, fontSize: 14, lineHeight: 20 },
  // 인물 상세 모달
  personModalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  personModalSheet: { backgroundColor: C.surfaceHigh, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 24, paddingBottom: 40, paddingTop: 12, height: '90%' },
  personModalHandle: { width: 36, height: 4, backgroundColor: C.borderHigh, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  personDetailHeader: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 16 },
  personDetailAvatar: { width: 52, height: 52, borderRadius: 26, backgroundColor: C.accentTeal + '33', borderWidth: 1, borderColor: C.accentTeal + '55', alignItems: 'center', justifyContent: 'center' },
  personDetailAvatarText: { color: C.accentTeal, fontSize: 22, fontWeight: '400' },
  personDetailName: { color: C.textPrimary, fontSize: 18, fontWeight: '400' },
  personDetailCompany: { color: C.textSecondary, fontSize: 12, marginTop: 2 },
  personDetailContact: { color: C.textDim, fontSize: 11, marginTop: 2 },
  personCloseBtn: { color: C.textSecondary, fontSize: 18, padding: 4 },
  personNotesBox: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 12, marginBottom: 12 },
  personNotesText: { color: C.textSecondary, fontSize: 13, lineHeight: 19 },
  personSection: { marginBottom: 16 },
  personLinkedSection: { marginBottom: 12 },
  personHistoryHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  personSectionLabel: { color: C.textDim, fontSize: 10, letterSpacing: 2, fontWeight: '600', marginBottom: 8 },
  personChipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  personProjectChip: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderRadius: 8, paddingVertical: 5, paddingHorizontal: 10 },
  personProjectChipDot: { width: 5, height: 5, borderRadius: 3 },
  personProjectChipText: { fontSize: 11, fontWeight: '500', maxWidth: 160 },
  personEmptyText: { color: C.textDim, fontSize: 13, paddingTop: 8 },
  personHistoryItem: { flexDirection: 'row', gap: 14, marginBottom: 4 },
  personHistoryLeft: { alignItems: 'center', width: 72 },
  personHistoryDate: { color: C.textDim, fontSize: 10, textAlign: 'center', lineHeight: 16 },
  personHistoryLine: { width: 1, flex: 1, backgroundColor: C.border, marginTop: 6 },
  personHistoryRight: { flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, padding: 12, marginBottom: 10, gap: 6 },
  personHistoryMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  personTypeBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 5, borderWidth: 1 },
  personTypeText: { fontSize: 10, fontWeight: '500' },
  personHistoryTitle: { color: C.textPrimary, fontSize: 13, flex: 1 },
  personHistoryContent: { color: C.textSecondary, fontSize: 12, lineHeight: 18 },
  personResultRow: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  personResultLabel: { color: C.gold, fontSize: 10, fontWeight: '600', marginTop: 1 },
  personResultText: { color: C.textDim, fontSize: 12, flex: 1 },
  personMeetingItem: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.accentPurple + '44', borderRadius: 10, padding: 12, marginBottom: 8, gap: 5 },
  personMeetingTitle: { color: C.accentPurple, fontSize: 13, fontWeight: '500' },
  personMeetingSummary: { color: C.textSecondary, fontSize: 12, lineHeight: 17 },
  linkedProjectRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  linkedProjectDot: { width: 7, height: 7, borderRadius: 4 },
  linkedProjectTitle: { flex: 1, color: C.textPrimary, fontSize: 13 },
  linkedProjectStatus: { fontSize: 11, fontWeight: '500' },
  clientAddBtn: {
    backgroundColor: C.accentBlue + '22', borderWidth: 1, borderColor: C.accentBlue + '55',
    borderRadius: 8, paddingVertical: 11, alignItems: 'center',
  },
  clientAddBtnText: { color: C.accentBlue, fontSize: 13, fontWeight: '500' },
  newClientRegBtn: {
    backgroundColor: C.accentTeal + '18', borderWidth: 1, borderColor: C.accentTeal + '55',
    borderRadius: 8, paddingVertical: 11, alignItems: 'center',
  },
  newClientRegBtnText: { color: C.accentTeal, fontSize: 13, fontWeight: '500' },
  newClientModalOverlay: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.6)' },
  newClientModalSheet: { backgroundColor: C.surfaceHigh, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 24, paddingBottom: 40, paddingTop: 12, maxHeight: '90%' },
  newClientModalHandle: { width: 36, height: 4, backgroundColor: C.borderHigh, borderRadius: 2, alignSelf: 'center', marginBottom: 20 },
  newClientModalTitle: { color: C.textPrimary, fontSize: 18, fontWeight: '400', marginBottom: 4 },
  newClientInputLabelRow: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 16, marginBottom: 8 },
  newClientInputLabel: { color: C.textDim, fontSize: 10, letterSpacing: 1.5, marginTop: 16, marginBottom: 8 },
  newClientRequiredMark: { color: C.accentTeal, fontSize: 12, lineHeight: 14 },
  newClientInput: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 10, color: C.textPrimary, fontSize: 14, paddingHorizontal: 14, paddingVertical: 12 },
  newClientModalBtns: { flexDirection: 'row', gap: 12, marginTop: 24 },
  newClientCancelBtn: { flex: 1, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: C.border, alignItems: 'center' },
  newClientCancelText: { color: C.textSecondary, fontSize: 14 },
  newClientConfirmBtn: { flex: 2, paddingVertical: 14, borderRadius: 12, backgroundColor: C.accentTeal, alignItems: 'center' },
  newClientConfirmText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  // 기록 탭
  historyContent: { padding: 16, paddingBottom: 40 },
  topicSection: { marginBottom: 16, gap: 12 },
  topicBtn: {
    backgroundColor: C.gold + '22', borderWidth: 1,
    borderColor: C.gold + '55', borderRadius: 10,
    paddingVertical: 12, alignItems: 'center', justifyContent: 'center',
    minHeight: 44,
  },
  topicBtnDisabled: { opacity: 0.5 },
  topicBtnText: { color: C.gold, fontSize: 14, fontWeight: '600', letterSpacing: 0.3 },
  topicResultBox: {
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.gold + '33',
    borderRadius: 12, padding: 16, gap: 12,
  },
  topicResultHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  topicResultLabel: { color: C.goldDim, fontSize: 10, letterSpacing: 2.5, fontWeight: '600' },
  topicResultText: { color: C.textPrimary, fontSize: 13, lineHeight: 22 },
  emptyBox: { marginTop: 80, alignItems: 'center', gap: 10 },
  emptyText: { color: C.textSecondary, fontSize: 15, fontWeight: '300' },
  emptyHint: { color: C.textDim, fontSize: 12, letterSpacing: 0.3 },
  historyItem: {
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    borderRadius: 12, marginBottom: 12, padding: 16,
  },
  historyMeta: {},
  historyMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  historyBtnRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8, flexWrap: 'wrap' },
  historyDate: { color: C.textPrimary, fontSize: 13, fontWeight: '500', flex: 1 },
  historySource: { color: C.textDim, fontSize: 11, letterSpacing: 0.3 },
  historyChevron: { color: C.textDim, fontSize: 12 },
  historyPreview: { color: C.textSecondary, fontSize: 12, lineHeight: 18, marginTop: 10 },
  historyDetail: { marginTop: 16, gap: 16 },
  historySection: { gap: 8 },
  historySectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  historySectionLabel: { color: C.textDim, fontSize: 10, letterSpacing: 2.5, fontWeight: '600' },
  historyBody: { color: C.textPrimary, fontSize: 13, lineHeight: 22 },
  editTitleBtn: {
    borderWidth: 1, borderColor: C.accentBlue + '55', borderRadius: 8,
    paddingVertical: 7, paddingHorizontal: 8,
  },
  editTitleBtnText: { color: C.accentBlue, fontSize: 12, fontWeight: '500' },
  contentEditBtn: {
    borderWidth: 1, borderColor: C.accentTeal + '55', borderRadius: 8,
    paddingVertical: 7, paddingHorizontal: 8,
  },
  contentEditBtnText: { color: C.accentTeal, fontSize: 12, fontWeight: '500' },
  contentEditInput: {
    backgroundColor: C.bg, borderWidth: 1, borderColor: C.borderHigh,
    borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12,
    color: C.textPrimary, fontSize: 13, lineHeight: 20,
    minHeight: 120, maxHeight: 260,
  },
  speakerEditBtn: {
    borderWidth: 1, borderColor: C.accentPurple + '55', borderRadius: 8,
    paddingVertical: 7, paddingHorizontal: 8,
  },
  speakerEditBtnText: { color: C.accentPurple, fontSize: 12, fontWeight: '500' },
  speakerRowDeleted: { opacity: 0.45 },
  speakerOrigLabelDeleted: { textDecorationLine: 'line-through' },
  speakerInputDeleted: { backgroundColor: C.bg + '80' },
  speakerDeleteBtn: {
    borderWidth: 1, borderColor: C.red + '55', borderRadius: 6,
    paddingVertical: 6, paddingHorizontal: 8, minWidth: 36, alignItems: 'center',
  },
  speakerDeleteBtnActive: { backgroundColor: C.accentTeal + '22', borderColor: C.accentTeal + '66' },
  speakerDeleteBtnText: { color: C.red, fontSize: 11, fontWeight: '600' },
  speakerDeleteBtnTextActive: { color: C.accentTeal },
  speakerAddBtn: {
    backgroundColor: C.accentPurple + '18', borderWidth: 1,
    borderColor: C.accentPurple + '44', borderRadius: 8,
    paddingVertical: 10, alignItems: 'center',
  },
  speakerAddBtnText: { color: C.accentPurple, fontSize: 13, fontWeight: '500' },
  segmentEditBtn: {
    borderWidth: 1, borderColor: C.gold + '55', borderRadius: 8,
    paddingVertical: 7, paddingHorizontal: 8,
  },
  segmentEditBtnText: { color: C.gold, fontSize: 12, fontWeight: '500' },
  segModalOverlay: { flex: 1, backgroundColor: '#000000AA', justifyContent: 'flex-end' },
  segModalBox: {
    backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20,
    borderWidth: 1, borderColor: C.borderHigh, maxHeight: '88%', paddingTop: 20,
  },
  segModalHeader: { paddingHorizontal: 24, paddingBottom: 16, gap: 6 },
  segModalScroll: { flexGrow: 0 },
  segModalFooter: { paddingHorizontal: 24, paddingVertical: 16, borderTopWidth: 1, borderTopColor: C.border },
  segRow: {
    paddingHorizontal: 24, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: C.border, gap: 8,
  },
  segSpeakerBadge: {
    alignSelf: 'flex-start',
    backgroundColor: C.gold + '22', borderWidth: 1, borderColor: C.gold + '55',
    borderRadius: 6, paddingVertical: 4, paddingHorizontal: 10,
  },
  segSpeakerBadgeActive: { backgroundColor: C.gold + '44', borderColor: C.gold },
  segSpeakerText: { color: C.gold, fontSize: 12, fontWeight: '600' },
  segSpeakerTextActive: { color: C.gold },
  segContent: { color: C.textSecondary, fontSize: 13, lineHeight: 20 },
  segPickerBox: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  segPickerChip: {
    borderWidth: 1, borderColor: C.borderHigh, borderRadius: 6,
    paddingVertical: 6, paddingHorizontal: 14,
  },
  segPickerChipActive: { backgroundColor: C.accentTeal + '22', borderColor: C.accentTeal + '66' },
  segPickerChipText: { color: C.textSecondary, fontSize: 13 },
  segPickerChipTextActive: { color: C.accentTeal, fontWeight: '600' },
  fixForeignBtn: {
    borderWidth: 1, borderColor: '#5AAF7A55', borderRadius: 8,
    paddingVertical: 7, paddingHorizontal: 8,
  },
  fixForeignBtnText: { color: '#5AAF7A', fontSize: 12, fontWeight: '500' },
  fixForeignBtnDisabled: { opacity: 0.4 },
  deleteBtn: {
    borderWidth: 1, borderColor: C.red + '55', borderRadius: 8,
    paddingVertical: 7, paddingHorizontal: 8,
  },
  deleteBtnText: { color: C.red, fontSize: 12, fontWeight: '500' },
  extractTasksBtn: {
    backgroundColor: C.accentPurple + '22', borderWidth: 1,
    borderColor: C.accentPurple + '55', borderRadius: 10,
    paddingVertical: 12, alignItems: 'center',
  },
  extractTasksBtnText: { color: C.accentPurple, fontSize: 14, fontWeight: '500' },
  taskRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, paddingHorizontal: 16, paddingVertical: 14 },
  taskRowBorder: { borderBottomWidth: 1, borderBottomColor: C.border },
  taskPriorityDot: { width: 8, height: 8, borderRadius: 4, marginTop: 4 },
  taskContent: { color: C.textPrimary, fontSize: 13, lineHeight: 20, fontWeight: '500' },
  taskMeta: { flexDirection: 'row', gap: 6, marginTop: 4, alignItems: 'center' },
  taskMetaText: { color: C.textDim, fontSize: 11 },
  taskPriorityLabel: { fontSize: 10, fontWeight: '600', letterSpacing: 0.5 },
  taskAddBtn: {
    borderWidth: 1, borderColor: C.accentTeal + '66', borderRadius: 8,
    paddingVertical: 5, paddingHorizontal: 10, marginLeft: 8,
  },
  taskAddBtnText: { color: C.accentTeal, fontSize: 11, fontWeight: '500' },
  taskCheckbox: {
    width: 20, height: 20, borderRadius: 10,
    borderWidth: 1.5, borderColor: C.borderHigh,
    alignItems: 'center', justifyContent: 'center', marginTop: 2,
  },
  taskCheckboxSelected: { backgroundColor: C.accentTeal, borderColor: C.accentTeal },
  taskCheckmark: { color: '#fff', fontSize: 11, fontWeight: '700', lineHeight: 14 },
  bundleBtn: {
    marginTop: 10, backgroundColor: C.accentTeal + '22', borderWidth: 1,
    borderColor: C.accentTeal + '66', borderRadius: 10,
    paddingVertical: 13, alignItems: 'center',
  },
  bundleBtnDisabled: { opacity: 0.4 },
  bundleBtnText: { color: C.accentTeal, fontSize: 14, fontWeight: '600' },
});
