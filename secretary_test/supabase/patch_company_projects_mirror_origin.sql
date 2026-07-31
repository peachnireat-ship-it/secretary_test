-- 버그 배경: get_company_projects()(schema.sql)는 회사 관리자가 "프로젝트 메뉴 > 회사 전체"
-- 목록을 볼 때 각 프로젝트의 등록자 정보(owner_name/owner_team/department_name)와 관련 인물
-- 목록(related_people)을 계산해서 반환한다. 그런데 이 계산이 항상 p.user_id(그 프로젝트 row
-- 자신의 소유자)와 p.client_ids(그 row 자신의 client_ids)만 사용했다.
--
-- 문제는 "관련 인물로 태그된 회사 직원"에게는 sync_project_mirrors()(patch_project_mirror.sql)가
-- 원본 프로젝트의 사본을 그 직원 명의(user_id)로 자동 생성해준다는 점이다. 이 사본 행은
-- origin_project_id로 원본을 가리키며, client_ids는 의도적으로 빈 배열('[]'::jsonb)로 저장된다
-- (사본 소유자가 원본 소유자의 개인 담당자 목록을 열람할 권한이 없기 때문 — patch_project_
-- mirror.sql 참고).
--
-- 그 결과, 회사 관리자가 "소속 직원이 관련 인물로 지정된 프로젝트"(=사본 행)를 상세 조회하면:
-- - owner_name/owner_team/department_name이 실제 등록자(원본 프로젝트를 만든 사람, 다른
--   회사/사람일 수 있음)가 아니라 사본의 소유자인 그 직원 자신으로 잘못 나온다.
-- - related_people이 사본 행의 client_ids(항상 빈 배열)를 기준으로 계산되므로 항상 빈 배열이
--   되어, 그 직원 외 다른 관련 인물이 전혀 보이지 않는다.
--
-- 해결: projects 테이블에 origin_project_id로 원본을 가리키는 left join을 추가해서, 각 프로젝트
-- 행이 사본(origin_project_id is not null)인 경우 원본 프로젝트를 따라가 등록자 정보와 관련
-- 인물을 계산하도록 한다(coalesce로 원본이 있으면 원본, 없으면(사본이 아닌 일반 프로젝트) 기존
-- 처럼 자기 자신을 사용 — 회귀 없음). sync_project_mirrors()가 "사본은 다시 동기화 대상이 되지
-- 않는다"고 보장하므로 origin_project_id 체인은 항상 최대 1단계이고 재귀 처리는 불필요하다.
--
-- 실행: Supabase Dashboard > SQL Editor에서 이 파일 전체를 실행한다.

create or replace function get_company_projects()
returns table (
  id text, title text, deadline text, start_date text, status text, priority text, notes text,
  progress int, client_ids jsonb, owner_client_id text, meeting_record_ids jsonb,
  origin_project_id text, created_at bigint, updated_at bigint,
  owner_name text, owner_team text, department_name text, related_people jsonb
)
language sql security definer stable
set search_path = public
as $$
  select p.id, p.title, p.deadline, p.start_date, p.status, p.priority, p.notes, p.progress,
    p.client_ids, p.owner_client_id, p.meeting_record_ids, p.origin_project_id, p.created_at, p.updated_at,
    coalesce(orig_pr.name, pr.name),
    coalesce(orig_pr.team, pr.team),
    coalesce(orig_d.name, d.name),
    coalesce(
      (select jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'company', c.company, 'role', c.role))
       from clients c
       where c.user_id = coalesce(orig.user_id, p.user_id)
         and c.id in (select jsonb_array_elements_text(coalesce(coalesce(orig.client_ids, p.client_ids), '[]'::jsonb)))),
      '[]'::jsonb
    )
  from projects p
  join profiles pr on pr.id = p.user_id
  left join departments d on d.id = pr.department_id
  left join projects orig on orig.id = p.origin_project_id
  left join profiles orig_pr on orig_pr.id = orig.user_id
  left join departments orig_d on orig_d.id = orig_pr.department_id
  where my_is_company_admin() and pr.company_id = my_company_id()
  order by p.created_at desc
$$;
grant execute on function get_company_projects() to authenticated;
