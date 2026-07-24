-- secretary_test: AsyncStorage -> Supabase 마이그레이션 스키마
-- Supabase Dashboard > SQL Editor 에서 전체를 그대로 실행하세요.
--
-- id 컬럼은 uuid가 아니라 text다: MessageScreen.js가 "발신함 사본"/"수신함 사본"을 미리 생성한
-- id(Date.now() 기반 숫자 문자열)로 서로 연결(linkedReceivedId)하기 때문에, 클라이언트가 만든
-- id를 그대로 저장해야 한다. 다른 도메인도 동일한 client-supplied id 관례를 따르도록 통일했다.

-- ── companies (회사 계정 시나리오) ─────────────────────────
-- name unique 제약: 회사명 중복 생성을 막아 동명 가짜 회사로 관리자를 참칭하는 것을 방지한다.
-- 자세한 배경은 patch_company_name_unique.sql 참고. 대소문자는 구분한다(한계점 동일 문서 참고).
create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
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
  -- 다른 사용자의 거래처 검색(search_discoverable_profiles) 결과에 내 정보(id/name/email/team/role/
  -- contact)를 노출하고, 검색한 상대방이 별도 확인 없이 거래처로 즉시 추가할 수 있도록 허용할지
  -- 여부. 기본값 false(옵트인) — 사용자가 설정 화면에서 명시적으로 켜야만 노출된다. 자세한 배경은
  -- patch_profile_discoverable_search.sql, patch_search_discoverable_profiles_add_contact.sql 참고.
  discoverable boolean not null default false,
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

