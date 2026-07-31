-- 부서 관리 모달에서 관리자가 직원의 소속 부서를 변경해도 실제로는 반영되지 않던 버그 수정.
--
-- 원인: assign_employee_department()가 `update profiles set department_id = ...`를 실행하면
-- profiles의 BEFORE UPDATE 트리거 trg_prevent_privileged_profile_self_update
-- (prevent_privileged_profile_self_update() 함수, schema.sql 참고)가 함께 발동한다. 이 트리거는
-- department_id/company_id/is_company_admin 같은 특권 컬럼이 바뀌면 auth.role() = 'service_role'
-- 이거나 app.bypass_privilege_trigger 세션 플래그가 켜져 있지 않은 한 무조건 NEW.department_id를
-- OLD 값으로 되돌린다. 원래 이 트리거는 "직원이 자기 자신의 프로필을 직접 update()해서 부서/권한을
-- 셀프 승격하는 것"을 막기 위한 것인데, 조건에 "본인 행인지" 여부가 없어 관리자가 SECURITY DEFINER
-- 함수(assign_employee_department)를 통해 다른 직원의 부서를 정당하게 바꾸는 UPDATE도 똑같이
-- 막아버렸다. 회원가입 RPC(signup_create_company_as_admin/signup_join_company_as_employee)는
-- 애초에 app.bypass_privilege_trigger를 켜고 UPDATE해서 이 문제가 없었지만, 나중에 추가된
-- assign_employee_department()에는 그 처리가 빠져 있었다.
--
-- 조치: assign_employee_department()도 signup RPC와 동일하게, 관리자 권한 검증(my_is_company_admin())
-- 을 통과한 뒤 UPDATE 직전에 app.bypass_privilege_trigger를 켠다.
--
-- 실행: Supabase Dashboard > SQL Editor에서 이 파일 전체를 실행한다.

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
  perform set_config('app.bypass_privilege_trigger', 'true', true);
  update profiles set department_id = p_department_id where id = p_employee_id;
end;
$$;
grant execute on function assign_employee_department(uuid, uuid) to authenticated;
