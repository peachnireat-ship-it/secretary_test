// 로컬 1회성 스크립트: "회사 계정" 시나리오 테스트 데이터 시드.
// 회사 1개("테스트 주식회사") + 부서 3개(영업팀/개발팀/마케팅팀) + 계정 4개(회사 관리자 1 + 부서 계정 3)를
// Supabase Auth + profiles + companies + departments + projects 테이블에 생성한다.
//
// 실행: node supabase/seed_company_departments.js
// 필요한 값: EXPO_PUBLIC_SUPABASE_URL(.env), SUPABASE_SERVICE_ROLE_KEY(.env.local)
// service-role key는 관리자 권한이므로 앱에 절대 포함되지 않는 이 스크립트 밖으로 나가면 안 된다.
//
// 주의: patch_company_department.sql이 먼저 Supabase SQL Editor에서 실행되어
// companies/departments 테이블과 profiles.company_id/department_id/is_company_admin 컬럼이
// 이미 존재해야 한다. 컬럼이 없는 상태에서 이 스크립트를 실행하면 upsert가 에러난다.

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

const COMPANY_NAME = '테스트 주식회사';
const DEPARTMENT_NAMES = ['영업팀', '개발팀', '마케팅팀'];

// 계정 4개: 회사 관리자 1명 + 부서 계정 3명 (legacyId는 storage.js ROSTER에 붙여넣을 때 사용)
const ACCOUNTS = [
  { legacyId: 'companyAdmin', email: 'company-admin@secretary.app', password: 'test1234', name: '회사 관리자', role: '대표', team: '경영지원팀', department: null, isCompanyAdmin: true },
  { legacyId: 'salesDept', email: 'sales-dept@secretary.app', password: 'test1234', name: '영업팀 계정', role: '팀원', team: '영업팀', department: '영업팀', isCompanyAdmin: false },
  { legacyId: 'devDept', email: 'dev-dept@secretary.app', password: 'test1234', name: '개발팀 계정', role: '팀원', team: '개발팀', department: '개발팀', isCompanyAdmin: false },
  { legacyId: 'marketingDept', email: 'marketing-dept@secretary.app', password: 'test1234', name: '마케팅팀 계정', role: '팀원', team: '마케팅팀', department: '마케팅팀', isCompanyAdmin: false },
];

// 부서별로 그럴듯한 한국어 프로젝트 1~2건
const DEPARTMENT_PROJECTS = {
  영업팀: [
    { title: '3분기 대형 거래처 계약 협상', status: '진행중', priority: '높음', progress: 45, deadline: '2026-09-30', notes: '주요 거래처 3곳과 계약 조건 협의 중' },
  ],
  개발팀: [
    { title: '사내 ERP 마이그레이션', status: '진행중', priority: '높음', progress: 60, deadline: '2026-10-15', notes: '레거시 ERP를 클라우드 기반으로 전환' },
    { title: '내부 API 인증 체계 개선', status: '위험', priority: '보통', progress: 30, deadline: '2026-08-20', notes: '토큰 만료 정책 재설계 필요' },
  ],
  마케팅팀: [
    { title: '신제품 런칭 캠페인', status: '진행중', priority: '높음', progress: 50, deadline: '2026-09-01', notes: 'SNS·오프라인 채널 동시 진행' },
  ],
};

async function upsertCompany() {
  const { data: existing, error: findErr } = await supabase.from('companies').select('id, name').eq('name', COMPANY_NAME).maybeSingle();
  if (findErr) throw findErr;
  if (existing) {
    console.log(`[skip] 회사 "${COMPANY_NAME}" 이미 존재 (id=${existing.id})`);
    return existing.id;
  }
  const { data: created, error: createErr } = await supabase.from('companies').insert({ name: COMPANY_NAME }).select('id').single();
  if (createErr) throw createErr;
  console.log(`[created] 회사 "${COMPANY_NAME}" -> ${created.id}`);
  return created.id;
}

async function upsertDepartments(companyId) {
  const map = {};
  for (const name of DEPARTMENT_NAMES) {
    const { data: existing, error: findErr } = await supabase.from('departments').select('id, name').eq('company_id', companyId).eq('name', name).maybeSingle();
    if (findErr) throw findErr;
    if (existing) {
      console.log(`[skip] 부서 "${name}" 이미 존재 (id=${existing.id})`);
      map[name] = existing.id;
      continue;
    }
    const { data: created, error: createErr } = await supabase.from('departments').insert({ company_id: companyId, name }).select('id').single();
    if (createErr) throw createErr;
    console.log(`[created] 부서 "${name}" -> ${created.id}`);
    map[name] = created.id;
  }
  return map;
}

async function main() {
  const companyId = await upsertCompany();
  const departmentMap = await upsertDepartments(companyId);

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

    const departmentId = acc.department ? departmentMap[acc.department] : null;

    const { error: profileErr } = await supabase.from('profiles').upsert({
      id: userId,
      email: acc.email,
      name: acc.name,
      role: acc.role,
      team: acc.team,
      company_id: companyId,
      department_id: departmentId,
      is_company_admin: acc.isCompanyAdmin,
    });
    if (profileErr) throw profileErr;

    // 부서 계정마다 프로젝트 1~2건 insert (회사 관리자는 프로젝트 없음)
    if (acc.department && DEPARTMENT_PROJECTS[acc.department]) {
      for (const proj of DEPARTMENT_PROJECTS[acc.department]) {
        const projectId = `${acc.legacyId}__${Date.now()}__${Math.floor(Math.random() * 10000)}`;
        const { error: projectErr } = await supabase.from('projects').insert({
          id: projectId,
          user_id: userId,
          title: proj.title,
          deadline: proj.deadline,
          status: proj.status,
          priority: proj.priority,
          progress: proj.progress,
          notes: proj.notes,
          created_at: Date.now(),
        });
        if (projectErr) throw projectErr;
        console.log(`  [project] ${acc.name} - "${proj.title}"`);
      }
    }

    roster.push({
      id: userId,
      legacyId: acc.legacyId,
      email: acc.email,
      name: acc.name,
      role: acc.role,
      team: acc.team,
    });
  }

  console.log('\n=== storage.js ROSTER에 붙여넣을 계정 (JS 배열) ===\n');
  console.log(JSON.stringify(roster, null, 2));
}

main().catch((err) => {
  console.error('seed 실패:', err);
  process.exit(1);
});
