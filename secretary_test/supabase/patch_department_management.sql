-- 회사 관리자용 부서 관리(조직 구조 세팅) 기능.
--
-- 배경: 지금까지 departments 행은 회원가입 시 signup_join_company_as_employee()가 직원이 입력한
-- 부서명을 그대로 최초 1회 생성하는 것 말고는 만들 방법이 없었다(departments 테이블은
-- departments_select_same_company로 조회만 가능, insert/update/delete RLS 정책 자체가 없음).
-- 관리자가 미리 조직 구조(부서 목록)를 세팅하거나, 이미 가입한 직원의 소속 부서를 바꿀 방법이
-- 없었던 것을 이 패치로 보완한다.
--
-- get_company_projects()/get_company_colleagues()와 동일한 패턴(SECURITY DEFINER + 함수 내부에서
-- my_is_company_admin() + company_id 일치를 직접 검증)으로 4개 함수를 추가한다:
--   create_department(p_name)                 -- 부서 추가
--   rename_department(p_department_id, p_new_name)  -- 부서명 변경
--   delete_department(p_department_id)         -- 부서 삭제(소속 직원은 on delete set null로 자동 미배정)
--   assign_employee_department(p_employee_id, p_department_id)  -- 직원 소속 부서 재배치(p_department_id
--                                                                  는 null 허용 = 미배정으로 변경)
--
-- 실행: Supabase Dashboard > SQL Editor에서 이 파일 전체를 실행한다.

create or replace function create_department(p_name text)
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
  insert into departments (company_id, name) values (v_company_id, v_name) returning id into v_id;
  return v_id;
end;
$$;
grant execute on function create_department(text) to authenticated;

create or replace function rename_department(p_department_id uuid, p_new_name text)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_name text := btrim(coalesce(p_new_name, ''));
begin
  if not my_is_company_admin() then
    raise exception '회사 관리자만 부서명을 수정할 수 있습니다.';
  end if;
  if v_name = '' then
    raise exception '부서명을 입력해주세요.';
  end if;
  v_company_id := my_company_id();
  if not exists (select 1 from departments where id = p_department_id and company_id = v_company_id) then
    raise exception '존재하지 않거나 접근 권한이 없는 부서입니다.';
  end if;
  if exists (select 1 from departments where company_id = v_company_id and name = v_name and id <> p_department_id) then
    raise exception '이미 존재하는 부서명입니다.';
  end if;
  update departments set name = v_name where id = p_department_id;
end;
$$;
grant execute on function rename_department(uuid, text) to authenticated;

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
  -- profiles.department_id는 on delete set null(schema.sql 38번째 줄)이라 소속 직원은
  -- 이 삭제만으로 자동으로 미배정 처리된다.
  delete from departments where id = p_department_id;
end;
$$;
grant execute on function delete_department(uuid) to authenticated;

create or replace function assign_employee_department(p_employee_id uuid, p_department_id uuid)
returns void
language plpgsql security definer
set search_path = public
as $$
declare
  v_company_id uuid;
begin
  if not my_is_company_admin() then
    raise exception '회사 관리자만 직원의 소속 부서를 변경할 수 있습니다.';
  end if;
  v_company_id := my_company_id();
  if not exists (select 1 from profiles where id = p_employee_id and company_id = v_company_id) then
    raise exception '존재하지 않거나 같은 회사 소속이 아닌 직원입니다.';
  end if;
  if p_department_id is not null and not exists (select 1 from departments where id = p_department_id and company_id = v_company_id) then
    raise exception '존재하지 않거나 접근 권한이 없는 부서입니다.';
  end if;
  update profiles set department_id = p_department_id where id = p_employee_id;
end;
$$;
grant execute on function assign_employee_department(uuid, uuid) to authenticated;
