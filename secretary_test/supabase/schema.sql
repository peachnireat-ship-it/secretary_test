-- secretary_test: AsyncStorage -> Supabase 마이그레이션 스키마
-- Supabase Dashboard > SQL Editor 에서 전체를 그대로 실행하세요.
--
-- id 컬럼은 uuid가 아니라 text다: MessageScreen.js가 "발신함 사본"/"수신함 사본"을 미리 생성한
-- id(Date.now() 기반 숫자 문자열)로 서로 연결(linkedReceivedId)하기 때문에, 클라이언트가 만든
-- id를 그대로 저장해야 한다. 다른 도메인도 동일한 client-supplied id 관례를 따르도록 통일했다.

-- ── companies (회사 계정 시나리오) ─────────────────────────
create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- ── departments (회사 소속 부서) ───────────────────────────
create table if not exists departments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

-- ── profiles ─────────────────────────────────────────────
-- auth.users(Supabase Auth)에 없는 name/role/team 등 앱 전용 필드를 보관.
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null,
  role text not null,
  team text not null,
  contact text not null default '',
  notes text not null default '',
  work_topics text not null default '',
  legacy_data_migrated boolean not null default false,
  company_id uuid references companies(id) on delete set null,
  department_id uuid references departments(id) on delete set null,
  is_company_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- ── schedules ────────────────────────────────────────────
create table if not exists schedules (
  id text primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  date text,
  time text,
  title text not null,
  tag text,
  notes text not null default '',
  client_ids jsonb not null default '[]',
  start_date text,
  end_date text,
  created_at bigint not null
);
create index if not exists schedules_user_date_idx on schedules(user_id, date);

-- ── clients ──────────────────────────────────────────────
create table if not exists clients (
  id text primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  company text not null,
  role text not null default '',
  contact text not null,
  work_contact text not null default '',
  notes text not null default '',
  ai_summary text not null default '',
  created_at bigint not null
);

-- ── histories (거래처 히스토리) ───────────────────────────
create table if not exists histories (
  id text primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  client_id text references clients(id) on delete cascade,
  date text,
  type text,
  title text not null,
  content text not null default '',
  result text not null default '',
  created_at bigint not null
);
create index if not exists histories_client_idx on histories(client_id);

-- ── projects ─────────────────────────────────────────────
create table if not exists projects (
  id text primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  deadline text,
  start_date text,
  status text not null default '진행중',
  priority text not null default '보통',
  notes text not null default '',
  progress int not null default 0,
  client_ids jsonb not null default '[]',
  meeting_record_ids jsonb not null default '[]',
  created_at bigint not null,
  updated_at bigint
);

-- ── meeting_records ──────────────────────────────────────
create table if not exists meeting_records (
  id text primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  transcript text not null default '',
  summary text not null default '',
  source text,
  client_ids jsonb not null default '[]',
  project_id text references projects(id) on delete set null,
  tasks jsonb not null default '[]',
  diarize_source text, -- 화자 분리 방식: 'pyannote' | 'ai' | null(과거 데이터/수동 입력)
  created_at bigint not null
);
create index if not exists meeting_records_project_idx on meeting_records(project_id);

-- ── client_favorites (다대다 join) ───────────────────────
create table if not exists client_favorites (
  user_id uuid not null references profiles(id) on delete cascade,
  client_id text not null references clients(id) on delete cascade,
  primary key (user_id, client_id)
);

-- ── messages (교차 계정 배달 시뮬레이션) ─────────────────
-- mailbox_owner_id: 이 행이 "누구의 메일함"에 있는지 (조회 기준)
-- sender_id: 실제로 이 메세지를 작성/발송한 인증된 유저 (RLS insert/update 기준)
-- to_id: 비즈니스 상의 수신 대상 (mailbox_owner_id와 별개로 표시용으로 유지)
create table if not exists messages (
  id text primary key,
  mailbox_owner_id uuid not null references profiles(id) on delete cascade,
  sender_id uuid not null references profiles(id) on delete cascade,
  to_id uuid references profiles(id),
  direction text not null,
  sender text not null default '',
  company text not null default '',
  subject text not null default '',
  content text not null default '',
  priority text not null default '일반',
  status text not null default '미확인',
  linked_received_id text,
  edit_history jsonb not null default '[]',
  created_at bigint not null,
  updated_at bigint
);
create index if not exists messages_mailbox_idx on messages(mailbox_owner_id);

