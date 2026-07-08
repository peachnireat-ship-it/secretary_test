// 로컬 1회성 스크립트: Supabase Auth에 6개 테스트 계정을 생성하고 profiles row를 삽입한다.
// 실행: node supabase/seed.js
// 필요한 값: EXPO_PUBLIC_SUPABASE_URL(.env), SUPABASE_SERVICE_ROLE_KEY(.env.local)
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

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('EXPO_PUBLIC_SUPABASE_URL(.env) / SUPABASE_SERVICE_ROLE_KEY(.env.local)를 먼저 채워주세요.');
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// storage.js TEST_ACCOUNTS와 동일한 6개 계정 (비밀번호는 기존과 동일하게 유지)
const ACCOUNTS = [
  { legacyId: 'test', email: 'test@secretary.app', password: 'test1234', name: '테스트 계정', role: 'tester', team: '개발팀' },
  { legacyId: 'admin', email: 'admin@secretary.app', password: 'admin1234', name: '관리자', role: 'admin', team: '운영팀' },
  { legacyId: 'kmj', email: 'kmj@secretary.app', password: 'test1234', name: '김민준', role: '구매팀장', team: '삼성물산' },
  { legacyId: 'lsy', email: 'lsy@secretary.app', password: 'test1234', name: '이서연', role: '기획팀 과장', team: '현대건설' },
  { legacyId: 'pjh', email: 'pjh@secretary.app', password: 'test1234', name: '박지훈', role: '영업이사', team: 'LG전자' },
  { legacyId: 'csa', email: 'csa@secretary.app', password: 'test1234', name: '최수아', role: '마케팅 팀장', team: 'SK텔레콤' },
];

async function main() {
  const roster = [];

  for (const acc of ACCOUNTS) {
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email: acc.email,
      password: acc.password,
      email_confirm: true,
    });

    let userId;
    if (createErr) {
      if (createErr.message && createErr.message.includes('already been registered')) {
        const { data: list, error: listErr } = await supabase.auth.admin.listUsers();
        if (listErr) throw listErr;
        const existing = list.users.find((u) => u.email === acc.email);
        if (!existing) throw new Error(`${acc.email} 계정을 찾을 수 없습니다.`);
        userId = existing.id;
        console.log(`[skip] ${acc.email} 이미 존재 (id=${userId})`);
      } else {
        throw createErr;
      }
    } else {
      userId = created.user.id;
      console.log(`[created] ${acc.email} -> ${userId}`);
    }

    const { error: profileErr } = await supabase.from('profiles').upsert({
      id: userId,
      email: acc.email,
      name: acc.name,
      role: acc.role,
      team: acc.team,
    });
    if (profileErr) throw profileErr;

    roster.push({ id: userId, legacyId: acc.legacyId, email: acc.email, name: acc.name, role: acc.role, team: acc.team });
  }

  console.log('\n=== storage.js에 붙여넣을 로스터 (JS 배열) ===\n');
  console.log(JSON.stringify(roster, null, 2));
}

main().catch((err) => {
  console.error('seed 실패:', err);
  process.exit(1);
});
