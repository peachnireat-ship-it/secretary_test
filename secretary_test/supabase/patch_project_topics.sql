-- 담당자(개인) - 프로젝트 - 토픽 - 히스토리 계층 지원.
-- 배경: 한 담당자(clients 1행 = 개인)가 여러 프로젝트를 진행할 수 있으므로, 프로젝트 상세에서
-- "관련 토픽"을 만들려면 그 토픽이 어느 담당자 소속인지 알아야 한다. 이를 위해 프로젝트에
-- "소속 담당자"(owner_client_id, 관련 인물 client_ids 중 1명을 지정)를 추가하고, 토픽에는
-- project_id를 추가해 담당자 토픽을 프로젝트 단위로도 묶을 수 있게 한다.
-- 기존 topics.client_id는 그대로 유지(상호공유 get_mutual_client_history()가 client_id 기준으로
-- 판정하므로 건드리지 않음) — project_id는 추가 분류일 뿐이다.
-- 실행: Supabase Dashboard > SQL Editor에서 이 파일 전체를 실행한다.

-- 1) 프로젝트의 소속 담당자(개인 1명, 관련 인물 client_ids 중 하나)
alter table projects add column if not exists owner_client_id text references clients(id) on delete set null;
create index if not exists projects_owner_client_idx on projects(owner_client_id);

create or replace function validate_project_owner_client_ownership()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.owner_client_id is null then return new; end if;
  if not exists (select 1 from clients where id = new.owner_client_id and user_id = new.user_id) then
    raise exception '존재하지 않거나 접근 권한이 없는 담당자(owner_client_id=%)입니다.', new.owner_client_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validate_project_owner_client on projects;
create trigger trg_validate_project_owner_client
  before insert or update of owner_client_id, user_id on projects
  for each row execute function validate_project_owner_client_ownership();

-- 2) 토픽의 소속 프로젝트(선택) — 토픽은 여전히 담당자(client_id) 소속이며, project_id는
--    그 담당자의 어느 프로젝트에 묶인 토픽인지를 나타내는 추가 분류다.
alter table topics add column if not exists project_id text references projects(id) on delete set null;
create index if not exists topics_project_idx on topics(project_id);

-- 토픽이 프로젝트에 묶일 때, 그 프로젝트의 소속 담당자(owner_client_id)와 토픽의 client_id가
-- 반드시 일치하도록 강제한다(계층 무결성: 담당자 → 프로젝트 → 토픽).
create or replace function validate_topic_project_client()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project_owner_client_id text;
  v_project_user_id uuid;
begin
  if new.project_id is null then return new; end if;
  select owner_client_id, user_id into v_project_owner_client_id, v_project_user_id
  from projects where id = new.project_id;
  if v_project_user_id is null or v_project_user_id <> new.user_id then
    raise exception '존재하지 않거나 접근 권한이 없는 프로젝트(project_id=%)입니다.', new.project_id;
  end if;
  if v_project_owner_client_id is null or v_project_owner_client_id <> new.client_id then
    raise exception '토픽의 담당자(client_id)가 프로젝트의 소속 담당자(owner_client_id)와 일치해야 합니다.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validate_topic_project_client on topics;
create trigger trg_validate_topic_project_client
  before insert or update of project_id, client_id, user_id on topics
  for each row execute function validate_topic_project_client();
