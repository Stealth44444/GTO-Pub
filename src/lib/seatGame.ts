// 아홉 자리 프리플랍 한 판.
//
// 자리 순서대로 돌면서, 각자 솔브된 레인지대로 친다. 히어로 차례가 오면 멈추고
// 판단을 받는다.
//
// 상태는 셋뿐이다 — 내 차례에 올 수 있는 상황이 그것뿐이다.
//   firstIn  아직 아무도 안 열었다   → 폴드 | 오픈 2.5 | 올인
//   vsOpen   앞에서 열렸다           → 폴드 | 콜 | 3벳 올인
//   vsJam    앞에서 올인이 나왔다     → 폴드 | 콜
//
// 첫 콜러가 나오면 그 뒤 자리는 접는 것으로 본다. 솔버가 그렇게 풀렸고,
// 멀티웨이 팟의 포스트플랍 데이터도 없다.

import type { PreflopStep } from "./preflop";

export type SeatAction = "fold" | "open" | "jam" | "call";

export type SeatsData = {
  tableSize: number;
  stackBb: number;
  anteBb: number;
  openToBb: number;
  hands: string[];
  seats: Record<
    string,
    {
      open?: Record<string, number>;
      openJam?: Record<string, number>;
      callJam?: Record<string, Record<string, number>>;
      vsOpenCall?: Record<string, Record<string, number>>;
      vsOpenJam?: Record<string, Record<string, number>>;
      vsJamCall?: Record<string, Record<string, number>>;
      foldEvBb: number;
      ev: {
        open: number[];
        openJam: number[];
        vsOpenCall: Record<string, number[]>;
        vsOpenJam: Record<string, number[]>;
        callJam: Record<string, number[]>;
        vsJamCall: Record<string, number[]>;
      };
    }
  >;
};

export type Stage =
  | { kind: "firstIn" }
  | { kind: "vsOpen"; opener: string }
  | { kind: "vsJam"; jammer: string; iOpened: boolean };

export const ACTION_LABEL: Record<SeatAction, string> = {
  fold: "폴드",
  open: "오픈",
  jam: "올인",
  call: "콜",
};

export function actionsAt(stage: Stage): SeatAction[] {
  if (stage.kind === "firstIn") return ["fold", "open", "jam"];
  if (stage.kind === "vsOpen") return ["fold", "call", "jam"];
  return ["fold", "call"];
}

export function labelFor(data: SeatsData, action: SeatAction): string {
  if (action === "open") return `오픈 ${data.openToBb}bb`;
  if (action === "jam") return `올인 ${data.stackBb}bb`;
  return ACTION_LABEL[action];
}

function handIndex(data: SeatsData, hand: string): number {
  return data.hands.indexOf(hand);
}

/**
 * 그 자리가 이미 낸 돈. 폴드의 EV는 이 값의 마이너스다.
 *
 * 데이터에서 읽으면 안 된다 — BB는 firstIn 스팟이 없어 솔버 출력에 자리 자체가
 * 없고, 그러면 BB의 폴드 EV가 null이 된다.
 */
function postedOf(data: SeatsData, seat: string): number {
  if (seat === "BB") return 1 + data.anteBb;
  if (seat === "SB") return 0.5;
  return 0;
}

/**
 * 이 자리에서 이 상황일 때 각 액션의 EV(bb). 데이터가 없으면 null.
 *
 * 솔버가 자리마다 스팟을 따로 풀었기 때문에, 뒤 자리의 대응 EV는 "오프너의
 * 스팟" 안에 들어 있다. 그래서 상황에 따라 읽는 자리가 달라진다.
 */
export function evAt(
  data: SeatsData,
  seat: string,
  stage: Stage,
  hand: string,
): (number | null)[] {
  const i = handIndex(data, hand);
  if (i < 0) return actionsAt(stage).map(() => null);
  const me = data.seats[seat];
  const foldEv = -postedOf(data, seat);

  if (stage.kind === "firstIn") {
    return [foldEv, me?.ev?.open?.[i] ?? null, me?.ev?.openJam?.[i] ?? null];
  }
  if (stage.kind === "vsOpen") {
    const opener = data.seats[stage.opener];
    return [
      foldEv,
      opener?.ev?.vsOpenCall?.[seat]?.[i] ?? null,
      opener?.ev?.vsOpenJam?.[seat]?.[i] ?? null,
    ];
  }
  // 올인에 대응. 내가 열었다가 3벳을 맞은 경우와, 앞의 오픈 올인을 맞은 경우.
  if (stage.iOpened) {
    // 이미 오픈액을 냈다. 접으면 그만큼만 잃는다.
    return [-data.openToBb, me?.ev?.callJam?.[stage.jammer]?.[i] ?? null];
  }
  const jammer = data.seats[stage.jammer];
  return [foldEv, jammer?.ev?.vsJamCall?.[seat]?.[i] ?? null];
}

