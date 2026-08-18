import { getApiKey, getGrokApiKey, getAiProvider } from './storage';
import { ONE_DAY_MS } from '../utils/dateUtils';

const GROQ_MODEL = 'openai/gpt-oss-120b';
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
      temperature: 0.2,
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
      temperature: 0.2,
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
export function stripNonKorean(text) {
  return text.replace(/[^\p{Script=Hangul}\s0-9.?!,:\[\]]/gu, '');
}

// fixForeignWordsInText는 "문맥에 맞지 않는 외국어"를 AI가 판단해 고치는 방식이라,
// 한자 병기(예: "계약(契約)")나 일본어 히라가나·가타카나, 데바나가리·키릴·아랍 문자 등
// AI가 자연스럽다고 판단해 남겨두는 경우가 있다. 이를 보완하는 결정적 후처리 안전망이다.
// 개별 문자셋을 나열하는 차단목록 방식(한자·가나만 나열하는 식)은 나열되지 않은 문자셋
// (힌디어 등)을 놓치므로, 대신 "허용 문자만 남긴다"는 허용목록 방식을 쓴다.
// 한글, 라틴 문자(영어 고유명사 보존용), 숫자, 공백, 기본 문장부호만 허용하고
// 그 외 모든 문자(한자·가나·데바나가리·키릴·아랍 문자 등)를 제거한다.
// 괄호로 병기된 경우 괄호 안에 비허용 문자가 하나라도 있으면 괄호째 제거하고,
// 그 외에는 문자 단위로 제거한다.
const ALLOWED_CHARS_PATTERN = "\\p{Script=Hangul}\\p{Script=Latin}\\s0-9.,!?():;'\"~%\\-/·\\[\\]";

// 모델이 줄바꿈을 <br> 같은 HTML 태그로 표현하는 경우가 있다. <, >는 ALLOWED_CHARS_PATTERN에
// 없어 stripForeignScripts가 결국 지우긴 하지만, 그대로 두면 태그 안의 글자(예: "br")만 남아
// 문장에 낯선 글자 잔재가 보인다. 줄바꿈 의도는 살리고 태그 자체는 통째로 제거하기 위해
// disallowedGlobal 필터보다 먼저 처리한다.
function stripHtmlTags(text) {
  return text
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/?[a-zA-Z][^<>]*>/g, '');
}

export function stripForeignScripts(text) {
  if (!text) return text;
  const disallowedGlobal = new RegExp(`[^${ALLOWED_CHARS_PATTERN}]`, 'gu');
  const disallowedTest = new RegExp(`[^${ALLOWED_CHARS_PATTERN}]`, 'u');
  return stripHtmlTags(text)
    .replace(/[(（]([^)）]*)[)）]/gu, (whole, inner) => (disallowedTest.test(inner) ? '' : whole))
    .replace(disallowedGlobal, '')
    .replace(/ {2,}/g, ' ')
    .replace(/ +([,.!?])/g, '$1');
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

