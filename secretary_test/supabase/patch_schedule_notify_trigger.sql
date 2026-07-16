-- schedules 테이블의 기존 행이 UPDATE되면 notify-schedule-updated Edge Function을 비동기 호출해
-- 등록자/관련 거래처에게 "일정 내용이 수정되었습니다" 이메일 알림을 보내는 트리거.
--
-- webhook secret은 notify-project-created(INSERT용)가 이미 Vault에 저장해 둔
-- notify_project_created_webhook_secret을 그대로 재사용한다(별도 시크릿을 새로 만들지 않음).
-- 이유: 세 트리거(project 등록/수정, schedule 수정) 모두 같은 Supabase 프로젝트 내부에서
-- notify-* Edge Function을 호출하는 동일한 신뢰 경계이고, 시크릿을 늘릴수록 로테이션/운영
-- 부담만 커지기 때문. 단, WEBHOOK_SECRET "환경변수"는 notify-schedule-updated Edge Function에도
-- 반드시 개별 설정해야 한다 — Supabase Edge Function 환경변수는 함수별로 독립적으로 관리되므로,
-- 값만 notify-project-created와 동일하게 맞추면 된다(Vault 시크릿 자체는 공유, 환경변수 설정은 함수별 별도).
--
-- 실행 순서 (반드시 순서대로):
-- 1) 이 SQL을 실행하기 전에 supabase/functions/notify-schedule-updated를 먼저 배포할 것.
--    아래 EDGE_FUNCTION_URL은 notify-project-created와 동일한 프로젝트 ref(peodtjwyajgratgshluy)를
--    이미 채워 넣었으므로 별도 치환이 필요 없다.
-- 2) notify-project-created 배포 시 이미 Vault에 notify_project_created_webhook_secret을
--    저장해 두었다면 이 트리거는 그 값을 그대로 재사용하므로 추가 작업이 필요 없다.
--    아직 저장한 적이 없다면 SQL Editor에서 아래를 먼저 실행:
--      select vault.create_secret('원하는-임의의-비밀-문자열', 'notify_project_created_webhook_secret');
-- 3) 그 다음 이 파일 전체를 SQL Editor에 붙여넣고 실행할 것
-- 4) 자세한 배포 절차는 supabase/README_notify_schedule_updated.md 참고

-- schedules 상세 모달의 "관련 인물에게 알림 메일 발송" 체크박스 상태를 저장하는 컬럼.
-- 기본값 true로, 기존 일정도 지금까지와 동일하게 계속 알림 메일이 발송된다.
alter table schedules add column if not exists notify_email boolean not null default true;

-- pg_net 확장: 트리거 내부에서 비동기 HTTP 요청(net.http_post)을 보내기 위해 필요
-- (notify-project-created/updated 트리거에서 이미 활성화했다면 아래는 그냥 no-op으로 통과된다)
create extension if not exists pg_net;

create or replace function notify_schedule_updated()
returns trigger
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  edge_function_url text := 'https://peodtjwyajgratgshluy.supabase.co/functions/v1/notify-schedule-updated';
  webhook_secret text;
begin
  select decrypted_secret into webhook_secret
  from vault.decrypted_secrets
  where name = 'notify_project_created_webhook_secret'
  limit 1;

  -- 알림 발송(net.http_post)이 어떤 이유로든 실패해도(pg_net 미설치, 권한 문제 등)
  -- 예외를 여기서 삼켜서 핵심 기능인 schedule UPDATE 자체는 항상 정상 커밋되도록 한다.
  begin
    perform net.http_post(
      url := edge_function_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-webhook-secret', coalesce(webhook_secret, '')
      ),
      body := jsonb_build_object(
        'schedule_id', new.id,
        'user_id', new.user_id,
        'old', jsonb_build_object(
          'title', old.title,
          'date', old.date,
          'time', old.time,
          'tag', old.tag,
          'notes', old.notes,
          'client_ids', old.client_ids,
          'start_date', old.start_date,
          'end_date', old.end_date
        ),
        'new', jsonb_build_object(
          'title', new.title,
          'date', new.date,
          'time', new.time,
          'tag', new.tag,
          'notes', new.notes,
          'client_ids', new.client_ids,
          'start_date', new.start_date,
          'end_date', new.end_date
        )
      )
    );
  exception
    when others then
      raise warning 'notify_schedule_updated: 알림 발송 실패(schedule_id=%): %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists trg_notify_schedule_updated on schedules;
create trigger trg_notify_schedule_updated
  after update on schedules
  for each row
  -- notify_email 체크박스가 꺼져 있으면(false) 다른 필드가 아무리 바뀌어도 메일을 보내지 않는다.
  -- 체크박스만 토글하고 다른 필드는 그대로면(old.title is distinct from new.title 등이 전부 false)
  -- 애초에 이 WHEN 절 자체가 거짓이 되어 발동하지 않는다 — "체크박스 변경 자체"는 알릴 내용이 없으므로 의도된 동작이다.
  -- 값이 완전히 동일한 단순 재저장 UPDATE도 마찬가지로 여기서 걸러진다.
  when (
    coalesce(new.notify_email, true) = true
    and (
      old.title is distinct from new.title
      or old.date is distinct from new.date
      or old.time is distinct from new.time
      or old.tag is distinct from new.tag
      or old.notes is distinct from new.notes
      or old.client_ids is distinct from new.client_ids
      or old.start_date is distinct from new.start_date
      or old.end_date is distinct from new.end_date
    )
  )
  execute function notify_schedule_updated();
