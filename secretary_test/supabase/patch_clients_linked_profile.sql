-- clients row가 실제 로그인 가능한 ROSTER 계정(=profiles row)과 동일 인물일 경우,
-- 그 연결 관계를 나타내는 linked_profile_id 컬럼을 추가한다.
--
-- 배경: clients.id는 PRIMARY KEY라서 여러 사용자가 각자 소유한 "같은 사람"의 clients row
-- (예: 최수아가 가진 박지훈, 이서연이 가진 박지훈)를 전부 profiles.id 하나로 통일할 수 없다
-- (PK 유일성 위반). 대신 각 row는 자기 고유 id를 유지하되, linked_profile_id로
-- "이 clients row가 실제로 어떤 profiles.id를 가리키는지"만 표시한다.
--
-- 이 컬럼이 채워진 clients row는, 상세 정보(특히 email)가 필요할 때
-- clients.email 대신 profiles.email을 우선 사용하도록 애플리케이션/Edge Function에서 참조한다.

alter table clients
  add column if not exists linked_profile_id uuid references profiles(id);

-- 기존 데이터 백필: name + company(=profiles.team)가 일치하는 clients row를
-- 해당 profiles row와 연결한다. (본인 소유의 클라이언트 row는 애초에 앱에서
-- 본인 이름을 필터링하므로 자기 자신과 연결되는 경우는 없음)
update clients c
set linked_profile_id = p.id
from profiles p
where c.linked_profile_id is null
  and c.name = p.name
  and c.company = p.team;

-- 확인용
select c.id, c.user_id, c.name, c.company, c.email as client_email,
       c.linked_profile_id, p.email as profile_email
from clients c
left join profiles p on p.id = c.linked_profile_id
where c.linked_profile_id is not null
order by c.name, c.company;
