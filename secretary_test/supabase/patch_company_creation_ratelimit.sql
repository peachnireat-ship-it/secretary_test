-- 보안 재감사(_review/secretary_test-20260723/02_security.md, 발견 #6) MEDIUM 취약점 수정.
--
-- 문제: 목록에 없는 회사명으로 "회사직원" 가입 시 signup_join_company_as_employee 내부에서
-- companies/departments 행이 rate limit 없이 무제한 자동 생성된다. 반복 가입으로 쓰레기
-- 데이터를 무제한 적재할 수 있고, companies_select_public으로 노출되는 회사 목록 UI도 오염된다.
--
-- 조치: 계정별 추적 컬럼이 없으므로 전역 카운터로 스코프를 좁힌다 — 신규 회사를 새로 insert하기
-- 직전에 최근 1시간 내 생성된 companies 행 개수가 20개를 초과하면 예외를 발생시켜 신규 회사
-- 생성을 막는다. 정상적인 서비스 이용 시 시간당 20개 신규 회사 생성은 상식적으로 거의 발생하지
-- 않는 임계값이므로 오탐 위험은 낮다. 이미 존재하는 회사에 합류하는 경우(정상 케이스, 위에서
-- select로 v_company_id를 찾은 분기)는 이 제한과 무관하게 항상 허용된다 — 신규 회사 "생성"
-- 경로에만 체크를 넣었다.
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
  v_recent_company_count integer;
begin
  if p_company_name is null or btrim(p_company_name) = '' then
    raise exception '회사명을 입력해주세요.';
  end if;
  v_dept := coalesce(nullif(btrim(p_department_name), ''), '미지정');

  select id into v_company_id from companies where name = btrim(p_company_name);
  if v_company_id is null then
    -- 신규 회사 생성 경로에만 전역 레이트리밋을 건다.
    select count(*) into v_recent_company_count
      from companies where created_at > now() - interval '1 hour';
    if v_recent_company_count >= 20 then
      raise exception '신규 회사 등록 요청이 일시적으로 많습니다. 잠시 후 다시 시도하거나, 이미 등록된 회사라면 이름을 다시 확인해주세요.';
    end if;
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