/** 이 자리가 이 상황에서 각 액션을 고를 빈도. */
function freqAt(
  data: SeatsData,
  seat: string,
  stage: Stage,
  hand: string,
): number[] {
  const me = data.seats[seat];
  const get = (r?: Record<string, number>) => (r ? (r[hand] ?? 0) : 0);
  if (!me) return actionsAt(stage).map((_, k) => (k === 0 ? 1 : 0));

  if (stage.kind === "firstIn") {
    const open = get(me.open);
    const jam = get(me.openJam);
    return [Math.max(0, 1 - open - jam), open, jam];
  }
  if (stage.kind === "vsOpen") {
    const opener = data.seats[stage.opener];
    const call = get(opener?.vsOpenCall?.[seat]);
    const jam = get(opener?.vsOpenJam?.[seat]);
    return [Math.max(0, 1 - call - jam), call, jam];
  }
  if (stage.iOpened) {
    const call = get(me.callJam?.[stage.jammer]);
    return [Math.max(0, 1 - call), call];
  }
  const jammer = data.seats[stage.jammer];
  const call = get(jammer?.vsJamCall?.[seat]);
  return [Math.max(0, 1 - call), call];
}

function pick(weights: number[], rnd: () => number): number {
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return 0;
  let r = rnd() * total;
  for (let i = 0; i < weights.length; i++) {
    r -= weights[i];
    if (r <= 0) return i;
  }
  return weights.length - 1;
}

export function sampleAction(
  data: SeatsData,
  seat: string,
  stage: Stage,
  hand: string,
  rnd: () => number,
): SeatAction {
  const actions = actionsAt(stage);
  return actions[pick(freqAt(data, seat, stage, hand), rnd)];
}

// ── 한 판 ───────────────────────────────────────────────────────────────

export type Outcome =
  | { kind: "folded"; winner: string }
  | { kind: "allin"; a: string; b: string }
  | { kind: "flop"; opener: string; caller: string };

export type Turn = { stage: Stage; actions: SeatAction[]; evBb: (number | null)[] };

export type GameState = {
  seats: string[];
  heroSeat: string;
  /** 자리별 핸드. 히어로 것 말고는 화면에 안 보인다. */
  hands: Record<string, string>;
  steps: PreflopStep[];
  /** 히어로 차례면 그 판단, 아니면 null. */
  turn: Turn | null;
  outcome: Outcome | null;
  /** 내부 진행 상태. */
  cursor: number;
  opener: string | null;
  jammer: string | null;
};

const posted = (data: SeatsData, seats: string[], seat: string) =>
  seat === seats[seats.length - 1]
    ? 1 + data.anteBb
    : seat === seats[seats.length - 2]
      ? 0.5
      : 0;

function stepFor(
  data: SeatsData,
  seats: string[],
  seat: string,
  action: SeatAction,
): PreflopStep {
  const ante = seat === seats[seats.length - 1] ? data.anteBb : 0;
  if (action === "fold") {
    return { seat, kind: "fold", committedBb: posted(data, seats, seat) };
  }
  if (action === "jam") return { seat, kind: "allin", committedBb: data.stackBb };
  if (action === "open") return { seat, kind: "raise", committedBb: data.openToBb + ante };
  return { seat, kind: "call", committedBb: data.openToBb + ante };
}

function stageFor(state: GameState, seat: string): Stage {
  if (state.jammer) return { kind: "vsJam", jammer: state.jammer, iOpened: state.opener === seat };
  if (state.opener) return { kind: "vsOpen", opener: state.opener };
  return { kind: "firstIn" };
}

function turnFor(data: SeatsData, state: GameState, seat: string): Turn {
  const stage = stageFor(state, seat);
  return { stage, actions: actionsAt(stage), evBb: evAt(data, seat, stage, state.hands[seat]) };
}

