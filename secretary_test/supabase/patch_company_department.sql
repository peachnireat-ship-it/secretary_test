-- "회사 계정" 시나리오: 한 회사(companies) 소속 여러 부서(departments) 테스트 계정들이
-- 각자 프로젝트를 갖고, company_admin 권한을 가진 계정 1개가 회사 전체 부서의 프로젝트를
-- 부서별로 그룹핑해 조회/수정/삭제할 수 있도록 하는 스키마 패치.
--
-- 주의: Supabase SQL Editor에서 수동 실행 필요 — 이 스크립트는 DDL이라
-- 앱 코드에서 자동 실행되지 않는다(이 프로젝트의 기존 patch_*.sql 관례와 동일).
-- 실행 순서: 이 파일 전체를 SQL Editor에 붙여넣고 한 번에 실행하면 된다.

-- ── companies ────────────────────────────────────────────
create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

-- ── departments ──────────────────────────────────────────
create table if not exists departments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

-- ── profiles 확장 컬럼 ─────────────────────────────────────
alter table profiles add column if not exists company_id uuid references companies(id) on delete set null;
alter table profiles add column if not exists department_id uuid references departments(id) on delete set null;
alter table profiles add column if not exists is_company_admin boolean not null default false;

-- ── RLS 무한 재귀 방지 헬퍼 함수 (SECURITY DEFINER) ─────────
-- profiles 테이블을 정책 내부에서 직접 서브쿼리하면(예: policy using (company_id = (select company_id from profiles where id = auth.uid())))
-- profiles 자신의 RLS 정책과 서로를 다시 평가하며 재귀에 빠질 위험이 있다. SECURITY DEFINER 함수로
-- RLS를 우회해 값만 조회하면 재귀 없이 안전하게 정책에서 재사용할 수 있다.
create or replace function my_company_id() returns uuid
language sql security definer stable
set search_path = public
as $$ select company_id from profiles where id = auth.uid() $$;

create or replace function my_is_company_admin() returns boolean
language sql security definer stable
set search_path = public
as $$ select coalesce(is_company_admin, false) from profiles where id = auth.uid() $$;

-- ── companies / departments RLS ────────────────────────────
alter table companies enable row level security;
alter table departments enable row level security;

create policy companies_select_same_company on companies
  for select using (id = my_company_id());

create policy departments_select_same_company on departments
  for select using (company_id = my_company_id());

-- ── profiles: 동료 프로필(이름/부서) 조회 허용 ──────────────
-- 기존 profiles_select_own(id = auth.uid())은 그대로 유지하고, 같은 회사 소속이면
-- 서로의 프로필을 조회할 수 있도록 정책을 추가한다(회사 관리자 화면에서 담당자 이름 표시용).
create policy profiles_select_same_company on profiles
  for select using (company_id is not null and company_id = my_company_id());

-- ── projects: 회사 관리자 전용 select/update/delete ────────
-- 기존 projects_all_own(user_id = auth.uid())은 그대로 유지한다.
-- insert는 제외한다 — 회사 관리자가 남의 이름으로 프로젝트를 새로 만드는 것은 범위 밖이다.
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

-- ── profiles: 셀프 권한 승격 방지 트리거 ────────────────────
-- profiles_update_own(using/with check: id = auth.uid())은 row 단위 정책이라 컬럼 단위 제한이
-- 불가능하다. 즉 일반 사용자가 자기 자신의 is_company_admin/company_id/department_id를 직접
-- update()로 바꿔 셀프 승격할 수 있는 구멍이 있다(이후 my_is_company_admin() 기반 정책들이
-- 전부 뚫림). BEFORE UPDATE 트리거로 이 3개 컬럼만 골라 조용히 원래 값으로 되돌린다.
create or replace function prevent_privileged_profile_self_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- 시드 스크립트 등 service_role 키로 실행되는 관리 작업은 예외적으로 허용
  if auth.role() = 'service_role' then
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
