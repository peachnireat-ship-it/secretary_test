-- 부서 관리(patch_department_management.sql)를 계층 구조(트리)로 확장한다.
--
-- departments에 parent_department_id(자기참조 FK)를 추가하고, 아래 함수들을 갱신/추가한다:
--   create_department(p_name, p_parent_department_id default null)  -- 부서 추가 시 상위 부서 지정 가능(시그니처 확장, 기존 호출 호환)
--   set_department_parent(p_department_id, p_parent_department_id)  -- 부서의 상위 부서 변경(순환 참조 방지)
--   delete_department(p_department_id)                              -- 하위 부서가 있으면 삭제 거부하도록 갱신
--
-- 실행: Supabase Dashboard > SQL Editor에서 이 파일 전체를 실행한다.
-- (patch_department_management.sql을 먼저 실행했어야 한다 — rename_department/assign_employee_department는
-- 이 패치에서 변경하지 않는다.)

alter table departments add column if not exists parent_department_id uuid references departments(id) on delete restrict;
create index if not exists departments_parent_idx on departments(parent_department_id);

create or replace function create_department(p_name text, p_parent_department_id uuid default null)
returns uuid
language plpgsql security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_name text := btrim(coalesce(p_name, ''));
  v_id uuid;
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
  insert into departments (company_id, name, parent_department_id)
    values (v_company_id, v_name, p_parent_department_id) returning id into v_id;
  return v_id;
end;
$$;
grant execute on function create_department(text, uuid) to authenticated;

create or replace function set_department_parent(p_department_id uuid, p_parent_department_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_cursor uuid;
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
    v_cursor := p_parent_department_id;
    while v_cursor is not null loop
      if v_cursor = p_department_id then
        raise exception '하위 부서를 상위 부서로 지정할 수 없습니다(순환 참조).';
      end if;
      select parent_department_id into v_cursor from departments where id = v_cursor;
    end loop;
  end if;
  update departments set parent_department_id = p_parent_department_id where id = p_department_id;
end;
$$;
grant execute on function set_department_parent(uuid, uuid) to authenticated;

create or replace function delete_department(p_department_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_company_id uuid;
begin
  if not my_is_company_admin() then
    raise exception '회사 관리자만 부서를 삭제할 수 있습니다.';
  end if;
  v_company_id := my_company_id();
  if not exists (select 1 from departments where id = p_department_id and company_id = v_company_id) then
    raise exception '존재하지 않거나 접근 권한이 없는 부서입니다.';
  end if;
  if exists (select 1 from departments where parent_department_id = p_department_id) then
    raise exception '하위 부서가 있는 부서는 삭제할 수 없습니다. 하위 부서를 먼저 삭제하거나 이동해주세요.';
  end if;
  delete from departments where id = p_department_id;
end;
$$;
grant execute on function delete_department(uuid) to authenticated;
