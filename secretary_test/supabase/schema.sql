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
-- parent_department_id: 상위 부서(트리 구조, 깊이 제한 없음). on delete restrict로 하위 부서가
-- 있는 부서는 삭제 자체가 DB 레벨에서 막힌다(delete_department() 함수도 더 친절한 한국어
-- 에러 메시지를 위해 동일한 검증을 먼저 함). 자세한 배경은 patch_department_hierarchy.sql 참고.
create table if not exists departments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  parent_department_id uuid references departments(id) on delete restrict,
  created_at timestamptz not null default now()
);
alter table departments add column if not exists parent_department_id uuid references departments(id) on delete restrict;
create index if not exists departments_parent_idx on departments(parent_department_id);

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
  -- 다른 사용자의 담당자 검색(search_discoverable_profiles) 결과에 내 정보(id/name/email/team/role/
  -- contact)를 노출하고, 검색한 상대방이 별도 확인 없이 담당자로 즉시 추가할 수 있도록 허용할지
  -- 여부. 기본값 false(옵트인) — 사용자가 설정 화면에서 명시적으로 켜야만 노출된다. 자세한 배경은
  -- patch_profile_discoverable_search.sql, patch_search_discoverable_profiles_add_contact.sql 참고.
  discoverable boolean not null default false,
  -- 상호 등록된 담당자(clients.linked_profile_id 상호 연결)와 내 히스토리(histories)를 공유할지
  -- 여부. 기본값 false(옵트인) — 대칭 조건이라 내가 켜도 "내 히스토리를 상대방에게 보여줄지"만
  -- 결정할 뿐, 상대방의 히스토리를 내가 볼 수 있는지는 상대방의 이 컬럼 값이 따로 결정한다.
  -- 자세한 배경은 patch_mutual_client_history.sql 참고.
  share_mutual_history boolean not null default false,
  created_at timestamptz not null default now()
);

-- ── profile_department_public (profiles.department_id의 공개 조회용 미러) ──
-- profiles 테이블은 RLS로 타인의 department_id를 볼 수 없어서, 담당자 관리 화면에서 상대방의
-- 최신 부서를 실시간으로 알 수 있는 방법이 없었다. 이 표를 공개(permissive) RLS로 별도로 두고
-- profiles.department_id 변경 시 트리거(sync_profile_department_public, 아래 assign_employee_department
-- 근처에 정의)로 동기화하면, 이미 공개된 departments 테이블과 조합해 부서 배정 여부를
-- privacy-safe하게 노출하면서 Supabase Realtime 구독 대상으로 쓸 수 있다.
-- 부서명 자체는 중복 저장하지 않는다(이미 공개된 departments 테이블에서 별도 조회) — 부서명
-- 변경 시 동기화 부담을 없애기 위함. company_id도 필요 없다(회사명은 clients.company 텍스트 그대로 사용).
create table if not exists profile_department_public (
  profile_id uuid primary key references profiles(id) on delete cascade,
  department_id uuid references departments(id) on delete set null,
  updated_at timestamptz not null default now()
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
  notify_email boolean not null default true,
  -- 관련 인물 중 앱에 가입된 계정(clients.linked_profile_id)에게 자동으로 만들어준 사본이면
  -- 원본 일정을 가리킨다. 원본 삭제 시 사본도 함께 삭제된다(on delete cascade). 사본 관리는
  -- sync_schedule_mirrors() RPC가 담당한다 — 함수 정의는 patch_schedule_mirror.sql 참고
  -- (notify_schedule_created/updated와 마찬가지로 schema.sql에는 컬럼만 반영하고 함수 본문은
  -- patch 파일에만 둔다).
  origin_schedule_id text references schedules(id) on delete cascade,
  created_at bigint not null
);
-- schedules 테이블이 이 컬럼 추가 이전에 이미 생성되어 있었다면 위 create table은 no-op이라
-- 컬럼이 실제로는 없을 수 있다(42703 원인). alter로 한 번 더 명시적으로 보장한다(멱등).
alter table schedules add column if not exists origin_schedule_id text references schedules(id) on delete cascade;
create index if not exists schedules_user_date_idx on schedules(user_id, date);
create index if not exists schedules_origin_idx on schedules(origin_schedule_id);

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
  -- 이 clients row가 실제로 어떤 profiles.id(가입 회원)를 가리키는지. get_mutual_client_history()가
  -- 상호 등록 여부 판정에 사용한다. 자세한 배경은 patch_clients_linked_profile.sql 참고.
  linked_profile_id uuid references profiles(id),
  created_at bigint not null
);

