-- 회사관리 화면에 "직책 관리" 기능 추가. 부서 관리와 동일한 방식으로 동작한다:
-- - 부서(departments)는 상위/하위 트리 구조지만, 직책(positions)은 하나의 순서만 있는
--   순위형 목록이다(예: 대표 0, 이사 1, 부장 2, ... 값이 작을수록 상위 직급).
-- - 관리자가 "직책 관리" 모달에서 직책을 추가/이름변경/삭제/순서변경(▲▼)할 수 있고,
--   같은 모달의 "직원별 직책" 섹션에서 직원마다 직책을 선택(피커, 선택 즉시 저장)할 수 있다.
-- - 회사관리 메인 목록에서 특정 부서를 선택했을 때 직원 정렬 기준이 기존 "직책 텍스트 가나다순"
--   에서 이 직책 목록의 순서(sort_order)로 바뀐다.
--
-- 이전에 배포했던 자유 텍스트 기반 set_employee_role() RPC(patch_set_employee_role.sql)는
-- 더 이상 앱에서 호출하지 않는다. 그대로 둬도 무해하므로 이 패치에서 드롭하지 않는다.
--
-- 실행: Supabase Dashboard > SQL Editor에서 이 파일 전체를 실행한다.

-- ── positions 테이블 ─────────────────────────────────────
create table if not exists positions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references companies(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
create index if not exists positions_company_sort_idx on positions(company_id, sort_order);

alter table profiles add column if not exists position_id uuid references positions(id) on delete set null;

alter table positions enable row level security;

drop policy if exists positions_select_same_company on positions;
create policy positions_select_same_company on positions
  for select using (company_id = my_company_id());

-- ── 셀프 승격 방지 트리거에 position_id 추가 ────────────────
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
     or new.department_id is distinct from old.department_id
     or new.position_id is distinct from old.position_id then
    new.is_company_admin := old.is_company_admin;
    new.company_id := old.company_id;
    new.department_id := old.department_id;
    new.position_id := old.position_id;
  end if;
  return new;
end;
$$;

-- ── get_company_colleagues()에 position_id 추가 ─────────────
-- RETURNS TABLE의 OUT 컬럼이 늘어나므로 create or replace만으로는 반영되지 않는다
-- (42P13 cannot change return type of existing function). 먼저 명시적으로 drop한다.
drop function if exists get_company_colleagues();

create or replace function get_company_colleagues()
returns table (
  id uuid,
  name text,
  role text,
  department_id uuid,
  position_id uuid,
  is_company_admin boolean
)
language sql security definer stable
set search_path = public
as $$
  select p.id, p.name, p.role, p.department_id, p.position_id, p.is_company_admin
  from profiles p
  where my_company_id() is not null and p.company_id = my_company_id()
  order by p.created_at, p.id
$$;
grant execute on function get_company_colleagues() to authenticated;

-- ── 직책 관리 RPC ────────────────────────────────────────
create or replace function create_position(p_name text)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid;
  v_next_order int;
begin
  if not my_is_company_admin() then
    raise exception '회사 관리자만 직책을 추가할 수 있습니다.';
  end if;
  if v_name = '' then
    raise exception '직책명을 입력해주세요.';
  end if;
  v_company_id := my_company_id();
  if v_company_id is null then
    raise exception '소속된 회사가 없습니다.';
  end if;
  if exists (select 1 from positions where company_id = v_company_id and name = v_name) then
    raise exception '이미 존재하는 직책명입니다.';
  end if;
  select coalesce(max(sort_order), -1) + 1 into v_next_order from positions where company_id = v_company_id;
  insert into positions (company_id, name, sort_order)
    values (v_company_id, v_name, v_next_order) returning id into v_id;
  return v_id;
end;
$$;
grant execute on function create_position(text) to authenticated;

create or replace function rename_position(p_position_id uuid, p_new_name text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_name text := btrim(coalesce(p_new_name, ''));
begin
  if not my_is_company_admin() then
    raise exception '회사 관리자만 직책명을 수정할 수 있습니다.';
  end if;
  if v_name = '' then
    raise exception '직책명을 입력해주세요.';
  end if;
  v_company_id := my_company_id();
  if not exists (select 1 from positions where id = p_position_id and company_id = v_company_id) then
    raise exception '존재하지 않거나 접근 권한이 없는 직책입니다.';
  end if;
  if exists (select 1 from positions where company_id = v_company_id and name = v_name and id <> p_position_id) then
    raise exception '이미 존재하는 직책명입니다.';
  end if;
  update positions set name = v_name where id = p_position_id;
end;
$$;
grant execute on function rename_position(uuid, text) to authenticated;

create or replace function delete_position(p_position_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_company_id uuid;
begin
  if not my_is_company_admin() then
    raise exception '회사 관리자만 직책을 삭제할 수 있습니다.';
  end if;
  v_company_id := my_company_id();
  if not exists (select 1 from positions where id = p_position_id and company_id = v_company_id) then
    raise exception '존재하지 않거나 접근 권한이 없는 직책입니다.';
  end if;
  delete from positions where id = p_position_id;
end;
$$;
grant execute on function delete_position(uuid) to authenticated;

create or replace function move_position(p_position_id uuid, p_direction text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_sort_order int;
  v_neighbor_id uuid;
  v_neighbor_order int;
begin
  if not my_is_company_admin() then
    raise exception '회사 관리자만 직책 순서를 변경할 수 있습니다.';
  end if;
  if p_direction not in ('up', 'down') then
    raise exception '방향 값이 올바르지 않습니다.';
  end if;
  v_company_id := my_company_id();
  select sort_order into v_sort_order from positions where id = p_position_id and company_id = v_company_id;
  if v_sort_order is null then
    raise exception '존재하지 않거나 접근 권한이 없는 직책입니다.';
  end if;
  if p_direction = 'up' then
    select id, sort_order into v_neighbor_id, v_neighbor_order
      from positions where company_id = v_company_id and sort_order < v_sort_order
      order by sort_order desc limit 1;
  else
    select id, sort_order into v_neighbor_id, v_neighbor_order
      from positions where company_id = v_company_id and sort_order > v_sort_order
      order by sort_order asc limit 1;
  end if;
  if v_neighbor_id is null then
    return;
  end if;
  update positions set sort_order = v_neighbor_order where id = p_position_id;
  update positions set sort_order = v_sort_order where id = v_neighbor_id;
end;
$$;
grant execute on function move_position(uuid, text) to authenticated;

create or replace function assign_employee_position(p_employee_id uuid, p_position_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_company_id uuid;
begin
  if not my_is_company_admin() then
    raise exception '회사 관리자만 직원의 직책을 변경할 수 있습니다.';
  end if;
  v_company_id := my_company_id();
  if not exists (select 1 from profiles where id = p_employee_id and company_id = v_company_id) then
    raise exception '존재하지 않거나 같은 회사 소속이 아닌 직원입니다.';
  end if;
  if p_position_id is not null and not exists (select 1 from positions where id = p_position_id and company_id = v_company_id) then
    raise exception '존재하지 않거나 접근 권한이 없는 직책입니다.';
  end if;
  perform set_config('app.bypass_privilege_trigger', 'true', true);
  update profiles set position_id = p_position_id where id = p_employee_id;
end;
$$;
grant execute on function assign_employee_position(uuid, uuid) to authenticated;
