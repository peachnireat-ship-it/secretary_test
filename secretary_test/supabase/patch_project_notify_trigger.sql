-- projects 테이블에 새 행이 INSERT되면 notify-project-created Edge Function을 비동기 호출해
-- 등록자/관련 거래처에게 이메일 알림을 보내는 트리거.
--
-- 실행 순서 (반드시 순서대로):
-- 1) 이 SQL을 실행하기 전에 supabase/functions/notify-project-created를 먼저 배포하고,
--    아래 EDGE_FUNCTION_URL 플레이스홀더(<PROJECT_REF>)를 실제 프로젝트 ref로 교체할 것
--    (Supabase 대시보드 > Project Settings > API 에서 Project URL로 확인 가능)
-- 2) Supabase 대시보드 SQL Editor에서 아래 명령으로 webhook secret을 Vault에 저장할 것
--    (일반 `alter database ... set`은 호스팅 환경에서 슈퍼유저 권한이 없어 permission denied가
--    발생하므로, Supabase의 암호화된 시크릿 저장소인 Vault를 사용한다.
--    이 값은 Edge Function의 WEBHOOK_SECRET 환경변수와 동일한 값이어야 한다):
--      select vault.create_secret('원하는-임의의-비밀-문자열', 'notify_project_created_webhook_secret');
--    (이미 한 번 만들었는데 값을 바꾸고 싶으면 아래로 갱신:
--      select vault.update_secret(id, '새로운-비밀-문자열') from vault.secrets
--      where name = 'notify_project_created_webhook_secret';)
-- 3) 그 다음에 이 파일 전체를 SQL Editor에 붙여넣고 실행할 것
-- 4) 자세한 배포 절차는 supabase/README_notify_project_created.md 참고

-- pg_net 확장: 트리거 내부에서 비동기 HTTP 요청(net.http_post)을 보내기 위해 필요
create extension if not exists pg_net;

create or replace function notify_project_created()
returns trigger
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  edge_function_url text := 'https://peodtjwyajgratgshluy.supabase.co/functions/v1/notify-project-created';
  webhook_secret text;
begin
  -- Vault에서 webhook secret 조회 (2번 단계에서 vault.create_secret으로 저장한 값)
  select decrypted_secret into webhook_secret
  from vault.decrypted_secrets
  where name = 'notify_project_created_webhook_secret'
  limit 1;
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
  -- sync_project_mirrors()(patch_project_mirror.sql)가 관련 인물에게 만들어주는 사본
  -- (origin_project_id not null)까지 이 트리거를 타면, 사본의 user_id가 그 관련 인물
  -- 본인이라 "등록자"를 사본 행 기준으로 조회하면서 실제 프로젝트 등록자가 아니라 그
  -- 관련 인물의 이름이 주최자로 잘못 표시된 채 "새 프로젝트 등록" 메일이 한 번 더
  -- 발송된다(원본 INSERT에서 이미 올바른 주최자로 정상 발송됨). schedules 쪽은 사본에
  -- notify_email:false를 심어 동일한 문제를 이미 피하고 있었는데(patch_schedule_mirror.sql),
  -- projects 쪽에는 이 방어가 빠져 있었다. origin_project_id가 있는(=사본) 행은 애초에
  -- 이 트리거 자체를 타지 않도록 제외한다.
  when (new.origin_project_id is null)
  execute function notify_project_created();
