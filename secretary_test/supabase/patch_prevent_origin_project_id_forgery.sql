-- ⚠️ Critical 보안 패치 — 아직 라이브 미배포 상태로 확인됨(2026-08-04 REST API 실측 검증).
--
-- projects.origin_project_id를 일반 사용자가 클라이언트 경로(addProject/updateProject, 특히
-- update_project AI 액션처럼 필드 화이트리스트 없이 changes를 그대로 넘기는 경로)로 직접 조작하지
-- 못하도록 막는다. origin_project_id는 "이 프로젝트가 다른 사용자 프로젝트의 사본(mirror)인지,
-- 사본이면 원본이 무엇인지"를 나타내는데, get_project_mirror_info()(patch_project_mirror_readonly_info.sql,
-- 이미 라이브 배포 확인됨)가 SECURITY DEFINER로 RLS를 우회하며 mirror.user_id = auth.uid()만 검사하고
-- 그 사본이 정말 sync_project_mirrors()가 만든 것인지는 검증하지 않는다. 따라서 이 트리거 없이는
-- 자기 소유 프로젝트의 origin_project_id를 임의의 다른 사용자 프로젝트 id로 위조해(id는 Date.now()
-- 기반이라 값 열거가 쉬움) 그 프로젝트 소유자의 이름/팀/부서, 관련 인물(이름/회사/직책)을 그대로
-- 조회할 수 있는 Critical 취약점이 그대로 열려 있다.
--
-- 실측 확인(2026-08-04): 테스트 계정으로 로그인 후 REST API로 자기 소유 프로젝트의
-- origin_project_id를 직접 UPDATE 시도한 결과 값이 그대로 반영됨(트리거가 없어 되돌려지지 않음)
-- — 즉 get_project_mirror_info()는 이미 배포되어 호출 가능한 상태에서 이 트리거만 누락되어 있어
-- 위 취약점이 현재 살아있는 상태. 확인에 사용한 테스트 행은 즉시 삭제 완료.
--
-- prevent_privileged_profile_self_update()(profiles 테이블, 이미 배포됨)와 정확히 동일한 패턴이다:
-- INSERT 시에는 항상 null로 강제(일반 사용자가 만드는 프로젝트는 사본일 수 없다 — 사본은 오직
-- sync_project_mirrors()가 만든다), UPDATE 시에는 값이 바뀌었으면 기존 값으로 되돌린다.
-- app.bypass_privilege_trigger 세션 플래그로 신뢰된 서버 경로(sync_project_mirrors() 내부, 이미
-- 그 플래그를 켜도록 배포되어 있음)만 우회한다.
--
-- 실행: Supabase Dashboard > SQL Editor에서 이 파일 전체를 실행한다. schema.sql에는 이미 동일한
-- 정의가 반영되어 있으므로(신규 설치 시 자동 포함), 이 파일은 기존 라이브 DB에 누락분만 추가하는
-- 1회성 스크립트다. 데이터 백필이 없어 재실행해도 안전(create or replace function + drop/create
-- trigger 조합).

create or replace function prevent_client_origin_project_id_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role'
     or current_setting('app.bypass_privilege_trigger', true) = 'true' then
    return new;
  end if;
  if TG_OP = 'INSERT' then
    new.origin_project_id := null;
    return new;
  end if;
  if new.origin_project_id is distinct from old.origin_project_id then
    new.origin_project_id := old.origin_project_id;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_client_origin_project_id_write on projects;
create trigger trg_prevent_client_origin_project_id_write
before insert or update on projects
for each row execute function prevent_client_origin_project_id_write();
