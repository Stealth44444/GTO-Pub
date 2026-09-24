// 이번에 앉아서 친 몫.
//
// 끝없이 다음 핸드만 나오면 배운 것이 쌓이는 느낌이 없다. 홀덤펍에서 자리를
// 기다리는 십 분 동안 쓰는 앱이니 더 그렇다. 몇 판마다 한 번 멈춰서 방금 친
// 것을 돌아보게 한다.
//
// 이 집계는 기기 안에서만 산다. 서버에 있는 누적 통계와 다른 값이어도 맞다 —
// 저쪽은 "지금까지의 나"고 이쪽은 "방금의 나"다.

import { gradeByEvLoss, isCleanChoice, type Grade } from "./grading.ts";
import type { Decision } from "./decisions.ts";

/** 몇 판마다 멈출 것인가. 열 판이면 대략 오 분이다. */
export const RECAP_EVERY = 10;

export type RunDecision = {
  street: string;
  handCode: string;
  seat: string;
  chosen: string;
  lossBb: number | null;
};

export type RunSummary = {
  hands: number;
  decisions: number;
  /** 채점된 판단만 센다. 레인지 밖은 평균을 왜곡한다. */
  graded: number;
  avgLossBb: number;
  lostBb: number;
  cleanPct: number;
  grade: Grade;
  /** 가장 비쌌던 한 판단. 없으면 null — 다 잘했다는 뜻이다. */
  worst: RunDecision | null;
};

/** 한 판의 판단들을 이번 세션 기록으로 옮긴다. */
export function toRunDecisions(
  decisions: Decision[],
  seat: string,
  handCode: string,
): RunDecision[] {
  return decisions.map((d) => ({
    street: d.street,
    handCode,
    seat,
    chosen: d.chosen,
    lossBb: d.lossBb,
  }));
}

export function summarizeRun(hands: number, decisions: RunDecision[]): RunSummary {
  const graded = decisions.filter((d) => d.lossBb !== null) as (RunDecision & {
    lossBb: number;
  })[];
  const lostBb = graded.reduce((sum, d) => sum + d.lossBb, 0);
  const avgLossBb = graded.length === 0 ? 0 : lostBb / graded.length;
  const clean = graded.filter((d) => isCleanChoice(gradeByEvLoss(d.lossBb))).length;

  // 전체 등급은 평균 손실로 매긴다. 판단 하나를 매기는 기준과 같아야 사용자가
  // 두 숫자를 나란히 놓고 이해할 수 있다.
  return {
    hands,
    decisions: decisions.length,
    graded: graded.length,
    avgLossBb: Math.round(avgLossBb * 1000) / 1000,
    lostBb: Math.round(lostBb * 100) / 100,
    cleanPct: graded.length === 0 ? 0 : Math.round((clean / graded.length) * 100),
    grade: gradeByEvLoss(avgLossBb),
    worst:
      graded.length === 0
        ? null
        : graded.reduce((a, b) => (b.lossBb > a.lossBb ? b : a)),
  };
}
