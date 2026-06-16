import {
  Text, View, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, Clipboard, Alert, FlatList,
  Modal, TextInput, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAudioRecorder, AudioModule, RecordingPresets } from 'expo-audio';
import * as DocumentPicker from 'expo-document-picker';
import { C } from '../theme';
import { transcribeAudio, diarizeSegments } from '../services/groqStt';
import { askClaude } from '../services/claude';
import { getMeetingRecords, addMeetingRecord, updateMeetingRecord, deleteMeetingRecord } from '../services/storage';

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
  const regex = /\[화자 \d+\]/g;
  let m;
  while ((m = regex.exec(text)) !== null) found.add(m[0].slice(1, -1));
  return [...found];
}

function applyNames(text, nameMap) {
  return Object.entries(nameMap).reduce((t, [orig, name]) => {
    const replacement = name.trim() || orig;
    return t.split(`[${orig}]`).join(`[${replacement}]`);
  }, text);
}

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

  const timerRef = useRef(null);
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

  async function runTranscribe(uri, mimeType, source) {
    setLoading(true);
    setErrorMsg('');
    setTranscript('');
    setSummary('');
    setSaved(false);
    setRawTranscript('');
    setSpeakerNames({});
    setTranscriptSource(source);
    try {
      setLoadingMsg('음성 변환 중…');
      const { text, segments } = await transcribeAudio(uri, mimeType);

      let diarized = text;
      if (segments.length > 0) {
        setLoadingMsg('화자 구분 분석 중…');
        diarized = await diarizeSegments(segments);
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
      setLoading(false);
      setLoadingMsg('');
    }
  }

  function openSaveModal() {
    setEditingRecordId(null);
    setTitleInput(`${formatDate(Date.now())} · ${transcriptSource}`);
    setShowSaveModal(true);
  }

  function openEditModal(item) {
    setEditingRecordId(item.id);
    setTitleInput(item.title || '');
    setShowSaveModal(true);
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
      await addMeetingRecord({ title: title || `${formatDate(Date.now())} · ${transcriptSource}`, source: transcriptSource, summary: finalSummary, transcript: finalTranscript });
      setSaved(true);
    }
  }

  function copyToClipboard(text) {
    Clipboard.setString(text);
    Alert.alert('복사 완료', '클립보드에 복사되었습니다.');
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
                  {Object.keys(speakerNames).map((speaker) => (
                    <View key={speaker} style={s.speakerRow}>
                      <Text style={s.speakerOrigLabel}>{speaker}</Text>
                      <Text style={s.speakerArrow}>→</Text>
                      <TextInput
                        style={s.speakerInput}
                        value={speakerNames[speaker]}
                        onChangeText={(v) => setSpeakerNames((prev) => ({ ...prev, [speaker]: v }))}
                        placeholder={speaker}
                        placeholderTextColor={C.textDim}
                      />
                    </View>
                  ))}
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
        <ScrollView style={s.scroll} contentContainerStyle={s.scrollContent} showsVerticalScrollIndicator={false}>
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

          {/* 저장 버튼 */}
          {(!!summary || !!transcript) && !loading && (
            <View style={s.saveRow}>
              {saved ? (
                <View style={s.savedBadge}>
                  <Text style={s.savedText}>✓ 기록에 저장됨</Text>
                </View>
              ) : (
                <TouchableOpacity style={s.saveBtn} onPress={openSaveModal} activeOpacity={0.8}>
                  <Text style={s.saveBtnText}>기록 저장</Text>
                </TouchableOpacity>
              )}
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
            <View style={[s.section, { marginBottom: 48 }]}>
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
        </ScrollView>
      ) : (
        /* 기록 탭 */
        <FlatList
          data={meetingRecords}
          keyExtractor={(item) => item.id}
          contentContainerStyle={s.historyContent}
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
                    <TouchableOpacity style={s.editTitleBtn} onPress={() => openEditModal(item)} activeOpacity={0.7}>
                      <Text style={s.editTitleBtnText}>제목 변경</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.deleteBtn} onPress={() => handleDelete(item.id)} activeOpacity={0.7}>
                      <Text style={s.deleteBtnText}>삭제</Text>
                    </TouchableOpacity>
                    <Text style={s.historyChevron}>{isExpanded ? '▲' : '▼'}</Text>
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
                        <Text style={[s.historyBody, { color: C.textSecondary }]}>{item.transcript}</Text>
                      </View>
                    )}
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
  saveRow: { alignItems: 'center', marginBottom: 20 },
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
  speakerOrigLabel: { color: C.textSecondary, fontSize: 13, fontWeight: '500', width: 58 },
  speakerArrow: { color: C.textDim, fontSize: 12 },
  speakerInput: {
    flex: 1, backgroundColor: C.bg, borderWidth: 1, borderColor: C.borderHigh,
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8,
    color: C.textPrimary, fontSize: 13,
  },
  // 기록 탭
  historyContent: { padding: 16, paddingBottom: 40 },
  emptyBox: { marginTop: 80, alignItems: 'center', gap: 10 },
  emptyText: { color: C.textSecondary, fontSize: 15, fontWeight: '300' },
  emptyHint: { color: C.textDim, fontSize: 12, letterSpacing: 0.3 },
  historyItem: {
    backgroundColor: C.surface, borderWidth: 1, borderColor: C.border,
    borderRadius: 12, marginBottom: 12, padding: 16,
  },
  historyMeta: {},
  historyMetaRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
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
    paddingVertical: 7, paddingHorizontal: 16,
  },
  editTitleBtnText: { color: C.accentBlue, fontSize: 12, fontWeight: '500' },
  deleteBtn: {
    borderWidth: 1, borderColor: C.red + '55', borderRadius: 8,
    paddingVertical: 7, paddingHorizontal: 16,
  },
  deleteBtnText: { color: C.red, fontSize: 12, fontWeight: '500' },
});
