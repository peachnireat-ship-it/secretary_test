import { getApiKey } from './storage';

export async function transcribeAudio(fileUri, mimeType = 'audio/m4a') {
  const apiKey = await getApiKey();
  if (!apiKey) throw new Error('API_KEY_MISSING');

  const ext = mimeType.split('/')[1] || 'm4a';
  const formData = new FormData();
  formData.append('file', { uri: fileUri, type: mimeType, name: `audio.${ext}` });
  const PROMPT = '한국어 회의 녹음입니다. 모든 내용을 한국어로 변환하세요. 고유명사, 브랜드명, 전문용어도 한국어 발음으로 표기하세요.';
  formData.append('model', 'whisper-large-v3');
  formData.append('language', 'ko');
  formData.append('response_format', 'text');
  formData.append('prompt', PROMPT);
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

  const raw = (await res.text()).trim();
  return raw.startsWith(PROMPT) ? raw.slice(PROMPT.length).trim() : raw;
}
