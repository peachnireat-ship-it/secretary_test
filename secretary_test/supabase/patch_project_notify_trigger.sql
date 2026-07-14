-- projects 테이블에 새 행이 INSERT되면 notify-project-created Edge Function을 비동기 호출해
-- 등록자/관련 거래처에게 이메일 알림을 보내는 트리거.
--
-- 실행 순서 (반드시 순서대로):
-- 1) 이 SQL을 실행하기 전에 supabase/functions/notify-project-created를 먼저 배포하고,
--    아래 EDGE_FUNCTION_URL 플레이스홀더(<PROJECT_REF>)를 실제 프로젝트 ref로 교체할 것
--    (Supabase 대시보드 > Project Settings > API 에서 Project URL로 확인 가능)
-- 2) Supabase 대시보드 SQL Editor에서 아래 명령으로 webhook_secret을 설정할 것
--    (이 값은 Edge Function의 WEBHOOK_SECRET 환경변수와 동일한 값이어야 한다):
--      alter database postgres set app.settings.webhook_secret = '원하는-임의의-비밀-문자열';
-- 3) 그 다음에 이 파일 전체를 SQL Editor에 붙여넣고 실행할 것
-- 4) 자세한 배포 절차는 supabase/README_notify_project_created.md 참고

-- pg_net 확장: 트리거 내부에서 비동기 HTTP 요청(net.http_post)을 보내기 위해 필요
create extension if not exists pg_net;

create or replace function notify_project_created()
returns trigger
language plpgsql
security definer
as $$
declare
  -- TODO: <PROJECT_REF>를 실제 Supabase 프로젝트 ref로 교체할 것
  edge_function_url text := 'https://<PROJECT_REF>.supabase.co/functions/v1/notify-project-created';
  webhook_secret text := current_setting('app.settings.webhook_secret', true);
begin
  -- 알림 발송(net.http_post)이 어떤 이유로든 실패해도(pg_net 미설치, 권한 문제 등)
  -- 예외를 여기서 삼켜서 핵심 기능인 project INSERT 자체는 항상 정상 커밋되도록 한다.
  begin
    perform net.http_post(
      url := edge_function_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-webhook-secret', coalesce(webhook_secret, '')
      ),
      body := jsonb_build_object('project_id', new.id)
    );
  exception
    when others then
      raise warning 'notify_project_created: 알림 발송 실패(project_id=%): %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists trg_notify_project_created on projects;
create trigger trg_notify_project_created
  after insert on projects
  for each row
  execute function notify_project_created();