-- ── topics (담당자별 업무 토픽) ───────────────────────────
-- 히스토리를 업무 토픽 단위로 묶기 위한 엔티티. 상호 등록된 담당자 관계에서는 A/B 각자 자신의
-- client row 아래에 토픽을 만들며(사용자가 직접 입력, AI 자동 분류 아님), shared를 켜면 그
-- 토픽에 속한 자신의 히스토리 전부가 상대방에게 공개 후보가 된다(단, 히스토리 개별
-- shared_with_mutual도 true여야 실제 노출됨 — AND 게이트, patch_history_topic.sql 참고).
create table if not exists topics (
  id text primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  client_id text not null references clients(id) on delete cascade,
  name text not null,
  shared boolean not null default false,
  created_at bigint not null
);
create index if not exists topics_client_idx on topics(client_id);
-- 같은 사용자·같은 담당자 안에서 이름이 같은 토픽이 중복 생성되는 것을 막는다(id 기준 단일 관리).
create unique index if not exists topics_unique_name_per_client
  on topics (user_id, client_id, lower(trim(name)));

-- ── histories (담당자 히스토리) ───────────────────────────
create table if not exists histories (
  id text primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  client_id text references clients(id) on delete cascade,
  date text,
  type text,
  title text not null,
  content text not null default '',
  result text not null default '',
  created_at bigint not null,
  -- 상호 히스토리 공유(get_mutual_client_history) 시 이 항목을 상대방에게 공개할지 여부.
  -- 기본 비공개(옵트인) — profiles.discoverable/share_mutual_history와 동일한 원칙.
  shared_with_mutual boolean not null default false,
  -- 업무 토픽별 보기(트리 그룹핑)용 topics.id 참조. 토픽 삭제 시 소속 히스토리는 미분류로 남는다.
  topic_id text references topics(id) on delete set null
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
  -- 이 프로젝트가 소속된 담당자(개인 1명, client_ids 중 하나를 지정). 담당자 - 프로젝트 - 토픽 -
  -- 히스토리 계층에서 "이 프로젝트는 어느 담당자 소속인가"를 나타낸다. 자세한 배경은
  -- patch_project_topics.sql 참고.
  owner_client_id text references clients(id) on delete set null,
  meeting_record_ids jsonb not null default '[]',
  -- 관련 인물 중 앱에 가입된 계정(clients.linked_profile_id)에게 자동으로 만들어준 사본이면
  -- 원본 프로젝트를 가리킨다. 원본 삭제 시 사본도 함께 삭제된다(on delete cascade). 사본 관리는
  -- sync_project_mirrors() RPC가 담당한다 — 함수 정의는 patch_project_mirror.sql 참고
  -- (schedules.origin_schedule_id와 동일 패턴 — schema.sql에는 컬럼만 반영하고 함수 본문은
  -- patch 파일에만 둔다).
  origin_project_id text references projects(id) on delete cascade,
  created_at bigint not null,
  updated_at bigint
);
-- projects 테이블이 이 컬럼 추가 이전에 이미 생성되어 있었다면 위 create table은 no-op이라
-- 컬럼이 실제로는 없을 수 있다(schedules.origin_schedule_id와 동일한 문제). alter로 한 번 더
-- 명시적으로 보장한다(멱등, patch_get_company_projects.sql에도 동일한 alter가 있음).
alter table projects add column if not exists origin_project_id text references projects(id) on delete cascade;
create index if not exists projects_owner_client_idx on projects(owner_client_id);
create index if not exists projects_origin_idx on projects(origin_project_id);

-- 프로젝트의 owner_client_id가 실제로 그 프로젝트 소유자(user_id)의 담당자인지 강제한다.
create or replace function validate_project_owner_client_ownership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner_client_id is null then return new; end if;
  if not exists (select 1 from clients where id = new.owner_client_id and user_id = new.user_id) then
    raise exception '존재하지 않거나 접근 권한이 없는 담당자(owner_client_id=%)입니다.', new.owner_client_id;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_validate_project_owner_client on projects;
create trigger trg_validate_project_owner_client
  before insert or update of owner_client_id, user_id on projects
  for each row execute function validate_project_owner_client_ownership();

-- 토픽이 소속될 수 있는 프로젝트(선택). topics 테이블이 projects보다 먼저 정의되므로 여기서
-- ALTER로 추가한다. 토픽은 여전히 client_id 소속을 유지하며, project_id는 그 담당자가 진행하는
-- 여러 프로젝트 중 어디에 속한 토픽인지 나타내는 추가 분류다.
alter table topics add column if not exists project_id text references projects(id) on delete set null;
create index if not exists topics_project_idx on topics(project_id);

-- 일정이 연결될 수 있는 프로젝트(선택). schedules 테이블도 projects보다 먼저 정의되므로 여기서
-- ALTER로 추가한다. meeting_records.project_id와 동일하게 단순 FK만 두고 소유권 교차검증
-- 트리거는 두지 않는다(표시용 참조, patch_schedule_project_id.sql).
alter table schedules add column if not exists project_id text references projects(id) on delete set null;
create index if not exists schedules_project_idx on schedules(project_id);

