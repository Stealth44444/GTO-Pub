// 선택의 좋고 나쁨을 EV 손실(bb)로 매긴다.
//
// 빈도로 매기던 방식은 "얼마나" 틀렸는지를 재지 못한다. 혼합 전략 스팟에서
// 올인 빈도가 49%인 핸드를 고르면 빈도 기준으로는 틀린 선택이지만, 그런 핸드는
// 두 액션의 EV가 거의 같아서(무차별점) 실제로 잃는 건 0에 가깝다.
// 사실상 정답인 선택을 틀렸다고 가르치게 된다.

export type GradeId = "best" | "correct" | "inaccuracy" | "wrong" | "blunder";

export type Grade = {
  id: GradeId;
  label: string;
  /** 0이 최선. 정확도 집계에서 어디까지를 "맞음"으로 칠지 판단할 때 쓴다. */
  rank: number;
  /** 막대·글자 색 (globals.css 토큰 또는 리터럴). */
  color: string;
};

const GRADES: Record<GradeId, Grade> = {
  best: { id: "best", label: "최선", rank: 0, color: "var(--gw-accent)" },
  correct: { id: "correct", label: "무난", rank: 1, color: "var(--gw-accent-strong)" },
  inaccuracy: { id: "inaccuracy", label: "부정확", rank: 2, color: "#f59e0b" },
  wrong: { id: "wrong", label: "실수", rank: 3, color: "var(--gw-danger)" },
  blunder: { id: "blunder", label: "큰 실수", rank: 4, color: "#b91c1c" },
};

export const GRADE_ORDER: GradeId[] = ["best", "correct", "inaccuracy", "wrong", "blunder"];

export function gradeInfo(id: GradeId): Grade {
  return GRADES[id];
}

/**
 * 최선 구간의 경계(0.01bb)는 솔버 자체 오차에서 왔다. 생성된 스팟의 최대
 * 착취가능성이 0.009bb이므로, 그보다 작은 차이는 우리 데이터로 구분할 수 없다.
 * 구분할 수 없는 차이를 틀렸다고 말할 근거는 없다.
 */
const EV_LOSS_BANDS: { maxLossBb: number; id: GradeId }[] = [
  { maxLossBb: 0.01, id: "best" },
  { maxLossBb: 0.05, id: "correct" },
  { maxLossBb: 0.25, id: "inaccuracy" },
  { maxLossBb: 1.0, id: "wrong" },
];

export function gradeByEvLoss(evLossBb: number): Grade {
  const loss = Math.max(0, evLossBb);
  for (const band of EV_LOSS_BANDS) {
    if (loss <= band.maxLossBb) return GRADES[band.id];
  }
  return GRADES.blunder;
}

/**
 * EV 데이터가 아직 없는 모드용 대체 채점. 고른 액션의 GTO 빈도만 보므로
 * "얼마나" 틀렸는지는 재지 못한다. 해당 모드의 솔버 데이터가 생기면 쓰이지 않는다.
 */
export function gradeByFrequency(frequencyPct: number): Grade {
  if (frequencyPct >= 90) return GRADES.best;
  if (frequencyPct >= 50) return GRADES.correct;
  if (frequencyPct >= 25) return GRADES.inaccuracy;
  if (frequencyPct >= 5) return GRADES.wrong;
  return GRADES.blunder;
}

/** 정확도·스트릭에서 "맞음"으로 치는 기준. 실질 손실이 없는 선택까지 포함한다. */
export function isCleanChoice(grade: Grade): boolean {
  return grade.rank <= GRADES.correct.rank;
}

/** 액션별 EV 표시용. 무차별 구간은 부호를 붙이지 않고 0으로 보여준다. */
export function formatEv(evBb: number): string {
  if (Math.abs(evBb) < 0.005) return "0 EV";
  return `${evBb > 0 ? "+" : ""}${evBb.toFixed(2)} EV`;
}

/** EV 손실 표시용. 0은 손실 없음이라 따로 쓰지 않는다. */
export function formatEvLoss(evLossBb: number): string {
  if (evLossBb <= 0) return "손실 없음";
  return `-${evLossBb.toFixed(evLossBb < 0.1 ? 3 : 2)}bb`;
}
