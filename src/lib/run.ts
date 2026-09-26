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
/** 이보다 적은 스택(bb)은 없는 것으로 친다. 정산의 반올림 부스러기다. */
const BUST_BELOW_BB = 0.05;

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
  /**
   * 운으로 얻거나 잃은 칩(1레벨 bb). 올인 판의 실제 결과 − 그 순간 승률 기준 결과.
   * 칩 증감에서 이걸 빼면 실력으로 번 몫이 남는다.
   */
  luck: number;
  /** 남은 리바이. 매장처럼 한 번. */
  rebuysLeft: number;
  over: null | "bust" | "done";
};

/** 매장 토너먼트처럼 버스트하면 한 번 다시 산다. */
export const REBUYS = 1;

export function startRun(): RunState {
  return {
    hands: 0,
    chips: RUN_START_BB,
    peak: RUN_START_BB,
    lossBb: 0,
    graded: 0,
    luck: 0,
    rebuysLeft: REBUYS,
    over: null,
  };
}

/**
 * 버스트한 런을 다시 산다. 받는 칩은 시작 칩 그대로라, 블라인드가 오른 뒤에는
 * 더 적은 bb다 — 늦게 떨어질수록 리바이의 값이 줄어드는 것도 토너먼트다.
 */
export function rebuy(state: RunState): RunState {
  if (state.over !== "bust" || state.rebuysLeft <= 0) return state;
  return {
    ...state,
    chips: RUN_START_BB,
    rebuysLeft: state.rebuysLeft - 1,
    over: state.hands >= RUN_HANDS ? "done" : null,
  };
}

/** 이 런에 들인 칩(1레벨 bb). 칩 증감은 여기서 잰다. */
export function boughtIn(state: RunState): number {
  return RUN_START_BB * (1 + REBUYS - state.rebuysLeft);
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
  result: { netBb: number; evNetBb?: number; lossBb: number; graded: number },
): RunState {
  if (state.over) return state;
  const mult = LEVEL_MULT[levelOf(state)];
  let chips = Math.max(0, Math.round((state.chips + result.netBb * mult) * 100) / 100);
  // 손익은 0.01bb로 반올림되어 온다. 스택을 다 잃어도 그 부스러기가 남으면 0bb로
  // 다음 판을 치게 된다. 0.05bb 아래는 없는 것으로 친다.
  if (chips < BUST_BELOW_BB * mult) chips = 0;
  const hands = state.hands + 1;
  return {
    hands,
    chips,
    peak: Math.max(state.peak, chips),
    lossBb: Math.round((state.lossBb + result.lossBb) * 100) / 100,
    graded: state.graded + result.graded,
    luck:
      Math.round((state.luck + (result.netBb - (result.evNetBb ?? result.netBb)) * mult) * 100) /
      100,
    rebuysLeft: state.rebuysLeft,
    over: chips <= 0 ? "bust" : hands >= RUN_HANDS ? "done" : null,
  };
}

/**
 * 런이 칠 수 있는 깊이. 20은 한 판 전체 풀이, 나머지는 푸시/폴드 풀이를 같은
 * 엔진으로 옮긴 것이다(depthData.ts). 30bb 풀이도 있지만 그 깊이의 보드를 앱이
 * 아직 골라 읽지 못해 넣지 않는다.
 */
export const RUN_DEPTHS = [20, 15, 12, 10, 8];

/**
 * 이 스택으로 칠 판을 어느 깊이의 풀이로 칠지. 스택 이하의 가장 깊은 것이다.
 *
 * 가장 가까운 것을 고르면 안 된다. 26bb로 30bb 판을 치면 30bb를 걸 수 없는데
 * 이긴 쪽은 30bb를 받아 가, 칩 계산이 스택 위로 비틀린다. 스택 이하를 고르면
 * 상대가 그 깊이의 스택을 가진 것으로 볼 수 있어 유효 스택이 곧 깊이다.
 * 가장 얕은 깊이보다 적으면 그 깊이를 쓰고, 거는 금액은 stakeCap으로 자른다.
 */
export function playDepth(stack: number, solved: number[]): number {
  const sorted = [...solved].sort((a, b) => b - a);
  return sorted.find((d) => d <= stack + 1e-9) ?? sorted[sorted.length - 1];
}

/** 지금 레벨 bb로 본 스택. stackBb와 달리 반올림하지 않는다 — 계산에 쓴다. */
export function exactStackBb(state: RunState): number {
  return state.chips / LEVEL_MULT[levelOf(state)];
}

/**
 * 스택이 칠 깊이보다 적으면 그 스택. 이긴 쪽도 진 쪽도 이만큼까지만 오간다.
 * 스택이 충분하면 undefined.
 */
export function stakeCap(state: RunState, depth: number): number | undefined {
  const stack = exactStackBb(state);
  return stack < depth - 1e-9 ? stack : undefined;
}