-- ── RLS 활성화 ────────────────────────────────────────────
alter table companies enable row level security;
alter table departments enable row level security;
alter table profiles enable row level security;
alter table schedules enable row level security;
alter table clients enable row level security;
alter table histories enable row level security;
alter table projects enable row level security;
alter table meeting_records enable row level security;
alter table client_favorites enable row level security;
alter table messages enable row level security;

-- ── RLS 무한 재귀 방지 헬퍼 함수 (SECURITY DEFINER) ────────
-- profiles를 정책 내부에서 직접 서브쿼리하면 profiles 자신의 RLS와 재귀할 위험이 있어
-- SECURITY DEFINER 함수로 우회한다. 자세한 배경은 patch_company_department.sql 참고.
create or replace function my_company_id() returns uuid
language sql security definer stable
set search_path = public
as $$ select company_id from profiles where id = auth.uid() $$;

create or replace function my_is_company_admin() returns boolean
language sql security definer stable
set search_path = public
as $$ select coalesce(is_company_admin, false) from profiles where id = auth.uid() $$;

-- ── companies / departments 정책: 같은 회사 소속만 조회 ────
create policy companies_select_same_company on companies
  for select using (id = my_company_id());

-- 회원가입 화면(회사직원)에서 미로그인/미소속 상태로도 회사 목록을 봐야 하므로 공개 조회도 허용한다.
-- 위 companies_select_same_company와는 permissive 정책이라 OR로 합쳐져 충돌 없다.
create policy companies_select_public on companies
  for select using (true);

create policy departments_select_same_company on departments
  for select using (company_id = my_company_id());

-- ── profiles 정책: 본인만 조회/수정 ───────────────────────
create policy profiles_select_own on profiles
  for select using (id = auth.uid());
create policy profiles_update_own on profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_insert_own on profiles
  for insert with check (id = auth.uid());

-- profiles_update_own은 row 단위 정책이라 컬럼 단위 제한이 불가능하다. 일반 사용자가
-- is_company_admin/company_id/department_id를 직접 update()로 바꿔 셀프 승격하는 것을
-- BEFORE UPDATE 트리거로 막는다(자세한 배경은 patch_company_department.sql 참고).
-- app.bypass_privilege_trigger 예외는 회원가입 RPC(signup_create_company_as_admin /
-- signup_join_company_as_employee) 내부에서만 통제된 경로로 켜진다(patch_signup_company_role.sql 참고).
create or replace function prevent_privileged_profile_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role'
     or current_setting('app.bypass_privilege_trigger', true) = 'true' then
    return new;
  end if;
  if new.is_company_admin is distinct from old.is_company_admin
     or new.company_id is distinct from old.company_id
     or new.department_id is distinct from old.department_id then
    new.is_company_admin := old.is_company_admin;
    new.company_id := old.company_id;
    new.department_id := old.department_id;
  end if;
  return new;
end;
$$;

create trigger trg_prevent_privileged_profile_self_update
before update on profiles
for each row execute function prevent_privileged_profile_self_update();

-- 같은 회사 소속이면 동료 프로필(이름/부서)을 조회할 수 있다 (회사 관리자 화면용)
create policy profiles_select_same_company on profiles
  for select using (company_id is not null and company_id = my_company_id());

