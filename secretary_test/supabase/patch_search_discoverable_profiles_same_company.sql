-- 담당자(clients) 추가 화면의 "기존 회원 검색"(search_discoverable_profiles)이 discoverable=true로
-- 옵트인한 계정만 대상으로 해서, 회사 관리자가 소속 회사 직원을 검색해도 그 직원이 discoverable을
-- 켜지 않은 이상 검색 결과에 전혀 나오지 않던 문제 수정.
--
-- get_company_colleagues()는 같은 회사 소속이면 discoverable 여부와 무관하게 이미 동료 존재를
-- 서로 알 수 있다는 전제로 만들어진 함수다(회사관리 탭에서 전체 직원 명단을 볼 수 있음). 이
-- 함수도 같은 전제를 적용해 검색 대상에 "discoverable=true" OR "같은 회사 소속"을 추가한다.
--
-- 다만 contact(연락처)는 discoverable로 명시 옵트인한 경우에만 채워 반환한다 — 같은 회사라는
-- 이유만으로 미동의 상태의 개인 연락처까지 노출하면 get_company_colleagues()가 email/contact를
-- 의도적으로 반환하지 않는 것과 상충되므로, 같은 회사지만 discoverable=false인 경우 contact는
-- 빈 문자열로 반환한다(검색·연결은 가능하되 연락처 자동입력만 안 됨).
--
-- 반환 컬럼 개수/타입은 그대로라 create or replace만으로 충분하다.
--
-- 실행: Supabase Dashboard > SQL Editor에서 이 파일 전체를 실행한다.

create or replace function search_discoverable_profiles(p_query text)
returns table (id uuid, name text, email text, team text, role text, contact text)
language plpgsql security definer stable
set search_path = public
as $$
begin
  if p_query is null or btrim(p_query) = '' then
    raise exception '검색어를 입력해주세요.';
  end if;

  return query
    select p.id, p.name, p.email, p.team, p.role,
      case when p.discoverable then p.contact else '' end
    from profiles p
    where p.id <> auth.uid()
      and (
        p.discoverable = true
        or (my_company_id() is not null and p.company_id = my_company_id())
      )
      and (
        p.name ilike '%' || btrim(p_query) || '%'
        or p.email ilike '%' || btrim(p_query) || '%'
        or p.team ilike '%' || btrim(p_query) || '%'
      )
    limit 20;
end;
$$;
grant execute on function search_discoverable_profiles(text) to authenticated;
