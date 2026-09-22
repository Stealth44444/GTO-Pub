-- GTO 트레이너 P0 스키마 (session-brief.md 4절 데이터 모델 기준)
-- 파일럿 단계: 게스트 모드를 지원하기 위해 RLS를 익명 접근 허용으로 단순화했습니다.
-- 카카오/전화번호 인증 도입 시 auth.uid() 기반 정책으로 재작성이 필요합니다.

create extension if not exists "pgcrypto";

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  auth_provider text not null default 'guest',
  nickname text,
  created_at timestamptz not null default now()
);

create table if not exists training_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  position text not null,
  hand_code text not null,
  user_action text not null check (user_action in ('open', 'fold')),
  correct_action text not null check (correct_action in ('open', 'fold')),
  is_correct boolean not null,
  created_at timestamptz not null default now()
);

create index if not exists training_attempts_user_id_idx on training_attempts (user_id);
create index if not exists training_attempts_created_at_idx on training_attempts (created_at);

-- 지금은 앱 코드(src/lib/poker.ts)에 단순화된 레인지가 하드코딩되어 있습니다.
-- 검증된 솔버 데이터로 교체할 때 이 테이블을 채워서 서버 구동으로 전환합니다.
create table if not exists range_data (
  position text not null,
  hand_code text not null,
  correct_action text not null check (correct_action in ('open', 'fold')),
  primary key (position, hand_code)
);

alter table users enable row level security;
alter table training_attempts enable row level security;
alter table range_data enable row level security;

create policy "anon upsert own guest user" on users
  for all using (true) with check (true);

create policy "anon insert/read attempts" on training_attempts
  for all using (true) with check (true);

create policy "anon read range data" on range_data
  for select using (true);