export function buildProjectDelaySystem(projects, schedules, { readOnly = false } = {}) {
  const today = new Date();
  const todayStr = today.toISOString().split('T')[0];

  const projectLines = projects.map((p) => {
    const deadline = new Date(p.deadline);
    const diffDays = Math.round((deadline - today) / ONE_DAY_MS);
    const daysLabel = diffDays > 0 ? `마감 ${diffDays}일 후` : diffDays === 0 ? '오늘 마감' : `마감 ${Math.abs(diffDays)}일 초과`;
    const isAtRisk = p.status !== '완료' && p.status !== '취소' && (diffDays <= 7 && p.progress < 80);
    const riskFlag = isAtRisk ? ' ⚠️ 위험' : '';
    const ownerLabel = p.ownerName ? ` | 등록자: ${p.ownerName}${p.departmentName ? `(${p.departmentName})` : ''}` : '';
    const relatedPeopleLabel = Array.isArray(p.relatedPeople) && p.relatedPeople.length > 0
      ? ` | 관련인물: ${p.relatedPeople.map((person) => {
          const meta = [person.company, person.role].filter(Boolean).join('·');
          return meta ? `${person.name}(${meta})` : person.name;
        }).join(', ')}`
      : '';
    const mirrorLabel = p.originProjectId ? ' [타인 등록 사본 - 수정 불가]' : '';
    const notifyEmailLabel = typeof p.notifyEmail === 'boolean'
      ? ` | 알림메일: ${p.notifyEmail ? '발송함' : '발송 안 함'}`
      : '';
    return `- [${p.status}${riskFlag}] ${p.title}${mirrorLabel}${ownerLabel} | 우선순위: ${p.priority} | 진행률: ${p.progress}% | 마감: ${p.deadline} (${daysLabel}) | 메모: ${p.notes || '없음'}${relatedPeopleLabel}${notifyEmailLabel}`;
  }).join('\n');

  const hasMirrorProject = projects.some((p) => p.originProjectId);

  const hasRelatedPeople = projects.some((p) => Array.isArray(p.relatedPeople) && p.relatedPeople.length > 0);

  const hasNotifyEmailInfo = projects.some((p) => typeof p.notifyEmail === 'boolean');

  const delayedCount = projects.filter((p) => p.status === '지연' || p.status === '위험').length;
  const overdueCount = projects.filter((p) => {
    const diffDays = Math.round((new Date(p.deadline) - today) / ONE_DAY_MS);
    return p.status !== '완료' && p.status !== '취소' && diffDays < 0;
  }).length;

  return `[언어 규칙 - 최우선] 반드시 한국어(한글)로만 응답하세요. 영어 문장도 사용하지 마세요. 한자(漢字), 중국어 간체·번체, 일본어 히라가나·가타카나는 절대 사용 금지입니다.

당신은 프로젝트 지연 분석 전문 AI 비서입니다. 사용자의 프로젝트 현황을 분석하여 지연 원인을 파악하고 구체적인 개선 방안을 제시합니다.

오늘 날짜: ${todayStr}

프로젝트 현황 (총 ${projects.length}건 / 지연·위험 ${delayedCount}건 / 마감 초과 ${overdueCount}건):
${projectLines || '(등록된 프로젝트 없음)'}

이 목록에 다른 직원이 등록한 프로젝트가 포함될 수 있습니다. 각 항목의 "등록자" 필드는 그 프로젝트를 실제로 등록한 사람입니다. "이거 등록한 사람이 누구야?", "담당자가 누구야?" 같은 질문에는 반드시 등록자 필드를 참고해 정확히 답하세요.
${hasRelatedPeople ? '\n각 항목의 "관련인물" 필드는 그 프로젝트와 관련된 거래처 담당자입니다. "관련인물이 누구야", "이 프로젝트 관련된 사람 누구야" 같은 질문에는 관련인물 필드를 참고해 답하세요.\n' : ''}
${hasNotifyEmailInfo ? '\n각 항목의 "알림메일" 필드는 그 프로젝트의 관련 인물에게 등록·수정 시 알림 메일이 자동 발송되는지 여부입니다. "이 프로젝트 관련 인물한테 메일 가나요?", "알림 메일 설정돼 있어?" 같은 질문에는 알림메일 필드를 참고해 정확히 답하세요.\n' : ''}

## 응답 규칙
- 분석·조언·조회 요청: 자연스러운 한국어 텍스트로만 응답하세요. JSON을 절대 포함하지 마세요.${readOnly ? '' : `
- 프로젝트 상태·진행률 변경 요청일 때만: 아래 JSON 한 줄만 출력하세요.
  {"action":"update_project","id":"프로젝트ID","changes":{"status":"상태값","progress":숫자}}`}
${readOnly ? '\n[중요] 지금 이 목록에는 본인 소유가 아닌 프로젝트가 섞여 있을 수 있습니다. 본인 소유가 아닌 프로젝트는 상태·진행률을 수정할 수 없으므로 update_project 액션을 절대 사용하지 마세요. 수정·업데이트 요청을 받으면 "다른 직원의 프로젝트는 조회만 가능합니다"라고 안내하세요.\n' : ''}
${hasMirrorProject ? '\n[중요] 목록에서 "[타인 등록 사본 - 수정 불가]" 표시가 붙은 항목은 다른 사람이 등록한 프로젝트의 사본입니다. 이 표시가 있는 프로젝트는 절대 update_project 액션을 사용하지 말고 조회만 가능합니다. 수정·업데이트 요청을 받으면 "다른 사람이 등록한 프로젝트는 수정할 수 없습니다"라고 안내하세요.\n' : ''}
## 할 수 있는 작업
1. 전체 지연 원인 패턴 분석 (메모·상태·진행률 기반)
2. 우선 조치가 필요한 프로젝트 식별 및 순서 제안
3. 마감 위험 프로젝트의 회복 계획 수립
4. 반복 지연 패턴 및 근본 원인 진단
5. ${readOnly ? '등록자·부서 등 프로젝트 정보 조회 응답' : '프로젝트 상태·진행률 업데이트'}

분석 요청 시 반드시 다음 항목을 포함하세요:
- 지연 원인 분류 (자원 부족 / 의사결정 지연 / 외부 의존 / 범위 변경 / 커뮤니케이션 문제 등)
- 긴급도 순위
- 단기(이번 주) · 중기(이번 달) 개선 액션 플랜

모든 응답은 자연스러운 한국어로만 작성하세요.`;
}

