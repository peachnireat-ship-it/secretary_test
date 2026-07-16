-- 앱에서 fmtPhone()으로 신규 입력 시 자동으로 하이픈을 넣도록 수정했지만(ClientScreen.js 등),
-- 그 이전에 하이픈 없이 저장된 기존 데이터(clients.contact/work_contact, profiles.contact)는
-- 그대로 남아있어 회원(하이픈 있음)과 비회원(하이픈 없음) 서식이 뒤섞여 있다.
-- 이 스크립트는 하이픈이 없는 기존 번호를 010-0000-0000 형식으로 1회성 정규화한다.
--
-- 이미 하이픈이 포함된 값이나, 자릿수가 유효 범위(9~11자리)를 벗어나는 값은 손대지 않고 그대로 둔다.
--
-- 실행 방법: 이 파일 전체를 Supabase SQL Editor에 붙여넣고 실행.

create or replace function format_kr_phone(raw text)
returns text
language plpgsql
immutable
as $$
declare
  d text;
begin
  if raw is null or raw = '' then
    return raw;
  end if;
  if raw like '%-%' then
    return raw;
  end if;

  d := regexp_replace(raw, '\D', '', 'g');
  if d = '' then
    return raw;
  end if;

  if left(d, 2) = '02' then
    if length(d) = 9 then
      return substr(d, 1, 2) || '-' || substr(d, 3, 3) || '-' || substr(d, 6, 4);
    elsif length(d) = 10 then
      return substr(d, 1, 2) || '-' || substr(d, 3, 4) || '-' || substr(d, 7, 4);
    else
      return raw; -- 유효하지 않은 자릿수는 원본 유지
    end if;
  else
    if length(d) = 10 then
      return substr(d, 1, 3) || '-' || substr(d, 4, 3) || '-' || substr(d, 7, 4);
    elsif length(d) = 11 then
      return substr(d, 1, 3) || '-' || substr(d, 4, 4) || '-' || substr(d, 8, 4);
    else
      return raw; -- 유효하지 않은 자릿수는 원본 유지
    end if;
  end if;
end;
$$;

update clients
set contact = format_kr_phone(contact)
where contact is not null and contact <> '' and contact not like '%-%';

update clients
set work_contact = format_kr_phone(work_contact)
where work_contact is not null and work_contact <> '' and work_contact not like '%-%';

update profiles
set contact = format_kr_phone(contact)
where contact is not null and contact <> '' and contact not like '%-%';

drop function format_kr_phone(text);

-- 확인용
select id, name, contact, work_contact from clients order by name;
