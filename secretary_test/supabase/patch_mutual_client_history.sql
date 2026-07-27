-- 상호 등록된 거래처 간 히스토리(histories) 열람 공유 기능.
--
-- 배경(사용자 명시적 결정 — 재질문 없이 그대로 구현):
-- 1. 공유 조건은 "상호 등록 + 별도 옵트인 필요"다. A가 B를 거래처로 등록(clients.linked_profile_id로
--    연결)했고, B도 A를 거래처로 등록했으며, B가 자신의 프로필에서 별도 토글(share_mutual_history)을
--    켠 경우에만 A가 B의 히스토리를 볼 수 있다. 각자의 토글은 "내 히스토리를 상대방에게 공개할지"만
--    독립적으로 제어한다 — 대칭 관계이며, A→B 공개 여부는 B의 토글이, B→A 공개 여부는 A의 토글이
--    각각 결정한다(한쪽이 켰다고 양쪽 다 보이는 것이 아니다).
-- 2. 공유 범위는 전체 항목 공개다. date, type, title, content, result 전부 그대로 노출한다(요약/
--    일부 필드만 공개하는 것이 아니다).
--
-- profiles.discoverable 옵트인 패턴(patch_profile_discoverable_search.sql)과 동일한 스타일로
-- share_mutual_history 컬럼을 추가한다. 기본값 false(옵트인) — 사용자가 설정 화면에서 명시적으로
-- 켜야만 상대방에게 내 히스토리가 노출된다(마이그레이션 직후 기존 사용자 전원은 비공개 상태 유지).
--
-- get_mutual_client_history(p_other_profile_id)는 SECURITY DEFINER 함수로, 다음 4단계를 모두
-- 만족해야만 결과를 반환한다(하나라도 실패하면 빈 결과 — 이유를 구분해 노출하지 않는다. 프라이버시상
-- "왜 안 보이는지"를 알려주는 것 자체가 정보 유출이 될 수 있기 때문):
--   1) p_other_profile_id가 null이거나 호출자(auth.uid()) 자신이면 빈 결과.
--   2) 상대방(B)의 profiles.share_mutual_history가 true인지 확인 — false면 빈 결과(상대방이
--      옵트인하지 않았으면 무조건 비공개, 예외 없음).
--   3) 호출자(A)가 B를 거래처로 등록했는지 확인(clients.user_id = auth.uid() and
--      linked_profile_id = p_other_profile_id) — 없으면 빈 결과.
--   4) B가 A를 거래처로 등록했는지 확인(clients.user_id = p_other_profile_id and
--      linked_profile_id = auth.uid())하고 그 거래처의 id를 획득 — 없으면 빈 결과(상호 등록이
--      아니면 공유하지 않는다).
-- 4단계를 모두 통과하면, B가 소유한(user_id = B) histories 중 client_id가 4)에서 찾은 B의 거래처
-- id와 일치하는 행 전부를 created_at desc로 반환한다.
--
-- 신규 함수라 반환 컬럼 구성이 처음부터 확정되어 있어 42P13(반환 타입 변경 불가) 문제는 없지만,
-- 재실행 시 안전을 위해 관례상 drop function if exists를 create or replace 앞에 둔다.
--
-- 실행 방법: Supabase Dashboard > SQL Editor에서 이 파일 전체를 그대로 실행하세요.
-- (다른 patch_*.sql과 동일한 관례 — DDL은 앱 코드/스크립트로 자동 실행되지 않으며 수동 실행이 필요하다.)

alter table profiles
  add column if not exists share_mutual_history boolean not null default false;

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

  -- 모든 조건 통과 — B가 기록한 히스토리(전체 항목)를 그대로 반환
  return query
    select h.id, h.date, h.type, h.title, h.content, h.result, h.created_at
    from histories h
    where h.user_id = p_other_profile_id
      and h.client_id = v_other_client_id
    order by h.created_at desc;
end;
$$;
grant execute on function get_mutual_client_history(uuid) to authenticated;