-- ── 회원가입 RPC: 회사관리자/회사직원 선택 가입(LoginScreen.js) ──────
-- 안전 불변식: signup_create_company_as_admin은 항상 새로 insert한 회사 id만 사용하므로
-- 기존 회사의 관리자로 셀프 승격 불가능. signup_join_company_as_employee는 is_company_admin을
-- 항상 false로만 설정하므로 이 경로로 관리자 권한 취득 불가능. 자세한 배경은
-- patch_signup_company_role.sql 참고.
create or replace function signup_create_company_as_admin(p_company_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
begin
  if p_company_name is null or btrim(p_company_name) = '' then
    raise exception '회사명을 입력해주세요.';
  end if;
  insert into companies (name) values (btrim(p_company_name)) returning id into v_company_id;
  perform set_config('app.bypass_privilege_trigger', 'true', true);
  update profiles
    set company_id = v_company_id, department_id = null, is_company_admin = true
    where id = auth.uid();
end;
$$;
grant execute on function signup_create_company_as_admin(text) to authenticated;

create or replace function signup_join_company_as_employee(p_company_name text, p_department_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_department_id uuid;
  v_dept text;
begin
  if p_company_name is null or btrim(p_company_name) = '' then
    raise exception '회사명을 입력해주세요.';
  end if;
  v_dept := coalesce(nullif(btrim(p_department_name), ''), '미지정');

  select id into v_company_id from companies where name = btrim(p_company_name);
  if v_company_id is null then
    insert into companies (name) values (btrim(p_company_name)) returning id into v_company_id;
  end if;

  select id into v_department_id from departments where company_id = v_company_id and name = v_dept;
  if v_department_id is null then
    insert into departments (company_id, name) values (v_company_id, v_dept) returning id into v_department_id;
  end if;

  perform set_config('app.bypass_privilege_trigger', 'true', true);
  update profiles
    set company_id = v_company_id, department_id = v_department_id, is_company_admin = false
    where id = auth.uid();
end;
$$;
grant execute on function signup_join_company_as_employee(text, text) to authenticated;

-- ── user_id = auth.uid() 공통 정책 (schedules/clients/histories/projects/meeting_records) ──
create policy schedules_all_own on schedules
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy clients_all_own on clients
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy histories_all_own on histories
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy projects_all_own on projects
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 회사 관리자는 같은 회사 소속 전체 프로젝트를 select/update/delete할 수 있다
-- (insert는 제외 — 남의 이름으로 새 프로젝트를 만드는 것은 범위 밖)
create policy projects_select_company_admin on projects
  for select using (
    my_is_company_admin()
    and exists (select 1 from profiles p where p.id = projects.user_id and p.company_id = my_company_id())
  );

create policy projects_update_company_admin on projects
  for update using (
    my_is_company_admin()
    and exists (select 1 from profiles p where p.id = projects.user_id and p.company_id = my_company_id())
  ) with check (
    my_is_company_admin()
    and exists (select 1 from profiles p where p.id = projects.user_id and p.company_id = my_company_id())
  );

create policy projects_delete_company_admin on projects
  for delete using (
    my_is_company_admin()
    and exists (select 1 from profiles p where p.id = projects.user_id and p.company_id = my_company_id())
  );

create policy meeting_records_all_own on meeting_records
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy client_favorites_all_own on client_favorites
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── messages 정책 (교차 계정 배달 특수 케이스) ────────────
create policy messages_select_own_mailbox on messages
  for select using (mailbox_owner_id = auth.uid());

-- sender_id = auth.uid(): 실제 발신자로서 남의 메일함에 배달(addMessageForUser)
-- mailbox_owner_id = auth.uid(): 과거 로컬 샘플 데이터처럼 fromId가 실제 발신자가 아니어도,
-- 자기 자신의 메일함에 넣는 것은 안전하므로 허용(마이그레이션에서 필요)
create policy messages_insert_as_sender on messages
  for insert with check (sender_id = auth.uid() or mailbox_owner_id = auth.uid());

create policy messages_update_own_mailbox_or_sender on messages
  for update
  using (mailbox_owner_id = auth.uid() or sender_id = auth.uid())
  with check (mailbox_owner_id = auth.uid() or sender_id = auth.uid());

create policy messages_delete_own_mailbox on messages
  for delete using (mailbox_owner_id = auth.uid());
