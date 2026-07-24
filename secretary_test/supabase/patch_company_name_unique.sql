-- 보안 재감사 2026-07-23 발견 #2(HIGH) 수정 패치.
--
-- 취약점: companies.name에 유일성 제약이 없고, signup_create_company_as_admin(p_company_name)이
-- 이름 중복 여부를 확인하지 않고 항상 새 companies 행을 insert해 호출자를 그 회사의 관리자로
-- 만든다. 회사직원 가입 화면(companies_select_public 정책)이 실제 회사명을 칩으로 노출하므로,
-- 공격자가 그 이름 그대로 "회사관리자"로 별도 가입하면 이름은 같지만 id가 다른 가짜 회사가
-- 생성되고 공격자가 그 관리자가 된다. 신규 입사자가 칩에서 이름만 보고 진짜/가짜 회사를 구분하지
-- 못하고 가짜 회사를 선택하면, 공격자가 projects_select/update/delete_company_admin RLS를 통해
-- 그 직원의 프로젝트를 열람/수정/삭제할 수 있게 된다.
--
-- 주의: Supabase SQL Editor에서 수동 실행 필요 — 이 스크립트는 DDL이라 앱 코드에서
-- 자동 실행되지 않는다(이 프로젝트의 기존 patch_*.sql 관례와 동일).
--
-- ⚠️ 실행 전 필수 확인 사항 ⚠️
-- 이 패치는 companies.name에 unique 제약을 추가한다. 기존 DB에 이미 동일한 이름의 회사가
-- 여러 개 존재하면(즉, 이 취약점이 이미 악용되었거나 우연히 중복 가입된 경우) unique 제약 추가
-- 자체가 실패한다. 아래 조회 쿼리를 먼저 실행해 중복 여부를 확인할 것:
--
--   select name, count(*) from companies group by name having count(*) > 1;
--
-- 위 쿼리가 행을 반환하면(중복 존재), unique 제약을 추가하기 전에 어느 회사가 진짜인지 파악해
-- 가짜 회사에 소속된 profiles.company_id를 진짜 회사 id로 재배정하고, 가짜 회사 행(및 그 회사만
-- 참조하는 departments/projects 등 연쇄 데이터)을 정리해야 한다. 이 정리 작업은 데이터 상황에
-- 따라 달라지므로 이 패치 파일이 자동으로 처리하지 않는다 — 수동으로 먼저 해결한 뒤 아래 DDL을
-- 실행할 것.
--
-- 한계점: 대소문자를 구분하는 기본 unique 제약이라 "삼성물산"과 "삼성물산 " 같은 공백 차이는
-- btrim으로 걸러지지만, 영문 회사명의 경우 대소문자만 다른 이름("Acme"와 "acme")은 여전히
-- 별개 행으로 통과된다. 대소문자 무시 유일성을 강제하려면 citext 확장이 필요한데 이 프로젝트는
-- citext를 쓴 적이 없어 이번 스코프에서는 도입하지 않는다(과도한 확장 도입 방지).

-- ── 1. companies.name unique 제약 추가 ──────────────────────
-- 실행 전 위 중복 확인 쿼리로 이상 없음을 확인했어야 한다.
alter table companies add constraint companies_name_unique unique (name);

-- ── 2. signup_create_company_as_admin RPC 재정의: 중복 이름 사전 체크 추가 ──
-- 안전 불변식은 기존과 동일(항상 새로 insert한 회사 id만 사용)하되, insert 전에 동일 이름
-- 회사가 이미 있는지 확인해 있으면 친절한 한국어 에러로 막는다. unique 제약(위 1번)이 최종
-- 방어선이므로 이 사전 체크가 없어도 안전하지만, 사전 체크가 있어야 Postgres unique violation
-- 에러 코드가 그대로 노출되지 않고 사용자에게 원인과 대안(회사직원으로 가입)을 안내할 수 있다.
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
  if exists (select 1 from companies where name = btrim(p_company_name)) then
    raise exception '이미 사용 중인 회사명입니다. 다른 이름을 사용하거나, 이미 있는 회사라면 회사직원으로 가입해 소속을 요청하세요.';
  end if;
  insert into companies (name) values (btrim(p_company_name)) returning id into v_company_id;
  perform set_config('app.bypass_privilege_trigger', 'true', true);
  update profiles
    set company_id = v_company_id, department_id = null, is_company_admin = true
    where id = auth.uid();
end;
$$;
grant execute on function signup_create_company_as_admin(text) to authenticated;
