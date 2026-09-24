import { supabase } from "./supabase.ts";
import { gradeByEvLoss, isCleanChoice, type GradeId } from "./grading.ts";

// 한 번에 읽어올 최대 행 수. 파일럿 규모에서는 전부 들어오고, 넘어가면
// 최근 것부터 이만큼만 집계한다 (집계를 서버로 옮기기 전까지의 한계).
const MAX_ROWS = 1000;

export type Attempt = {
  mode: string;
  tableSize: number | null;
  stackBb: number | null;
  position: string;
  shoverPosition: string | null;
  handCode: string;
  userAction: string;
  correctAction: string;
  evLossBb: number;
  createdAt: string;
  /** preflop / flop / turn / river. 옛 푸시·폴드 기록에는 없다. */
  street: string | null;
  /** 어떤 상황이었는지. 복습 스팟을 다시 만들 때 쓴다. */
  nodeLine: string | null;
  /** 그 시점의 보드. 공백으로 나눈 문자열. 프리플랍은 비어 있다. */
  board: string | null;
  /** 히어로가 들고 있던 두 장. 무늬까지 맞아야 포스트플랍을 다시 만들 수 있다. */
  heroCards: string | null;
  /** 어느 보드 파일의, 어느 쪽 자리였는지. */
  spotFile: string | null;
  heroPlayer: 0 | 1 | null;
};

type Row = {
  mode: string;
  table_size: number | null;
  stack_bb: number | string | null;
  position: string;
  shover_position: string | null;
  hand_code: string;
  user_action: string;
  correct_action: string;
  street?: string | null;
  node_line?: string | null;
  board?: string | null;
  hero_cards?: string | null;
  spot_file?: string | null;
  hero_player?: number | null;
  ev_loss_bb: number | string;
  created_at: string;
};

const num = (v: number | string | null): number | null =>
  v === null ? null : typeof v === "number" ? v : Number(v);

function toAttempt(r: Row): Attempt {
  return {
    mode: r.mode,
    tableSize: r.table_size,
    stackBb: num(r.stack_bb),
    position: r.position,
    shoverPosition: r.shover_position,
    handCode: r.hand_code,
    userAction: r.user_action,
    correctAction: r.correct_action,
    street: r.street ?? null,
    nodeLine: r.node_line ?? null,
    board: r.board ?? null,
    heroCards: r.hero_cards ?? null,
    spotFile: r.spot_file ?? null,
    heroPlayer: r.hero_player === 0 || r.hero_player === 1 ? r.hero_player : null,
    evLossBb: num(r.ev_loss_bb) ?? 0,
    createdAt: r.created_at,
  };
}

/**
 * EV 손실이 기록된 시도만 읽는다. 그 컬럼이 채워지기 전에 쌓인 행은 어떤
 * 스팟이었는지도 남아 있지 않아 채점할 수 없으므로 집계에서 제외한다.
 */
export async function fetchAttempts(userId: string): Promise<Attempt[] | null> {
  if (!supabase || !userId) return null;
  const { data, error } = await supabase
    .from("training_attempts")
    .select(
      "mode, table_size, stack_bb, position, shover_position, hand_code, user_action, correct_action, street, node_line, board, hero_cards, spot_file, hero_player, ev_loss_bb, created_at",
    )
    .eq("user_id", userId)
    .not("ev_loss_bb", "is", null)
    .order("created_at", { ascending: false })
    .limit(MAX_ROWS);

  if (error) {
    console.error("Failed to load attempts", error.message);
    return null;
  }
  return (data as Row[]).map(toAttempt);
}

export type Summary = {
  attempts: number;
  /** 실질 손실이 없는 선택의 비율(%). */
  accuracyPct: number;
  /** 실수 이상으로 잘못 고른 횟수. */
  mistakes: number;
  /** 잘못 고르는 바람에 잃은 총 bb. */
  lostBb: number;
  /** 등급별 횟수. */
  byGrade: Record<GradeId, number>;
  /** 가장 손해가 컸던 스팟들. */
  worst: Attempt[];
};

export function summarize(attempts: Attempt[]): Summary {
  const byGrade: Record<GradeId, number> = {
    best: 0,
    correct: 0,
    inaccuracy: 0,
    wrong: 0,
    blunder: 0,
  };
  let clean = 0;
  let mistakes = 0;
  let lostBb = 0;

  for (const a of attempts) {
    const grade = gradeByEvLoss(a.evLossBb);
    byGrade[grade.id]++;
    if (isCleanChoice(grade)) clean++;
    // "실수"는 실수·큰 실수만 센다. 부정확은 따로 보여주므로 여기 넣지 않는다.
    if (grade.id === "wrong" || grade.id === "blunder") mistakes++;
    lostBb += a.evLossBb;
  }

  const worst = [...attempts].sort((a, b) => b.evLossBb - a.evLossBb).slice(0, 5);

  return {
    attempts: attempts.length,
    accuracyPct: attempts.length === 0 ? 0 : Math.round((clean / attempts.length) * 100),
    mistakes,
    lostBb,
    byGrade,
    worst: worst.filter((a) => a.evLossBb > 0),
  };
}

