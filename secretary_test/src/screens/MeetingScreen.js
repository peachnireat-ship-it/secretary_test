import {
  Text, View, ScrollView, TouchableOpacity,
  StyleSheet, ActivityIndicator, Clipboard, Alert,
} from 'react-native';
import { useState, useEffect, useRef } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAudioRecorder, AudioModule, RecordingPresets } from 'expo-audio';
import * as DocumentPicker from 'expo-document-picker';
import { C } from '../theme';
import { transcribeAudio, diarizeSegments } from '../services/groqStt';
import { askClaude } from '../services/claude';

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
  const insets = useSafeAreaInsets();
  const [elapsed, setElapsed] = useState(0);
  const [loading, setLoading] = useState(false);
  const [loadingMsg, setLoadingMsg] = useState('');
  const [transcript, setTranscript] = useState('');
  const [summary, setSummary] = useState('');
  const [transcriptSource, setTranscriptSource] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [pickedFile, setPickedFile] = useState(null);
  const [recording, setRecording] = useState(false);

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
    setSummary('');
    setTranscriptSource('');
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

  async function runTranscribe(uri, mimeType, source) {
    setLoading(true);
    setErrorMsg('');
    setTranscript('');
    setSummary('');
    setTranscriptSource(source);
    try {
      setLoadingMsg('음성 변환 중…');
      const { text, segments } = await transcribeAudio(uri, mimeType);

      let finalTranscript = text;
      if (segments.length > 0) {
        setLoadingMsg('화자 구분 분석 중…');
        finalTranscript = await diarizeSegments(segments);
      }
      setTranscript(finalTranscript);

      setLoadingMsg('회의 내용 요약 중…');
      const sum = await askClaude(
        [{ role: 'user', content: finalTranscript }],
        `[언어 규칙] 반드시 한국어로만 응답하세요. 한자·일본어·영어 문장은 절대 사용하지 마세요.

회의 내용을 아래 형식으로 간결하게 요약하세요.

## 핵심 주제
(회의의 주요 목적이나 주제)

## 주요 논의 내용
(핵심 포인트를 간결하게 bullet로)

## 결정 사항
(회의에서 결정된 사항, 없으면 "없음")

## 액션 아이템
(후속 조치 및 담당자/기한, 없으면 "없음")`
      );
      setSummary(sum);
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
      setLoadingMsg('');
    }
  }

  function copyToClipboard(text) {
    Clipboard.setString(text);
    Alert.alert('복사 완료', '클립보드에 복사되었습니다.');
  }

  return (
    <ScrollView style={s.root} contentContainerStyle={[s.scroll, { paddingTop: insets.top + 16 }]} showsVerticalScrollIndicator={false}>
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
});
