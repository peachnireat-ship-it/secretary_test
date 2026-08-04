-- 프로젝트 사본(mirror) 소유자 본인이, 자신의 사본 하나에 대해 "원본 등록자 이름/팀/부서, 원본의
-- 관련 인물 목록"을 조회하기 위한 함수. sync_project_mirrors()(patch_project_mirror.sql)가 만드는
-- 사본 행은 client_ids/owner_client_id/meeting_record_ids를 항상 빈 값으로 저장한다(사본 소유자가
-- 원본 소유자의 개인 담당자·회의록을 열람할 권한이 없으므로) — 그래서 사본 소유자는 자기 사본만
-- 봐서는 "누가 등록했는지", "관련 인물이 누구인지"를 알 수 없다.
--
-- get_company_projects()(patch_get_company_projects.sql)의 owner_name/owner_team/department_name/
-- related_people 계산 로직을 그대로 재사용하되, 이 함수는 회사 관리자 권한(my_is_company_admin())이
-- 아니라 "호출자가 그 사본의 소유자 본인인지"(mirror.user_id = auth.uid())만 검사한다. 다른 사람의
-- 사본이거나 애초에 사본이 아닌(origin_project_id가 null인) 프로젝트 id로 호출하면 0 rows를
-- 반환한다(SELECT 자체가 WHERE 조건에 맞는 행이 없으면 자연히 빈 결과를 반환하므로 별도의 예외
-- 처리가 필요 없다).
--
-- 보안 주의(Critical): 이 함수는 mirror.user_id = auth.uid()만 검사할 뿐, 그 mirror 행이 정말
-- sync_project_mirrors()가 만든 정당한 사본인지는 검증하지 않는다. schema.sql의
-- trg_prevent_client_origin_project_id_write 트리거(prevent_client_origin_project_id_write())가
-- projects.origin_project_id를 일반 사용자가 직접 조작하지 못하도록 막아주는 최종 방어선이므로,
-- 이 함수를 배포하기 전에(또는 함께) 반드시 그 트리거도 schema.sql에서 배포해야 한다. 트리거 없이
-- 이 함수만 배포하면 origin_project_id 위조를 통한 임의 사용자 정보 열람이 가능하다(자세한 배경은
-- patch_project_mirror.sql 상단 주석도 참고).
--
-- 실행: Supabase Dashboard > SQL Editor에서 이 파일 전체를 실행한다. schema.sql의
-- trg_prevent_client_origin_project_id_write 트리거를 먼저(또는 같은 세션에서 함께) 실행할 것.

create or replace function get_project_mirror_info(p_project_id text)
returns table (
  owner_name text, owner_team text, department_name text, related_people jsonb
)
language sql security definer stable
set search_path = public
as $$
  select pr.name, pr.team, d.name,
    coalesce(
      (select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'company', c.company, 'role', c.role))
       from clients c
       where c.user_id = orig.user_id
         and c.id in (select jsonb_array_elements_text(coalesce(orig.client_ids, '[]'::jsonb)))),
      '[]'::jsonb
    )
  from projects mirror
  join projects orig on orig.id = mirror.origin_project_id
  join profiles pr on pr.id = orig.user_id
  left join departments d on d.id = pr.department_id
  where mirror.id = p_project_id
    and mirror.user_id = auth.uid()
    and mirror.origin_project_id is not null
$$;
grant execute on function get_project_mirror_info(text) to authenticated;
