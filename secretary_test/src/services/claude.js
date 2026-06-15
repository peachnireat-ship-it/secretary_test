import { getApiKey, getGrokApiKey, getAiProvider } from './storage';

const GROQ_MODEL = 'llama-3.3-70b-versatile';
const GROK_MODEL = 'grok-3';

async function callGroq(messages, systemPrompt, apiKey) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `API 오류 (${res.status})`);
  }
  const data = await res.json();
  return data.choices[0].message.content;
}

async function callGrok(messages, systemPrompt, apiKey) {
  const res = await fetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: GROK_MODEL,
      messages: [
        { role: 'system', content: systemPrompt },
        ...messages,
      ],
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `API 오류 (${res.status})`);
  }
  const data = await res.json();
  return data.choices[0].message.content;
}

// 한자(CJK 통합한자·확장·호환), 히라가나, 가타카나 제거
function stripNonKorean(text) {
  return text.replace(
    /[぀-ヿ㐀-䶿一-鿿豈-﫿\u{20000}-\u{2A6DF}\u{2A700}-\u{2CEAF}\u{2CEB0}-\u{2EBEF}]/gu,
    ''
  );
}

export async function askClaude(messages, systemPrompt) {
  const provider = await getAiProvider();
  let result;
  if (provider === 'grok') {
    const apiKey = await getGrokApiKey();
    if (!apiKey) throw new Error('API_KEY_MISSING');
    result = await callGrok(messages, systemPrompt, apiKey);
  } else {
    const apiKey = await getApiKey();
    if (!apiKey) throw new Error('API_KEY_MISSING');
    result = await callGroq(messages, systemPrompt, apiKey);
  }
  return stripNonKorean(result);
}

export function buildScheduleSystem(schedules) {
  const list = schedules
    .map((s) => `- [${s.date} ${s.time}] ${s.title} (${s.tag})${s.notes ? ': ' + s.notes : ''}`)
    .join('\n');

  return `당신은 개인 비서 앱의 일정 관리 AI 비서입니다. 사용자의 일정 데이터를 기반으로 도움을 줍니다.

현재 등록된 일정:
${list || '(등록된 일정 없음)'}

오늘 날짜: ${new Date().toISOString().split('T')[0]}

다음 작업을 수행할 수 있습니다:
1. 일정 조회 및 요약
2. 자연어로 새 일정 생성 — JSON 응답: {"action":"create_schedule","data":{"date":"YYYY-MM-DD","time":"HH:MM","title":"...","tag":"...","notes":"..."}}
3. 일정 충돌 감지
4. 일정 관련 조언 및 우선순위 제안

새 일정 생성 요청이 아니라면 자연스러운 한국어로만 응답하세요. JSON을 섞지 마세요.

[언어 규칙] 반드시 한국어(한글)로만 작성하세요. 영어 문장도 사용하지 마세요. 한자(漢字), 중국어 간체·번체, 일본어 히라가나·가타카나는 절대 사용하지 마세요.`;
}

export function buildClientSystem(clients, histories) {
  const clientList = clients
    .map((c) => {
      const cHistory = histories
        .filter((h) => h.clientId === c.id)
        .sort((a, b) => b.createdAt - a.createdAt);
      const lastContact = cHistory[0]?.date || '기록 없음';
      return `## ${c.company} — ${c.name} (${c.role})\n연락처: ${c.contact}\n메모: ${c.notes}\n마지막 연락: ${lastContact}\n히스토리:\n${cHistory.map((h) => `  - [${h.date}] ${h.type}: ${h.title} → 결과: ${h.result}`).join('\n') || '  (없음)'}`;
    })
    .join('\n\n');

  return `[언어 규칙 - 최우선] 반드시 한국어(한글)로만 응답하세요. 영어 문장도 사용하지 마세요. 회사명·인명 등 고유명사에만 예외적으로 영어를 쓸 수 있습니다. 한자(漢字), 중국어 간체·번체, 일본어 히라가나·가타카나는 절대 사용 금지입니다.

당신은 개인 비서 앱의 거래처 관계 관리 AI 비서입니다.

등록된 거래처 및 히스토리:
${clientList || '(등록된 거래처 없음)'}

오늘 날짜: ${new Date().toISOString().split('T')[0]}

다음 작업을 수행할 수 있습니다:
1. 특정 거래처와의 관계 및 히스토리 요약
2. 마지막 연락/미팅 일자 조회
3. 후속 조치 및 다음 스텝 제안
4. 거래처 관계 분석 및 전략적 조언

모든 응답은 자연스러운 한국어로만 작성하세요. 한자·일본어·영어 문장은 절대 사용하지 마세요.`;
}
