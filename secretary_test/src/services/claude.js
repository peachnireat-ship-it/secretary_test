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

// 한국어 조사 선택: 앞 글자 받침 유무에 따라 과/와 반환
export function josa과와(word) {
  const last = word[word.length - 1];
  const code = last?.charCodeAt(0);
  if (code >= 0xAC00 && code <= 0xD7A3) {
    return (code - 0xAC00) % 28 !== 0 ? '과' : '와';
  }
  return '와';
}

// 한국어, 공백(\s), 숫자(0-9), 기본 문장부호(.?!,)를 제외한 모든 것을 제거
function stripNonKorean(text) {
  return text.replace(/[^\p{Script=Hangul}\s0-9.?!,\[\]]/gu, '');
}

export async function askClaude(messages, systemPrompt, { raw = false } = {}) {
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
  return raw ? result : stripNonKorean(result);
}

export function buildScheduleSystem(schedules) {
  const list = schedules
    .map((s) => `- [${s.date} ${s.time}] ${s.title} (${s.tag})${s.notes ? ': ' + s.notes : ''}`)
    .join('\n');

  return `[언어 규칙 - 최우선] 반드시 한국어(한글)로만 응답하세요. 영어 문장·한자(漢字)·중국어·일본어 히라가나·가타카나는 절대 사용 금지입니다.

당신은 개인 비서 앱의 일정 관리 AI 비서입니다. 사용자의 일정 데이터를 기반으로 간결하고 실용적인 도움을 줍니다.

오늘 날짜: ${new Date().toISOString().split('T')[0]}

현재 등록된 일정:
${list || '(등록된 일정 없음)'}

## 응답 규칙
- 일반 질문·조회·조언: 자연스러운 한국어 텍스트로만 응답하세요. JSON을 절대 포함하지 마세요.
- 새 일정 생성 요청일 때만: 아래 JSON 형식 한 줄만 출력하세요.
  {"action":"create_schedule","data":{"date":"YYYY-MM-DD","time":"HH:MM","title":"...","tag":"업무|개인|미팅|기타","notes":"..."}}

## 할 수 있는 작업
- 일정 조회 및 요약 (오늘, 이번 주, 특정 날짜 등)
- 일정 충돌 감지 및 경고
- 자연어로 새 일정 등록
- 일정 우선순위 제안 및 시간 관리 조언`;
}

export function buildProjectDelaySystem(projects, schedules) {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  const projectLines = projects.map((p) => {
    const deadline = new Date(p.deadline);
    const diffDays = Math.round((deadline - today) / 86400000);
    const daysLabel = diffDays > 0 ? `마감 ${diffDays}일 후` : diffDays === 0 ? '오늘 마감' : `마감 ${Math.abs(diffDays)}일 초과`;
    const isAtRisk = p.status !== '완료' && p.status !== '취소' && (diffDays <= 7 && p.progress < 80);
    const riskFlag = isAtRisk ? ' ⚠️ 위험' : '';
    return `- [${p.status}${riskFlag}] ${p.title} | 우선순위: ${p.priority} | 진행률: ${p.progress}% | 마감: ${p.deadline} (${daysLabel}) | 메모: ${p.notes || '없음'}`;
  }).join('\n');

  const delayedCount = projects.filter((p) => p.status === '지연' || p.status === '위험').length;
  const overdueCount = projects.filter((p) => {
    const diffDays = Math.round((new Date(p.deadline) - today) / 86400000);
    return p.status !== '완료' && p.status !== '취소' && diffDays < 0;
  }).length;

  return `[언어 규칙 - 최우선] 반드시 한국어(한글)로만 응답하세요. 영어 문장도 사용하지 마세요. 한자(漢字), 중국어 간체·번체, 일본어 히라가나·가타카나는 절대 사용 금지입니다.

당신은 프로젝트 지연 분석 전문 AI 비서입니다. 사용자의 프로젝트 현황을 분석하여 지연 원인을 파악하고 구체적인 개선 방안을 제시합니다.

오늘 날짜: ${todayStr}

프로젝트 현황 (총 ${projects.length}건 / 지연·위험 ${delayedCount}건 / 마감 초과 ${overdueCount}건):
${projectLines || '(등록된 프로젝트 없음)'}

다음을 수행할 수 있습니다:
1. 전체 지연 원인 패턴 분석 (메모·상태·진행률 기반)
2. 우선 조치가 필요한 프로젝트 식별 및 순서 제안
3. 마감 위험 프로젝트의 회복 계획 수립
4. 반복 지연 패턴 및 근본 원인 진단
5. 프로젝트 상태 업데이트 — JSON: {"action":"update_project","id":"...","changes":{"status":"...","progress":...}}

분석 요청 시 반드시 다음 항목을 포함하세요:
- 지연 원인 분류 (자원 부족 / 의사결정 지연 / 외부 의존 / 범위 변경 / 커뮤니케이션 문제 등)
- 긴급도 순위
- 단기(이번 주) · 중기(이번 달) 개선 액션 플랜

모든 응답은 자연스러운 한국어로만 작성하세요.`;
}

export function buildTaskExtractionSystem() {
  return `[언어 규칙] 반드시 한국어로만 응답하세요. 한자·일본어·영어 문장은 절대 사용하지 마세요.

회의 스크립트에서 실행 가능한 태스크(할 일)를 추출하세요.

결과는 반드시 아래 JSON 배열 형식으로만 출력하세요. 다른 텍스트는 절대 포함하지 마세요.

[
  {"assignee": "담당자 이름 (없으면 '미지정')", "content": "태스크 내용", "deadline": "YYYY-MM-DD 또는 '미정'", "priority": "높음|보통|낮음"}
]

태스크가 없으면 빈 배열 []을 출력하세요.`;
}

export async function fixForeignWordsInText(text) {
  const provider = await getAiProvider();
  const systemPrompt = `[언어 규칙] 반드시 한국어로만 응답하세요.

주어진 텍스트에서 문맥에 맞지 않는 외국어(영어, 일본어, 한자 등)를 자연스러운 한국어로 수정하세요.

규칙:
- [화자 N] 형식의 화자 표시, ## 제목, 줄바꿈 등 텍스트 구조는 절대 변경하지 마세요
- 고유명사(사람 이름, 회사명, 제품명, 기술명)는 변경하지 마세요
- 문맥상 자연스러운 외래어(인터넷, 컴퓨터, 이메일 등)는 그대로 두세요
- 수정이 필요 없으면 원문을 그대로 반환하세요
- 수정된 전체 텍스트만 출력하세요. 설명이나 추가 텍스트는 쓰지 마세요`;

  if (provider === 'grok') {
    const apiKey = await getGrokApiKey();
    if (!apiKey) throw new Error('API_KEY_MISSING');
    return (await callGrok([{ role: 'user', content: text }], systemPrompt, apiKey)).trim();
  } else {
    const apiKey = await getApiKey();
    if (!apiKey) throw new Error('API_KEY_MISSING');
    return (await callGroq([{ role: 'user', content: text }], systemPrompt, apiKey)).trim();
  }
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
