-- 일정의 관련 인물(clientIds) 중 이 앱에 실제로 가입된 계정(clients.linked_profile_id 연결)에게는
-- 동일한 일정 정보를 그 사람 본인의 일정 목록에도 사본으로 추가한다.
-- 배경: 관련 인물이 수동 추가든 "관련 프로젝트 선택 시 자동 세팅"이든 구분 없이 전부 대상이다.
--
-- 사본 행은 origin_schedule_id로 원본을 가리키며(FK, on delete cascade — 원본 삭제 시 사본도
-- 자동 삭제), id는 "원본id_mirror_대상user_id" 형태로 결정론적으로 생성해 upsert(on conflict)가
-- 가능하도록 한다. 사본 자체는 다시 동기화 대상이 되지 않는다(무한 루프 방지).
--
-- 실행: Supabase Dashboard > SQL Editor에서 이 파일 전체를 실행한다.

alter table schedules add column if not exists origin_schedule_id text references schedules(id) on delete cascade;
create index if not exists schedules_origin_idx on schedules(origin_schedule_id);

create or replace function sync_schedule_mirrors(p_schedule_id text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_origin schedules%rowtype;
  v_client record;
  v_target_user_id uuid;
  v_keep_user_ids uuid[] := '{}';
begin
  select * into v_origin from schedules where id = p_schedule_id and user_id = auth.uid();
  if not found then
    raise exception '존재하지 않거나 접근 권한이 없는 일정입니다.';
  end if;

  -- 사본 행 자체를 대상으로 호출된 경우(무한 루프 방지) 아무것도 하지 않는다.
  if v_origin.origin_schedule_id is not null then
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

    insert into schedules (
      id, user_id, date, time, title, tag, notes, client_ids, start_date, end_date,
      notify_email, project_id, origin_schedule_id, created_at
    )
    values (
      v_origin.id || '_mirror_' || v_target_user_id::text,
      v_target_user_id, v_origin.date, v_origin.time, v_origin.title, v_origin.tag, v_origin.notes,
      '[]'::jsonb, v_origin.start_date, v_origin.end_date,
      false, null, v_origin.id, v_origin.created_at
    )
    on conflict (id) do update set
      date = excluded.date,
      time = excluded.time,
      title = excluded.title,
      tag = excluded.tag,
      notes = excluded.notes,
      start_date = excluded.start_date,
      end_date = excluded.end_date;
  end loop;

  -- 더 이상 관련 인물이 아니게 된 대상(관련 인물에서 제외되었거나 linked_profile_id가
  -- 해제된 경우)의 기존 사본은 삭제한다.
  delete from schedules
  where origin_schedule_id = v_origin.id
    and not (user_id = any(v_keep_user_ids));
end;
$$;

grant execute on function sync_schedule_mirrors(text) to authenticated;