/**
 * 실제로 친 판만. 복습에서 다시 푼 문제는 뺀다.
 *
 * 복습은 같은 스팟을 반복해서 물어보므로, 통계에 넣으면 열 번 맞힌 한 자리가
 * 정확도를 끌어올린다. 실력이 는 게 아니라 같은 문제를 외운 것이다.
 */
export function playedOnly(attempts: Attempt[]): Attempt[] {
  return attempts.filter((a) => a.mode !== "review");
}

export type DayProgress = {
  /** "2026-09-25". 로컬 날짜다 — 새벽 두 시에 친 판은 그날 친 것이다. */
  day: string;
  decisions: number;
  /** 판단 한 번당 평균 손실(bb). 낮을수록 좋다. */
  avgLossBb: number;
  accuracyPct: number;
};

/**
 * 날짜별로 얼마나 늘었는가.
 *
 * 누적 정확도는 좋아져도 거의 안 움직인다. 처음에 쌓인 실수가 분모에 계속
 * 남기 때문이다. 그래서 그날그날을 따로 센다 — 어제보다 나은지는 그렇게만
 * 보인다.
 *
 * 판단 수가 적은 날은 평균이 한 판에 휘둘리므로 함께 돌려준다. 화면에서
 * 그걸 보여주지 않으면 세 판 친 날의 100%가 잘한 날로 읽힌다.
 */
export function progressByDay(attempts: Attempt[], days = 14): DayProgress[] {
  const byDay = new Map<string, { n: number; loss: number; clean: number }>();

  for (const a of attempts) {
    const day = localDay(a.createdAt);
    if (!day) continue;
    const acc = byDay.get(day) ?? { n: 0, loss: 0, clean: 0 };
    acc.n += 1;
    acc.loss += a.evLossBb;
    if (isCleanChoice(gradeByEvLoss(a.evLossBb))) acc.clean += 1;
    byDay.set(day, acc);
  }

  return [...byDay.entries()]
    .sort((x, y) => (x[0] < y[0] ? -1 : 1))
    .slice(-days)
    .map(([day, v]) => ({
      day,
      decisions: v.n,
      avgLossBb: Math.round((v.loss / v.n) * 1000) / 1000,
      accuracyPct: Math.round((v.clean / v.n) * 100),
    }));
}

/** ISO 시각을 그 기기의 날짜로. 못 읽으면 null — 그런 행은 추이에서 뺀다. */
function localDay(iso: string): string | null {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const pad = (v: number) => String(v).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 액션 종류를 사람이 읽는 말로. 기록에는 종류만 남는다. */
export const ACTION_KO: Record<string, string> = {
  fold: "폴드",
  check: "체크",
  call: "콜",
  bet: "벳",
  raise: "레이즈",
  open: "오픈",
  allin: "올인",
  shove: "올인",
};

const STREET_KO: Record<string, string> = {
  preflop: "프리플랍",
  flop: "플랍",
  turn: "턴",
  river: "리버",
};

export type Leak = {
  label: string;
  count: number;
  /** 이 묶음에서 잃은 총 bb. */
  lostBb: number;
  /** 한 번당 평균 손실. 횟수가 적은 묶음이 위로 올라오지 않게 함께 본다. */
  avgLossBb: number;
};

/**
 * 어디서 새고 있는지.
 *
 * 총 손실로 줄을 세운다. 평균 손실이 큰 묶음은 아프지만 드물 수 있고, 고쳐서
 * 돌아오는 양은 결국 총합이다. 손실이 0인 묶음은 새는 곳이 아니므로 뺀다.
 */
export function findLeaks(
  attempts: Attempt[],
  keyOf: (a: Attempt) => string | null,
  minCount = 2,
): Leak[] {
  const groups = new Map<string, { count: number; lost: number }>();
  for (const a of attempts) {
    const key = keyOf(a);
    if (key === null) continue;
    const g = groups.get(key) ?? { count: 0, lost: 0 };
    g.count += 1;
    g.lost += a.evLossBb;
    groups.set(key, g);
  }
  return [...groups.entries()]
    .filter(([, g]) => g.count >= minCount && g.lost > 0.005)
    .map(([label, g]) => ({
      label,
      count: g.count,
      lostBb: Number(g.lost.toFixed(2)),
      avgLossBb: Number((g.lost / g.count).toFixed(3)),
    }))
    .sort((x, y) => y.lostBb - x.lostBb);
}

/** 스트릿별 누수. 어느 구간이 약한지 가장 먼저 봐야 할 값이다. */
export function leaksByStreet(attempts: Attempt[]): Leak[] {
  return findLeaks(attempts, (a) => (a.street ? (STREET_KO[a.street] ?? a.street) : null), 1);
}

/** "리버에서 콜" 같은 묶음. 무엇을 고쳐야 하는지까지 좁혀 준다. */
export function leaksByAction(attempts: Attempt[]): Leak[] {
  return findLeaks(attempts, (a) => {
    const street = a.street ? (STREET_KO[a.street] ?? a.street) : null;
    const action = ACTION_KO[a.userAction] ?? a.userAction;
    return street ? `${street} · ${action}` : action;
  });
}

/** 자리별 누수. 같은 실수도 자리에 따라 값이 다르다. */
export function leaksByPosition(attempts: Attempt[]): Leak[] {
  return findLeaks(attempts, (a) => a.position, 1);
}
