-- 회원가입 화면(LoginScreen.js)에서 "회사관리자"/"회사직원"을 선택해 가입하는 기능을 위한 패치.
--
-- 주의: Supabase SQL Editor에서 수동 실행 필요 — 이 스크립트는 DDL이라 앱 코드에서
-- 자동 실행되지 않는다(이 프로젝트의 기존 patch_*.sql 관례와 동일).
-- patch_company_department.sql이 먼저 적용돼 있어야 한다(companies/departments 테이블,
-- profiles.company_id/department_id/is_company_admin 컬럼, my_company_id()/my_is_company_admin()
-- 헬퍼, prevent_privileged_profile_self_update() 트리거가 이미 존재해야 함).

-- ── companies: 회사직원 가입 화면에서 미로그인/미소속 상태로도 목록을 봐야 함 ──
-- 기존 companies_select_same_company(같은 회사만 조회)는 그대로 둔다 — 여러 permissive
-- 정책은 OR로 합쳐지므로 충돌 없이 공존한다.
create policy companies_select_public on companies
  for select using (true);

-- ── 셀프 승격 방지 트리거 예외 조건 추가 ────────────────────
-- 기존에는 auth.role() = 'service_role'일 때만 컬럼 되돌리기를 건너뛰었다. 이제 아래
-- RPC 함수(signup_create_company_as_admin / signup_join_company_as_employee) 내부에서만
-- 켜지는 세션 로컬 설정(app.bypass_privilege_trigger)이 true인 경우도 예외로 추가한다.
-- 이 설정은 Supabase JS SDK로는 임의 SQL/set_config를 호출할 수 없으므로 일반 클라이언트
-- 코드에서는 켤 수 없다 — RPC 함수 내부에서만 통제된 경로로 켜진다.
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
     or new.department_id is distinct from old.department_id then
    new.is_company_admin := old.is_company_admin;
    new.company_id := old.company_id;
    new.department_id := old.department_id;
  end if;
  return new;
end;
$$;

-- ── 회원가입 RPC: 회사관리자로 가입 ──────────────────────────
-- 안전 불변식: 항상 새로 insert한 회사 id만 사용하므로 기존 회사의 관리자로 셀프 승격 불가능.
create or replace function signup_create_company_as_admin(p_company_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
begin
  if p_company_name is null or btrim(p_company_name) = '' then
    raise exception '회사명을 입력해주세요.';
  end if;
  insert into companies (name) values (btrim(p_company_name)) returning id into v_company_id;
  perform set_config('app.bypass_privilege_trigger', 'true', true);
  update profiles
    set company_id = v_company_id, department_id = null, is_company_admin = true
    where id = auth.uid();
end;
$$;
grant execute on function signup_create_company_as_admin(text) to authenticated;

-- ── 회원가입 RPC: 회사직원으로 가입 ──────────────────────────
-- 안전 불변식: is_company_admin을 항상 false로만 설정하므로 이 경로로 관리자 권한 취득 불가능.
create or replace function signup_join_company_as_employee(p_company_name text, p_department_name text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_department_id uuid;
  v_dept text;
begin
  if p_company_name is null or btrim(p_company_name) = '' then
    raise exception '회사명을 입력해주세요.';
  end if;
  v_dept := coalesce(nullif(btrim(p_department_name), ''), '미지정');

  select id into v_company_id from companies where name = btrim(p_company_name);
  if v_company_id is null then
    insert into companies (name) values (btrim(p_company_name)) returning id into v_company_id;
  end if;

  select id into v_department_id from departments where company_id = v_company_id and name = v_dept;
  if v_department_id is null then
    insert into departments (company_id, name) values (v_company_id, v_dept) returning id into v_department_id;
  end if;

  perform set_config('app.bypass_privilege_trigger', 'true', true);
  update profiles
    set company_id = v_company_id, department_id = v_department_id, is_company_admin = false
    where id = auth.uid();
end;
$$;
grant execute on function signup_join_company_as_employee(text, text) to authenticated;
