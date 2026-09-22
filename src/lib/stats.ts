import { supabase } from "./supabase";
import { gradeByEvLoss, isCleanChoice, type GradeId } from "./grading";

// 한 번에 읽어올 최대 행 수. 파일럿 규모에서는 전부 들어오고, 넘어가면
// 최근 것부터 이만큼만 집계한다 (집계를 서버로 옮기기 전까지의 한계).
const MAX_ROWS = 1000;

export type Attempt = {
  mode: string;
  tableSize: number | null;
  stackBb: number | null;
  position: string;
  handCode: string;
  userAction: string;
  correctAction: string;
  evLossBb: number;
  createdAt: string;
};

type Row = {
  mode: string;
  table_size: number | null;
  stack_bb: number | string | null;
  position: string;
  hand_code: string;
  user_action: string;
  correct_action: string;
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
    handCode: r.hand_code,
    userAction: r.user_action,
    correctAction: r.correct_action,
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
      "mode, table_size, stack_bb, position, hand_code, user_action, correct_action, ev_loss_bb, created_at",
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
