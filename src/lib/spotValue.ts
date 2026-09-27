// 한 판단이 공부할 가치가 있는가.
//
// 랜덤으로 딜하면 20bb 첫 진입 판단의 절반이 최선과 차선의 차이가 1bb를 넘는다
// (2026-09-26 측정) — 72o를 접는 것 같은, 답이 뻔한 판단이다. 반대로 차이가
// 0.05bb 미만이면 무엇을 골라도 "무난" 이상이라 배울 것이 없다. 그 사이가
// 실력이 갈리는 곳이다.
//
// 경계는 grading.ts와 맞춘다. 0.05bb는 "무난"의 끝이다.

export type SpotBand = "trivial" | "clear" | "close" | "indifferent";

export const STUDY_MIN_GAP_BB = 0.05;
export const STUDY_MAX_GAP_BB = 1;
const CLEAR_FROM_BB = 0.25;

/** 최선과 차선의 EV 차이. 값이 있는 액션이 둘 미만이면 null. */
export function spotGap(evBb: (number | null)[]): number | null {
  const known = evBb.filter((v): v is number => v !== null).sort((a, b) => b - a);
  if (known.length < 2) return null;
  return Number((known[0] - known[1]).toFixed(4));
}

export function spotBand(gapBb: number): SpotBand {
  if (gapBb > STUDY_MAX_GAP_BB) return "trivial";
  if (gapBb > CLEAR_FROM_BB) return "clear";
  if (gapBb >= STUDY_MIN_GAP_BB) return "close";
  return "indifferent";
}

export function isStudyWorthy(evBb: (number | null)[]): boolean {
  const gap = spotGap(evBb);
  return gap !== null && gap >= STUDY_MIN_GAP_BB && gap <= STUDY_MAX_GAP_BB;
}
