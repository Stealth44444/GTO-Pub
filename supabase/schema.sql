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
  selected_frequency numeric(5, 2),
  ev_loss_bb numeric(8, 4),
  created_at timestamptz not null default now()
);

create index if not exists training_attempts_user_id_idx on training_attempts (user_id);
create index if not exists training_attempts_created_at_idx on training_attempts (created_at);

-- 기존 파일럿 DB에도 솔루션 품질 지표 컬럼을 안전하게 추가한다.
alter table training_attempts add column if not exists selected_frequency numeric(5, 2);
alter table training_attempts add column if not exists ev_loss_bb numeric(8, 4);

-- 솔버 또는 검증된 외부 데이터에서 가져온 학습 기준.
-- 한 행은 하나의 스팟/핸드에 대한 액션 빈도와 EV 정보를 나타낸다.
create table if not exists training_solutions (
  id uuid primary key default gen_random_uuid(),
  game_type text not null default 'nlhe_6max',
  street text not null check (street in ('preflop', 'flop', 'turn', 'river')),
  position text not null,
  stack_bb numeric(7, 2) not null,
  hand_code text not null,
  open_frequency numeric(5, 2) not null check (open_frequency between 0 and 100),
  fold_frequency numeric(5, 2) not null check (fold_frequency between 0 and 100),
  ev_open_bb numeric(8, 4),
  ev_fold_bb numeric(8, 4),
  source text not null default 'solver',
  created_at timestamptz not null default now(),
  unique (game_type, street, position, stack_bb, hand_code, source)
);

create index if not exists training_solutions_lookup_idx
  on training_solutions (game_type, street, position, stack_bb, hand_code);

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
alter table training_solutions enable row level security;
alter table range_data enable row level security;

create policy "anon upsert own guest user" on users
  for all using (true) with check (true);

create policy "anon insert/read attempts" on training_attempts
  for all using (true) with check (true);

create policy "anon read training solutions" on training_solutions
  for select using (true);

create policy "anon read range data" on range_data
  for select using (true);
