-- 상호 히스토리 공유(get_mutual_client_history, patch_mutual_client_history.sql) 범위를
-- "전체 항목 공개"에서 "항목별 개별 공개"로 좁힌다.
--
-- 배경(사용자 명시적 결정):
-- 기존에는 profiles.share_mutual_history를 켜면 해당 거래처에 기록한 히스토리 전부가 상대방에게
-- 노출됐다. 이를 histories.shared_with_mutual 컬럼(항목별 옵트인)으로 세분화한다.
--
-- 기본값은 false(비공개) — 이 프로젝트의 다른 프라이버시 옵트인 컬럼들(profiles.discoverable,
-- profiles.share_mutual_history)과 동일한 기본-비공개 원칙을 따른다. 사용자가 명시적으로 동의한
-- 바 있는 트레이드오프: 이 마이그레이션 직후에는 과거에 이미 노출되던 히스토리 항목도 전부
-- shared_with_mutual = false로 시작하므로, 상대방에게 다시 보이게 하려면 각 항목을 열어 개별
-- 재공개해야 한다(일괄 이전 없음).
--
-- 실행 방법: Supabase Dashboard > SQL Editor에서 이 파일 전체를 그대로 실행하세요.

alter table histories
  add column if not exists shared_with_mutual boolean not null default false;

drop function if exists get_mutual_client_history(uuid);

create or replace function get_mutual_client_history(p_other_profile_id uuid)
returns table (id text, date text, type text, title text, content text, result text, created_at bigint)
language plpgsql security definer stable
set search_path = public
as $$
declare
  v_other_client_id text;
begin
  -- 1) 상대방 미지정 또는 자기 자신이면 비공개
  if p_other_profile_id is null or p_other_profile_id = auth.uid() then
    return;
  end if;

  -- 2) 상대방(B)이 상호 히스토리 공유를 옵트인했는지 확인
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

  -- 3) 호출자(A)가 B를 거래처로 등록했는지 확인
  if not exists (
    select 1 from clients
    where user_id = auth.uid()
      and linked_profile_id = p_other_profile_id
  ) then
    return;
  end if;

  -- 4) B가 A를 거래처로 등록했는지 확인하고, 그 거래처 id를 획득(상호 등록이어야만 공유)
  select c.id into v_other_client_id
  from clients c
  where c.user_id = p_other_profile_id
    and c.linked_profile_id = auth.uid()
  limit 1;

  if v_other_client_id is null then
    return;
  end if;

  -- 모든 조건 통과 — B가 기록한 히스토리 중 항목별로 공개(shared_with_mutual = true) 표시한 것만 반환
  return query
    select h.id, h.date, h.type, h.title, h.content, h.result, h.created_at
    from histories h
    where h.user_id = p_other_profile_id
      and h.client_id = v_other_client_id
      and h.shared_with_mutual = true
    order by h.created_at desc;
end;
$$;
grant execute on function get_mutual_client_history(uuid) to authenticated;
