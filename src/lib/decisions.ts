// 한 판에서 내린 판단들.
//
// 원래는 핸드를 끝내는 액션만 채점했다. 그러면 리버까지 가는 판에서 서너 번
// 고른 것 중 마지막 하나만 평가받고, 게다가 상대가 핸드를 끝내면 등급도 표도
// 없는 다른 화면이 떠서 판마다 결과가 달라 보였다. 그래서 모든 판단을 같은
// 모양으로 쌓고, 끝날 때 한꺼번에 보여준다.

import { gradeByEvLoss, isGradable, type Grade } from "./grading.ts";

export type DecisionRow = {
  label: string;
  /** 값이 없는 액션도 있다 — 레인지 밖 핸드에는 콜의 EV가 없다. */
  evBb: number | null;
  /** 채점할 수 없으면 null. */
  lossBb: number | null;
};

export type Decision = {
  /** PREFLOP / FLOP / TURN / RIVER */
  street: string;
  chosen: string;
  lossBb: number | null;
  grade: Grade | null;
  rows: DecisionRow[];
};

/**
 * 액션별 EV에서 판단 하나를 만든다.
 *
 * 값이 전부 0이면 채점하지 않는다. 앞선 실수로 솔버 레인지를 벗어나면 그 뒤
 * 노드의 도달확률이 0이 되고, 솔버는 그런 핸드의 EV를 전부 0으로 돌려준다.
 * 그대로 채점하면 손실 0, 즉 무엇을 해도 정답이 되어버린다.
 */
export function makeDecision(
  street: string,
  labels: string[],
  evBb: (number | null)[],
  chosenIndex: number,
): Decision {
  // 값이 없는 액션은 비교에서 빼야 한다. 0으로 채우면 안 된다 — BB에게 0 EV는
  // 폴드(-2bb)보다 훨씬 좋은 값이라, 값이 없다는 이유로 최선이 되어버린다.
  const known = evBb.filter((v): v is number => v !== null);
  const gradable = known.length > 0 && isGradable(known);
  const best = gradable ? Math.max(...known) : 0;
  const losses = evBb.map((v) =>
    gradable && v !== null ? Number((best - v).toFixed(2)) : null,
  );
  const lossBb = losses[chosenIndex];
  return {
    street,
    chosen: labels[chosenIndex],
    lossBb,
    grade: lossBb === null ? null : gradeByEvLoss(lossBb),
    rows: labels.map((label, i) => ({ label, evBb: evBb[i], lossBb: losses[i] })),
  };
}

export type HandScore = {
  /** 채점된 판단 수. */
  gradedCount: number;
  /** 근거가 없어 채점하지 못한 판단 수. */
  ungradedCount: number;
  totalLossBb: number;
  /**
   * 핸드 전체 등급. 합계가 아니라 가장 나빴던 판단으로 정한다 — 한 번 크게
   * 틀리면 나머지를 잘 쳐도 그 핸드를 잘 친 것이 아니다.
   */
  grade: Grade;
};

export function scoreHand(decisions: Decision[]): HandScore {
  const graded = decisions.filter((d): d is Decision & { lossBb: number } => d.lossBb !== null);
  const totalLossBb = Number(graded.reduce((sum, d) => sum + d.lossBb, 0).toFixed(2));
  return {
    gradedCount: graded.length,
    ungradedCount: decisions.length - graded.length,
    totalLossBb,
    grade: gradeByEvLoss(graded.length > 0 ? Math.max(...graded.map((d) => d.lossBb)) : 0),
  };
}
