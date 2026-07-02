import { useState, useRef, useEffect } from 'react';
import { useAudioRecorder, AudioModule, RecordingPresets } from 'expo-audio';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { transcribeAudio, convertToMonoViaServer } from '../services/groqStt';
import { askClaude, buildTaskExtractionSystem, buildMeetingSummarySystem } from '../services/claude';

const AUDIO_EXTS = ['mp3', 'mp4', 'm4a', 'wav', 'aac', 'ogg', 'flac', 'wma', 'opus', 'webm', 'amr', '3gp'];

export function formatTime(sec) {
  const m = String(Math.floor(sec / 60)).padStart(2, '0');
  const s = String(sec % 60).padStart(2, '0');
  return `${m}:${s}`;
}

/**
 * 회의록 화면의 녹음/파일 업로드/STT 상태·로직 공통 훅.
 * 화자 분리는 useDiarization이 담당하며, 이 훅은 diarize/resetDiarization 콜백으로 연결한다.
 * @param {object} params
 * @param {(audioUri: string, audioMime: string, segments: any[], fallbackText: string) => Promise<string>} params.diarize STT 세그먼트를 화자 분리 텍스트로 변환 (useDiarization 제공)
 * @param {() => void} params.resetDiarization 새 변환 시작 시 화자 분리 상태 초기화 (useDiarization 제공)
 * @param {() => void} params.onFileReplace 기존 변환 결과가 있는 상태에서 파일을 새로 선택했을 때 호출 (스크롤 처리 등)
 * @param {(e: Error) => void} params.onError API 에러 처리 (handleApiError)
 */
export function useAudioRecording({ diarize, resetDiarization, onFileReplace, onError }) {
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

  const [tasks, setTasks] = useState([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [selectedTaskIndices, setSelectedTaskIndices] = useState(new Set());
  const [pickedAfterTranscript, setPickedAfterTranscript] = useState(false);

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
      resetDiarization();
      setPickedAfterTranscript(true);
      onFileReplace();
    }
    setPickedFile(asset);
  }

  async function transcribeFile() {
    if (!pickedFile) return;
    await runTranscribe(pickedFile.uri, pickedFile.mimeType || 'audio/m4a', pickedFile.name);
  }

  async function runSummarize(text) {
    setLoading(true);
    setLoadingMsg('회의 내용 요약 중…');
    try {
      const sum = await askClaude(
        [{ role: 'user', content: text }],
        buildMeetingSummarySystem(),
        { raw: true }
      );
      setSummary(sum);
    } catch (e) {
      onError(e);
    } finally {
      setLoading(false);
      setLoadingMsg('');
    }
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
        buildTaskExtractionSystem(),
        { raw: true }
      );
      const jsonStr = raw.replace(/```json?\n?/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(jsonStr);
      setTasks(Array.isArray(parsed) ? parsed : []);
    } catch (e) {
      if (e.message === 'API_KEY_MISSING') {
        onError(e);
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
    resetDiarization();
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
        diarized = await diarize(audioUri, audioMime, segments, text);
      }

      setTranscript(diarized);
      runSummarize(diarized);
    } catch (e) {
      onError(e);
    } finally {
      if (monoUri) FileSystem.deleteAsync(monoUri, { idempotent: true }).catch(() => {});
      setLoading(false);
      setLoadingMsg('');
    }
  }

  return {
    elapsed, loading, loadingMsg, transcript, summary, transcriptSource, errorMsg,
    pickedFile, recording, saved, tasks, tasksLoading, selectedTaskIndices, pickedAfterTranscript,
    setTranscript, setSummary, setSaved, setErrorMsg, setSelectedTaskIndices,
    startRecording, stopAndTranscribe, pickFile, transcribeFile, toggleTaskSelect, runExtractTasks,
  };
}
