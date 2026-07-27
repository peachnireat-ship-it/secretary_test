-- 히스토리를 업무 토픽 단위로 묶어보기 위한 topics 테이블 신설.
--
-- 배경(사용자 명시적 결정 — 재질문 없이 그대로 구현):
-- 1. 토픽은 사용자가 히스토리 등록/수정 시 직접 입력해 만든다(AI 자동 분류 아님). 상호 등록된
--    거래처 관계에서는 A/B 각자 자신의 client row 아래에 독립적으로 토픽을 만든다 — "둘 중
--    한 명이 등록할 수 있다"는 것은 공유 단일 엔티티가 아니라, 각자 자기 쪽에서 만든 토픽을
--    각자 공유 여부와 무관하게 자유롭게 관리한다는 뜻이다.
-- 2. 공유 게이트는 AND 방식이다 — 상대방에게 어떤 히스토리가 보이려면 다음을 모두 만족해야 한다:
--    가) 히스토리 개별 공개(histories.shared_with_mutual = true, patch_history_shared_with_mutual.sql)
--    나) 토픽이 지정된 경우, 그 토픽도 공유 옵트인(topics.shared = true). 토픽이 없으면(미분류)
--        이 조건은 생략하고 가)만으로 판정한다.
--    기존 "항목별 개별 공개" 체크박스는 그대로 유지하고, 토픽 단위 공유 체크를 추가 게이트로 얹는
--    구조다(항목이 공개여도 토픽이 비공개면 안 보이고, 토픽이 공개여도 항목이 비공개면 안 보임).
--
-- histories.topic(자유 입력 문자열) 컬럼을 도입했던 이전 버전을 이 패치로 대체한다(아직 실행 전
-- 상태에서 설계를 변경함 — 별도 마이그레이션 불필요). topics 테이블은 clients/histories와 동일한
-- "user_id = auth.uid()" RLS 정책을 따른다.
--
-- 실행 방법: Supabase Dashboard > SQL Editor에서 이 파일 전체를 그대로 실행하세요.

create table if not exists topics (
  id text primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  client_id text not null references clients(id) on delete cascade,
  name text not null,
  shared boolean not null default false,
  created_at bigint not null
);
create index if not exists topics_client_idx on topics(client_id);

alter table topics enable row level security;

drop policy if exists topics_all_own on topics;
create policy topics_all_own on topics
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table histories
  add column if not exists topic_id text references topics(id) on delete set null;

drop function if exists get_mutual_client_history(uuid);

create or replace function get_mutual_client_history(p_other_profile_id uuid)
returns table (id text, date text, type text, title text, content text, result text, topic_name text, created_at bigint)
language plpgsql security definer stable
set search_path = public
as $$
declare
  v_other_client_id text;
begin
  if p_other_profile_id is null or p_other_profile_id = auth.uid() then
    return;
  end if;

  -- 주의: returns table(id text, ...)이 plpgsql 함수 스코프에 "id"라는 OUT 파라미터를 암묵
  -- 선언하므로, 아래에서 테이블 별칭 없이 "id"라고만 쓰면 profiles.id인지 OUT 파라미터 id인지
  -- 모호해져 42702(column reference "id" is ambiguous) 에러가 난다. 반드시 별칭으로 한정한다.
  if not exists (
    select 1 from profiles p
    where p.id = p_other_profile_id
      and p.share_mutual_history = true
  ) then
    return;
  end if;

  if not exists (
    select 1 from clients
    where user_id = auth.uid()
      and linked_profile_id = p_other_profile_id
  ) then
    return;
  end if;

  select c.id into v_other_client_id
  from clients c
  where c.user_id = p_other_profile_id
    and c.linked_profile_id = auth.uid()
  limit 1;

  if v_other_client_id is null then
    return;
  end if;

  -- 모든 조건 통과 — B가 기록한 히스토리 중 항목별 공개 + (토픽 있으면 토픽도 공유) 조건을
  -- 모두 만족하는 것만 반환. topic_name은 SECURITY DEFINER로 topics RLS를 우회해 조회한다
  -- (호출자는 상대방의 topics 행에 직접 접근 권한이 없음).
  return query
    select h.id, h.date, h.type, h.title, h.content, h.result, t.name, h.created_at
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
