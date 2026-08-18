-- useProjectForm.js의 알림메일 체크박스 버그(관련 인물 유무로 매번 강제 덮어씀, 저장된 실제
-- notify_email 값을 읽지 않고 매 저장마다 그 값을 잘못된 값으로 재기록) 때문에, 관련 인물이
-- 없는 프로젝트에도 notify_email이 true로 잘못 저장되어 있는 경우가 실제로 확인됨(프로젝트
-- 탭 AI 도우미가 이 값을 그대로 읽어 "관련 인물에게 알림 메일 발송 설정된 프로젝트" 목록에
-- 관련 인물이 아예 없는 프로젝트까지 포함시키는 문제로 드러남).
--
-- 관련 인물이 없으면 알림 메일을 보낼 대상 자체가 없으므로 notify_email이 true인 것 자체가
-- 논리적으로 의미 없는 상태(=버그의 흔적)다. 이 조합만 결정적으로 false로 정리한다.
-- 관련 인물이 있는 프로젝트는 실제 사용자 의도(원래 켜져 있었는지 꺼져 있었는지)를 코드만으로는
-- 알 수 없으므로 건드리지 않는다 — 앱에서 개별적으로 확인해 필요하면 다시 저장해야 한다.
--
-- 실행: Supabase Dashboard > SQL Editor에서 이 파일 전체를 실행한다.

update projects
set notify_email = false
where notify_email = true
  and (client_ids is null or jsonb_array_length(client_ids) = 0);
