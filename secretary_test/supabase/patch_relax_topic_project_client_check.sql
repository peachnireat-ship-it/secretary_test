-- "소속 회사" 개념 제거에 따른 후속 조치.
-- 기존 validate_topic_project_client() 트리거는 토픽의 client_id가 프로젝트의
-- owner_client_id(소속 회사 대표 담당자)와 반드시 일치해야 한다고 강제했다. 그런데 이제 프로젝트
-- 상세 모달에서 "소속 회사" 선택 UI 자체를 없애고, 관련 인물(직접 추가 + 회의록 연결 포함) 중
-- 아직 같은 이름의 토픽이 없는 누구에게든 토픽을 생성할 수 있도록 바꿨다(ProjectScreen.js
-- handleCreateProjectTopic). owner_client_id는 앞으로 항상 null이 되므로, 기존 트리거를 그대로
-- 두면 모든 토픽 생성이 "일치해야 합니다" 예외로 막힌다.
--
-- meeting_records.project_id와 동일한 신뢰 수준(단순 소유권 확인만)으로 완화한다: 토픽의
-- project_id가 가리키는 프로젝트가 실제로 같은 사용자(user_id) 소유인지만 확인하고,
-- client_id가 그 프로젝트의 특정 담당자와 일치해야 한다는 제약은 제거한다.
create or replace function validate_topic_project_client()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_user_id uuid;
begin
  if new.project_id is null then return new; end if;
  select user_id into v_project_user_id from projects where id = new.project_id;
  if v_project_user_id is null or v_project_user_id <> new.user_id then
    raise exception '존재하지 않거나 접근 권한이 없는 프로젝트(project_id=%)입니다.', new.project_id;
  end if;
  return new;
end;
$$;
-- 트리거 자체(trg_validate_topic_project_client)는 이미 존재하며 project_id/client_id/user_id
-- 변경 시 실행되도록 등록돼 있으므로 재생성할 필요 없다 — 함수 본문만 교체하면 된다.