/**
 * 히어로 차례가 오거나 판이 끝날 때까지 진행한다.
 * 상대는 전부 솔브된 빈도대로 친다.
 */
function advance(data: SeatsData, state: GameState, rnd: () => number): GameState {
  const s = { ...state, steps: [...state.steps] };

  while (s.cursor < s.seats.length) {
    const seat = s.seats[s.cursor];

    // 올인이 나왔으면 그 뒤로는 3벳자 이전 자리들도 응답해야 하지만,
    // 여기서는 순서대로 한 바퀴만 돈다. 오프너의 응답은 아래에서 따로 받는다.
    // 아무도 안 열었는데 BB 차례가 왔다면 BB가 그냥 가져간다. BB에게는
    // "먼저 여는" 선택지가 없다.
    if (!s.opener && !s.jammer && !data.seats[seat]?.open) {
      s.turn = null;
      s.outcome = { kind: "folded", winner: seat };
      return s;
    }

    if (seat === s.heroSeat) {
      s.turn = turnFor(data, s, seat);
      return s;
    }

    const stage = stageFor(s, seat);
    const action = sampleAction(data, seat, stage, s.hands[seat], rnd);
    s.steps.push(stepFor(data, s.seats, seat, action));
    s.cursor += 1;

    if (action === "jam") {
      // 3벳 올인. 오프너가 있으면 그쪽 응답을 받아야 한다.
      if (s.opener) {
        if (s.opener === s.heroSeat) {
          s.jammer = seat;
          s.turn = turnFor(data, s, s.opener);
          return s;
        }
        const openerStage: Stage = { kind: "vsJam", jammer: seat, iOpened: true };
        const reply = sampleAction(data, s.opener, openerStage, s.hands[s.opener], rnd);
        s.steps.push(stepFor(data, s.seats, s.opener, reply));
        s.turn = null;
        s.outcome =
          reply === "fold"
            ? { kind: "folded", winner: seat }
            : { kind: "allin", a: s.opener, b: seat };
        return s;
      }
      s.jammer = seat;
      continue;
    }

    if (action === "open") {
      s.opener = seat;
      continue;
    }

    if (action === "call") {
      s.turn = null;
      s.outcome = s.jammer
        ? { kind: "allin", a: s.jammer, b: seat }
        : { kind: "flop", opener: s.opener!, caller: seat };
      return s;
    }
  }

  // 한 바퀴가 다 돌았다.
  s.turn = null;
  if (s.jammer) s.outcome = { kind: "folded", winner: s.jammer };
  else if (s.opener) s.outcome = { kind: "folded", winner: s.opener };
  else s.outcome = { kind: "folded", winner: s.seats[s.seats.length - 1] };
  return s;
}

export function startGame(
  data: SeatsData,
  seats: string[],
  heroSeat: string,
  hands: Record<string, string>,
  rnd: () => number,
): GameState {
  return advance(
    data,
    {
      seats,
      heroSeat,
      hands,
      steps: [],
      turn: null,
      outcome: null,
      cursor: 0,
      opener: null,
      jammer: null,
    },
    rnd,
  );
}

export function applyHeroAction(
  data: SeatsData,
  state: GameState,
  action: SeatAction,
  rnd: () => number,
): GameState {
  if (!state.turn) return state;
  const s = { ...state, steps: [...state.steps, stepFor(data, state.seats, state.heroSeat, action)] };
  s.turn = null;

  const wasOpenerAnsweringJam = state.turn.stage.kind === "vsJam" && state.turn.stage.iOpened;
  if (wasOpenerAnsweringJam) {
    s.outcome =
      action === "fold"
        ? { kind: "folded", winner: state.jammer! }
        : { kind: "allin", a: state.heroSeat, b: state.jammer! };
    return s;
  }

  if (action === "fold") {
    s.cursor += 1;
    return advance(data, s, rnd);
  }
  if (action === "call") {
    s.outcome = s.jammer
      ? { kind: "allin", a: s.jammer, b: state.heroSeat }
      : { kind: "flop", opener: s.opener!, caller: state.heroSeat };
    return s;
  }
  if (action === "open") {
    s.opener = state.heroSeat;
    s.cursor += 1;
    return advance(data, s, rnd);
  }
  // jam
  s.jammer = state.heroSeat;
  s.cursor += 1;
  return advance(data, s, rnd);
}
