-- search_discoverable_profiles()에 contact(연락처) 컬럼을 추가한다.
--
-- 배경: patch_profile_discoverable_search.sql 작성 당시에는 "이름/이메일/소속/직책 검색 노출"까지만
-- discoverable 옵트인의 의미로 설계했고, contact는 개인정보라 의도적으로 반환 컬럼에서 제외했다.
-- 당시 흐름은 검색 결과 선택 → "직접 입력" 폼으로 이동 → 연락처는 사용자가 매번 직접 입력하는
-- 구조였다.
--
-- 이번 변경(사용자 명시적 결정): 검색 결과에서 회원을 선택하면 입력 폼을 거치지 않고 DB에 저장된
-- 회원 데이터 그대로 거래처 목록에 즉시 추가하는 방식으로 바뀐다(ClientScreen.js의
-- selectMemberResult()가 addClient()를 바로 호출). 이를 위해서는 연락처도 검색 결과에 포함되어야
-- 한다. 사용자가 밝힌 근거: "추가 대상자가 이미 거래처 검색 노출(discoverable 옵트인)을 승인한
-- 상태이므로, 연락처도 함께 자동으로 가져와도 된다." 즉 discoverable 옵트인의 의미가
-- "이름/이메일/소속/직책 검색 노출"에서 "연락처 포함 노출 및 거래처 자동 추가"로 명시적으로
-- 확장되었다. SettingsScreen.js의 동의 안내 문구도 이 변경에 맞춰 함께 갱신되었다(반드시 최신
-- 문구를 확인할 것 — 옵트인 대상자에게 정확한 동의 범위를 안내해야 한다).
--
-- contact 컬럼 자체는 이미 profiles 테이블에 존재하므로(alter table 불필요) 함수 반환 타입만
-- 갱신한다. 기존 보안 조건(discoverable=true만 대상, 검색어 필수, 본인 제외, 최대 20건,
-- grant to authenticated)은 전부 그대로 유지한다.
--
-- 실행 방법: Supabase Dashboard > SQL Editor에서 이 파일 전체를 그대로 실행하세요.
-- (다른 patch_*.sql과 동일한 관례 — DDL은 앱 코드/스크립트로 자동 실행되지 않으며 수동 실행이 필요하다.)
--
-- 주의: RETURNS TABLE의 OUT 컬럼 목록(개수/구성)을 바꾸는 경우 create or replace만으로는
-- 반영되지 않는다(Postgres 오류 42P13: cannot change return type of existing function /
-- HINT: Use DROP FUNCTION ... first). 기존 함수는 5개 컬럼(id, name, email, team, role)이고
-- 이번 변경은 contact를 추가해 6개 컬럼이 되므로, 먼저 기존 함수를 명시적으로 drop한 뒤
-- create or replace로 새로 만든다. grant는 함수가 새로 생성된 뒤 다시 실행되므로 이 파일
-- 그대로 실행하면 된다.
drop function if exists search_discoverable_profiles(text);

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
    select p.id, p.name, p.email, p.team, p.role, p.contact
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
