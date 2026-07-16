-- schedules 테이블에 새 행이 INSERT되면 notify-schedule-created Edge Function을 비동기 호출해
-- 등록자/관련 거래처에게 "새 일정이 등록되었습니다" 이메일 알림을 보내는 트리거.
--
-- notify_email 컬럼은 patch_schedule_notify_trigger.sql에서 이미 추가했으므로 여기서는
-- 컬럼을 새로 만들지 않는다(해당 패치가 먼저 실행되어 있어야 한다).
--
-- webhook secret은 notify-project-created가 이미 Vault에 저장해 둔
-- notify_project_created_webhook_secret을 그대로 재사용한다(별도 시크릿을 새로 만들지 않음).
--
-- 실행 순서 (반드시 순서대로):
-- 1) patch_schedule_notify_trigger.sql이 이미 실행되어 schedules.notify_email 컬럼이 있어야 한다.
-- 2) 이 SQL을 실행하기 전에 supabase/functions/notify-schedule-created를 먼저 배포할 것.
--    아래 EDGE_FUNCTION_URL은 notify-project-created와 동일한 프로젝트 ref(peodtjwyajgratgshluy)를
--    이미 채워 넣었으므로 별도 치환이 필요 없다.
-- 3) 그 다음 이 파일 전체를 SQL Editor에 붙여넣고 실행할 것
-- 4) 자세한 배포 절차는 supabase/README_notify_schedule_updated.md 참고

-- pg_net 확장: 트리거 내부에서 비동기 HTTP 요청(net.http_post)을 보내기 위해 필요
create extension if not exists pg_net;

create or replace function notify_schedule_created()
returns trigger
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  edge_function_url text := 'https://peodtjwyajgratgshluy.supabase.co/functions/v1/notify-schedule-created';
  webhook_secret text;
begin
  select decrypted_secret into webhook_secret
  from vault.decrypted_secrets
  where name = 'notify_project_created_webhook_secret'
  limit 1;

  -- 알림 발송(net.http_post)이 어떤 이유로든 실패해도(pg_net 미설치, 권한 문제 등)
  -- 예외를 여기서 삼켜서 핵심 기능인 schedule INSERT 자체는 항상 정상 커밋되도록 한다.
  begin
    perform net.http_post(
      url := edge_function_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-webhook-secret', coalesce(webhook_secret, '')
      ),
      body := jsonb_build_object('schedule_id', new.id)
    );
  exception
    when others then
      raise warning 'notify_schedule_created: 알림 발송 실패(schedule_id=%): %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists trg_notify_schedule_created on schedules;
create trigger trg_notify_schedule_created
  after insert on schedules
  for each row
  -- "관련 인물에게 알림 메일 발송" 체크박스가 꺼져 있으면(false) 등록 시에도 알림을 건너뛴다.
  when (coalesce(new.notify_email, true) = true)
  execute function notify_schedule_created();