-- 토픽이 프로젝트에 묶일 때, 그 프로젝트의 소속 담당자(owner_client_id)와 토픽의 client_id가
-- 반드시 일치하도록 강제한다(계층 무결성: 담당자 → 프로젝트 → 토픽).
-- 토픽의 project_id가 가리키는 프로젝트가 같은 사용자 소유인지만 확인한다(단순 소유권 체크).
-- 과거에는 topic.client_id가 프로젝트의 owner_client_id(소속 회사 대표 담당자)와 반드시
-- 일치해야 한다고 강제했지만, "소속 회사" 선택 UI를 없애면서(patch_relax_topic_project_client_check.sql)
-- 관련 인물 누구에게든 토픽을 생성할 수 있도록 완화했다.
create or replace function validate_topic_project_client()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_user_id uuid;
begin
  if new.project_id is null then return new; end if;
  select user_id into v_project_user_id from projects where id = new.project_id;
  if v_project_user_id is null or v_project_user_id <> new.user_id then
    raise exception '존재하지 않거나 접근 권한이 없는 프로젝트(project_id=%)입니다.', new.project_id;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_validate_topic_project_client on topics;
create trigger trg_validate_topic_project_client
  before insert or update of project_id, client_id, user_id on topics
  for each row execute function validate_topic_project_client();

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
alter table topics enable row level security;
alter table histories enable row level security;
alter table projects enable row level security;
alter table meeting_records enable row level security;
alter table client_favorites enable row level security;
alter table messages enable row level security;
alter table profile_department_public enable row level security;

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
-- create policy는 if not exists를 지원하지 않아, schema.sql을 반복 실행해도 안전하도록
-- (42710 already exists 에러 방지) 매번 drop policy if exists를 먼저 실행한다.
drop policy if exists companies_select_same_company on companies;
create policy companies_select_same_company on companies
  for select using (id = my_company_id());

-- 회원가입 화면(회사직원)에서 미로그인/미소속 상태로도 회사 목록을 봐야 하므로 공개 조회도 허용한다.
-- 위 companies_select_same_company와는 permissive 정책이라 OR로 합쳐져 충돌 없다.
drop policy if exists companies_select_public on companies;
create policy companies_select_public on companies
  for select using (true);

drop policy if exists departments_select_same_company on departments;
create policy departments_select_same_company on departments
  for select using (company_id = my_company_id());

-- 회원가입 화면(회사직원)에서 선택한 회사에 이미 구성된 부서 목록을 콤보박스로 보여줘야 하는데,
-- 회원가입 시점은 미로그인(anon) 상태라 my_company_id()가 항상 null이라서 위 정책만으로는
-- 조회가 불가능하다. companies_select_public과 완전히 동일한 패턴(부서명도 회사명과 같은 수준의
-- 비민감 정보이며, 회사명 자체가 이미 전체 공개돼 있음)으로 공개 조회도 허용한다.
-- permissive 정책이라 departments_select_same_company와는 OR로 합쳐져 충돌 없다.
drop policy if exists departments_select_public on departments;
create policy departments_select_public on departments
  for select using (true);

-- ── profile_department_public 정책: 전체 공개 조회 ─────────
-- departments_select_public과 동일한 이유(부서 배정 여부는 비민감 정보, 이미 공개된 departments와
-- 조합해야만 의미가 있는 데이터)로 permissive select-only 정책을 둔다. insert/update/delete는
-- sync_profile_department_public() 트리거(SECURITY DEFINER)만 수행하므로 별도 정책이 필요 없다.
drop policy if exists profile_department_public_select_public on profile_department_public;
create policy profile_department_public_select_public on profile_department_public
  for select using (true);

-- ── profiles 정책: 본인만 조회/수정 ───────────────────────
drop policy if exists profiles_select_own on profiles;
create policy profiles_select_own on profiles
  for select using (id = auth.uid());
drop policy if exists profiles_update_own on profiles;
create policy profiles_update_own on profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
drop policy if exists profiles_insert_own on profiles;
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

drop trigger if exists trg_prevent_privileged_profile_self_update on profiles;
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
  order by p.created_at, p.id
$$;
grant execute on function get_company_colleagues() to authenticated;

