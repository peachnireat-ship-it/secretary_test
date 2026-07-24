-- 보안 재감사(_review/secretary_test-20260723/02_security.md, 발견 #3) MEDIUM 취약점 수정.
--
-- 문제: profiles_select_same_company RLS 정책(행 단위 정책)은 컬럼 단위 제한이 불가능하다.
-- "담당자 이름 표시용"이라는 의도와 달리, 같은 회사 소속이면 일반 직원(관리자 아님)도
-- 동료의 email/contact/notes/work_topics/is_company_admin 등 profiles 테이블 전체 컬럼을
-- supabase.from('profiles').select('*').eq('company_id', ...) 직접 호출로 조회할 수 있었다.
-- 기존 UI(getCompanyEmployees())가 필요한 컬럼만 select하는 것은 앱 레이어의 우연한 제한일
-- 뿐 DB 레벨 통제가 아니었다.
--
-- 조치: my_company_id()/my_is_company_admin()과 동일한 이 프로젝트의 기존 컨벤션에 따라
-- SECURITY DEFINER 함수(get_company_colleagues)로 안전한 컬럼(id, name, role, department_id,
-- is_company_admin)만 반환하도록 감싸고, 전체 컬럼을 노출하던 profiles_select_same_company
-- 정책은 drop한다(이제 이 함수가 그 역할을 대체하므로 전체 컬럼 노출 경로 자체를 제거).
--
-- 실행 방법: Supabase Dashboard > SQL Editor에서 이 파일 전체를 그대로 실행하세요.
-- (다른 patch_*.sql과 동일한 관례 — DDL은 앱 코드/스크립트로 자동 실행되지 않으며 수동 실행이 필요하다.)

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
$$;
grant execute on function get_company_colleagues() to authenticated;

-- 전체 컬럼을 노출하던 행 단위 정책 제거 — 이제 get_company_colleagues()가 이 역할을 대체한다.
drop policy if exists profiles_select_same_company on profiles;
