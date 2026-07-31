-- 설계 문제 발견 및 정책 변경.
--
-- 문제: 회원가입(회사직원) 플로우에서 직원이 회사 목록에 없는 회사명을 자유 입력("+ 신규
-- 회사로 등록")하면 signup_join_company_as_employee()가 관리자 없이(is_company_admin=false)
-- 회사를 자동 생성해버렸다. 그런데 signup_create_company_as_admin()은 보안상 "이미 존재하는
-- 회사명이면 무조건 거부"하도록 설계돼 있다(기존 회사 관리자로 셀프 승격 방지 목적,
-- patch_signup_company_role.sql 참고). 그 결과 나중에 진짜 관리자가 그 회사명으로 가입하려
-- 해도 "이미 사용 중인 회사명입니다"로 거부당하고, 그 회사는 영구히 관리자가 없는 고아 상태로
-- 남는다.
--
-- 조치: 신규 회사 생성은 회사관리자 가입 경로(signup_create_company_as_admin)에서만 가능하도록
-- 하고, 회사직원 가입 경로(signup_join_company_as_employee)에서는 신규 회사 생성을 아예
-- 막는다. 목록에 없는 회사명이면 즉시 "등록되지 않은 회사입니다. 회사관리자가 먼저 가입해야
-- 합니다." 에러로 명확히 거부한다. 이에 따라 신규 회사 생성 경로에만 걸려 있던 전역 레이트리밋
-- 체크(patch_company_creation_ratelimit.sql, v_recent_company_count)도 더 이상 쓰이지 않는
-- 죽은 코드가 되어 함께 제거한다.
--
-- 부서 자동 생성 로직(목록에 없는 부서명이면 새로 insert)은 이번 정책 변경과 무관하므로 그대로
-- 유지한다 — 부서는 기존 회사 안에서 계속 자유 입력으로 신규 생성 가능하다.
--
-- 실행 방법: Supabase Dashboard > SQL Editor에서 이 파일 전체를 그대로 실행하세요.
-- (다른 patch_*.sql과 동일한 관례 — DDL은 앱 코드/스크립트로 자동 실행되지 않으며 수동 실행이 필요하다.)

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
    raise exception '등록되지 않은 회사입니다. 회사관리자가 먼저 가입해야 합니다.';
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
