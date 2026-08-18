-- 프로젝트 탭 AI 도우미("회사 전체" 보기)가 프로젝트별 "관련 인물에게 알림 메일 발송" 여부를
-- 전혀 알지 못하던 문제 수정. get_company_projects()가 notify_email 컬럼을 아예 반환하지 않아,
-- 화면(ProjectScreen.js)에는 체크박스로 정상 표시되는 값이 AI 시스템 프롬프트(claude.js
-- buildProjectDelaySystem)에는 애초에 전달되지 않았다("내 프로젝트" 보기는 getProjects()가
-- notify_email을 그대로 반환해 문제 없음 — 이 함수만 누락).
--
-- 반환 컬럼이 추가되어(return type 변경) create or replace만으로는 안 되므로 먼저 drop한다.
--
-- 실행: Supabase Dashboard > SQL Editor에서 이 파일 전체를 실행한다.

drop function if exists get_company_projects();

create or replace function get_company_projects()
returns table (
  id text, title text, deadline text, start_date text, status text, priority text, notes text,
  progress int, client_ids jsonb, owner_client_id text, meeting_record_ids jsonb,
  origin_project_id text, created_at timestamptz, updated_at timestamptz, notify_email boolean,
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
    p.client_ids, p.owner_client_id, p.meeting_record_ids, p.origin_project_id, p.created_at, p.updated_at, p.notify_email,
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
