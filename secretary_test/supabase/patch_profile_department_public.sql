-- 담당자 관리(ClientScreen.js) 화면에서, 상대방(linked_profile_id로 연결된 가입 회원)의 부서가
-- 회사 관리자에 의해 바뀌면 화면을 새로고침하지 않아도 Supabase Realtime(웹소켓 push)으로 즉시
-- 회사명 옆에 부서명이 반영되도록 한다.
--
-- 배경: profiles 테이블은 RLS로 타인의 department_id를 볼 수 없어서(profiles_select_own 등),
-- 담당자 관리 화면에서 상대방의 최신 부서를 실시간으로 알 수 있는 방법이 없었다. 이 표를
-- 공개(permissive) RLS로 별도로 두고 profiles.department_id 변경 시 트리거로 동기화하면, 이미
-- 공개된 departments 테이블(departments_select_public, patch_departments_select_public.sql)과
-- 조합해 부서 배정 여부를 privacy-safe하게 노출하면서 Supabase Realtime 구독 대상으로 쓸 수 있다.
-- 부서명 자체는 중복 저장하지 않는다(departments 테이블에서 별도 조회) — 부서명 변경 시
-- 동기화 부담을 없애기 위함. company_id도 필요 없다(회사명은 clients.company 텍스트 그대로 사용,
-- 이번 패치는 부서만 추가하는 것).
--
-- 적용 대상: clients 테이블 행 중 linked_profile_id가 채워진 것(실제 가입 회원과 연결된 담당자)만
-- 해당된다. linked_profile_id가 없는 일반 외부 연락처는 부서 개념이 없으므로 영향 없다.
--
-- 이 프로젝트는 지금까지 Supabase Realtime을 전혀 쓴 적이 없다 — 이번이 첫 도입.
--
-- 실행 순서(중요, 반드시 순서대로): 아래 1~5번을 Supabase Dashboard > SQL Editor에서 이 파일
-- 전체를 그대로 실행하면 순서대로 처리된다.
--   1. profile_department_public 테이블 생성
--   2. RLS 활성화 + 공개 select 정책
--   3. 동기화 트리거 함수/트리거 생성 (profiles.department_id insert/update 시 upsert)
--   4. 기존 프로필 데이터 백필
--   5. Realtime publication에 테이블 추가
--
-- 주의: 5번 SQL만으로 Realtime이 안 될 수 있다. Supabase Dashboard > Database > Replication에서도
-- profile_department_public 테이블에 대해 Realtime 토글이 켜져 있는지 별도로 확인해야 한다
-- (대시보드 설정이 publication 멤버십과 별개로 취급되는 프로젝트가 있음).

-- 1. 테이블 생성
create table if not exists profile_department_public (
  profile_id uuid primary key references profiles(id) on delete cascade,
  department_id uuid references departments(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- 2. RLS 활성화 + 공개 select 정책
alter table profile_department_public enable row level security;
drop policy if exists profile_department_public_select_public on profile_department_public;
create policy profile_department_public_select_public on profile_department_public
  for select using (true);

-- 3. 동기화 트리거: profiles.department_id가 insert/update될 때마다 upsert.
-- assign_employee_department()의 update, 회원가입 RPC의 최초 insert, delete_department()가
-- departments(id) on delete set null로 department_id를 null로 되돌리는 경우까지 전부 일반
-- insert/update로 처리되므로 이 트리거 하나로 모든 경로를 커버한다(별도 처리 불필요, 확인만 하면 됨).
create or replace function sync_profile_department_public() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profile_department_public (profile_id, department_id, updated_at)
  values (new.id, new.department_id, now())
  on conflict (profile_id) do update set department_id = excluded.department_id, updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_sync_profile_department_public on profiles;
create trigger trg_sync_profile_department_public
after insert or update of department_id on profiles
for each row execute function sync_profile_department_public();

-- 4. 기존 프로필 데이터 백필 (이미 있으면 무시)
insert into profile_department_public (profile_id, department_id)
  select id, department_id from profiles
  on conflict (profile_id) do nothing;

-- 5. Realtime publication 등록 (postgres_changes 웹소켓 push를 받으려면 명시적으로 추가해야 함)
alter publication supabase_realtime add table profile_department_public;
