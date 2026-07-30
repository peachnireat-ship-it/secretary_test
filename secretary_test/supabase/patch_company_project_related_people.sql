-- 회사 관리자가 "프로젝트 > 회사 전체" 보기에서 프로젝트 상세를 열어도 관련 인물이 전혀
-- 보이지 않던 문제 수정. 화면(ProjectScreen.js)의 개인 프로젝트 상세는 clientIds를 화면에 이미
-- 로드돼 있는 자신의 clients 배열에서 찾아 이름을 표시하는데, 회사 전체 보기의 프로젝트는 다른
-- 직원 소유라 client_ids가 그 직원의 clients 행을 가리킨다. clients 테이블은 본인 소유 행만
-- select 가능한 RLS(clients_all_own)라 관리자 자신의 clients 배열에서는 애초에 찾을 수 없어
-- 항상 빈 결과였다.
--
-- get_company_projects()에 related_people(jsonb 배열: id/name/company/role)을 추가해 프로젝트
-- 소유자 본인의 clients 중 그 프로젝트에 실제로 연결된 행만 SECURITY DEFINER로 안전하게 함께
-- 반환한다(get_company_colleagues()와 동일한 컨벤션 — 컬럼 단위로 필요한 값만 노출).
--
-- 반환 컬럼이 추가되어(return type 변경) create or replace만으로는 안 되므로 먼저 drop한다.
--
-- 실행: Supabase Dashboard > SQL Editor에서 이 파일 전체를 실행한다.

drop function if exists get_company_projects();

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
    pr.name, pr.team, d.name,
    coalesce(
      (select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'company', c.company, 'role', c.role))
       from clients c
       where c.user_id = p.user_id
         and c.id in (select jsonb_array_elements_text(coalesce(p.client_ids, '[]'::jsonb)))),
      '[]'::jsonb
    )
  from projects p
  join profiles pr on pr.id = p.user_id
  left join departments d on d.id = pr.department_id
  where my_is_company_admin() and pr.company_id = my_company_id()
  order by p.created_at desc
$$;
grant execute on function get_company_projects() to authenticated;
