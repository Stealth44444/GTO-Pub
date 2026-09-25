// 토너먼트 런. 판이 이어지고, 칩이 판마다 실제로 오가고, 블라인드가 오른다.
//
// 칩은 1레벨 빅블라인드 단위로 들고 있고, 화면에는 지금 레벨의 bb로 바꿔 보여준다.
// 블라인드가 오르면 같은 칩이 더 적은 bb가 된다 — 버티기만 해서는 줄어드는 것이
// 토너먼트다.
//
// 실력과 결과를 따로 센다. 칩은 카드가 떨어진 결과이고, lossBb는 판단이 최선에서
// 잃은 양이다. 칩을 잃어도 lossBb가 0이면 잘 친 것이다.

export const RUN_START_BB = 30;
export const HANDS_PER_LEVEL = 8;
/** 1레벨 대비 빅블라인드 배수. 마지막 레벨을 다 버티면 완주다. */
export const LEVEL_MULT = [1, 1.25, 1.5, 2, 2.5, 3];
export const RUN_HANDS = HANDS_PER_LEVEL * LEVEL_MULT.length;

export type RunState = {
  /** 끝낸 판 수. */
  hands: number;
  /** 1레벨 bb 단위의 칩. */
  chips: number;
  /** 가장 많았을 때의 칩(1레벨 bb). */
  peak: number;
  /** 판단들이 최선에서 잃은 합(bb). 채점할 수 없던 판단은 빠진다. */
  lossBb: number;
  graded: number;
  over: null | "bust" | "done";
};

export function startRun(): RunState {
  return { hands: 0, chips: RUN_START_BB, peak: RUN_START_BB, lossBb: 0, graded: 0, over: null };
}

/** 지금 판의 레벨(0부터). */
export function levelOf(state: RunState): number {
  return Math.min(LEVEL_MULT.length - 1, Math.floor(state.hands / HANDS_PER_LEVEL));
}

/** 지금 레벨의 bb로 본 스택. */
export function stackBb(state: RunState): number {
  return Math.round((state.chips / LEVEL_MULT[levelOf(state)]) * 10) / 10;
}

/**
 * 한 판을 반영한다.
 *
 * netBb는 그 판을 친 레벨의 bb로 잰 손익이다. 판은 스택보다 깊게 풀린 데이터로
 * 칠 수 있으므로(풀린 깊이가 몇 개뿐이다) 스택을 넘는 손실은 스택에서 멈춘다.
 */
export function applyHand(
  state: RunState,
  result: { netBb: number; lossBb: number; graded: number },
): RunState {
  if (state.over) return state;
  const mult = LEVEL_MULT[levelOf(state)];
  const chips = Math.max(0, Math.round((state.chips + result.netBb * mult) * 100) / 100);
  const hands = state.hands + 1;
  return {
    hands,
    chips,
    peak: Math.max(state.peak, chips),
    lossBb: Math.round((state.lossBb + result.lossBb) * 100) / 100,
    graded: state.graded + result.graded,
    over: chips <= 0 ? "bust" : hands >= RUN_HANDS ? "done" : null,
  };
}

/**
 * 이 스택으로 칠 판을 어느 깊이의 풀이로 칠지. 풀린 깊이 중 가장 가까운 것이다.
 * 깊이 데이터가 늘수록 런의 판이 실제 스택에 가까워진다.
 */
export function playDepth(stack: number, solved: number[]): number {
  return solved.reduce((best, d) => (Math.abs(d - stack) < Math.abs(best - stack) ? d : best));
}
