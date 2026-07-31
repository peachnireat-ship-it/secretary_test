-- 회원가입 화면(회사직원)에서 "소속 회사"를 고르면, 그 회사에 관리자가 이미 구성해둔 부서
-- 목록을 콤보박스로 보여주기 위해 departments 테이블을 조회해야 한다. 하지만 회원가입 시점은
-- 아직 로그인 전(anon 세션)이라 my_company_id()(auth.uid() 기반)가 항상 null이 되고, 기존
-- departments_select_same_company 정책(company_id = my_company_id()) 하나만으로는 이 조회가
-- 항상 실패한다(RLS에 막혀 빈 배열만 반환됨).
--
-- companies 테이블이 정확히 같은 문제를 겪었고 companies_select_public(schema.sql) permissive
-- 정책으로 이미 해결돼 있다. 부서명 역시 회사명과 마찬가지로 민감정보가 아니며, 이미 회사명 자체가
-- 전체 공개돼 있는 것과 같은 노출 수준이므로 동일한 패턴을 departments에도 적용한다.
--
-- permissive 정책이라 기존 departments_select_same_company와는 OR로 합쳐져 충돌 없다.
--
-- 실행: Supabase Dashboard > SQL Editor에서 이 파일 전체를 실행한다.

drop policy if exists departments_select_public on departments;
create policy departments_select_public on departments
  for select using (true);
