import { getApiKey } from './storage';

export async function transcribeAudio(fileUri, mimeType = 'audio/m4a') {
  const apiKey = await getApiKey();
  if (!apiKey) throw new Error('API_KEY_MISSING');

  const ext = mimeType.split('/')[1] || 'm4a';
  const formData = new FormData();
  formData.append('file', { uri: fileUri, type: mimeType, name: `audio.${ext}` });
  formData.append('model', 'whisper-large-v3');
  formData.append('language', 'ko');
  formData.append('response_format', 'verbose_json');
  formData.append('prompt', '한국어 회의 녹음입니다. 모든 내용을 한국어로 변환하세요. 고유명사, 브랜드명, 전문용어도 한국어 발음으로 표기하세요.');
  formData.append('temperature', '0');
  formData.append('diarize', 'true');

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
  return formatWithSpeakers(data);
}

function formatWithSpeakers(data) {
  const segments = data.segments;
  if (!segments?.length) return (data.text || '').trim();

  const hasSpeakers = segments.some((s) => s.speaker != null);
  if (!hasSpeakers) return (data.text || '').trim();

  const speakerMap = {};
  let speakerCount = 0;
  const lines = [];
  let currentSpeaker = null;
  let currentText = '';

  for (const seg of segments) {
    const rawSpeaker = seg.speaker ?? 'UNKNOWN';
    if (!(rawSpeaker in speakerMap)) {
      speakerMap[rawSpeaker] = `화자 ${++speakerCount}`;
    }
    const speaker = speakerMap[rawSpeaker];
    const text = seg.text.trim();
    if (!text) continue;

    if (speaker === currentSpeaker) {
      currentText += ' ' + text;
    } else {
      if (currentSpeaker !== null) lines.push(`[${currentSpeaker}] ${currentText}`);
      currentSpeaker = speaker;
      currentText = text;
    }
  }
  if (currentSpeaker !== null) lines.push(`[${currentSpeaker}] ${currentText}`);

  return lines.join('\n');
}
