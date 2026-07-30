-- projects 테이블의 기존 행이 UPDATE되면 notify-project-updated Edge Function을 비동기 호출해
-- 등록자/관련 거래처에게 "프로젝트 내용이 수정되었습니다" 이메일 알림을 보내는 트리거.
--
-- webhook secret은 notify-project-created(INSERT용)가 이미 Vault에 저장해 둔
-- notify_project_created_webhook_secret을 그대로 재사용한다(별도 시크릿을 새로 만들지 않음).
-- 이유: 두 트리거 모두 같은 Supabase 프로젝트 내부에서 notify-project-* Edge Function을
-- 호출하는 동일한 신뢰 경계이고, 시크릿을 늘릴수록 로테이션/운영 부담만 커지기 때문.
-- 단, WEBHOOK_SECRET "환경변수"는 notify-project-updated Edge Function에도 반드시 개별
-- 설정해야 한다 — Supabase Edge Function 환경변수는 함수별로 독립적으로 관리되므로, 값만
-- notify-project-created와 동일하게 맞추면 된다(Vault 시크릿 자체는 공유, 환경변수 설정은 함수별 별도).
--
-- 실행 순서 (반드시 순서대로):
-- 1) 이 SQL을 실행하기 전에 supabase/functions/notify-project-updated를 먼저 배포할 것.
--    아래 EDGE_FUNCTION_URL은 notify-project-created와 동일한 프로젝트 ref(peodtjwyajgratgshluy)를
--    이미 채워 넣었으므로 별도 치환이 필요 없다.
-- 2) notify-project-created 배포 시 이미 Vault에 notify_project_created_webhook_secret을
--    저장해 두었다면 이 트리거는 그 값을 그대로 재사용하므로 추가 작업이 필요 없다.
--    아직 저장한 적이 없다면 SQL Editor에서 아래를 먼저 실행:
--      select vault.create_secret('원하는-임의의-비밀-문자열', 'notify_project_created_webhook_secret');
--    (이미 있는데 값을 바꾸고 싶으면:
--      select vault.update_secret(id, '새로운-비밀-문자열') from vault.secrets
--      where name = 'notify_project_created_webhook_secret';)
-- 3) 그 다음 이 파일 전체를 SQL Editor에 붙여넣고 실행할 것
-- 4) 자세한 배포 절차는 supabase/README_notify_project_created.md 참고

-- pg_net 확장: 트리거 내부에서 비동기 HTTP 요청(net.http_post)을 보내기 위해 필요
-- (notify-project-created 트리거에서 이미 활성화했다면 아래는 그냥 no-op으로 통과된다)
create extension if not exists pg_net;

-- 메일 도착 순서 보정 배경: addProject() 직후(예: ProjectScreen.js load()의 startDate 백필,
-- syncProjectMirrors 등) 같은 프로젝트가 INSERT되자마자 짧은 시간 안에 다시 UPDATE되는 경우가
-- 있다. INSERT/UPDATE 트리거 모두 net.http_post로 각자 독립적인 비동기 HTTP 요청을 큐에 넣을
-- 뿐이라, 두 Edge Function 호출(및 그 안의 Gmail SMTP 발송)이 서로 다른 속도로 완료되면서
-- "프로젝트 내용 수정" 메일이 "새 프로젝트 등록" 메일보다 먼저 도착하는 순서 역전이 실제로
-- 관찰됐다. DB 트리거 안에서 pg_sleep으로 지연시키면 UPDATE 트랜잭션 자체(및 이를 호출한
-- updateProject())가 그 시간만큼 블로킹되므로, 대신 new.created_at이 아주 최근(15초 이내)이면
-- "이 UPDATE는 사실상 생성 흐름의 연장"으로 보고 is_recent_creation 플래그를 payload에 실어
-- Edge Function(notify-project-updated) 쪽에서 발송 전에 지연시키도록 위임한다(트랜잭션은
-- 즉시 커밋되고, 지연은 별도 비동기 실행에서만 발생).
create or replace function notify_project_updated()
returns trigger
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  edge_function_url text := 'https://peodtjwyajgratgshluy.supabase.co/functions/v1/notify-project-updated';
  webhook_secret text;
  is_recent_creation boolean;
begin
  is_recent_creation := new.created_at is not null
    and (extract(epoch from clock_timestamp()) * 1000 - new.created_at) < 15000;

  -- Vault에서 webhook secret 조회 (notify-project-created와 동일한 시크릿을 재사용)
  select decrypted_secret into webhook_secret
  from vault.decrypted_secrets
  where name = 'notify_project_created_webhook_secret'
  limit 1;

  -- 알림 발송(net.http_post)이 어떤 이유로든 실패해도(pg_net 미설치, 권한 문제 등)
  -- 예외를 여기서 삼켜서 핵심 기능인 project UPDATE 자체는 항상 정상 커밋되도록 한다.
  begin
    perform net.http_post(
      url := edge_function_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-webhook-secret', coalesce(webhook_secret, '')
      ),
      -- project_id/user_id와 함께 변경 전(old)/후(new) 값을 jsonb로 함께 담아 보낸다.
      -- Edge Function이 projects 테이블을 다시 조회하지 않고도 이 값만으로 무엇이
      -- 바뀌었는지 비교(diff)해서 메일 본문에 "상태: 진행중 → 위험" 형태로 보여줄 수 있다.
      body := jsonb_build_object(
        'project_id', new.id,
        'user_id', new.user_id,
        'is_recent_creation', is_recent_creation,
        'old', jsonb_build_object(
          'title', old.title,
          'status', old.status,
          'priority', old.priority,
          'progress', old.progress,
          'start_date', old.start_date,
          'deadline', old.deadline,
          'notes', old.notes,
          'client_ids', old.client_ids
        ),
        'new', jsonb_build_object(
          'title', new.title,
          'status', new.status,
          'priority', new.priority,
          'progress', new.progress,
          'start_date', new.start_date,
          'deadline', new.deadline,
          'notes', new.notes,
          'client_ids', new.client_ids
        )
      )
    );
  exception
    when others then
      raise warning 'notify_project_updated: 알림 발송 실패(project_id=%): %', new.id, sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists trg_notify_project_updated on projects;
create trigger trg_notify_project_updated
  after update on projects
  for each row
  -- 실제로 의미 있는 필드(title/status/priority/progress/start_date/deadline/notes/client_ids)가
  -- 하나라도 바뀐 경우에만 발동. updated_at만 갱신되거나 값이 완전히 동일한 단순 재저장 UPDATE는
  -- 여기서 걸러져 함수 본문까지 진입하지 않으므로 불필요한 메일이 발송되지 않는다.
  -- new.origin_project_id is null: sync_project_mirrors()가 원본 수정 시 관련 인물의 사본도
  -- on conflict do update로 함께 갱신하는데, 사본 행의 user_id는 그 관련 인물 본인이라
  -- 이 트리거를 그대로 타면 "등록자"가 실제 원본 등록자가 아니라 그 관련 인물로 잘못 표시된
  -- "프로젝트 내용 수정" 메일이 원본 수정 메일과 별도로 한 번 더 발송된다(trg_notify_project_created의
  -- 동일한 문제와 같은 원인 — patch_project_notify_trigger.sql 참고). 사본(origin_project_id
  -- not null) 행의 UPDATE는 애초에 이 트리거를 타지 않도록 제외한다.
  when (
    new.origin_project_id is null
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
