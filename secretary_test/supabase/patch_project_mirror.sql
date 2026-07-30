-- 프로젝트의 관련 인물(clientIds) 중 이 앱에 실제로 가입된 계정(clients.linked_profile_id 연결)에게는
-- 동일한 프로젝트 정보를 그 사람 본인의 프로젝트 목록에도 사본으로 추가한다.
-- 배경: schedules.origin_schedule_id/sync_schedule_mirrors()(patch_schedule_mirror.sql)와 완전히
-- 동일한 패턴을 projects에도 적용한다. 회사 관리자가 "프로젝트" 메뉴의 회사 전체 보기에서
-- (getCompanyProjects, RLS projects_select_company_admin) 프로젝트 소유자가 회사 소속이 아니어도
-- 관련 인물로 태그된 자사 직원에게 생긴 사본은 그 직원 명의(user_id)로 조회되므로 함께 노출된다.
--
-- 사본 행은 origin_project_id로 원본을 가리키며(FK, on delete cascade — 원본 삭제 시 사본도
-- 자동 삭제), id는 "원본id_mirror_대상user_id" 형태로 결정론적으로 생성해 upsert(on conflict)가
-- 가능하도록 한다. 사본에는 client_ids/owner_client_id/meeting_record_ids를 싣지 않는다(원본
-- 소유자의 개인 담당자·회의록을 사본 소유자가 열람할 권한이 없으므로). 사본 자체는 다시 동기화
-- 대상이 되지 않는다(무한 루프 방지).
--
-- 실행: Supabase Dashboard > SQL Editor에서 이 파일 전체를 실행한다.

alter table projects add column if not exists origin_project_id text references projects(id) on delete cascade;
create index if not exists projects_origin_idx on projects(origin_project_id);

create or replace function sync_project_mirrors(p_project_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_origin projects%rowtype;
  v_client record;
  v_target_user_id uuid;
  v_keep_user_ids uuid[] := '{}';
begin
  select * into v_origin from projects where id = p_project_id and user_id = auth.uid();
  if not found then
    raise exception '존재하지 않거나 접근 권한이 없는 프로젝트입니다.';
  end if;

  -- 사본 행 자체를 대상으로 호출된 경우(무한 루프 방지) 아무것도 하지 않는다.
  if v_origin.origin_project_id is not null then
    return;
  end if;

  for v_client in
    select c.linked_profile_id
    from clients c
    where c.user_id = auth.uid()
      and c.linked_profile_id is not null
      and c.linked_profile_id <> auth.uid()
      and c.id in (
        select jsonb_array_elements_text(coalesce(v_origin.client_ids, '[]'::jsonb))
      )
  loop
    v_target_user_id := v_client.linked_profile_id;
    v_keep_user_ids := array_append(v_keep_user_ids, v_target_user_id);

    insert into projects (
      id, user_id, title, deadline, start_date, status, priority, notes, progress,
      client_ids, owner_client_id, meeting_record_ids, origin_project_id, created_at, updated_at
    )
    values (
      v_origin.id || '_mirror_' || v_target_user_id::text,
      v_target_user_id, v_origin.title, v_origin.deadline, v_origin.start_date, v_origin.status,
      v_origin.priority, v_origin.notes, v_origin.progress,
      '[]'::jsonb, null, '[]'::jsonb, v_origin.id, v_origin.created_at, v_origin.updated_at
    )
    on conflict (id) do update set
      title = excluded.title,
      deadline = excluded.deadline,
      start_date = excluded.start_date,
      status = excluded.status,
      priority = excluded.priority,
      notes = excluded.notes,
      progress = excluded.progress,
      updated_at = excluded.updated_at;
  end loop;

  -- 더 이상 관련 인물이 아니게 된 대상(관련 인물에서 제외되었거나 linked_profile_id가
  -- 해제된 경우)의 기존 사본은 삭제한다.
  delete from projects
  where origin_project_id = v_origin.id
    and not (user_id = any(v_keep_user_ids));
end;
$$;

grant execute on function sync_project_mirrors(text) to authenticated;
