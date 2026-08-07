-- projects.created_at/updated_at를 bigint(Date.now() epoch ms)에서 timestamptz로 변경.
--
-- 배경: 기존 컬럼은 클라이언트가 Date.now()로 만든 epoch ms 정수를 그대로 저장하는 방식이었다.
-- timestamptz로 바꾸면 표준 SQL 날짜/시간 연산(now(), interval, at time zone 등)을 그대로 쓸 수 있다.
--
-- 이 변경과 함께 반드시 같이 적용해야 하는 것 3가지(따로 적용하면 즉시 깨진다):
-- 1) 클라이언트(src/services/storage.js)가 Date.now() 대신 new Date().toISOString()을 보내도록 수정
--    — 이미 이번 세션에서 addProject()/updateProject()/migrateLocalDataToCloud() 3곳 반영 완료.
-- 2) get_company_projects()의 RETURNS TABLE 선언(created_at/updated_at)도 timestamptz로 일치시켜야
--    함 — 아래에서 재정의.
-- 3) notify_project_updated() 트리거의 is_recent_creation 판정이 bigint 뺄셈(ms 단위)이었던 것을
--    timestamptz 뺄셈(interval)으로 바꿔야 함 — 아래에서 재정의.
--
-- 실행: Supabase Dashboard > SQL Editor에서 이 파일 전체를 실행한다. 기존 값은 epoch ms로 안전하게
-- 변환되어 보존된다(to_timestamp(ms/1000.0)).

alter table projects
  alter column created_at type timestamptz using to_timestamp(created_at / 1000.0),
  alter column updated_at type timestamptz using to_timestamp(updated_at / 1000.0);

-- ── get_company_projects() 재정의: created_at/updated_at 반환 타입만 timestamptz로 변경, 나머지 로직은
-- schema.sql의 기존 정의(2026-08-07 기준)와 동일. Postgres는 OUT 파라미터(RETURNS TABLE) 타입이
-- 바뀌면 create or replace만으로 안 되고 반드시 기존 함수를 먼저 drop해야 한다(42P13 에러) ──
drop function if exists get_company_projects();
create or replace function get_company_projects()
returns table (
  id text, title text, deadline text, start_date text, status text, priority text, notes text,
  progress int, client_ids jsonb, owner_client_id text, meeting_record_ids jsonb,
  origin_project_id text, created_at timestamptz, updated_at timestamptz,
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

-- ── notify_project_updated() 재정의: is_recent_creation 판정을 bigint(ms) 뺄셈에서 timestamptz
-- 뺄셈(interval)으로 변경. 나머지 로직(payload 구성 등)은 patch_project_update_notify_trigger.sql과
-- 동일. 트리거(trg_notify_project_updated)는 함수 이름만 참조하므로 함수 재정의만으로 충분하고
-- 트리거를 다시 만들 필요는 없다. ──
create or replace function notify_project_updated()
returns trigger
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  edge_function_url text := 'https://peodtjwyajgratgshluy.supabase.co/functions/v1/notify-project-updated';
  webhook_secret text;
  is_recent_creation boolean;
begin
  is_recent_creation := new.created_at is not null
    and (clock_timestamp() - new.created_at) < interval '15 seconds';

  select decrypted_secret into webhook_secret
  from vault.decrypted_secrets
  where name = 'notify_project_created_webhook_secret'
  limit 1;

  begin
    perform net.http_post(
      url := edge_function_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-webhook-secret', coalesce(webhook_secret, '')
      ),
      body := jsonb_build_object(
        'project_id', new.id,
        'user_id', new.user_id,
        'is_recent_creation', is_recent_creation,
        'old', jsonb_build_object(
          'title', old.title,
          'status', old.status,
          'priority', old.priority,
          'progress', old.progress,
          'start_date', old.start_date,
          'deadline', old.deadline,
          'notes', old.notes,
          'client_ids', old.client_ids
        ),
        'new', jsonb_build_object(
          'title', new.title,
          'status', new.status,
          'priority', new.priority,
          'progress', new.progress,
          'start_date', new.start_date,
          'deadline', new.deadline,
          'notes', new.notes,
          'client_ids', new.client_ids
        )
      )
    );
  exception
    when others then
      raise warning 'notify_project_updated: 알림 발송 실패(project_id=%): %', new.id, sqlerrm;
  end;
  return new;
end;
$$;
