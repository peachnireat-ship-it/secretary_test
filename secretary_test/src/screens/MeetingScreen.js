import {
  Text, View, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, Clipboard, Alert,
  Modal, FlatList,
} from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { useAudioRecorder, AudioModule, RecordingPresets } from 'expo-audio';
import * as MediaLibrary from 'expo-media-library';
import { C } from '../theme';
import { transcribeAudio } from '../services/groqStt';

function formatTime(sec) {
  const m = String(Math.floor(sec / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

function formatDate(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

export default function MeetingScreen({ navigation }) {
  const [elapsed, setElapsed] = useState(0);
  const [loading, setLoading] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [transcriptSource, setTranscriptSource] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [pickedFile, setPickedFile] = useState(null);
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [audioFiles, setAudioFiles] = useState([]);
  const [fileLoading, setFileLoading] = useState(false);

  const timerRef = useRef(null);
  const audioRecorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  async function startRecording() {
    setErrorMsg('');
    setTranscript('');
    setTranscriptSource('');
    const perm = await AudioModule.requestRecordingPermissionsAsync();
    if (!perm.granted) {
      setErrorMsg('마이크 권한이 필요합니다.');
      return;
    }
    setElapsed(0);
    audioRecorder.record();
    timerRef.current = setInterval(() => setElapsed((p) => p + 1), 1000);
  }

  async function stopAndTranscribe() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    await audioRecorder.stop();
    const uri = audioRecorder.uri;
    if (!uri) {
      setErrorMsg('녹음 파일을 찾을 수 없습니다.');
      return;
    }
    await runTranscribe(uri, 'audio/m4a', '직접 녹음');
  }

  async function openFilePicker() {
    setErrorMsg('');
    setAudioFiles([]);
    setFileLoading(true);
    setShowFilePicker(true);
    const { status } = await MediaLibrary.requestPermissionsAsync();
    if (status !== 'granted') {
      setShowFilePicker(false);
      setFileLoading(false);
      Alert.alert('권한 필요', '미디어 라이브러리 접근 권한이 필요합니다.');
      return;
    }
    const result = await MediaLibrary.getAssetsAsync({
      mediaType: MediaLibrary.MediaType.audio,
      sortBy: [[MediaLibrary.SortBy.modificationTime, false]],
      first: 300,
    });
    setAudioFiles(result.assets);
    setFileLoading(false);
  }

  function selectAudioFile(asset) {
    const ext = asset.filename.split('.').pop().toLowerCase();
    setPickedFile({
      uri: asset.uri,
      name: asset.filename,
      mimeType: `audio/${ext}`,
    });
    setShowFilePicker(false);
  }

  async function transcribeFile() {
    if (!pickedFile) return;
    await runTranscribe(pickedFile.uri, pickedFile.mimeType || 'audio/m4a', pickedFile.name);
  }

  async function runTranscribe(uri, mimeType, source) {
    setLoading(true);
    setErrorMsg('');
    setTranscript('');
    setTranscriptSource(source);
    try {
      const text = await transcribeAudio(uri, mimeType);
      setTranscript(text);
    } catch (e) {
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
    } finally {
      setLoading(false);
    }
  }

  function copyToClipboard() {
    Clipboard.setString(transcript);
    Alert.alert('복사 완료', '클립보드에 복사되었습니다.');
  }

  const isRecording = audioRecorder.isRecording;

  return (
    <>
      <ScrollView style={s.root} contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <View style={s.header}>
          <View style={s.badge}>
            <View style={s.badgeDot} />
            <Text style={s.badgeText}>MEETING</Text>
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
              <Text style={s.timerText}>{formatTime(elapsed)}</Text>
              {!isRecording ? (
                <TouchableOpacity style={s.recordBtn} onPress={startRecording} activeOpacity={0.8}>
                  <View style={s.recordDot} />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity style={[s.recordBtn, s.recordBtnActive]} onPress={stopAndTranscribe} activeOpacity={0.8}>
                  <View style={s.stopSquare} />
                </TouchableOpacity>
              )}
              <Text style={s.recordHint}>
                {isRecording ? '중지하면 자동으로 변환됩니다' : '버튼을 눌러 녹음을 시작하세요'}
              </Text>
            </View>
          </View>
        </View>

        {/* 파일 업로드 */}
        <View style={s.section}>
          <Text style={s.sectionLabel}>FILE UPLOAD</Text>
          <View style={s.card}>
            <TouchableOpacity style={s.filePickBtn} onPress={openFilePicker} activeOpacity={0.7} disabled={loading}>
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
            <Text style={s.loadingText}>변환 중…</Text>
          </View>
        )}

        {/* 에러 */}
        {!!errorMsg && (
          <View style={s.errorBox}>
            <Text style={s.errorText}>{errorMsg}</Text>
          </View>
        )}

        {/* 변환 결과 */}
        {!!transcript && (
          <View style={[s.section, { marginBottom: 48 }]}>
            <View style={s.transcriptHeader}>
              <View>
                <Text style={s.sectionLabel}>TRANSCRIPT</Text>
                {!!transcriptSource && (
                  <Text style={s.transcriptSource}>{transcriptSource}</Text>
                )}
              </View>
              <TouchableOpacity onPress={copyToClipboard} activeOpacity={0.7}>
                <Text style={s.copyBtn}>복사</Text>
              </TouchableOpacity>
            </View>
            <View style={s.card}>
              <Text style={s.transcriptText}>{transcript}</Text>
            </View>
          </View>
        )}
      </ScrollView>

      {/* 커스텀 오디오 파일 피커 */}
      <Modal visible={showFilePicker} animationType="slide" onRequestClose={() => setShowFilePicker(false)}>
        <View style={s.pickerRoot}>
          <View style={s.pickerHeader}>
            <Text style={s.pickerTitle}>오디오 파일 선택</Text>
            <TouchableOpacity onPress={() => setShowFilePicker(false)} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Text style={s.pickerClose}>✕</Text>
            </TouchableOpacity>
          </View>
          <View style={s.pickerRule} />

          {fileLoading ? (
            <View style={s.pickerCenter}>
              <ActivityIndicator color={C.accentBlue} size="large" />
              <Text style={s.pickerLoadingText}>파일 목록 불러오는 중…</Text>
            </View>
          ) : audioFiles.length === 0 ? (
            <View style={s.pickerCenter}>
              <Text style={s.pickerEmptyText}>오디오 파일이 없습니다</Text>
            </View>
          ) : (
            <FlatList
              data={audioFiles}
              keyExtractor={(item) => item.id}
              contentContainerStyle={s.pickerList}
              renderItem={({ item }) => (
                <TouchableOpacity style={s.fileItem} onPress={() => selectAudioFile(item)} activeOpacity={0.7}>
                  <Text style={s.fileItemIcon}>◈</Text>
                  <View style={s.fileItemInfo}>
                    <Text style={s.fileItemName} numberOfLines={1}>{item.filename}</Text>
                    <Text style={s.fileItemMeta}>
                      {item.duration ? formatTime(Math.floor(item.duration)) : '—'} · {formatDate(item.modificationTime)}
                    </Text>
                  </View>
                </TouchableOpacity>
              )}
              ItemSeparatorComponent={() => <View style={s.fileSep} />}
            />
          )}
        </View>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  scroll: { paddingTop: 60, paddingHorizontal: 24 },
  header: { marginBottom: 32 },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 28 },
  badgeDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.gold },
  badgeText: { color: C.goldDim, fontSize: 10, letterSpacing: 3, fontWeight: '600' },
  title: { color: C.textPrimary, fontSize: 32, fontWeight: '200', letterSpacing: -1 },
  subtitle: { color: C.textDim, fontSize: 12, marginTop: 6, letterSpacing: 0.5 },
  rule: { height: 1, backgroundColor: C.border, marginBottom: 32 },
  section: { marginBottom: 28 },
  sectionLabel: { color: C.textDim, fontSize: 10, letterSpacing: 2.5, fontWeight: '600', marginBottom: 14 },
  card: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, overflow: 'hidden' },
  recordCenter: { alignItems: 'center', paddingVertical: 40, gap: 20 },
  timerText: { color: C.textPrimary, fontSize: 48, fontWeight: '200', letterSpacing: -1 },
  recordBtn: {
    width: 72, height: 72, borderRadius: 36,
    backgroundColor: C.surface, borderWidth: 2, borderColor: C.red,
    alignItems: 'center', justifyContent: 'center',
  },
  recordBtnActive: { borderColor: C.textSecondary },
  recordDot: { width: 28, height: 28, borderRadius: 14, backgroundColor: C.red },
  stopSquare: { width: 22, height: 22, borderRadius: 4, backgroundColor: C.textSecondary },
  recordHint: { color: C.textDim, fontSize: 12, letterSpacing: 0.3 },
  filePickBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    padding: 20, justifyContent: 'center',
  },
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
  transcriptHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  transcriptSource: { color: C.textDim, fontSize: 11, marginTop: 2 },
  copyBtn: { color: C.accentBlue, fontSize: 12, fontWeight: '500' },
  transcriptText: { color: C.textPrimary, fontSize: 14, lineHeight: 24, padding: 18 },

  // 커스텀 피커
  pickerRoot: { flex: 1, backgroundColor: C.bg },
  pickerHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 24, paddingTop: 60, paddingBottom: 20,
  },
  pickerTitle: { color: C.textPrimary, fontSize: 20, fontWeight: '300', letterSpacing: -0.5 },
  pickerClose: { color: C.textSecondary, fontSize: 16 },
  pickerRule: { height: 1, backgroundColor: C.border },
  pickerList: { paddingVertical: 8 },
  pickerCenter: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  pickerLoadingText: { color: C.textDim, fontSize: 13 },
  pickerEmptyText: { color: C.textDim, fontSize: 13 },
  fileItem: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    paddingHorizontal: 24, paddingVertical: 14,
  },
  fileItemIcon: { color: C.accentBlue, fontSize: 16 },
  fileItemInfo: { flex: 1 },
  fileItemName: { color: C.textPrimary, fontSize: 14, marginBottom: 3 },
  fileItemMeta: { color: C.textDim, fontSize: 11, letterSpacing: 0.3 },
  fileSep: { height: 1, backgroundColor: C.border, marginLeft: 54 },
});