-- 보안 재감사(_review/secretary_test-20260723/02_security.md, 발견 #3) MEDIUM 취약점 수정.
-- 과거에는 profiles_select_same_company RLS(행 단위 정책)로 같은 회사 소속이면 동료 프로필을
-- 직접 select할 수 있게 했었다. RLS는 행 단위 통제만 가능해 email/contact/notes/work_topics 등
-- profiles 전체 컬럼이 노출되는 구조였다(UI가 필요한 컬럼만 select하는 것은 앱 레이어의 우연한
-- 제한일 뿐 DB 레벨 통제가 아니었음). 컬럼 단위 제한을 위해 SECURITY DEFINER 함수로 감싸
-- 안전한 컬럼만 반환하고, 전체 컬럼을 노출하던 정책은 제거한다(my_company_id()/my_is_company_admin()과
-- 동일한 이 프로젝트의 기존 컨벤션). 자세한 배경은 patch_profiles_colleagues_columns.sql 참고.
create or replace function get_company_colleagues()
returns table (
  id uuid,
  name text,
  role text,
  department_id uuid,
  is_company_admin boolean
)
language sql security definer stable
set search_path = public
as $$
  select p.id, p.name, p.role, p.department_id, p.is_company_admin
  from profiles p
  where my_company_id() is not null and p.company_id = my_company_id()
$$;
grant execute on function get_company_colleagues() to authenticated;

-- 설정 화면 "계정 전환" 목록을 ROSTER(하드코딩 테스트 계정)에서 DB의 모든 가입 계정으로
-- 확장하기 위한 조회 함수. get_company_colleagues()와 동일한 이유(RLS는 행 단위 통제만
-- 가능해 컬럼 단위 제한이 안 됨)로 SECURITY DEFINER 함수로 감싸 필요한 컬럼(id, name, email,
-- team, role)만 반환한다. 자세한 배경은 patch_get_all_accounts_for_switch.sql 참고.
create or replace function get_all_accounts_for_switch()
returns table (id uuid, name text, email text, team text, role text)
language sql security definer stable
set search_path = public
as $$
  select p.id, p.name, p.email, p.team, p.role from profiles p order by p.name
$$;
grant execute on function get_all_accounts_for_switch() to authenticated;

-- 거래처(clients) 추가 시 기존 가입 회원을 검색해 linked_profile_id로 연결할 수 있게 하는 함수.
-- get_company_colleagues()/get_all_accounts_for_switch()와 동일한 이유로 SECURITY DEFINER 함수로
-- 감싸 필요한 컬럼(id, name, email, team, role, contact)만 반환한다. discoverable=true(옵트인)로
-- 설정한 계정만 대상이며, 검색어 없이는 결과를 반환하지 않는다(전체 덤프 방지), 호출자 자신은 제외,
-- 최대 20건. contact(연락처)는 검색 결과 선택 시 거래처로 즉시 자동 추가되는 용도로 함께
-- 노출된다(옵트인 동의 범위 확장 — 자세한 배경은 patch_profile_discoverable_search.sql,
-- patch_search_discoverable_profiles_add_contact.sql 참고).
-- RETURNS TABLE의 OUT 컬럼 개수가 바뀌므로(5→6, contact 추가) create or replace만으로는
-- 반영되지 않는다(42P13 cannot change return type of existing function). 기존 DB에 이미
-- 5컬럼 버전이 있을 수 있으므로 먼저 명시적으로 drop한다.
drop function if exists search_discoverable_profiles(text);

create or replace function search_discoverable_profiles(p_query text)
returns table (id uuid, name text, email text, team text, role text, contact text)
language plpgsql security definer stable
set search_path = public
as $$
begin
  if p_query is null or btrim(p_query) = '' then
    raise exception '검색어를 입력해주세요.';
  end if;

  return query
    select p.id, p.name, p.email, p.team, p.role, p.contact
    from profiles p
    where p.discoverable = true
      and p.id <> auth.uid()
      and (
        p.name ilike '%' || btrim(p_query) || '%'
        or p.email ilike '%' || btrim(p_query) || '%'
        or p.team ilike '%' || btrim(p_query) || '%'
      )
    limit 20;
end;
$$;
grant execute on function search_discoverable_profiles(text) to authenticated;

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
  -- 이름 중복 사전 체크: companies_name_unique(unique 제약)가 최종 방어선이지만, 여기서
  -- 먼저 확인해야 사용자에게 친절한 한국어 에러 메시지를 줄 수 있다(그냥 두면 Postgres
  -- unique violation 에러 코드가 그대로 노출됨). 자세한 배경은 patch_company_name_unique.sql 참고.
  if exists (select 1 from companies where name = btrim(p_company_name)) then
    raise exception '이미 사용 중인 회사명입니다. 다른 이름을 사용하거나, 이미 있는 회사라면 회사직원으로 가입해 소속을 요청하세요.';
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
  v_recent_company_count integer;
begin
  if p_company_name is null or btrim(p_company_name) = '' then
    raise exception '회사명을 입력해주세요.';
  end if;
  v_dept := coalesce(nullif(btrim(p_department_name), ''), '미지정');

  select id into v_company_id from companies where name = btrim(p_company_name);
  if v_company_id is null then
    -- 보안 재감사(_review/secretary_test-20260723/02_security.md 발견 #6) MEDIUM 취약점 수정.
    -- 목록에 없는 회사명으로 반복 가입하면 companies/departments 행이 rate limit 없이 무제한
    -- 자동 생성될 수 있었다(리소스 고갈, companies_select_public으로 노출되는 회사 목록 UI 오염).
    -- 계정별 추적 컬럼이 없어 전역 카운터로 스코프를 좁힌다 — 신규 회사 "생성" 경로에만 건다.
    -- 이미 존재하는 회사에 합류하는 정상 케이스(위 select 성공 분기)는 이 체크와 무관하게 항상 허용.
    select count(*) into v_recent_company_count
      from companies where created_at > now() - interval '1 hour';
    if v_recent_company_count >= 20 then
      raise exception '신규 회사 등록 요청이 일시적으로 많습니다. 잠시 후 다시 시도하거나, 이미 등록된 회사라면 이름을 다시 확인해주세요.';
    end if;
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

-- ── client_ids 소유권 검증 (보안 재감사 _review/secretary_test-20260723/02_security.md #1) ──
-- schedules.client_ids / projects.client_ids(jsonb 배열, 각 원소는 clients.id 텍스트)는 RLS만으로는
-- 배열 내부 원소의 소유권을 검증할 수 없다(RLS는 행 자체의 user_id만 검사). 이 트리거로 INSERT/UPDATE
-- 시점에 client_ids 배열의 각 원소가 실제로 new.user_id 소유의 거래처인지 강제한다.
-- 자세한 배경은 supabase/patch_client_ids_ownership.sql 참고(이 함수는 그 파일과 동일한 정의다).
create or replace function validate_client_ids_ownership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id text;
begin
  if new.client_ids is null or jsonb_array_length(new.client_ids) = 0 then
    return new;
  end if;

  -- projects는 updateProjectAsCompanyAdmin()을 통해 회사 관리자가 다른 직원의 프로젝트(user_id가
  -- 자신이 아닌 행)를 수정할 수 있다 — 이 경우도 new.user_id(그 프로젝트의 실제 소유자) 기준으로
  -- 검증해야 하므로 트리거는 항상 new.user_id를 기준으로 판단한다(관리자가 남의 client_id를
  -- 끼워넣는 것도 함께 막아준다). security definer로 RLS를 우회해 이 판단이 오탐 없이 정확하도록 한다.
  for v_client_id in select jsonb_array_elements_text(new.client_ids)
  loop
    if not exists (select 1 from clients where id = v_client_id and user_id = new.user_id) then
      raise exception '존재하지 않거나 접근 권한이 없는 거래처(client_id=%)가 포함되어 있습니다.', v_client_id;
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_validate_schedule_client_ids on schedules;
create trigger trg_validate_schedule_client_ids
  before insert or update on schedules
  for each row execute function validate_client_ids_ownership();

drop trigger if exists trg_validate_project_client_ids on projects;
create trigger trg_validate_project_client_ids
  before insert or update on projects
  for each row execute function validate_client_ids_ownership();
