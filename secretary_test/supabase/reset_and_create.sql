-- 기존 테이블을 완전히 제거하고(타입이 잘못된 profiles 포함) 스키마를 처음부터 다시 만든다.
-- SQL Editor에서 이 파일 전체를 한 번에 실행하세요.

drop table if exists messages cascade;
drop table if exists client_favorites cascade;
drop table if exists meeting_records cascade;
drop table if exists histories cascade;
drop table if exists projects cascade;
drop table if exists clients cascade;
drop table if exists schedules cascade;
drop table if exists profiles cascade;
drop table if exists departments cascade;
drop table if exists companies cascade;

-- ── companies (회사 계정 시나리오) ─────────────────────────
create table companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- ── departments (회사 소속 부서) ───────────────────────────
create table departments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

-- ── profiles ─────────────────────────────────────────────
create table profiles (
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
create table schedules (
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
create index schedules_user_date_idx on schedules(user_id, date);

-- ── clients ──────────────────────────────────────────────
create table clients (
  id text primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  company text not null,
  role text not null default '',
  contact text not null,
  work_contact text not null default '',
  notes text not null default '',
  created_at bigint not null
);

-- ── histories (거래처 히스토리) ───────────────────────────
create table histories (
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
create index histories_client_idx on histories(client_id);

-- ── projects ─────────────────────────────────────────────
create table projects (
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
create table meeting_records (
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
create index meeting_records_project_idx on meeting_records(project_id);

-- ── client_favorites (다대다 join) ───────────────────────
create table client_favorites (
  user_id uuid not null references profiles(id) on delete cascade,
  client_id text not null references clients(id) on delete cascade,
  primary key (user_id, client_id)
);

-- ── messages (교차 계정 배달 시뮬레이션) ─────────────────
create table messages (
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
create index messages_mailbox_idx on messages(mailbox_owner_id);

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
create or replace function my_company_id() returns uuid
language sql security definer stable
set search_path = public
as $$ select company_id from profiles where id = auth.uid() $$;

create or replace function my_is_company_admin() returns boolean
language sql security definer stable
set search_path = public
as $$ select coalesce(is_company_admin, false) from profiles where id = auth.uid() $$;

create policy companies_select_same_company on companies
  for select using (id = my_company_id());

-- 회원가입 화면(회사직원)에서 미로그인/미소속 상태로도 회사 목록을 봐야 하므로 공개 조회도 허용한다.
-- 위 companies_select_same_company와는 permissive 정책이라 OR로 합쳐져 충돌 없다.
create policy companies_select_public on companies
  for select using (true);

create policy departments_select_same_company on departments
  for select using (company_id = my_company_id());

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

create policy schedules_all_own on schedules
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy clients_all_own on clients
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy histories_all_own on histories
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy projects_all_own on projects
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

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

create policy messages_select_own_mailbox on messages
  for select using (mailbox_owner_id = auth.uid());

create policy messages_insert_as_sender on messages
  for insert with check (sender_id = auth.uid() or mailbox_owner_id = auth.uid());

create policy messages_update_own_mailbox_or_sender on messages
  for update
  using (mailbox_owner_id = auth.uid() or sender_id = auth.uid())
  with check (mailbox_owner_id = auth.uid() or sender_id = auth.uid());

create policy messages_delete_own_mailbox on messages
  for delete using (mailbox_owner_id = auth.uid());
