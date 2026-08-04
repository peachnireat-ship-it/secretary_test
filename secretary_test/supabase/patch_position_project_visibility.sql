-- 회사관리 화면 "직책 관리" 모달에서, 특정 직책에 "본인 이하 직급 프로젝트 조회" 권한을 켜면
-- 그 직책으로 배정된 직원이 프로젝트 메뉴 "회사 전체" 보기에서 같은 회사 소속 중 본인 직책보다
-- sort_order가 같거나 큰(= 본인 직급 이하) 직책의 동료 프로젝트를 조회할 수 있게 한다. 이전에는
-- "회사 전체" 보기 자체가 회사 관리자 전용이었다.
--
-- - positions.can_view_subordinate_projects(기본값 false)로 직책별 권한을 저장한다.
-- - set_position_project_visibility() RPC(관리자 전용)로 토글한다.
-- - get_company_projects()는 기존 "관리자 전체 조회"에 더해, 권한이 켜진 직책의 직원에게는
--   본인 직급 이하 동료의 프로젝트만 필터링해 반환하도록 WHERE 조건을 넓힌다. 직책 미배정이거나
--   권한이 꺼진 직책의 직원은 기존과 동일하게 빈 결과를 받는다(회사 전체 조회 불가).
--
-- 실행: Supabase Dashboard > SQL Editor에서 이 파일 전체를 실행한다.

alter table positions add column if not exists can_view_subordinate_projects boolean not null default false;

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
  with my_pos as (
    select pos.sort_order, pos.can_view_subordinate_projects
    from profiles me
    join positions pos on pos.id = me.position_id
    where me.id = auth.uid()
  )
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
  left join positions target_pos on target_pos.id = pr.position_id
  where pr.company_id = my_company_id()
    and (
      my_is_company_admin()
      or exists (
        select 1 from my_pos
        where my_pos.can_view_subordinate_projects
          and target_pos.sort_order >= my_pos.sort_order
      )
    )
  order by p.created_at desc
$$;
grant execute on function get_company_projects() to authenticated;

create or replace function set_position_project_visibility(p_position_id uuid, p_enabled boolean)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_company_id uuid;
begin
  if not my_is_company_admin() then
    raise exception '회사 관리자만 직책의 프로젝트 조회 권한을 변경할 수 있습니다.';
  end if;
  v_company_id := my_company_id();
  if not exists (select 1 from positions where id = p_position_id and company_id = v_company_id) then
    raise exception '존재하지 않거나 접근 권한이 없는 직책입니다.';
  end if;
  update positions set can_view_subordinate_projects = coalesce(p_enabled, false) where id = p_position_id;
end;
$$;
grant execute on function set_position_project_visibility(uuid, boolean) to authenticated;
