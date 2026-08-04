-- 부서(departments)에도 직책(positions)과 동일한 sort_order 기반 순서 관리 기능을 추가한다.
-- 다만 부서는 parent_department_id로 트리 구조이므로 "형제" 그룹은 회사 전체가 아니라
-- company_id + parent_department_id 단위로 좁혀진다(같은 상위 부서를 가진 부서들끼리만 순서 비교).
-- 자세한 배경/패턴 소스는 patch_position_management.sql(positions.sort_order + move_position()) 참고.
--
-- ⚠️ 경고: 이 파일의 백필 UPDATE(아래 "기존 데이터 백필" 섹션)는 1회성이다. 이미 존재하는 부서들을
-- created_at, id 기준으로 결정론적인 순서로 초기화하는데, 관리자가 이미 ▲▼로 순서를 수동 조정한
-- 뒤에 이 파일을 재실행하면 그 커스텀 순서가 초기화(덮어쓰기)된다. 최초 1회만 실행할 것.
--
-- 실행 방법: 이 파일 전체를 Supabase SQL Editor에 붙여넣고 실행.

-- ── departments.sort_order 컬럼 추가 ──────────────────────
alter table departments add column if not exists sort_order int not null default 0;
create index if not exists departments_company_parent_sort_idx on departments(company_id, parent_department_id, sort_order);

-- ── 기존 데이터 백필(1회성) ────────────────────────────────
-- 신규 컬럼은 전부 기본값 0이 되므로, 같은 형제 그룹(company_id + parent_department_id) 내에서
-- 결정론적인 순서(created_at, id)를 매겨준다. ⚠️ 위 경고 참고 — 재실행 금지(관리자가 이미 수동으로
-- 순서를 바꾼 뒤 재실행하면 커스텀 순서가 초기화됨).
with ranked as (
  select id, row_number() over (partition by company_id, parent_department_id order by created_at, id) - 1 as rn
  from departments
)
update departments d set sort_order = r.rn from ranked r where r.id = d.id;

-- ── create_department(): 새 부서를 형제 그룹(company_id + parent_department_id) 맨 뒤에 추가 ───
create or replace function create_department(p_name text, p_parent_department_id uuid default null)
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
    raise exception '회사 관리자만 부서를 추가할 수 있습니다.';
  end if;
  if v_name = '' then
    raise exception '부서명을 입력해주세요.';
  end if;
  v_company_id := my_company_id();
  if v_company_id is null then
    raise exception '소속된 회사가 없습니다.';
  end if;
  if exists (select 1 from departments where company_id = v_company_id and name = v_name) then
    raise exception '이미 존재하는 부서명입니다.';
  end if;
  if p_parent_department_id is not null
     and not exists (select 1 from departments where id = p_parent_department_id and company_id = v_company_id) then
    raise exception '존재하지 않거나 접근 권한이 없는 상위 부서입니다.';
  end if;
  select coalesce(max(sort_order), -1) + 1 into v_next_order
    from departments
    where company_id = v_company_id and parent_department_id is not distinct from p_parent_department_id;
  insert into departments (company_id, name, parent_department_id, sort_order)
    values (v_company_id, v_name, p_parent_department_id, v_next_order) returning id into v_id;
  return v_id;
end;
$$;
grant execute on function create_department(text, uuid) to authenticated;

-- ── set_department_parent(): 상위 부서 변경 시 새 형제 그룹 맨 뒤로 재배치 ───────
-- (변경 전 그룹의 sort_order를 그대로 들고 가면 새 그룹의 기존 형제들과 값이 충돌해 순서가
-- 뒤섞일 수 있으므로, 이동할 때마다 새 그룹의 맨 뒤에 배치한다.)
create or replace function set_department_parent(p_department_id uuid, p_parent_department_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_cursor uuid;
  v_next_order int;
begin
  if not my_is_company_admin() then
    raise exception '회사 관리자만 부서 구조를 변경할 수 있습니다.';
  end if;
  v_company_id := my_company_id();
  if not exists (select 1 from departments where id = p_department_id and company_id = v_company_id) then
    raise exception '존재하지 않거나 접근 권한이 없는 부서입니다.';
  end if;
  if p_parent_department_id is not null then
    if p_parent_department_id = p_department_id then
      raise exception '부서를 자기 자신의 상위 부서로 지정할 수 없습니다.';
    end if;
    if not exists (select 1 from departments where id = p_parent_department_id and company_id = v_company_id) then
      raise exception '존재하지 않거나 접근 권한이 없는 상위 부서입니다.';
    end if;
    -- 순환 참조 방지: 지정하려는 상위 부서의 조상 체인을 타고 올라가며 p_department_id가
    -- 나오면(=p_department_id의 하위 부서를 상위로 지정하려는 것) 거부한다.
    v_cursor := p_parent_department_id;
    while v_cursor is not null loop
      if v_cursor = p_department_id then
        raise exception '하위 부서를 상위 부서로 지정할 수 없습니다(순환 참조).';
      end if;
      select parent_department_id into v_cursor from departments where id = v_cursor;
    end loop;
  end if;
  select coalesce(max(sort_order), -1) + 1 into v_next_order
    from departments
    where company_id = v_company_id and parent_department_id is not distinct from p_parent_department_id;
  update departments set parent_department_id = p_parent_department_id, sort_order = v_next_order where id = p_department_id;
end;
$$;
grant execute on function set_department_parent(uuid, uuid) to authenticated;

-- ── move_department(): 같은 형제 그룹(같은 상위 부서를 가진 부서들) 내에서만 상하 순서 이동 ───
-- move_position()과 동일한 인접 항목 swap 로직이되, neighbor 탐색 조건에
-- parent_department_id is not distinct from v_parent_id를 추가해 형제 그룹 밖으로는 넘어가지 않는다.
create or replace function move_department(p_department_id uuid, p_direction text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_parent_id uuid;
  v_sort_order int;
  v_neighbor_id uuid;
  v_neighbor_order int;
begin
  if not my_is_company_admin() then
    raise exception '회사 관리자만 부서 순서를 변경할 수 있습니다.';
  end if;
  if p_direction not in ('up', 'down') then
    raise exception '방향 값이 올바르지 않습니다.';
  end if;
  v_company_id := my_company_id();
  select parent_department_id, sort_order into v_parent_id, v_sort_order
    from departments where id = p_department_id and company_id = v_company_id;
  if v_sort_order is null then
    raise exception '존재하지 않거나 접근 권한이 없는 부서입니다.';
  end if;
  if p_direction = 'up' then
    select id, sort_order into v_neighbor_id, v_neighbor_order
      from departments
      where company_id = v_company_id and parent_department_id is not distinct from v_parent_id and sort_order < v_sort_order
      order by sort_order desc limit 1;
  else
    select id, sort_order into v_neighbor_id, v_neighbor_order
      from departments
      where company_id = v_company_id and parent_department_id is not distinct from v_parent_id and sort_order > v_sort_order
      order by sort_order asc limit 1;
  end if;
  if v_neighbor_id is null then
    return; -- 이미 맨 위/맨 아래
  end if;
  update departments set sort_order = v_neighbor_order where id = p_department_id;
  update departments set sort_order = v_sort_order where id = v_neighbor_id;
end;
$$;
grant execute on function move_department(uuid, text) to authenticated;
