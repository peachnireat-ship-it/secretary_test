-- getCompanyProjects()가 사용하던 `projects.select('*, profiles!inner(name, team, department_id,
-- departments(name))')` 임베드 조회가 실제로는 항상 회사 관리자 본인 소유 프로젝트만 반환하고
-- 나머지 직원의 프로젝트는 조용히 사라지는 버그가 있었다(원인: 07-24 보안 재감사 대응
-- (patch_profiles_colleagues_columns.sql)에서 profiles_select_same_company RLS를 제거하고
-- get_company_colleagues() SECURITY DEFINER 함수로 대체했는데, getCompanyProjects()의
-- profiles!inner 임베드는 그대로 남아 있었다. PostgREST 임베드 조회는 대상 테이블(profiles) 자체의
-- SELECT RLS를 통과해야 하고, profiles_select_own은 본인 행만 허용하므로 다른 직원의 profiles
-- 행을 끌어오지 못해 !inner 조인 조건에 걸려 그 프로젝트 행 자체가 결과에서 빠졌다).
--
-- get_company_colleagues()와 동일한 방식(SECURITY DEFINER + 필요한 컬럼만 반환)으로
-- get_company_projects() 함수를 추가해 이 문제를 해결한다. projects 테이블 자체의 행 단위 접근
-- 권한은 기존 projects_select_company_admin RLS와 동일한 조건(my_is_company_admin() +
-- 같은 company_id)을 함수 내부에서 그대로 재현한다.
--
-- origin_project_id(patch_project_mirror.sql)를 반환 컬럼에 포함하므로, 이 파일이 먼저 실행되는
-- 경우에도 안전하도록 컬럼 존재를 방어적으로 보장한다(멱등).
alter table projects add column if not exists origin_project_id text references projects(id) on delete cascade;

-- 실행: Supabase Dashboard > SQL Editor에서 이 파일 전체를 실행한다.

create or replace function get_company_projects()
returns table (
  id text, title text, deadline text, start_date text, status text, priority text, notes text,
  progress int, client_ids jsonb, owner_client_id text, meeting_record_ids jsonb,
  origin_project_id text, created_at bigint, updated_at bigint,
  owner_name text, owner_team text, department_name text
)
language sql security definer stable
set search_path = public
as $$
  select p.id, p.title, p.deadline, p.start_date, p.status, p.priority, p.notes, p.progress,
    p.client_ids, p.owner_client_id, p.meeting_record_ids, p.origin_project_id, p.created_at, p.updated_at,
    pr.name, pr.team, d.name
  from projects p
  join profiles pr on pr.id = p.user_id
  left join departments d on d.id = pr.department_id
  where my_is_company_admin() and pr.company_id = my_company_id()
  order by p.created_at desc
$$;
grant execute on function get_company_projects() to authenticated;
