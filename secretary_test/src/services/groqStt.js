import * as FileSystem from 'expo-file-system';
import { getApiKey, getPyannoteUrl } from './storage';
import { askClaude } from './claude';

export async function transcribeAudio(fileUri, mimeType = 'audio/m4a') {
  const apiKey = await getApiKey();
  if (!apiKey) throw new Error('API_KEY_MISSING');

  const ext = mimeType.split('/')[1] || 'm4a';
  const formData = new FormData();
  formData.append('file', { uri: fileUri, type: mimeType, name: `audio.${ext}` });
  formData.append('model', 'whisper-large-v3');
  formData.append('language', 'ko');
  formData.append('prompt', '한국어 회의 녹음입니다. 정확하게 한국어로 전사해 주세요.');
  formData.append('response_format', 'verbose_json');
  formData.append('temperature', '0');

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `API 오류 (${res.status})`);
  }

  const data = await res.json();
  return {
    text: (data.text || '').trim(),
    segments: data.segments || [],
  };
}

function formatSec(sec) {
  const m = String(Math.floor(sec / 60)).padStart(2, '0');
  const s = String(Math.floor(sec % 60)).padStart(2, '0');
  return `${m}:${s}`;
}

function isValidSegment(s) {
  return (s.no_speech_prob ?? 0) < 0.6 && (s.avg_logprob ?? 0) > -1.0;
}

export async function diarizeSegments(segments) {
  if (!segments?.length) return '';

  const input = segments
    .filter(isValidSegment)
    .map((s) => `[${formatSec(s.start)}-${formatSec(s.end)}] ${(s.text || '').trim()}`)
    .filter((l) => l)
    .join('\n');

  return askClaude(
    [{ role: 'user', content: input }],
    `[언어 규칙] 반드시 한국어로만 응답하세요.

다음은 회의 음성을 타임스탬프별로 변환한 텍스트입니다. 아래 4가지 작업을 순서대로 수행하세요.

1. 화자 구분: 대화 흐름, 질문/답변 패턴, 내용의 연속성을 분석하여 화자를 구분하세요.
2. 오타 수정: 음성 인식 과정에서 발생한 오타(잘못 인식된 단어, 붙여쓰기 오류 등)를 교정하세요.
3. 조사 수정: 문맥에 맞지 않는 조사(을/를, 이/가, 은/는, 에/에서 등)를 올바르게 교정하세요.
4. 업무 용어 정규화: 동일한 의미의 업무 용어가 다양한 표기로 혼용된 경우 가장 일반적인 표준 표기로 통일하세요(예: 미팅→회의, 컨펌→확인, 피드백→의견).

출력 형식:
- 연속된 같은 화자의 발화는 합쳐서 "[화자 N] 내용" 형식으로 출력하세요.
- 타임스탬프는 제거하고, 다른 설명 없이 화자 구분된 대화문만 출력하세요.`
  );
}

// pyannote 세그먼트(음성 기반)와 Whisper 세그먼트(텍스트 기반)를 병합해 [화자 N] 포맷으로 반환.
// pyannote 서버 URL이 설정되지 않았거나 호출 실패 시 null을 반환 → 호출부에서 LLM fallback.
export async function convertToMonoViaServer(fileUri, mimeType) {
  const baseUrl = await getPyannoteUrl();
  if (!baseUrl) return null;

  try {
    const ext = (mimeType || 'audio/m4a').split('/')[1] || 'm4a';
    const formData = new FormData();
    formData.append('file', { uri: fileUri, type: mimeType, name: `audio.${ext}` });

    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/mono`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) return null;

    const blob = await res.blob();
    const base64 = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });

    const outputUri = `${FileSystem.cacheDirectory}mono_${Date.now()}.wav`;
    await FileSystem.writeAsStringAsync(outputUri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });
    return outputUri;
  } catch {
    return null;
  }
}

export async function diarizeWithPyannote(fileUri, mimeType, whisperSegments) {
  if (!whisperSegments?.length) return null;

  const baseUrl = await getPyannoteUrl();
  if (!baseUrl) return null;

  try {
    const ext = (mimeType || 'audio/m4a').split('/')[1] || 'm4a';
    const formData = new FormData();
    formData.append('file', { uri: fileUri, type: mimeType, name: `audio.${ext}` });

    const res = await fetch(`${baseUrl.replace(/\/$/, '')}/diarize`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) return null;

    const { segments: pySegs } = await res.json();
    if (!pySegs?.length) return null;

    const raw = buildTranscript(whisperSegments, pySegs);
    return polishTranscript(raw);
  } catch {
    return null;
  }
}

async function polishTranscript(text) {
  return askClaude(
    [{ role: 'user', content: text }],
    `[언어 규칙] 반드시 한국어로만 응답하세요.

다음은 화자가 이미 구분된 회의 텍스트입니다. 아래 3가지 교정 작업을 수행하세요.

1. 오타 수정: 음성 인식 과정에서 발생한 오타(잘못 인식된 단어, 붙여쓰기 오류 등)를 교정하세요.
2. 조사 수정: 문맥에 맞지 않는 조사(을/를, 이/가, 은/는, 에/에서 등)를 올바르게 교정하세요.
3. 업무 용어 정규화: 동일한 의미의 업무 용어가 다양한 표기로 혼용된 경우 가장 일반적인 표준 표기로 통일하세요(예: 미팅→회의, 컨펌→확인, 피드백→의견).

출력 형식:
- "[화자 N] 내용" 형식과 화자 구분은 그대로 유지하세요.
- 다른 설명 없이 교정된 대화문만 출력하세요.`
  );
}

function buildTranscript(whisperSegments, pyannoteSegments) {
  const speakerMap = {};
  let counter = 1;

  const labeled = whisperSegments.filter(isValidSegment).map((seg) => {
    let bestSpeaker = null;
    let bestOverlap = 0;
    for (const ps of pyannoteSegments) {
      const overlap = Math.max(0, Math.min(seg.end, ps.end) - Math.max(seg.start, ps.start));
      if (overlap > bestOverlap) {
        bestOverlap = overlap;
        bestSpeaker = ps.speaker;
      }
    }
    if (bestSpeaker && !speakerMap[bestSpeaker]) {
      speakerMap[bestSpeaker] = `화자 ${counter++}`;
    }
    return { text: seg.text || '', speakerKey: bestSpeaker ? speakerMap[bestSpeaker] : null };
  });

  // 겹침이 없는 세그먼트는 이전 화자로 채움
  for (let i = 0; i < labeled.length; i++) {
    if (!labeled[i].speakerKey) {
      labeled[i].speakerKey = (i > 0 ? labeled[i - 1].speakerKey : null) || '화자 1';
    }
  }

  // 연속된 같은 화자 발화를 합쳐 "[화자 N] ..." 포맷으로 출력
  const lines = [];
  let curSpeaker = null;
  let curText = '';
  for (const seg of labeled) {
    const text = seg.text.trim();
    if (!text) continue;
    if (seg.speakerKey !== curSpeaker) {
      if (curText) lines.push(`[${curSpeaker}] ${curText}`);
      curSpeaker = seg.speakerKey;
      curText = text;
    } else {
      curText += ' ' + text;
    }
  }
  if (curText) lines.push(`[${curSpeaker}] ${curText}`);

  return lines.join('\n');
}
