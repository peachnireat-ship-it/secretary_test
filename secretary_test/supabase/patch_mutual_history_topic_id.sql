-- 토픽 그룹을 이름이 아닌 topic_id로 구분하기 위한 RPC 반환값 확장.
-- 실행: Supabase Dashboard > SQL Editor에서 이 파일 전체를 실행한다.

drop function if exists get_mutual_client_history(uuid);

create or replace function get_mutual_client_history(p_other_profile_id uuid)
returns table (id text, date text, type text, title text, content text, result text, topic_id text, topic_name text, created_at bigint)
language plpgsql security definer stable
set search_path = public
as $$
declare
  v_other_client_id text;
begin
  if p_other_profile_id is null or p_other_profile_id = auth.uid() then return; end if;
  if not exists (
    select 1 from profiles p where p.id = p_other_profile_id and p.share_mutual_history = true
  ) or not exists (
    select 1 from clients c where c.user_id = auth.uid() and c.linked_profile_id = p_other_profile_id
  ) then return; end if;

  select c.id into v_other_client_id
  from clients c where c.user_id = p_other_profile_id and c.linked_profile_id = auth.uid()
  limit 1;
  if v_other_client_id is null then return; end if;

  return query
    select h.id, h.date, h.type, h.title, h.content, h.result, h.topic_id, t.name, h.created_at
    from histories h
    left join topics t on t.id = h.topic_id
    where h.user_id = p_other_profile_id
      and h.client_id = v_other_client_id
      and h.shared_with_mutual = true
      and (h.topic_id is null or t.shared = true)
    order by h.created_at desc;
end;
$$;
grant execute on function get_mutual_client_history(uuid) to authenticated;
