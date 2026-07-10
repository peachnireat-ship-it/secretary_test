-- secretary_test: AsyncStorage -> Supabase 마이그레이션 스키마
-- Supabase Dashboard > SQL Editor 에서 전체를 그대로 실행하세요.
--
-- id 컬럼은 uuid가 아니라 text다: MessageScreen.js가 "발신함 사본"/"수신함 사본"을 미리 생성한
-- id(Date.now() 기반 숫자 문자열)로 서로 연결(linkedReceivedId)하기 때문에, 클라이언트가 만든
-- id를 그대로 저장해야 한다. 다른 도메인도 동일한 client-supplied id 관례를 따르도록 통일했다.

-- ── profiles ─────────────────────────────────────────────
-- auth.users(Supabase Auth)에 없는 name/role/team 등 앱 전용 필드를 보관.
create table if not exists profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  name text not null,
  role text not null,
  team text not null,
  contact text not null default '',
  notes text not null default '',
  work_topics text not null default '',
  legacy_data_migrated boolean not null default false,
  created_at timestamptz not null default now()
);

-- ── schedules ────────────────────────────────────────────
create table if not exists schedules (
  id text primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  date text,
  time text,
  title text not null,
  tag text,
  notes text not null default '',
  client_ids jsonb not null default '[]',
  start_date text,
  end_date text,
  created_at bigint not null
);
create index if not exists schedules_user_date_idx on schedules(user_id, date);

-- ── clients ──────────────────────────────────────────────
create table if not exists clients (
  id text primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  name text not null,
  company text not null,
  role text not null default '',
  contact text not null,
  work_contact text not null default '',
  notes text not null default '',
  ai_summary text not null default '',
  created_at bigint not null
);

-- ── histories (거래처 히스토리) ───────────────────────────
create table if not exists histories (
  id text primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  client_id text references clients(id) on delete cascade,
  date text,
  type text,
  title text not null,
  content text not null default '',
  result text not null default '',
  created_at bigint not null
);
create index if not exists histories_client_idx on histories(client_id);

-- ── projects ─────────────────────────────────────────────
create table if not exists projects (
  id text primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  deadline text,
  start_date text,
  status text not null default '진행중',
  priority text not null default '보통',
  notes text not null default '',
  progress int not null default 0,
  client_ids jsonb not null default '[]',
  meeting_record_ids jsonb not null default '[]',
  created_at bigint not null,
  updated_at bigint
);

-- ── meeting_records ──────────────────────────────────────
create table if not exists meeting_records (
  id text primary key,
  user_id uuid not null references profiles(id) on delete cascade,
  title text not null,
  transcript text not null default '',
  summary text not null default '',
  source text,
  client_ids jsonb not null default '[]',
  project_id text references projects(id) on delete set null,
  tasks jsonb not null default '[]',
  diarize_source text, -- 화자 분리 방식: 'pyannote' | 'ai' | null(과거 데이터/수동 입력)
  created_at bigint not null
);
create index if not exists meeting_records_project_idx on meeting_records(project_id);

-- ── client_favorites (다대다 join) ───────────────────────
create table if not exists client_favorites (
  user_id uuid not null references profiles(id) on delete cascade,
  client_id text not null references clients(id) on delete cascade,
  primary key (user_id, client_id)
);

-- ── messages (교차 계정 배달 시뮬레이션) ─────────────────
-- mailbox_owner_id: 이 행이 "누구의 메일함"에 있는지 (조회 기준)
-- sender_id: 실제로 이 메세지를 작성/발송한 인증된 유저 (RLS insert/update 기준)
-- to_id: 비즈니스 상의 수신 대상 (mailbox_owner_id와 별개로 표시용으로 유지)
create table if not exists messages (
  id text primary key,
  mailbox_owner_id uuid not null references profiles(id) on delete cascade,
  sender_id uuid not null references profiles(id) on delete cascade,
  to_id uuid references profiles(id),
  direction text not null,
  sender text not null default '',
  company text not null default '',
  subject text not null default '',
  content text not null default '',
  priority text not null default '일반',
  status text not null default '미확인',
  linked_received_id text,
  edit_history jsonb not null default '[]',
  created_at bigint not null,
  updated_at bigint
);
create index if not exists messages_mailbox_idx on messages(mailbox_owner_id);

-- ── RLS 활성화 ────────────────────────────────────────────
alter table profiles enable row level security;
alter table schedules enable row level security;
alter table clients enable row level security;
alter table histories enable row level security;
alter table projects enable row level security;
alter table meeting_records enable row level security;
alter table client_favorites enable row level security;
alter table messages enable row level security;

-- ── profiles 정책: 본인만 조회/수정 ───────────────────────
create policy profiles_select_own on profiles
  for select using (id = auth.uid());
create policy profiles_update_own on profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_insert_own on profiles
  for insert with check (id = auth.uid());

-- ── user_id = auth.uid() 공통 정책 (schedules/clients/histories/projects/meeting_records) ──
create policy schedules_all_own on schedules
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy clients_all_own on clients
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy histories_all_own on histories
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy projects_all_own on projects
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy meeting_records_all_own on meeting_records
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy client_favorites_all_own on client_favorites
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ── messages 정책 (교차 계정 배달 특수 케이스) ────────────
create policy messages_select_own_mailbox on messages
  for select using (mailbox_owner_id = auth.uid());

-- sender_id = auth.uid(): 실제 발신자로서 남의 메일함에 배달(addMessageForUser)
-- mailbox_owner_id = auth.uid(): 과거 로컬 샘플 데이터처럼 fromId가 실제 발신자가 아니어도,
-- 자기 자신의 메일함에 넣는 것은 안전하므로 허용(마이그레이션에서 필요)
create policy messages_insert_as_sender on messages
  for insert with check (sender_id = auth.uid() or mailbox_owner_id = auth.uid());

create policy messages_update_own_mailbox_or_sender on messages
  for update
  using (mailbox_owner_id = auth.uid() or sender_id = auth.uid())
  with check (mailbox_owner_id = auth.uid() or sender_id = auth.uid());

create policy messages_delete_own_mailbox on messages
  for delete using (mailbox_owner_id = auth.uid());
