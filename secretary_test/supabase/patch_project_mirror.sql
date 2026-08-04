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
--
-- 보안 주의: 이 파일만 실행하고 schema.sql의 trg_prevent_client_origin_project_id_write 트리거
-- (prevent_client_origin_project_id_write())를 배포하지 않으면, 일반 사용자가 addProject/updateProject
-- 경로(특히 update_project AI 액션처럼 필드 화이트리스트가 없는 경로)로 origin_project_id를 임의의
-- 다른 사용자 프로젝트 id로 위조해 get_project_mirror_info()를 통해 그 사용자 정보를 열람할 수 있는
-- Critical 취약점이 그대로 남는다. 반드시 schema.sql의 해당 트리거도 함께 배포할 것.

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

    -- trg_prevent_client_origin_project_id_write(schema.sql)가 일반 사용자의 origin_project_id
    -- 직접 조작을 막는데, 이 upsert는 신뢰된 서버 경로(사본 동기화 자체)이므로 회원가입 RPC들과
    -- 동일한 패턴으로 세션 플래그를 켜서 그 트리거를 우회한다.
    perform set_config('app.bypass_privilege_trigger', 'true', true);

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
