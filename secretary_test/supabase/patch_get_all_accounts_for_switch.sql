-- 설정 화면 "계정 전환" 목록을 하드코딩된 ROSTER(테스트 계정 6개)에서 DB의 모든 가입 계정
-- (profiles 테이블 전체)으로 확장하기 위한 조회 함수.
--
-- 배경: 기존 getTestAccounts()는 ROSTER 배열만 반환해, 실제로 회원가입한 계정(회사 관리자/직원
-- 가입 등)은 전환 목록에 아예 노출되지 않았다. 이번 요청으로 개인 프로젝트/테스트 환경이라는
-- 전제 하에 전체 가입 계정을 노출하기로 결정됨(email 노출 허용, 사용자 명시적 승인).
--
-- 보안 주의: get_company_colleagues()(patch_profiles_colleagues_columns.sql)와 동일하게,
-- profiles 테이블에 직접 select를 허용하면 RLS가 행 단위 통제만 가능해 컬럼 단위 제한이
-- 안 되므로 SECURITY DEFINER 함수로 감싸 필요한 컬럼(id, name, email, team, role)만 반환한다.
-- contact/notes/work_topics/sns/company_id/department_id/is_company_admin 등은 이 화면에
-- 불필요하거나 민감한 컬럼이므로 절대 포함하지 않는다(보안 재감사에서 반복 지적된
-- "필요한 컬럼만 select" 원칙).
--
-- 비밀번호 없이 원클릭 전환은 ROSTER(고정 비밀번호가 CLAUDE.md에 이미 공개된 테스트 계정)에서만
-- 유지되며, 이 함수가 반환하는 그 외 계정은 클라이언트(storage.js switchAccount)가 반드시
-- 대상 계정의 실제 비밀번호를 입력받아 signInWithPassword로 검증한다. 이 함수 자체는 로그인
-- 처리를 하지 않고 목록 조회만 담당한다.
--
-- 실행 방법: Supabase Dashboard > SQL Editor에서 이 파일 전체를 그대로 실행하세요.
-- (다른 patch_*.sql과 동일한 관례 — DDL은 앱 코드/스크립트로 자동 실행되지 않으며 수동 실행이 필요하다.)

create or replace function get_all_accounts_for_switch()
returns table (id uuid, name text, email text, team text, role text)
language sql security definer stable
set search_path = public
as $$
  select p.id, p.name, p.email, p.team, p.role from profiles p order by p.name
$$;
grant execute on function get_all_accounts_for_switch() to authenticated;
