-- 상호 등록된 거래처가 공유로 설정한 토픽에 서로의 히스토리를 연결할 수 있게 한다.
-- 실행: Supabase Dashboard > SQL Editor에서 이 파일 전체를 실행한다.

create or replace function get_mutual_client_topics(p_other_profile_id uuid)
returns table (id text, client_id text, name text, created_at bigint)
language plpgsql security definer stable
set search_path = public
as $$
declare
  v_other_client_id text;
begin
  if p_other_profile_id is null or p_other_profile_id = auth.uid() then return; end if;

  if not exists (
    select 1 from profiles p
    where p.id = p_other_profile_id and p.share_mutual_history = true
  ) or not exists (
    select 1 from clients c
    where c.user_id = auth.uid() and c.linked_profile_id = p_other_profile_id
  ) then return; end if;

  select c.id into v_other_client_id
  from clients c
  where c.user_id = p_other_profile_id and c.linked_profile_id = auth.uid()
  limit 1;
  if v_other_client_id is null then return; end if;

  return query
    select t.id, t.client_id, t.name, t.created_at
    from topics t
    where t.user_id = p_other_profile_id
      and t.client_id = v_other_client_id
      and t.shared = true
    order by t.created_at desc;
end;
$$;
grant execute on function get_mutual_client_topics(uuid) to authenticated;

create or replace function validate_history_topic_access()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  v_topic_user_id uuid;
  v_topic_client_id text;
  v_topic_shared boolean;
begin
  if new.topic_id is null then return new; end if;

  select t.user_id, t.client_id, t.shared
    into v_topic_user_id, v_topic_client_id, v_topic_shared
  from topics t where t.id = new.topic_id;
  if not found then raise exception '존재하지 않는 토픽입니다.'; end if;

  -- 내 토픽은 같은 거래처 히스토리에만 연결 가능하다.
  if v_topic_user_id = new.user_id then
    if v_topic_client_id <> new.client_id then
      raise exception '다른 거래처의 토픽에는 히스토리를 연결할 수 없습니다.';
    end if;
    return new;
  end if;

  -- 상대 토픽은 상호 등록, 상대의 공유 허용, 토픽 공유 상태를 모두 만족해야 한다.
  if not v_topic_shared
     or not exists (select 1 from profiles p where p.id = v_topic_user_id and p.share_mutual_history = true)
     or not exists (select 1 from clients c where c.id = new.client_id and c.user_id = new.user_id and c.linked_profile_id = v_topic_user_id)
     or not exists (select 1 from clients c where c.id = v_topic_client_id and c.user_id = v_topic_user_id and c.linked_profile_id = new.user_id) then
    raise exception '공동 편집 권한이 없는 토픽입니다.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validate_history_topic_access on histories;
create trigger trg_validate_history_topic_access
  before insert or update of topic_id, client_id, user_id on histories
  for each row execute function validate_history_topic_access();
