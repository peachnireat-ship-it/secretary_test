-- 거래처(clients) 추가 시, 이미 이 앱에 가입된 기존 회원(profiles) 중에서 검색해 거래처로
-- 연결할 수 있게 하기 위한 컬럼 + 조회 함수.
--
-- 배경: 지금까지 clients.linked_profile_id는 ROSTER(하드코딩 테스트 계정) 이름+회사 일치
-- 휴리스틱(addClient)이나 회원가입 시 자동 연결(patch_link_client_on_signup.sql)로만 채워졌다.
-- 사용자가 "이미 가입된 회원을 검색해서 직접 골라 거래처로 추가"할 수 있는 경로는 없었다.
--
-- 프라이버시 설계: 이 검색은 옵트인(opt-in) 방식이다. profiles.discoverable 기본값은 false이며,
-- 사용자가 설정 화면에서 명시적으로 "다른 사용자 검색에 내 정보 노출 허용"을 켜야만 검색 결과에
-- 노출된다(기본값 true인 옵트아웃 방식은 절대 아님 — 마이그레이션 직후 기존 사용자 전원은 비노출
-- 상태가 유지되어야 한다).
--
-- 보안 주의: get_company_colleagues()/get_all_accounts_for_switch()와 동일하게, profiles를
-- 직접 select하게 허용하면 RLS는 행 단위 통제만 가능해 컬럼 단위 제한이 안 되므로 SECURITY DEFINER
-- 함수로 감싸 필요한 컬럼(id, name, email, team, role)만 반환한다. contact(연락처)는 여전히
-- 비공개 정보이므로 절대 포함하지 않는다.
--
-- 추가 방어: p_query가 비어있으면 예외를 던져 "전체 노출 계정 덤프"를 원천 차단한다(검색어 없이
-- discoverable=true 계정 전체를 긁어가는 것을 방지). 호출자 자신은 결과에서 제외하고, 결과는
-- 최대 20건으로 제한한다.
--
-- 실행 방법: Supabase Dashboard > SQL Editor에서 이 파일 전체를 그대로 실행하세요.
-- (다른 patch_*.sql과 동일한 관례 — DDL은 앱 코드/스크립트로 자동 실행되지 않으며 수동 실행이 필요하다.)

alter table profiles
  add column if not exists discoverable boolean not null default false;

create or replace function search_discoverable_profiles(p_query text)
returns table (id uuid, name text, email text, team text, role text)
language plpgsql security definer stable
set search_path = public
as $$
begin
  if p_query is null or btrim(p_query) = '' then
    raise exception '검색어를 입력해주세요.';
  end if;

  return query
    select p.id, p.name, p.email, p.team, p.role
    from profiles p
    where p.discoverable = true
      and p.id <> auth.uid()
      and (
        p.name ilike '%' || btrim(p_query) || '%'
        or p.email ilike '%' || btrim(p_query) || '%'
        or p.team ilike '%' || btrim(p_query) || '%'
      )
    limit 20;
end;
$$;
grant execute on function search_discoverable_profiles(text) to authenticated;
