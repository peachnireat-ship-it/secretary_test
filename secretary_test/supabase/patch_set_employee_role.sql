-- 회사관리 화면에서 관리자가 직원 카드를 클릭해 직책을 수정할 수 있게 하는 RPC 추가.
--
-- 배경: profiles_update_own RLS는 본인 행만 update를 허용한다(assign_employee_department()가
-- department_id에 대해 이미 겪은 것과 동일한 제약). 관리자가 다른 직원의 role을 바꾸려면
-- SECURITY DEFINER 함수가 필요하다. role은 prevent_privileged_profile_self_update 트리거가
-- 보호하는 특권 컬럼(is_company_admin/company_id/department_id)에 포함되지 않으므로
-- app.bypass_privilege_trigger 우회 처리는 필요 없다.
--
-- 실행: Supabase Dashboard > SQL Editor에서 이 파일 전체를 실행한다.

create or replace function set_employee_role(p_employee_id uuid, p_role text)
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
  update profiles set role = coalesce(btrim(p_role), '') where id = p_employee_id;
end;
$$;
grant execute on function set_employee_role(uuid, text) to authenticated;
