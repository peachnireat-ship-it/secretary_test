-- 부서 관리 모달에서 특정 직원의 소속 부서를 변경할 때마다 "직원별 소속 부서" 목록(및 회사관리
-- 화면 전체 직원 목록)의 표시 순서가 뒤바뀌던 버그 수정.
--
-- 원인: get_company_colleagues()가 ORDER BY 없이 profiles를 조회했다. Postgres는 ORDER BY가
-- 없으면 반환 순서를 보장하지 않는데, 실제로는 대체로 물리적 튜플 저장 순서(seq scan 순서)를
-- 따른다. assign_employee_department()의 `update profiles set department_id = ...`가 실행되면
-- 해당 행이 새 튜플 버전으로 다시 쓰이면서 이 물리적 순서가 바뀌고, 그 결과 department_id를
-- 바꾸지 않은 다른 직원들과의 상대적 순서까지 함께 흔들렸다. 실제로 재현해보면 department_id를
-- 원래 값으로 되돌려도(즉 실질적으로 아무것도 안 바꿔도) 한 번 UPDATE가 발생한 행은 순서가
-- 원상복구되지 않는다 — "값이 바뀌어서"가 아니라 "UPDATE가 일어나서" 순서가 흔들리는 것이었다.
--
-- 조치: get_company_projects()(order by p.created_at desc), get_all_accounts_for_switch()
-- (order by p.name) 등 이 프로젝트의 다른 회사 관리자용 SECURITY DEFINER 함수들과 동일하게
-- 명시적 ORDER BY를 추가한다. created_at(가입 순서) 기준으로 정렬해, 부서 재배치 여부와
-- 무관하게 항상 동일한 순서가 나오도록 고정한다.
--
-- 실행: Supabase Dashboard > SQL Editor에서 이 파일 전체를 실행한다.

create or replace function get_company_colleagues()
returns table (
  id uuid,
  name text,
  role text,
  department_id uuid,
  is_company_admin boolean
)
language sql security definer stable
set search_path = public
as $$
  select p.id, p.name, p.role, p.department_id, p.is_company_admin
  from profiles p
  where my_company_id() is not null and p.company_id = my_company_id()
  order by p.created_at, p.id
$$;
grant execute on function get_company_colleagues() to authenticated;
