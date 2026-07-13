// 로컬 1회성 스크립트: stripNonKorean이 영문 회사명(LG전자, SK텔레콤 등)의 알파벳을
// 낱개로 지워버려 깨진 채로 저장된 clients.ai_summary를 찾아 재생성한다.
// (ClientScreen.js의 fetchClientSummary가 raw:true + fixForeignWordsInText로 수정된 것과
// 동일한 방식으로 다시 생성해 덮어쓴다.)
// 실행: node supabase/fix_client_ai_summary.js
// 필요한 값: EXPO_PUBLIC_SUPABASE_URL(.env), SUPABASE_SERVICE_ROLE_KEY(.env.local), EXPO_PUBLIC_GROQ_API_KEY(.env)
// service-role key는 관리자 권한이므로 앱에 절대 포함되지 않는 이 스크립트 밖으로 나가면 안 된다.

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

function loadEnvFile(filename) {
  const filePath = path.join(__dirname, '..', filename);
  if (!fs.existsSync(filePath)) return;
  const lines = fs.readFileSync(filePath, 'utf8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    const value = trimmed.slice(eq + 1).trim();
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnvFile('.env.local');
loadEnvFile('.env');

const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GROQ_API_KEY = process.env.EXPO_PUBLIC_GROQ_API_KEY;
const GROQ_MODEL = 'llama-3.3-70b-versatile';

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !GROQ_API_KEY) {
  console.error('EXPO_PUBLIC_SUPABASE_URL(.env) / SUPABASE_SERVICE_ROLE_KEY(.env.local) / EXPO_PUBLIC_GROQ_API_KEY(.env)를 먼저 채워주세요.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── src/services/claude.js에서 그대로 옮겨온 로직 (RN 의존성 없이 재사용하기 위해 복제) ──

async function callGroq(messages, systemPrompt) {
  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [{ role: 'system', content: systemPrompt }, ...messages],
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err?.error?.message || `API 오류 (${res.status})`);
  }
  const data = await res.json();
  return data.choices[0].message.content;
}

function josa과와(word) {
  const last = word[word.length - 1];
  const code = last?.charCodeAt(0);
  if (code >= 0xAC00 && code <= 0xD7A3) {
    return (code - 0xAC00) % 28 !== 0 ? '과' : '와';
  }
  return '와';
}

function normalizeAIDates(text) {
  if (!text) return text;
  return text.replace(/(\d{4})[-./](\d{2})[-./](\d{2})/g, '$1년 $2월 $3일');
}

function fmtDate(dateStr) {
  if (!dateStr) return '기록 없음';
  const [y, m, d] = dateStr.split('-');
  return `${y}년 ${m}월 ${d}일`;
}

function tokenizeContact(contact) {
  return contact ? '[연락처 등록됨]' : '[연락처 없음]';
}

function buildClientSystem(clients, histories) {
  const clientList = clients
    .map((c) => {
      const cHistory = histories
        .filter((h) => h.clientId === c.id)
        .sort((a, b) => b.createdAt - a.createdAt);
      const lastContact = cHistory[0]?.date ? fmtDate(cHistory[0].date) : '기록 없음';
      return `## ${c.company} — ${c.name} (${c.role})\n연락처: ${tokenizeContact(c.contact)}\n메모: ${c.notes}\n마지막 연락: ${lastContact}\n히스토리:\n${cHistory.map((h) => `  - [${fmtDate(h.date)}] ${h.type}: ${h.title} → 결과: ${h.result}`).join('\n') || '  (없음)'}`;
    })
    .join('\n\n');

  const today = new Date();
  const todayLabel = `${today.getFullYear()}년 ${String(today.getMonth() + 1).padStart(2, '0')}월 ${String(today.getDate()).padStart(2, '0')}일`;

  return `[언어 규칙 - 최우선] 반드시 한국어(한글)로만 응답하세요. 영어 문장도 사용하지 마세요. 회사명·인명 등 고유명사에만 예외적으로 영어를 쓸 수 있습니다. 한자(漢字), 중국어 간체·번체, 일본어 히라가나·가타카나는 절대 사용 금지입니다.

당신은 개인 비서 앱의 거래처 관계 관리 AI 비서입니다.

등록된 거래처 및 히스토리:
${clientList || '(등록된 거래처 없음)'}

오늘 날짜: ${todayLabel}

다음 작업을 수행할 수 있습니다:
1. 특정 거래처와의 관계 및 히스토리 요약
2. 마지막 연락/미팅 일자 조회
3. 후속 조치 및 다음 스텝 제안
4. 거래처 관계 분석 및 전략적 조언

모든 응답은 자연스러운 한국어로만 작성하세요. 한자·일본어·영어 문장은 절대 사용하지 마세요.
날짜를 언급할 때는 반드시 'yyyy년 mm월 dd일' 형식으로 표기하세요 (예: 2024년 01월 15일). YYYY-MM-DD, YYYY.MM.DD, YYYYMMDD 등 다른 형식은 절대 사용하지 마세요.`;
}

async function fixForeignWordsInText(text) {
  const systemPrompt = `[언어 규칙] 반드시 한국어로만 응답하세요.

주어진 텍스트에서 문맥에 맞지 않는 외국어(영어, 일본어, 한자 등)를 자연스러운 한국어로 수정하세요.

규칙:
- [화자 N] 형식의 화자 표시, ## 제목, 줄바꿈 등 텍스트 구조는 절대 변경하지 마세요
- 고유명사(사람 이름, 회사명, 제품명, 기술명)는 변경하지 마세요
- 문맥상 자연스러운 외래어(인터넷, 컴퓨터, 이메일 등)는 그대로 두세요
- 수정이 필요 없으면 원문을 그대로 반환하세요
- 수정된 전체 텍스트만 출력하세요. 설명이나 추가 텍스트는 쓰지 마세요`;
  return (await callGroq([{ role: 'user', content: text }], systemPrompt)).trim();
}

async function regenerateSummary(client, histories) {
  const clientHistList = histories.filter((h) => h.clientId === client.id);
  const systemPrompt = buildClientSystem([client], clientHistList);
  const lastWord = client.role?.trim() || client.name;
  const particle = josa과와(lastWord);
  const nameWithRole = client.role?.trim() ? `${client.name} ${client.role}` : client.name;
  const reply = await callGroq(
    [{ role: 'user', content: `${client.company} ${nameWithRole}${particle}의 관계를 3~4문장으로 자연스럽게 요약해줘. 마지막 연락 날짜, 현재 상황, 다음 필요한 액션을 포함해줘. 반드시 한국어로만 작성해줘.` }],
    systemPrompt
  );
  let fixed = reply;
  try {
    fixed = await fixForeignWordsInText(reply);
  } catch {
    // 교정 실패 시 원본 응답 사용
  }
  return normalizeAIDates(fixed);
}

// clients/histories 테이블 컬럼(snake_case) -> 함수 내부에서 쓰는 camelCase로 변환
function fromRow(row) {
  return {
    id: row.id,
    name: row.name,
    company: row.company,
    role: row.role,
    contact: row.contact,
    notes: row.notes,
  };
}

function historyFromRow(row) {
  return {
    id: row.id,
    clientId: row.client_id,
    date: row.date,
    type: row.type,
    title: row.title,
    result: row.result,
    createdAt: row.created_at,
  };
}

async function main() {
  const { data: clientRows, error: clientErr } = await supabase.from('clients').select('*');
  if (clientErr) throw clientErr;

  const { data: historyRows, error: historyErr } = await supabase.from('histories').select('*');
  if (historyErr) throw historyErr;

  const allHistories = historyRows.map(historyFromRow);

  // 영문이 섞인 회사명/이름을 가진 거래처 중 이미 요약이 저장된 것만 대상 (LG전자, SK텔레콤 등)
  const hasLatin = (s) => /[A-Za-z]/.test(s || '');
  const targets = clientRows.filter((r) => (hasLatin(r.company) || hasLatin(r.name)) && r.ai_summary);

  if (targets.length === 0) {
    console.log('대상 없음 — 영문이 섞인 회사명/이름을 가진 거래처 중 저장된 요약이 없습니다.');
    return;
  }

  console.log(`대상 ${targets.length}건:`);
  targets.forEach((r) => console.log(`  - [${r.company}] ${r.name} (user_id=${r.user_id})`));
  console.log('');

  for (const row of targets) {
    const client = fromRow(row);
    try {
      const newSummary = await regenerateSummary(client, allHistories);
      const { error: updateErr } = await supabase
        .from('clients')
        .update({ ai_summary: newSummary })
        .eq('id', row.id);
      if (updateErr) throw updateErr;
      console.log(`[완료] ${row.company} ${row.name}\n  이전: ${row.ai_summary}\n  이후: ${newSummary}\n`);
    } catch (e) {
      console.error(`[실패] ${row.company} ${row.name}: ${e.message}`);
    }
  }
}

main().catch((err) => {
  console.error('스크립트 실패:', err);
  process.exit(1);
});