-- get_company_projects(): 회사 관리자가 같은 회사 소속 전체 부서의 프로젝트를 소유자 이름/부서명과
-- 함께 조회하기 위한 함수. projects_select_company_admin RLS(위 참고)는 projects 테이블 행 단위
-- 접근만 허용할 뿐, PostgREST의 profiles!inner(...) 임베드 조회는 profiles 자체의 SELECT RLS가
-- 본인 행만 허용하므로(profiles_select_own, get_company_colleagues() 도입 배경과 동일 이유)
-- 다른 직원의 profiles 행을 끌어오지 못해 !inner 조인에 걸려 결과가 통째로 사라진다. 컬럼 단위로
-- 필요한 값(name, team, department name)만 SECURITY DEFINER로 안전하게 노출해 이 문제를 피한다.
-- related_people: 프로젝트의 client_ids가 가리키는, 그 프로젝트 소유자 본인의 clients 행(이름/
-- 회사/직책)을 함께 반환한다. clients도 profiles와 동일하게 본인 소유 행만 select 가능한 RLS라
-- (clients_all_own) 관리자가 다른 직원의 clients를 직접 조회할 수 없어서, 여기서도 SECURITY
-- DEFINER로 그 프로젝트 소유자(c.user_id = p.user_id) 소유이면서 해당 프로젝트에 실제로 연결된
-- id만 한정해 안전하게 노출한다(patch_company_project_related_people.sql 참고).
-- 사본(origin_project_id is not null) 보정: sync_project_mirrors()(patch_project_mirror.sql)가
-- "관련 인물로 태그된 회사 직원" 명의로 만들어주는 프로젝트 사본은 client_ids를 의도적으로 빈
-- 배열로 저장한다(사본 소유자가 원본 소유자의 개인 담당자 목록을 열람할 권한이 없으므로). 이
-- 함수가 사본 행 자신(p.user_id/p.client_ids)만 보고 등록자·관련 인물을 계산하면, 회사 관리자가
-- "직원이 관련 인물로 지정된 프로젝트"를 조회할 때 등록자가 실제 등록자가 아니라 사본 소유자인
-- 그 직원 자신으로 잘못 나오고, 관련 인물은 항상 빈 배열로 나온다. origin_project_id로 원본을
-- left join해 원본이 있으면 원본의 소유자 프로필/부서/client_ids를 쓰고(coalesce), 없으면(사본이
-- 아닌 일반 프로젝트) 기존처럼 자기 자신을 쓰도록 한다. sync_project_mirrors()가 "사본은 다시
-- 동기화 대상이 되지 않는다"고 보장하므로 origin_project_id 체인은 항상 최대 1단계다(patch_
-- company_projects_mirror_origin.sql 참고).
create or replace function get_company_projects()
returns table (
  id text, title text, deadline text, start_date text, status text, priority text, notes text,
  progress int, client_ids jsonb, owner_client_id text, meeting_record_ids jsonb,
  origin_project_id text, created_at bigint, updated_at bigint,
  owner_name text, owner_team text, department_name text, related_people jsonb
)
language sql security definer stable
set search_path = public
as $$
  select p.id, p.title, p.deadline, p.start_date, p.status, p.priority, p.notes, p.progress,
    p.client_ids, p.owner_client_id, p.meeting_record_ids, p.origin_project_id, p.created_at, p.updated_at,
    coalesce(orig_pr.name, pr.name),
    coalesce(orig_pr.team, pr.team),
    coalesce(orig_d.name, d.name),
    coalesce(
      (select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'company', c.company, 'role', c.role))
       from clients c
       where c.user_id = coalesce(orig.user_id, p.user_id)
         and c.id in (select jsonb_array_elements_text(coalesce(coalesce(orig.client_ids, p.client_ids), '[]'::jsonb)))),
      '[]'::jsonb
    )
  from projects p
  join profiles pr on pr.id = p.user_id
  left join departments d on d.id = pr.department_id
  left join projects orig on orig.id = p.origin_project_id
  left join profiles orig_pr on orig_pr.id = orig.user_id
  left join departments orig_d on orig_d.id = orig_pr.department_id
  where my_is_company_admin() and pr.company_id = my_company_id()
  order by p.created_at desc
$$;
grant execute on function get_company_projects() to authenticated;

-- 회사 관리자용 부서 관리(조직 구조 세팅): 부서 추가/이름변경/삭제/상위부서 변경, 직원 소속
-- 부서 재배치. departments 테이블은 조회(departments_select_same_company)만 RLS로 허용되어
-- 있고 insert/update/delete 정책이 없으므로(회원가입 시 signup_join_company_as_employee()가
-- SECURITY DEFINER로만 생성), get_company_projects()와 동일한 패턴으로 관리자 전용 CRUD
-- 함수를 제공한다. 자세한 배경은 patch_department_management.sql, 계층 구조(parent_department_id)
-- 관련 배경은 patch_department_hierarchy.sql 참고.
create or replace function create_department(p_name text, p_parent_department_id uuid default null)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid;
begin
  if not my_is_company_admin() then
    raise exception '회사 관리자만 부서를 추가할 수 있습니다.';
  end if;
  if v_name = '' then
    raise exception '부서명을 입력해주세요.';
  end if;
  v_company_id := my_company_id();
  if v_company_id is null then
    raise exception '소속된 회사가 없습니다.';
  end if;
  if exists (select 1 from departments where company_id = v_company_id and name = v_name) then
    raise exception '이미 존재하는 부서명입니다.';
  end if;
  if p_parent_department_id is not null
     and not exists (select 1 from departments where id = p_parent_department_id and company_id = v_company_id) then
    raise exception '존재하지 않거나 접근 권한이 없는 상위 부서입니다.';
  end if;
  insert into departments (company_id, name, parent_department_id)
    values (v_company_id, v_name, p_parent_department_id) returning id into v_id;
  return v_id;
