-- 같은 사용자·같은 거래처 안에 이름이 동일한 토픽이 실수로 중복 생성된 경우를 하나의 id로
-- 병합하고, 재발을 막기 위해 유니크 인덱스를 추가한다.
-- 배경: topics 테이블에는 이름 중복을 막는 제약이 없어, 토픽 관리 모달에서 "새 토픽"을 두 번
-- 누르는 등으로 같은 이름의 토픽이 서로 다른 id로 여러 개 생길 수 있었다(앱 코드는
-- ClientHistorySection.js handleCreateTopic()에서 이미 이름 중복 시 기존 id를 재사용하도록
-- 수정됨). 이 스크립트는 이미 생성돼버린 중복 데이터를 정리한다.
-- 실행: Supabase Dashboard > SQL Editor에서 이 파일 전체를 실행한다.

-- 1) 중복 그룹별로 대표 토픽(공유중인 것 우선, 그 다음 가장 먼저 만든 것)을 남기고
--    나머지 토픽에 연결된 히스토리를 대표 토픽으로 재배정한 뒤 중복 토픽을 삭제한다.
do $$
declare
  r record;
  keep_id text;
begin
  for r in
    select user_id, client_id, lower(trim(name)) as norm_name
    from topics
    group by user_id, client_id, lower(trim(name))
    having count(*) > 1
  loop
    select id into keep_id
    from topics
    where user_id = r.user_id and client_id = r.client_id and lower(trim(name)) = r.norm_name
    order by shared desc, created_at asc
    limit 1;

    update histories
    set topic_id = keep_id
    where topic_id in (
      select id from topics
      where user_id = r.user_id and client_id = r.client_id and lower(trim(name)) = r.norm_name and id <> keep_id
    );

    delete from topics
    where user_id = r.user_id and client_id = r.client_id and lower(trim(name)) = r.norm_name and id <> keep_id;
  end loop;
end $$;

-- 2) 같은 사용자·같은 거래처 안에서 이름(공백 제거, 대소문자 무시)이 같은 토픽을 다시는
--    만들 수 없도록 DB 레벨에서 방지(앱 레벨 방지의 안전망).
create unique index if not exists topics_unique_name_per_client
  on topics (user_id, client_id, lower(trim(name)));
