-- 신규 회원가입으로 profiles 행이 생성될 때, 다른 사용자가 이미 거래처(clients)로
-- 등록해 둔 "같은 사람"이 있으면 자동으로 linked_profile_id를 연결해 준다.
--
-- 배경: patch_clients_linked_profile.sql에서 기존 데이터를 name+company 기준으로
-- 1회성 백필했지만, 그 이후 새로 가입하는 사용자에 대해서는 아무것도 연결되지 않았다.
-- 이 트리거는 그 백필 로직을 "가입 시점"에 자동으로 재현한다.
--
-- 매칭 기준(4개 전부 일치해야 연결): 이름, 소속 회사(company = profiles.team),
-- 직급(role), 이메일. 대소문자/공백 차이는 무시(trim + lower)한다.
-- 이미 다른 profiles에 연결된 clients row(linked_profile_id가 이미 채워진 row)는 건드리지 않는다.
--
-- 실행 방법: 이 파일 전체를 Supabase SQL Editor에 붙여넣고 실행.
-- 선행 조건: patch_clients_linked_profile.sql이 이미 실행되어 clients.linked_profile_id 컬럼이 있어야 한다.

create or replace function link_client_on_profile_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is null or trim(new.email) = '' then
    return new;
  end if;

  update clients
  set linked_profile_id = new.id
  where linked_profile_id is null
    and trim(lower(name)) = trim(lower(new.name))
    and trim(lower(company)) = trim(lower(coalesce(new.team, '')))
    and trim(lower(coalesce(role, ''))) = trim(lower(coalesce(new.role, '')))
    and trim(lower(coalesce(email, ''))) = trim(lower(new.email));

  return new;
end;
$$;

drop trigger if exists trg_link_client_on_profile_insert on profiles;
create trigger trg_link_client_on_profile_insert
  after insert on profiles
  for each row
  execute function link_client_on_profile_insert();