end;
$$;
grant execute on function create_department(text, uuid) to authenticated;

-- 부서의 상위 부서를 변경(트리 재구성)한다. 자기 자신을 상위로 지정하거나, 자신의 하위
-- 부서(직계·조상 포함)를 상위로 지정하면 순환 참조가 생기므로 재귀적으로 조상 체인을 타고
-- 올라가며 p_department_id 자신이 나오면 거부한다.
create or replace function set_department_parent(p_department_id uuid, p_parent_department_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_cursor uuid;
begin
  if not my_is_company_admin() then
    raise exception '회사 관리자만 부서 구조를 변경할 수 있습니다.';
  end if;
  v_company_id := my_company_id();
  if not exists (select 1 from departments where id = p_department_id and company_id = v_company_id) then
    raise exception '존재하지 않거나 접근 권한이 없는 부서입니다.';
  end if;
  if p_parent_department_id is not null then
    if p_parent_department_id = p_department_id then
      raise exception '부서를 자기 자신의 상위 부서로 지정할 수 없습니다.';
    end if;
    if not exists (select 1 from departments where id = p_parent_department_id and company_id = v_company_id) then
      raise exception '존재하지 않거나 접근 권한이 없는 상위 부서입니다.';
    end if;
    -- 순환 참조 방지: 지정하려는 상위 부서의 조상 체인을 타고 올라가며 p_department_id가
    -- 나오면(=p_department_id의 하위 부서를 상위로 지정하려는 것) 거부한다.
    v_cursor := p_parent_department_id;
    while v_cursor is not null loop
      if v_cursor = p_department_id then
        raise exception '하위 부서를 상위 부서로 지정할 수 없습니다(순환 참조).';
      end if;
      select parent_department_id into v_cursor from departments where id = v_cursor;
    end loop;
  end if;
  update departments set parent_department_id = p_parent_department_id where id = p_department_id;
end;
$$;
grant execute on function set_department_parent(uuid, uuid) to authenticated;

create or replace function rename_department(p_department_id uuid, p_new_name text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_name text := btrim(coalesce(p_new_name, ''));
begin
  if not my_is_company_admin() then
    raise exception '회사 관리자만 부서명을 수정할 수 있습니다.';
  end if;
  if v_name = '' then
    raise exception '부서명을 입력해주세요.';
  end if;
  v_company_id := my_company_id();
  if not exists (select 1 from departments where id = p_department_id and company_id = v_company_id) then
    raise exception '존재하지 않거나 접근 권한이 없는 부서입니다.';
  end if;
  if exists (select 1 from departments where company_id = v_company_id and name = v_name and id <> p_department_id) then
    raise exception '이미 존재하는 부서명입니다.';
  end if;
  update departments set name = v_name where id = p_department_id;
end;
$$;
grant execute on function rename_department(uuid, text) to authenticated;

create or replace function delete_department(p_department_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_company_id uuid;
begin
  if not my_is_company_admin() then
    raise exception '회사 관리자만 부서를 삭제할 수 있습니다.';
  end if;
  v_company_id := my_company_id();
  if not exists (select 1 from departments where id = p_department_id and company_id = v_company_id) then
    raise exception '존재하지 않거나 접근 권한이 없는 부서입니다.';
  end if;
  -- 하위 부서가 있으면 삭제를 막는다(parent_department_id의 on delete restrict와 동일한 제약을
  -- 더 친절한 한국어 메시지로 먼저 검증). 하위 부서를 먼저 삭제하거나 다른 곳으로 옮긴 뒤
  -- 다시 시도해야 한다.
  if exists (select 1 from departments where parent_department_id = p_department_id) then
    raise exception '하위 부서가 있는 부서는 삭제할 수 없습니다. 하위 부서를 먼저 삭제하거나 이동해주세요.';
  end if;
  -- profiles.department_id는 on delete set null(위 profiles 테이블 정의)이라 소속 직원은
  -- 이 삭제만으로 자동으로 미배정 처리된다.
  delete from departments where id = p_department_id;
end;
$$;
grant execute on function delete_department(uuid) to authenticated;

create or replace function assign_employee_department(p_employee_id uuid, p_department_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_company_id uuid;
begin
  if not my_is_company_admin() then
    raise exception '회사 관리자만 직원의 소속 부서를 변경할 수 있습니다.';
  end if;
  v_company_id := my_company_id();
  if not exists (select 1 from profiles where id = p_employee_id and company_id = v_company_id) then
    raise exception '존재하지 않거나 같은 회사 소속이 아닌 직원입니다.';
  end if;
  if p_department_id is not null and not exists (select 1 from departments where id = p_department_id and company_id = v_company_id) then
    raise exception '존재하지 않거나 접근 권한이 없는 부서입니다.';
  end if;
  -- prevent_privileged_profile_self_update 트리거(profiles의 department_id 등 특권 컬럼 변경을
  -- BEFORE UPDATE에서 원상복구하는 셀프 승격 방지 트리거)가 이 관리자발 UPDATE에도 무조건 적용되어
  -- department_id를 조용히 원래 값으로 되돌리는 문제가 있었다. signup 계열 RPC와 동일하게
  -- app.bypass_privilege_trigger를 켜서 이 함수 내부의 정당한 UPDATE만 트리거를 통과시킨다.
  perform set_config('app.bypass_privilege_trigger', 'true', true);
  update profiles set department_id = p_department_id where id = p_employee_id;
end;
$$;
grant execute on function assign_employee_department(uuid, uuid) to authenticated;

-- profiles.department_id가 바뀔 때마다 profile_department_public(위 profiles 테이블 정의 근처 참고)에
-- 미러링하는 트리거. assign_employee_department()의 update뿐 아니라 회원가입 RPC의 최초 insert,
-- delete_department()가 departments(id) on delete set null로 department_id를 null로 되돌리는
-- 경우까지 전부 일반 insert/update로 처리되므로 이 트리거 하나로 모든 경로를 커버한다(별도 처리 불필요).
create or replace function sync_profile_department_public() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profile_department_public (profile_id, department_id, updated_at)
  values (new.id, new.department_id, now())
  on conflict (profile_id) do update set department_id = excluded.department_id, updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_sync_profile_department_public on profiles;
create trigger trg_sync_profile_department_public
after insert or update of department_id on profiles
for each row execute function sync_profile_department_public();

-- 기존 프로필 데이터 백필(신규 설치/최초 실행 시 1회성, 이미 있으면 무시).
insert into profile_department_public (profile_id, department_id)
  select id, department_id from profiles
  on conflict (profile_id) do nothing;

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

-- 담당자(clients) 추가 시 기존 가입 회원을 검색해 linked_profile_id로 연결할 수 있게 하는 함수.
-- get_company_colleagues()/get_all_accounts_for_switch()와 동일한 이유로 SECURITY DEFINER 함수로
-- 감싸 필요한 컬럼(id, name, email, team, role, contact)만 반환한다. discoverable=true(옵트인)로
-- 설정한 계정 전체, 또는 같은 회사 소속 동료(get_company_colleagues()와 동일한 전제 —
-- 같은 회사면 discoverable 여부와 무관하게 이미 서로 존재를 알 수 있는 사이이므로 검색 대상에
-- 포함한다)가 대상이다. 검색어 없이는 결과를 반환하지 않는다(전체 덤프 방지), 호출자 자신은 제외,
-- 최대 20건. contact(연락처)는 discoverable=true로 옵트인한 계정에 한해서만 채워 반환한다
-- (같은 회사라는 이유만으로 미동의 상태의 연락처까지 노출하지는 않음 — get_company_colleagues()가
-- email/contact를 반환하지 않는 것과 동일한 제한 취지, patch_search_discoverable_profiles_same_company.sql
-- 참고). contact 컬럼 자체는 옵트인 동의 범위 확장으로 앞서 추가됨(patch_profile_discoverable_search.sql,
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
    select p.id, p.name, p.email, p.team, p.role,
      case when p.discoverable then p.contact else '' end
    from profiles p
    where p.id <> auth.uid()
      and (
        p.discoverable = true
        or (my_company_id() is not null and p.company_id = my_company_id())
      )
      and (
        p.name ilike '%' || btrim(p_query) || '%'
        or p.email ilike '%' || btrim(p_query) || '%'
        or p.team ilike '%' || btrim(p_query) || '%'
      )
    limit 20;
end;
$$;
grant execute on function search_discoverable_profiles(text) to authenticated;

-- 상호 등록된 담당자(A가 B를 담당자로 등록 + B도 A를 담당자로 등록)이고, B가
-- share_mutual_history를 옵트인한 경우에만 B가 기록한 히스토리 중 아래 두 조건을 모두
-- 만족하는 것만 A에게 반환하는 함수(AND 게이트):
--   1) 히스토리 개별 공개(histories.shared_with_mutual = true)
--   2) 토픽이 지정된 경우, 그 토픽도 공유 옵트인(topics.shared = true) — 토픽 미지정(topic_id
--      null)이면 이 조건은 건너뛰고 1)만으로 판정한다.
-- 대칭 조건이라 반대 방향(B가 A의 히스토리를 보는 것)은 A측 값이 별도로 결정한다. 4단계 보안
-- 조건과 자세한 배경은 patch_mutual_client_history.sql, patch_history_shared_with_mutual.sql,
-- patch_history_topic.sql 참고. 반환 컬럼이 바뀔 때마다 42P13(반환 타입 변경 불가) 방지를 위해
-- 관례상 drop 후 생성한다.
drop function if exists get_mutual_client_history(uuid);

create or replace function get_mutual_client_history(p_other_profile_id uuid)
returns table (id text, date text, type text, title text, content text, result text, topic_id text, topic_name text, created_at bigint)
language plpgsql security definer stable
set search_path = public
as $$
declare
  v_other_client_id text;
begin
  if p_other_profile_id is null or p_other_profile_id = auth.uid() then
    return;
  end if;

  -- 주의: returns table(id text, ...)이 plpgsql 스코프에 "id" OUT 파라미터를 암묵 선언하므로,
  -- 별칭 없이 "id"라고만 쓰면 profiles.id와 모호해져 42702 에러가 난다. 반드시 별칭으로 한정한다.
  if not exists (
    select 1 from profiles p
    where p.id = p_other_profile_id
      and p.share_mutual_history = true
  ) then
    return;
  end if;

  if not exists (
    select 1 from clients
    where user_id = auth.uid()
      and linked_profile_id = p_other_profile_id
  ) then
    return;
  end if;

  select c.id into v_other_client_id
  from clients c
  where c.user_id = p_other_profile_id
    and c.linked_profile_id = auth.uid()
  limit 1;

  if v_other_client_id is null then
    return;
  end if;

  return query
    select h.id, h.date, h.type, h.title, h.content, h.result, h.topic_id, t.name, h.created_at
    from histories h
    left join topics t on t.id = h.topic_id
    where h.user_id = p_other_profile_id
      and h.client_id = v_other_client_id
      and h.shared_with_mutual = true
      and (h.topic_id is null or t.shared = true)
    order by h.created_at desc;
end;
$$;
grant execute on function get_mutual_client_history(uuid) to authenticated;

-- 상대방이 공유한 토픽을 공동 편집 대상으로 조회하고, 히스토리 연결 시 상호 등록/공유 조건을 강제한다.
-- 배포용 독립 패치: patch_shared_topic_collaboration.sql
create or replace function get_mutual_client_topics(p_other_profile_id uuid)
returns table (id text, client_id text, name text, created_at bigint)
language plpgsql security definer stable set search_path = public
as $$
declare v_other_client_id text;
begin
  if p_other_profile_id is null or p_other_profile_id = auth.uid() then return; end if;
  if not exists (select 1 from profiles p where p.id = p_other_profile_id and p.share_mutual_history = true)
     or not exists (select 1 from clients c where c.user_id = auth.uid() and c.linked_profile_id = p_other_profile_id) then return; end if;
  select c.id into v_other_client_id from clients c where c.user_id = p_other_profile_id and c.linked_profile_id = auth.uid() limit 1;
  if v_other_client_id is null then return; end if;
  return query select t.id, t.client_id, t.name, t.created_at from topics t
    where t.user_id = p_other_profile_id and t.client_id = v_other_client_id and t.shared = true order by t.created_at desc;
end;
$$;
grant execute on function get_mutual_client_topics(uuid) to authenticated;

create or replace function validate_history_topic_access()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v_topic_user_id uuid; v_topic_client_id text; v_topic_shared boolean;
begin
  if new.topic_id is null then return new; end if;
  select t.user_id, t.client_id, t.shared into v_topic_user_id, v_topic_client_id, v_topic_shared from topics t where t.id = new.topic_id;
  if not found then raise exception '존재하지 않는 토픽입니다.'; end if;
  if v_topic_user_id = new.user_id then
    if v_topic_client_id <> new.client_id then raise exception '다른 담당자의 토픽에는 히스토리를 연결할 수 없습니다.'; end if;
    return new;
  end if;
  if not v_topic_shared
     or not exists (select 1 from profiles p where p.id = v_topic_user_id and p.share_mutual_history = true)
     or not exists (select 1 from clients c where c.id = new.client_id and c.user_id = new.user_id and c.linked_profile_id = v_topic_user_id)
     or not exists (select 1 from clients c where c.id = v_topic_client_id and c.user_id = v_topic_user_id and c.linked_profile_id = new.user_id) then
    raise exception '공동 편집 권한이 없는 토픽입니다.';
  end if;
  return new;
end;
$$;
drop trigger if exists trg_validate_history_topic_access on histories;
create trigger trg_validate_history_topic_access before insert or update of topic_id, client_id, user_id on histories
  for each row execute function validate_history_topic_access();

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

-- 정책 변경(패치: patch_signup_employee_no_company_create.sql): 회사직원 가입 경로에서 신규
-- 회사를 자동 생성하던 기존 동작을 제거했다. signup_create_company_as_admin()은 보안상 이미
-- 존재하는 회사명이면 무조건 거부하도록 설계돼 있는데(기존 회사 관리자로 셀프 승격 방지 목적),
-- 회사직원이 이 경로로 목록에 없는 회사명을 자유 입력하면 관리자 없이(is_company_admin=false)
-- 회사가 만들어져 버려서 나중에 진짜 관리자가 같은 이름으로 가입하려 해도 "이미 사용 중인
-- 회사명"으로 거부당하고 그 회사가 영구히 관리자 없는 고아 상태로 남는 문제가 있었다. 이제
-- 신규 회사 생성은 signup_create_company_as_admin() 경로에서만 가능하고, 회사직원은 이미
-- 존재하는 회사에만 합류할 수 있다(목록에 없으면 즉시 명확한 에러로 거부).
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
    raise exception '등록되지 않은 회사입니다. 회사관리자가 먼저 가입해야 합니다.';
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
-- (아래 전부 동일한 이유로 drop policy if exists를 먼저 실행 — companies/departments/profiles
-- 정책 섹션 상단 주석 참고)
drop policy if exists schedules_all_own on schedules;
create policy schedules_all_own on schedules
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists clients_all_own on clients;
create policy clients_all_own on clients
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists topics_all_own on topics;
create policy topics_all_own on topics
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists histories_all_own on histories;
create policy histories_all_own on histories
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists projects_all_own on projects;
create policy projects_all_own on projects
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 회사 관리자는 같은 회사 소속 전체 프로젝트를 select/update/delete할 수 있다
-- (insert는 제외 — 남의 이름으로 새 프로젝트를 만드는 것은 범위 밖)
drop policy if exists projects_select_company_admin on projects;
create policy projects_select_company_admin on projects
  for select using (
    my_is_company_admin()
    and exists (select 1 from profiles p where p.id = projects.user_id and p.company_id = my_company_id())
  );

drop policy if exists projects_update_company_admin on projects;
create policy projects_update_company_admin on projects
  for update using (
    my_is_company_admin()
    and exists (select 1 from profiles p where p.id = projects.user_id and p.company_id = my_company_id())
  ) with check (
    my_is_company_admin()
    and exists (select 1 from profiles p where p.id = projects.user_id and p.company_id = my_company_id())
  );

drop policy if exists projects_delete_company_admin on projects;
create policy projects_delete_company_admin on projects
  for delete using (
    my_is_company_admin()
    and exists (select 1 from profiles p where p.id = projects.user_id and p.company_id = my_company_id())
  );

drop policy if exists meeting_records_all_own on meeting_records;
create policy meeting_records_all_own on meeting_records
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists client_favorites_all_own on client_favorites;
create policy client_favorites_all_own on client_favorites
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── messages 정책 (교차 계정 배달 특수 케이스) ────────────
drop policy if exists messages_select_own_mailbox on messages;
create policy messages_select_own_mailbox on messages
  for select using (mailbox_owner_id = auth.uid());

-- sender_id = auth.uid(): 실제 발신자로서 남의 메일함에 배달(addMessageForUser)
-- mailbox_owner_id = auth.uid(): 과거 로컬 샘플 데이터처럼 fromId가 실제 발신자가 아니어도,
-- 자기 자신의 메일함에 넣는 것은 안전하므로 허용(마이그레이션에서 필요)
drop policy if exists messages_insert_as_sender on messages;
create policy messages_insert_as_sender on messages
  for insert with check (sender_id = auth.uid() or mailbox_owner_id = auth.uid());

drop policy if exists messages_update_own_mailbox_or_sender on messages;
create policy messages_update_own_mailbox_or_sender on messages
  for update
  using (mailbox_owner_id = auth.uid() or sender_id = auth.uid())
  with check (mailbox_owner_id = auth.uid() or sender_id = auth.uid());

drop policy if exists messages_delete_own_mailbox on messages;
create policy messages_delete_own_mailbox on messages
  for delete using (mailbox_owner_id = auth.uid());

-- ── client_ids 소유권 검증 (보안 재감사 _review/secretary_test-20260723/02_security.md #1) ──
-- schedules.client_ids / projects.client_ids(jsonb 배열, 각 원소는 clients.id 텍스트)는 RLS만으로는
-- 배열 내부 원소의 소유권을 검증할 수 없다(RLS는 행 자체의 user_id만 검사). 이 트리거로 INSERT/UPDATE
-- 시점에 client_ids 배열의 각 원소가 실제로 new.user_id 소유의 담당자인지 강제한다.
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
      raise exception '존재하지 않거나 접근 권한이 없는 담당자(client_id=%)가 포함되어 있습니다.', v_client_id;
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

-- ── Supabase Realtime publication ──────────────────────────
-- 이 프로젝트는 지금까지 Supabase Realtime(웹소켓 push)을 전혀 쓴 적이 없다 — 첫 도입.
-- Realtime으로 postgres_changes를 받으려면 테이블을 supabase_realtime publication에 명시적으로
-- 추가해야 한다(RLS만 permissive여도 publication에 없으면 push가 오지 않는다). 담당자 관리
-- 화면(ClientScreen.js)에서 상대방 부서 변경을 실시간으로 반영하기 위해 profile_department_public만
-- 추가한다(useLiveDepartments 훅 참고).
-- 주의: 위 SQL만으로 안 될 수 있다 — Supabase Dashboard > Database > Replication에서도 이 테이블에
-- 대해 Realtime 토글이 켜져 있는지 별도로 확인해야 한다(대시보드 설정이 publication 멤버십과
-- 별개로 취급되는 프로젝트가 있음).
alter publication supabase_realtime add table profile_department_public;
