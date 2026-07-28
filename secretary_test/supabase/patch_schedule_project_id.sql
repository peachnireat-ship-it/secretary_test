-- 일정(schedules)에 관련 프로젝트 매핑 추가.
-- meeting_records.project_id와 동일한 방식(단순 FK, 소유권 교차검증 트리거 없음) — 값은 화면에서
-- 로그인 계정의 프로젝트 목록(콤보박스)으로만 선택되고, RLS가 schedules 행 자체의 user_id는
-- 이미 검사하므로 project_id는 표시용 참조로 충분하다.
-- 실행: Supabase Dashboard > SQL Editor에서 이 파일 전체를 실행한다.

alter table schedules add column if not exists project_id text references projects(id) on delete set null;
create index if not exists schedules_project_idx on schedules(project_id);
