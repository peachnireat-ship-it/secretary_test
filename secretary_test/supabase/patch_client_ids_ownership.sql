-- 보안 재감사(_review/secretary_test-20260723/02_security.md, 발견 #1) CRITICAL 취약점 수정.
--
-- 문제: schedules.client_ids / projects.client_ids(jsonb 배열, 각 원소는 clients.id 텍스트)에
-- 소유권 검증이 전혀 없었다. RLS(schedules_all_own/projects_all_own)는 행 자체의
-- user_id = auth.uid()만 검사할 뿐, 배열 안의 client_ids 원소가 실제로 호출자 소유의 거래처인지는
-- 검사하지 않는다. 알림 메일 파이프라인(DB 트리거 → Edge Function, Service Role 키 사용)이 이
-- 배열을 소유권 필터 없이 그대로 조회해 이메일을 발송하므로, 공격자가 자신의 일정/프로젝트에
-- 타인의 clients.id를 끼워 넣으면 그 거래처의 이메일이 유출되고 임의 내용의 메일이 발송될 수
-- 있었다.
--
-- 조치(3단계 방어):
--   (a) DB 레벨(이 파일) — schedules/projects에 BEFORE INSERT OR UPDATE 트리거를 추가해,
--       client_ids 배열의 각 원소가 new.user_id 소유의 clients.id인지 강제한다. 가장 근본적인
--       방어선이며, 다른 두 방어(앱 레벨/Edge Function 레벨)를 어떤 경로로든 우회해도 여기서 막힌다.
--   (b) 앱 레벨 — src/services/storage.js의 addSchedule/updateSchedule/saveSchedules/
--       addProject/updateProject/saveProjects에서 저장 전 client_ids 소유권을 사전 검증해
--       사용자 친화적인 한국어 에러 메시지를 준다.
--   (c) Edge Function 레벨 — notify-schedule-created/updated, notify-project-created/updated
--       4개 함수의 clients 조회에 .eq('user_id', ...) 방어적 이중 필터를 추가한다.
--
-- 실행 방법: Supabase Dashboard > SQL Editor에서 이 파일 전체를 그대로 실행하세요.
-- (다른 patch_*.sql과 동일한 관례 — DDL은 앱 코드/스크립트로 자동 실행되지 않으며 수동 실행이 필요하다.)

create or replace function validate_client_ids_ownership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id text;
begin
  -- client_ids가 null이거나 빈 배열이면 통과(기존 클라이언트 미연결 일정/프로젝트는 그대로 허용).
  if new.client_ids is null or jsonb_array_length(new.client_ids) = 0 then
    return new;
  end if;

  -- new.user_id 기준으로 검증한다. schedules/projects 두 테이블 모두 client_ids/user_id
  -- 컬럼명이 동일하므로 함수 하나로 두 테이블에 공용으로 재사용한다(TG_TABLE_NAME 분기 불필요).
  --
  -- 주의(projects 전용 케이스): projects는 updateProjectAsCompanyAdmin()을 통해 회사 관리자가
  -- user_id가 자신이 아닌 행(다른 직원의 프로젝트)을 수정할 수 있다. 이 경우에도 검증 기준은
  -- "new.user_id(그 프로젝트의 실제 소유자) 기준으로 client_ids가 유효한 clients.id인가"여야
  -- 하며, 이 트리거는 new.user_id를 기준으로 검증하므로 이 케이스에서도 자연스럽게 올바르게
  -- 동작한다 — 관리자가 남의 client_id를 끼워넣는 것도 함께 막아주므로 오히려 바람직하다.
  --
  -- security definer + search_path 고정: BEFORE 트리거가 invoker 권한으로 clients를 SELECT하면
  -- clients_all_own RLS(user_id = auth.uid())에 걸려, 회사 관리자가 auth.uid() != new.user_id인
  -- 프로젝트를 수정할 때 정당한 client_ids까지 오탐으로 거부될 수 있다. SECURITY DEFINER로 RLS를
  -- 우회해 new.user_id 기준으로만 존재 여부를 정확히 판단한다.
  for v_client_id in select jsonb_array_elements_text(new.client_ids)
  loop
    if not exists (select 1 from clients where id = v_client_id and user_id = new.user_id) then
      raise exception '존재하지 않거나 접근 권한이 없는 거래처(client_id=%)가 포함되어 있습니다.', v_client_id;
    end if;
  end loop;

  return new;
end;
$$;

drop trigger if exists trg_validate_schedule_client_ids on schedules;
create trigger trg_validate_schedule_client_ids
  before insert or update on schedules
  for each row execute function validate_client_ids_ownership();

drop trigger if exists trg_validate_project_client_ids on projects;
create trigger trg_validate_project_client_ids
  before insert or update on projects
  for each row execute function validate_client_ids_ownership();