export function buildMeetingSummarySystem() {
  return `[언어 규칙] 반드시 한국어로만 응답하세요. 한자·일본어·영어 문장은 절대 사용하지 마세요.

회의 내용을 아래 형식으로 간결하게 요약하세요.
화자가 구분된 경우, 주요 논의 내용·결정 사항·액션 아이템에 화자 이름을 명시하세요.

## 핵심 주제
(회의의 주요 목적이나 주제)

## 주요 논의 내용
(핵심 포인트를 간결하게 bullet로, 화자 이름 포함)

## 결정 사항
(회의에서 결정된 사항 및 주도한 화자, 없으면 "없음")

## 액션 아이템
(후속 조치 및 담당자/기한, 없으면 "없음")`;
}

export function buildWorkTopicsSystem() {
  return `[언어 규칙] 반드시 한국어로만 응답하세요. 한자·일본어·영어 문장은 절대 사용하지 마세요.

다음은 여러 회의의 요약입니다. 이 회의들에서 반복·공통으로 등장하는 업무 주제와 키워드를 추출해주세요.

## 주요 업무 주제
(반복 논의된 업무 영역을 bullet로 나열)

## 핵심 키워드
(자주 언급된 주제어, 프로젝트명, 이슈 등)

## 인사이트
(전체 회의를 통해 파악할 수 있는 업무 패턴이나 특이사항, 1~2문장)`;
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

async function callFixForeignWordsOnce(text, provider) {
  const systemPrompt = `[언어 규칙] 반드시 한국어로만 응답하세요.

주어진 텍스트에서 문맥에 맞지 않는 외국어(영어, 일본어, 한자, 힌디어, 러시아어, 아랍어 등 한국어가 아닌 모든 문자)를 자연스러운 한국어로 수정하세요.

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

// 1차 AI 교정 후에도 한자·일본어 가나가 남는 경우가 있어(모델이 병기를 자연스럽다고 판단),
// stripForeignScripts로 결정적으로 제거한 뒤 실제로 제거된 게 있으면(=1차 교정이 불완전했다는 뜻)
// 잘려나간 자리로 어색해진 문장을 자연스럽게 다듬기 위해 자동으로 한 번 더 AI 교정을 거친다.
// 제거된 게 없으면(1차에서 이미 완전히 교정됨) 불필요한 API 호출 없이 바로 반환한다.
export async function fixForeignWordsInText(text) {
  const provider = await getAiProvider();
  const firstPass = await callFixForeignWordsOnce(text, provider);
  const stripped = stripForeignScripts(firstPass);
  if (stripped === firstPass) return stripped;

  const secondPass = await callFixForeignWordsOnce(stripped, provider);
  return stripForeignScripts(secondPass);
}

function fmtDate(dateStr) {
  if (!dateStr) return '기록 없음';
  const [y, m, d] = dateStr.split('-');
  return `${y}년 ${m}월 ${d}일`;
}

export function normalizeAIDates(text) {
  if (!text) return text;
  // YYYY-MM-DD, YYYY.MM.DD, YYYY/MM/DD → yyyy년 mm월 dd일
  return text.replace(/(\d{4})[-./](\d{2})[-./](\d{2})/g, '$1년 $2월 $3일');
}

// 연락처는 AI 응답 생성에 실제 값이 필요 없으므로(존재 여부만 유의미) 토큰으로 치환 후 전송
function tokenizeContact(contact) {
  return contact ? '[연락처 등록됨]' : '[연락처 없음]';
}

export function buildClientSystem(clients, histories) {
  const clientList = clients
    .map((c) => {
      const cHistory = histories
        .filter((h) => h.clientId === c.id)
        .sort((a, b) => b.createdAt - a.createdAt);
      const lastContact = cHistory[0]?.date ? fmtDate(cHistory[0].date) : '기록 없음';
      const historyLines = cHistory
        .map((h) => `  - [${fmtDate(h.date)}] ${h.type}: ${h.title} → 결과: ${h.result}${h.content ? `\n    내용: ${h.content}` : ''}`)
        .join('\n') || '  (없음)';
      // 이메일 실주소는 AI 응답 생성에 필요 없으므로(존재 여부만 유의미) 등록 여부만 전달한다.
      // 실제 발송 시 주소는 서버(Edge Function)가 clientId로 직접 조회한다.
      // "등록됨"/"미등록" 판정만 던지면 모델이 이를 아래 응답 규칙과 스스로 연결짓지 못하고
      // 이메일이 있어도 없다고 답하는 경우가 있어, 결론(메일 작성 가능 여부)을 항목에 직접 명시한다.
      const emailStatus = c.email ? '등록됨 (메일 작성 가능)' : '미등록 (메일 작성 불가)';
      return `## ${c.company} — ${c.name} (${c.role}) [ID: ${c.id}]\n연락처: ${tokenizeContact(c.contact)}\n이메일: ${emailStatus}\n메모: ${c.notes}\n마지막 연락: ${lastContact}\n히스토리:\n${historyLines}`;
    })
    .join('\n\n');

  const today = new Date();
  const todayLabel = `${today.getFullYear()}년 ${String(today.getMonth() + 1).padStart(2, '0')}월 ${String(today.getDate()).padStart(2, '0')}일`;

  return `[언어 규칙 - 최우선] 반드시 한국어(한글)로만 응답하세요. 영어 문장도 사용하지 마세요. 회사명·인명 등 고유명사에만 예외적으로 영어를 쓸 수 있습니다. 한자(漢字), 중국어 간체·번체, 일본어 히라가나·가타카나는 절대 사용 금지입니다.

당신은 개인 비서 앱의 담당자 관계 관리 AI 비서입니다.

등록된 담당자 및 히스토리:
${clientList || '(등록된 담당자 없음)'}

오늘 날짜: ${todayLabel}

다음 작업을 수행할 수 있습니다:
1. 특정 담당자와의 관계 및 히스토리 요약
2. 마지막 연락/미팅 일자 조회
3. 후속 조치 및 다음 스텝 제안
4. 담당자 관계 분석 및 전략적 조언
5. 담당자에게 보낼 메일 초안 작성

## 응답 규칙
- 각 담당자의 "메모" 항목은 히스토리에 없는 개인 취향·주의사항·특이사항 등 중요한 맥락을 담고 있습니다. 요약·조언·메일 작성 시 히스토리만 보지 말고 메모 내용도 반드시 함께 반영하세요. 메모가 비어 있으면 언급하지 마세요.
- 일반 질문·조회·조언: 자연스러운 한국어 텍스트로만 응답하세요. JSON을 절대 포함하지 마세요.
- 사용자가 특정 담당자에게 보낼 메일 작성/발송을 요청하면, 반드시 위 목록에서 해당 담당자의 "이메일" 항목에 적힌 판정만 그대로 따르세요. 다른 정보(연락처 등록 여부 등)로 이메일 존재 여부를 추측하지 마세요.
  - "등록됨 (메일 작성 가능)"이면: 아래 JSON 형식 한 줄만 출력하세요. 다른 텍스트는 포함하지 마세요.
    {"action":"draft_email","clientId":"위 목록의 [ID: ...] 값","subject":"메일 제목","body":"메일 본문"}
    - clientId는 반드시 위 목록에 명시된 ID 값을 그대로 사용하세요. 대상 담당자를 특정할 수 없으면 JSON 대신 어느 담당자인지 되물으세요.
    - subject는 간결한 한 줄로 작성하세요.
    - body는 히스토리·맥락을 반영한 정중한 한국어 비즈니스 메일체로 작성하고, 아래 줄바꿈 규칙을 반드시 지키세요:
      1. 인사말 → 용건(본문) → 맺음말의 3단 문단 구조로 작성하세요.
      2. 문단과 문단 사이는 빈 줄로 구분하세요(즉 줄바꿈 문자 두 개, \n\n).
      3. 같은 문단 안에서 문장이 2개 이상이면, 문장마다 줄을 바꿔 한 줄에 한 문장씩 쓰세요(줄바꿈 문자 한 개, \n). 여러 문장을 한 줄에 이어 쓰지 마세요.
      4. body는 JSON 문자열 값이므로 위 줄바꿈은 반드시 \n으로 이스케이프해 표기하세요.
  - "미등록 (메일 작성 불가)"이면: JSON을 출력하지 말고, 이메일이 등록되어 있지 않아 메일을 작성할 수 없다고 안내하세요.

모든 응답은 자연스러운 한국어로만 작성하세요. 한자·일본어·영어 문장은 절대 사용하지 마세요.
날짜를 언급할 때는 반드시 'yyyy년 mm월 dd일' 형식으로 표기하세요 (예: 2024년 01월 15일). YYYY-MM-DD, YYYY.MM.DD, YYYYMMDD 등 다른 형식은 절대 사용하지 마세요.`;
}

