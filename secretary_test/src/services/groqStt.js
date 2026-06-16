import { getApiKey } from './storage';

export async function transcribeAudio(fileUri, mimeType = 'audio/m4a') {
  const apiKey = await getApiKey();
  if (!apiKey) throw new Error('API_KEY_MISSING');

  const ext = mimeType.split('/')[1] || 'm4a';
  const formData = new FormData();
  formData.append('file', { uri: fileUri, type: mimeType, name: `audio.${ext}` });
  formData.append('model', 'whisper-large-v3');
  formData.append('language', 'ko');
  formData.append('response_format', 'text');

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `API 오류 (${res.status})`);
  }

  return (await res.text()).trim();
}
