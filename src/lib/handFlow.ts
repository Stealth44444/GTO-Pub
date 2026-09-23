// 한 판의 흐름. 프리플랍 판단에서 시작해 플랍으로 넘어가는 지점까지를 다룬다.
//
// 플랍부터는 포스트플랍 스팟(lib/hand.ts)이 이어받으므로, 여기서는 "언제
// 플랍으로 넘어가는가"와 "그때까지 각 자리가 얼마를 넣었는가"만 정하면 된다.

import {
  actionsAt,
  evAt,
  sampleAction,
  type PreflopAction,
  type PreflopData,
  type PreflopNode,
  type PreflopSeat,
} from "./preflopGame.ts";
import type { PreflopStep } from "./preflop.ts";

export type PreflopOutcome =
  | { kind: "folded"; by: PreflopSeat } // 누군가 접어서 끝났다
  | { kind: "allin" } // 3벳 올인이 콜됐다 — 보드는 깔리지만 판단은 끝
  | { kind: "flop" }; // 싱글레이즈 팟으로 플랍에 간다

export type PreflopTurn = {
  node: PreflopNode;
  seat: PreflopSeat;
  actions: PreflopAction[];
  evBb: (number | null)[];
};

export type PreflopState = {
  heroSeat: PreflopSeat;
  heroHand: string;
  villainHand: string;
  /** 지금까지 일어난 액션. 테이블 재생에 그대로 쓴다. */
  steps: PreflopStep[];
  /** 히어로 차례면 그 판단, 아니면 null. */
  turn: PreflopTurn | null;
  outcome: PreflopOutcome | null;
};

const SEAT_OF = { BTN: "BTN", BB: "BB" } as const;

function blindOf(data: PreflopData, seat: PreflopSeat): number {
  return seat === "BB" ? 1 + data.anteBb : 0;
}

function turnFor(data: PreflopData, node: PreflopNode, hand: string): PreflopTurn {
  return {
    node,
    seat: node.kind === "bbDefend" ? "BB" : "BTN",
    actions: actionsAt(node),
    evBb: evAt(data, node, hand),
  };
}

/** 그 자리가 이 액션 뒤에 갖게 되는 누적 투입액. 앤티는 죽은 돈이라 따로 얹는다. */
function committedAfter(
  data: PreflopData,
  seat: PreflopSeat,
  action: PreflopAction,
): number {
  const ante = seat === "BB" ? data.anteBb : 0;
  if (action === "fold") return blindOf(data, seat);
  if (action === "shove") return data.stackBb;
  return data.openToBb + ante; // open · call
}

function step(
  data: PreflopData,
  seat: PreflopSeat,
  action: PreflopAction,
): PreflopStep {
  const kind =
    action === "open" ? "raise" : action === "shove" ? "allin" : action === "call" ? "call" : "fold";
  return { seat: SEAT_OF[seat], kind, committedBb: committedAfter(data, seat, action) };
}

/**
 * 판을 시작한다. 히어로가 BB면 BTN의 오픈부터 재생하고, BTN이 접으면 판이 없으므로
 * outcome을 folded로 둔다(호출한 쪽이 다시 돌리면 된다).
 */
export function startPreflop(
  data: PreflopData,
  heroSeat: PreflopSeat,
  heroHand: string,
  villainHand: string,
  rnd: () => number,
): PreflopState {
  const base: PreflopState = {
    heroSeat,
    heroHand,
    villainHand,
    steps: [],
    turn: null,
    outcome: null,
  };

  if (heroSeat === "BTN") {
    return { ...base, turn: turnFor(data, { kind: "btnOpen" }, heroHand) };
  }

  // 히어로가 BB다. BTN이 먼저 판단한다.
  const btnAction = sampleAction(data, { kind: "btnOpen" }, villainHand, rnd);
  const steps = [step(data, "BTN", btnAction)];
  if (btnAction === "fold") {
    return { ...base, steps, outcome: { kind: "folded", by: "BTN" } };
  }
  return { ...base, steps, turn: turnFor(data, { kind: "bbDefend" }, heroHand) };
}

/**
 * 히어로가 액션을 골랐다. 상대의 응수까지 진행해서 다음 판단이나 결과를 돌려준다.
 */
export function applyPreflop(
  data: PreflopData,
  state: PreflopState,
  action: PreflopAction,
  rnd: () => number,
): PreflopState {
  if (!state.turn) return state;
  const { node } = state.turn;
  const steps = [...state.steps, step(data, state.turn.seat, action)];
  const done = (outcome: PreflopOutcome): PreflopState => ({
    ...state,
    steps,
    turn: null,
    outcome,
  });

  if (node.kind === "btnOpen") {
    if (action === "fold") return done({ kind: "folded", by: "BTN" });
    // BB가 대응한다.
    const bb = sampleAction(data, { kind: "bbDefend" }, state.villainHand, rnd);
    const withBb = [...steps, step(data, "BB", bb)];
    if (bb === "fold") return { ...state, steps: withBb, turn: null, outcome: { kind: "folded", by: "BB" } };
    if (bb === "call") return { ...state, steps: withBb, turn: null, outcome: { kind: "flop" } };
    // BB가 3벳 올인했다. 다시 히어로(BTN) 차례다.
    return {
      ...state,
      steps: withBb,
      turn: turnFor(data, { kind: "btnVsShove" }, state.heroHand),
      outcome: null,
    };
  }

  if (node.kind === "bbDefend") {
    if (action === "fold") return done({ kind: "folded", by: "BB" });
    if (action === "call") return done({ kind: "flop" });
    // 히어로(BB)가 3벳 올인했다. BTN이 대응한다.
    const btn = sampleAction(data, { kind: "btnVsShove" }, state.villainHand, rnd);
    const withBtn = [...steps, step(data, "BTN", btn)];
    return {
      ...state,
      steps: withBtn,
      turn: null,
      outcome: btn === "fold" ? { kind: "folded", by: "BTN" } : { kind: "allin" },
    };
  }

  // btnVsShove — 히어로가 BTN이고 올인에 대응한다.
  return done(action === "fold" ? { kind: "folded", by: "BTN" } : { kind: "allin" });
}

/** 최선 대비 손실(bb). 값이 없는 액션은 null. */
export function evLoss(evBb: (number | null)[]): (number | null)[] {
  const known = evBb.filter((v): v is number => v !== null);
  if (known.length === 0) return evBb.map(() => null);
  const best = Math.max(...known);
  return evBb.map((v) => (v === null ? null : Number((best - v).toFixed(2))));
}
