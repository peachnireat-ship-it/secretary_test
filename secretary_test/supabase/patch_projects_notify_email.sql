-- 프로젝트 추가/수정 모달의 "관련 인물에게 알림 메일 발송" 체크박스 상태를 저장하는 컬럼과,
-- 이미 배포되어 있는 notify-project-created(INSERT)/notify-project-updated(UPDATE) 트리거가
-- 이 체크박스 값을 존중하도록 WHEN 절을 추가해 두 트리거를 재생성한다.
--
-- 주의: 이 파일은 patch_project_notify_trigger.sql / patch_project_update_notify_trigger.sql이
-- 이미 실행되어 두 트리거·함수가 존재하는 것을 전제로 한다(둘 다 이미 배포·운영 중).
-- Edge Function(notify-project-created/updated) 코드 자체는 수정할 필요가 없다 — 게이팅은
-- DB 트리거의 WHEN 절에서만 처리하므로, notify_email이 false인 저장은 Edge Function 호출 자체가
-- 발생하지 않는다.
--
-- 실행 순서: 이 파일 전체를 SQL Editor에 붙여넣고 실행하기만 하면 된다(추가 배포 불필요).

-- 기본값 true로, 기존 프로젝트도 지금까지와 동일하게 계속 알림 메일이 발송된다.
alter table projects add column if not exists notify_email boolean not null default true;

-- notify-project-created(INSERT) 트리거: 기존에는 WHEN 절이 없어 항상 발동했다.
-- notify_email이 false(체크 해제)면 등록 시에도 알림을 건너뛰도록 WHEN 절을 추가해 재생성한다.
drop trigger if exists trg_notify_project_created on projects;
create trigger trg_notify_project_created
  after insert on projects
  for each row
  when (coalesce(new.notify_email, true) = true)
  execute function notify_project_created();

-- notify-project-updated(UPDATE) 트리거: 기존 WHEN 절(의미 있는 필드 변경 여부) 앞에
-- notify_email 체크를 추가한다. 체크박스만 껐다 켜고 다른 필드가 안 바뀐 경우는 원래도
-- 발동하지 않았으므로 동작 변화 없음.
drop trigger if exists trg_notify_project_updated on projects;
create trigger trg_notify_project_updated
  after update on projects
  for each row
  when (
    coalesce(new.notify_email, true) = true
    and (
      old.title is distinct from new.title
      or old.status is distinct from new.status
      or old.priority is distinct from new.priority
      or old.progress is distinct from new.progress
      or old.start_date is distinct from new.start_date
      or old.deadline is distinct from new.deadline
      or old.notes is distinct from new.notes
      or old.client_ids is distinct from new.client_ids
    )
  )
  execute function notify_project_updated();
