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

-- 한 시도를 나중에 분석하려면 "어떤 스팟이었는지"가 행 안에 있어야 한다.
-- position과 hand_code만으로는 9인 8bb였는지 6인 20bb였는지 알 수 없고,
-- 그 둘은 정답이 정반대다.
create table if not exists training_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users (id) on delete cascade,
  mode text not null default 'pushfold',
  table_size smallint,
  stack_bb numeric(7, 2),
  ante_bb numeric(5, 2),
  position text not null,
  -- 올인 대응에서 먼저 올인한 자리. 올인한 자리에 따라 상대 레인지가 달라져
  -- 정답도 달라지므로, 이게 없으면 행을 해석할 수 없다.
  shover_position text,
  hand_code text not null,
  user_action text not null check (user_action in ('shove', 'call', 'open', 'fold')),
  correct_action text not null check (correct_action in ('shove', 'call', 'open', 'fold')),
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

-- 스팟 정보. 이 컬럼들이 없던 동안 쌓인 행은 어떤 조건이었는지 복원할 수 없어
-- null로 남는다.
alter table training_attempts add column if not exists mode text not null default 'pushfold';
alter table training_attempts add column if not exists table_size smallint;
alter table training_attempts add column if not exists stack_bb numeric(7, 2);
alter table training_attempts add column if not exists ante_bb numeric(5, 2);
alter table training_attempts add column if not exists shover_position text;

-- 올인을 'open'으로 적던 제약을 푼다. 푸시/폴드의 올인과 딥스택 오픈레이즈는
-- 다른 액션인데 같은 값으로 뭉개져 있었다.
alter table training_attempts drop constraint if exists training_attempts_user_action_check;
alter table training_attempts add constraint training_attempts_user_action_check
  check (user_action in ('shove', 'call', 'open', 'fold'));
alter table training_attempts drop constraint if exists training_attempts_correct_action_check;
alter table training_attempts add constraint training_attempts_correct_action_check
  check (correct_action in ('shove', 'call', 'open', 'fold'));

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

-- 한 판이 프리플랍부터 리버까지 이어지면서, 한 행 = 한 판단이 되었다.
-- (마이그레이션 attempts_support_full_hand)
--
-- 포스트플랍 액션을 허용한다.
alter table training_attempts drop constraint if exists training_attempts_user_action_check;
alter table training_attempts drop constraint if exists training_attempts_correct_action_check;
alter table training_attempts
  add constraint training_attempts_user_action_check
  check (user_action in (''shove'',''call'',''open'',''fold'',''check'',''bet'',''raise'',''allin''));
alter table training_attempts
  add constraint training_attempts_correct_action_check
  check (correct_action is null or
         correct_action in (''shove'',''call'',''open'',''fold'',''check'',''bet'',''raise'',''allin''));

-- 채점할 수 없는 판단이 있다. 앞선 실수로 솔버 레인지를 벗어나면 비교할 정답이
-- 없으므로, 정답과 정오답을 비워 둘 수 있어야 한다.
alter table training_attempts alter column correct_action drop not null;
alter table training_attempts alter column is_correct drop not null;

-- 같은 판에서 나온 판단들을 묶고, 어느 스트릿이었는지와 보드를 남긴다.
alter table training_attempts add column if not exists hand_id uuid;
alter table training_attempts add column if not exists street text
  check (street is null or street in (''preflop'',''flop'',''turn'',''river''));
alter table training_attempts add column if not exists board text;
create index if not exists training_attempts_hand_id_idx on training_attempts (hand_id);

-- 어떤 상황에서 내린 판단인지. 이게 없으면 기록을 보고 그 스팟을 다시 만들 수
-- 없어서, 틀린 곳을 다시 연습시킬 방법이 없다.
--   프리플랍: firstIn | vsOpen:UTG | vsJam:BB
--   포스트플랍: 솔버 트리의 라인 (check/bet3.3)
alter table training_attempts add column if not exists node_line text;
create index if not exists training_attempts_review_idx
  on training_attempts (user_id, ev_loss_bb desc)
  where ev_loss_bb is not null;
