import { getApiKey } from './storage';
import { askClaude } from './claude';

export async function transcribeAudio(fileUri, mimeType = 'audio/m4a') {
  const apiKey = await getApiKey();
  if (!apiKey) throw new Error('API_KEY_MISSING');

  const ext = mimeType.split('/')[1] || 'm4a';
  const formData = new FormData();
  formData.append('file', { uri: fileUri, type: mimeType, name: `audio.${ext}` });
  formData.append('model', 'whisper-large-v3');
  formData.append('language', 'ko');
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

export async function diarizeSegments(segments) {
  if (!segments?.length) return '';

  const input = segments
    .map((s) => `[${formatSec(s.start)}-${formatSec(s.end)}] ${(s.text || '').trim()}`)
    .filter((l) => l)
    .join('\n');

  return askClaude(
    [{ role: 'user', content: input }],
    `[언어 규칙] 반드시 한국어로만 응답하세요.

다음은 회의 음성을 타임스탬프별로 변환한 텍스트입니다. 대화 흐름, 질문/답변 패턴, 내용의 연속성을 분석하여 화자를 구분하세요.

연속된 같은 화자의 발화는 합쳐서 "[화자 N] 내용" 형식으로 출력하세요.
타임스탬프는 제거하고, 다른 설명 없이 화자 구분된 대화문만 출력하세요.`
  );
}