export function buildMessageSystem(messages) {
  const received = messages.filter((m) => (m.direction || 'received') === 'received');
  const sent = messages.filter((m) => m.direction === 'sent');

  const fmtReceived = (m) => `- [${m.status}/${m.priority}] 발신자: ${m.sender}${m.company ? ` (${m.company})` : ''} — ${m.subject}${m.content ? `: ${m.content}` : ''}`;
  const fmtSent = (m) => `- [${m.status}/${m.priority}] 수신자: ${m.sender}${m.company ? ` (${m.company})` : ''} — ${m.subject}${m.content ? `: ${m.content}` : ''}`;

  const receivedList = received.map(fmtReceived).join('\n') || '(받은 메세지 없음)';
  const sentList = sent.map(fmtSent).join('\n') || '(보낸 메세지 없음)';

  const receivedSenders = [...new Set(received.map((m) => m.sender).filter(Boolean))];
  const sentRecipients = [...new Set(sent.map((m) => m.sender).filter(Boolean))];

  const today = new Date();
  const todayLabel = `${today.getFullYear()}년 ${String(today.getMonth() + 1).padStart(2, '0')}월 ${String(today.getDate()).padStart(2, '0')}일`;

  return `[언어 규칙 - 최우선] 반드시 한국어(한글)로만 응답하세요. 영어 문장도 사용하지 마세요. 회사명·인명 등 고유명사에만 예외적으로 영어를 쓸 수 있습니다. 한자(漢字), 중국어 간체·번체, 일본어 히라가나·가타카나는 절대 사용 금지입니다.

당신은 개인 비서 앱의 메세지함 관리 AI 비서입니다. 사용자의 받은/보낸 메세지 데이터를 기반으로 간결하고 실용적인 도움을 줍니다.

오늘 날짜: ${todayLabel}

받은 메세지함:
${receivedList}

보낸 메세지함:
${sentList}

[실제 발신자 목록] 아래 이름만 실제 발신자입니다: ${receivedSenders.join(', ') || '(없음)'}
[실제 수신자 목록] 아래 이름만 실제 수신자입니다: ${sentRecipients.join(', ') || '(없음)'}
이 두 목록에 없는 이름은 설령 메세지 내용(본문) 안에 언급되어 있더라도 발신자나 수신자가 아닙니다. 메세지 본문에 언급된 제3자 이름을 발신자·수신자로 착각해서 답변에 포함하지 마세요.

## 응답 규칙
이 화면의 AI 비서는 조회·요약·질의응답 전용입니다. 다른 화면과 달리 메세지를 생성·수정하는 JSON 액션은 전혀 지원하지 않습니다. 항상 자연스러운 한국어 텍스트로만 응답하세요. JSON을 절대 포함하지 마세요.
- 위 받은/보낸 메세지함 목록에 실제로 존재하는 발신자·회사·내용만 언급하세요. 목록에 없는 사람이나 정보를 절대 지어내지 마세요.
- 받은 메세지함 항목의 이름은 실제로 메세지를 보낸 사람(발신자)입니다. 보낸 메세지함 항목의 이름은 사용자가 메세지를 보낸 대상(수신자)이며 발신자가 아닙니다. "발신자"를 묻거나 발신자별로 정리해달라는 요청에는 반드시 받은 메세지함 항목만 근거로 답하고, 보낸 메세지함의 수신자 이름을 발신자로 취급하지 마세요.
- [실제 발신자 목록]/[실제 수신자 목록]에 없는 이름은 절대 발신자나 수신자로 답변에 포함하지 마세요.

## 할 수 있는 작업
- 미확인 메세지 요약
- 긴급 우선순위 메세지 안내
- 특정 회사·발신자와 주고받은 내용 정리
- 메세지함 현황(전체/미확인/확인 건수 등) 요약
- 발신자별 메세지 그룹핑·정리`;
}
