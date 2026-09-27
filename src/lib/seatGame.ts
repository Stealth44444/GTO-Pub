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
//
// 오픈 뒤에 3벳 올인이 나오면 실제 순서대로 올인 뒤의 자리가 먼저 답하고,
// 다들 접었을 때만 오프너가 답한다. 뒷자리가 콜하면 오프너는 접는다(콜러는
// 한 명까지).

import { equityVsRange, type EquityTable } from "./equity.ts";
import type { PreflopStep } from "./preflop";

export type SeatAction = "fold" | "open" | "jam" | "call" | "threebet";

export type SeatsData = {
  tableSize: number;
  stackBb: number;
  anteBb: number;
  openToBb: number;
  /**
   * 크기가 있는 3벳. 오프너 뒤(IP)와 블라인드가 다르다. 없으면 3벳은 올인
   * 하나뿐이다(지금 20bb 데이터).
   */
  threeBetToBb?: { ip: number; blind: number };
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
      /** 오프너의 스팟 안: 뒤 자리(키)가 크기 있는 3벳을 하는 빈도. */
      vsOpenThreeBet?: Record<string, Record<string, number>>;
      /** 오프너의 3벳 대응. 키는 3벳한 자리. */
      vsThreeBetCall?: Record<string, Record<string, number>>;
      vsThreeBetJam?: Record<string, Record<string, number>>;
      /** 3벳한 자리(키)가 오프너의 4벳 올인에 콜하는 빈도. */
      vsFourBetCall?: Record<string, Record<string, number>>;
      /**
       * 오프너의 스팟 안, [플랫한 자리][그 뒤의 자리]: 플랫 뒤 스퀴즈 올인 빈도.
       * 없으면 첫 콜러가 나오는 순간 뒤 자리는 접는다(지금 20bb 데이터).
       */
      vsFlatJam?: Record<string, Record<string, Record<string, number>>>;
      /** 스퀴즈에 오프너가 콜하는 빈도. [플랫한 자리][스퀴즈한 자리]. */
      vsSqueezeOpenerCall?: Record<string, Record<string, Record<string, number>>>;
      /** 오프너가 접은 뒤 플랫한 자리가 스퀴즈에 콜하는 빈도. */
      vsSqueezeCallerCall?: Record<string, Record<string, Record<string, number>>>;
      /** 플랫 뒤 오버콜(3인 팟) 빈도. [플랫한 자리][그 뒤의 자리]. 없으면 오버콜이 없다. */
      vsFlatCall?: Record<string, Record<string, Record<string, number>>>;
      foldEvBb: number;
      ev: {
        open: number[];
        openJam: number[];
        vsOpenCall: Record<string, number[]>;
        vsOpenJam: Record<string, number[]>;
        callJam: Record<string, number[]>;
        vsJamCall: Record<string, number[]>;
        vsOpenThreeBet?: Record<string, number[]>;
        vsThreeBetCall?: Record<string, number[]>;
        vsThreeBetJam?: Record<string, number[]>;
        vsFourBetCall?: Record<string, number[]>;
        vsFlatJam?: Record<string, Record<string, number[]>>;
        vsSqueezeOpenerCall?: Record<string, Record<string, number[]>>;
        vsSqueezeCallerCall?: Record<string, Record<string, number[]>>;
        vsFlatCall?: Record<string, Record<string, number[]>>;
      };
    }
  >;
};

export type Stage =
  | { kind: "firstIn" }
  | { kind: "vsOpen"; opener: string }
  | {
      kind: "vsJam";
      jammer: string;
      iOpened: boolean;
      /**
       * 올인이 누군가의 오픈 위에 나왔고 나는 그 오프너가 아니다(3벳 올인 뒤에
       * 앉은 자리). 솔버는 이 상황을 풀지 않았으므로 승률표로 EV를 낸다.
       */
      opener?: string;
    }
  /** 내가 열었고 뒤에서 크기 있는 3벳이 왔다 → 폴드 | 콜 | 4벳 올인. */
  | { kind: "vsThreeBet"; threeBettor: string }
  /** 내가 3벳했고 오프너가 4벳 올인했다 → 폴드 | 콜. */
  | { kind: "vsFourBet"; opener: string }
  /** 앞에서 오픈과 플랫이 나왔다 → 폴드 | 스퀴즈 올인. */
  | { kind: "vsFlat"; opener: string; caller: string }
  /**
   * 플랫 뒤에 스퀴즈 올인이 나왔다 → 폴드 | 콜. 오프너(iOpened)가 먼저 답하고,
   * 오프너가 접었을 때만 플랫한 자리가 답한다.
   */
  | { kind: "vsSqueeze"; opener: string; caller: string; squeezer: string; iOpened: boolean };

/**
 * 3벳 올인 뒤에 앉은 자리의 콜 EV를 낼 승률표. 앱이 받아서 넣어 준다.
 * 없으면 그 자리는 접는다 — 근거 없는 콜을 시키느니 모델대로 접는 편이 낫다.
 */
let equityTable: EquityTable | null = null;

export function setEquityTable(t: EquityTable | null): void {
  equityTable = t;
}

/**
 * 오픈 → 3벳 올인을 맞은 뒷자리가 콜했을 때의 EV(bb). 폴드 EV(-이미 낸 돈)와
 * 같은 기준이다. 콜하면 오프너는 접으므로 오프너의 오픈액은 죽은 돈이 된다.
 *
 *   팟 = 올인 스택 + 내 스택 + 오프너 오픈액 + 관여 안 한 블라인드(BB는 앤티 포함)
 *   EV = 승률 × 팟 − 내 스택
 *
 * 카드 제거는 반영하지 않는다(equityVsRange 참고).
 */
export function squeezeCallEv(
  data: SeatsData,
  seat: string,
  opener: string,
  jammer: string,
  hand: string,
): number | null {
  if (!equityTable) return null;
  const range = data.seats[opener]?.vsOpenJam?.[jammer];
  if (!range) return null;
  const eqPct = equityVsRange(equityTable, hand, range);
  if (eqPct === null) return null;
  const involved = new Set([seat, opener, jammer]);
  const deadBlinds =
    (involved.has("SB") ? 0 : 0.5) + (involved.has("BB") ? 0 : 1 + data.anteBb);
  const pot = 2 * data.stackBb + data.openToBb + deadBlinds;
  return Math.round(((eqPct / 100) * pot - data.stackBb) * 100) / 100;
}

export const ACTION_LABEL: Record<SeatAction, string> = {
  fold: "폴드",
  open: "오픈",
  jam: "올인",
  call: "콜",
  threebet: "3벳",
};

/** 이 깊이에 오픈(레이즈)이 있는가. 푸시/폴드 깊이는 openToBb가 0이다. */
export function canOpen(data: SeatsData): boolean {
  return data.openToBb > 0;
}

/** 이 깊이에 크기 있는 3벳이 있는가. 없으면 3벳은 올인 하나뿐이다. */
export function canThreeBet(data: SeatsData): boolean {
  return Boolean(data.threeBetToBb);
}

/** 이 자리의 3벳 크기(bb). 블라인드는 오프너보다 먼저 치므로 더 크다. */
export function threeBetToOf(data: SeatsData, seat: string): number {
  const size = data.threeBetToBb ?? { ip: 7.5, blind: 9 };
  return seat === "SB" || seat === "BB" ? size.blind : size.ip;
}

export function actionsAt(
  stage: Stage,
  open = true,
  threeBet = false,
  overcall = false,
): SeatAction[] {
  if (stage.kind === "firstIn") return open ? ["fold", "open", "jam"] : ["fold", "jam"];
  if (stage.kind === "vsOpen") {
    return threeBet ? ["fold", "call", "threebet", "jam"] : ["fold", "call", "jam"];
  }
  if (stage.kind === "vsThreeBet") return ["fold", "call", "jam"];
  if (stage.kind === "vsFlat") return overcall ? ["fold", "call", "jam"] : ["fold", "jam"];
  return ["fold", "call"];
}

/** 플랫 뒤에 오버콜(3인 팟)이 있는가. */
export function canOvercall(data: SeatsData): boolean {
  return Object.values(data.seats).some((s) => s.vsFlatCall);
}

/** 플랫 뒤에 스퀴즈가 있는가. 없으면 첫 콜러가 나오는 순간 뒤 자리는 접는다. */
export function canSqueeze(data: SeatsData): boolean {
  return Object.values(data.seats).some((s) => s.vsFlatJam);
}

/** 플랫한 자리가 낸 금액. BB는 앤티까지 냈다. */
function flatPut(data: SeatsData, seat: string): number {
  return data.openToBb + (seat === "BB" ? data.anteBb : 0);
}

/** 이 데이터로 이 상황에서 고를 수 있는 액션. 엔진 안에서는 늘 이걸 쓴다. */
function actionsFor(data: SeatsData, stage: Stage): SeatAction[] {
  return actionsAt(stage, canOpen(data), canThreeBet(data), canOvercall(data));
}

export function labelFor(data: SeatsData, action: SeatAction, seat?: string): string {
  if (action === "open") return `오픈 ${data.openToBb}bb`;
  if (action === "jam") return `올인 ${data.stackBb}bb`;
  if (action === "threebet") return seat ? `3벳 ${threeBetToOf(data, seat)}bb` : ACTION_LABEL.threebet;
  return ACTION_LABEL[action];
}

/** 3벳한 자리가 낸 총액. BB의 앤티는 3벳액과 따로 이미 낸 돈이다. */
function threeBetPut(data: SeatsData, seat: string): number {
  return threeBetToOf(data, seat) + (seat === "BB" ? data.anteBb : 0);
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
  if (i < 0) return actionsFor(data, stage).map(() => null);
  const me = data.seats[seat];
  const foldEv = -postedOf(data, seat);

  if (stage.kind === "firstIn") {
    const jam = me?.ev?.openJam?.[i] ?? null;
    return canOpen(data) ? [foldEv, me?.ev?.open?.[i] ?? null, jam] : [foldEv, jam];
  }
  if (stage.kind === "vsOpen") {
    const opener = data.seats[stage.opener];
    const call = opener?.ev?.vsOpenCall?.[seat]?.[i] ?? null;
    const jam = opener?.ev?.vsOpenJam?.[seat]?.[i] ?? null;
    if (!canThreeBet(data)) return [foldEv, call, jam];
    return [foldEv, call, opener?.ev?.vsOpenThreeBet?.[seat]?.[i] ?? null, jam];
  }
  if (stage.kind === "vsThreeBet") {
    // 이미 오픈액을 냈다. 접으면 그만큼 잃는다.
    return [
      -data.openToBb,
      me?.ev?.vsThreeBetCall?.[stage.threeBettor]?.[i] ?? null,
      me?.ev?.vsThreeBetJam?.[stage.threeBettor]?.[i] ?? null,
    ];
  }
  if (stage.kind === "vsFourBet") {
    // 3벳액(BB는 앤티까지)을 냈다. 대응 EV는 오프너의 스팟 안에 있다.
    return [
      -threeBetPut(data, seat),
      data.seats[stage.opener]?.ev?.vsFourBetCall?.[seat]?.[i] ?? null,
    ];
  }
  if (stage.kind === "vsFlat") {
    const o = data.seats[stage.opener]?.ev;
    const jam = o?.vsFlatJam?.[stage.caller]?.[seat]?.[i] ?? null;
    if (!canOvercall(data)) return [foldEv, jam];
    return [foldEv, o?.vsFlatCall?.[stage.caller]?.[seat]?.[i] ?? null, jam];
  }
  if (stage.kind === "vsSqueeze") {
    const opener = data.seats[stage.opener]?.ev;
    if (stage.iOpened) {
      const ev = opener?.vsSqueezeOpenerCall?.[stage.caller]?.[stage.squeezer];
      return [-data.openToBb, ev?.[i] ?? null];
    }
    const ev = opener?.vsSqueezeCallerCall?.[stage.caller]?.[stage.squeezer];
    return [-flatPut(data, seat), ev?.[i] ?? null];
  }
  // 올인에 대응. 내가 열었다가 3벳을 맞은 경우와, 앞의 오픈 올인을 맞은 경우.
  if (stage.iOpened) {
    // 이미 오픈액을 냈다. 접으면 그만큼만 잃는다.
    return [-data.openToBb, me?.ev?.callJam?.[stage.jammer]?.[i] ?? null];
  }
  if (stage.opener) {
    return [foldEv, squeezeCallEv(data, seat, stage.opener, stage.jammer, hand)];
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
  // 자기 데이터가 없으면 접는다. 단 자기 데이터를 읽는 상황에서만이다 — 오픈·올인
  // 대응 빈도는 오프너·올인한 자리의 데이터에 들어 있다. BB는 먼저 여는 스팟이
  // 없어 자기 항목이 없는데, 여기서 먼저 접어 버리면 AA로도 응답하지 않는다.
  const foldOnly = () => actionsFor(data, stage).map((_, k) => (k === 0 ? 1 : 0));

  if (stage.kind === "firstIn") {
    if (!me) return foldOnly();
    const jam = get(me.openJam);
    if (!canOpen(data)) return [Math.max(0, 1 - jam), jam];
    const open = get(me.open);
    return [Math.max(0, 1 - open - jam), open, jam];
  }
  if (stage.kind === "vsOpen") {
    const opener = data.seats[stage.opener];
    const call = get(opener?.vsOpenCall?.[seat]);
    const jam = get(opener?.vsOpenJam?.[seat]);
    if (!canThreeBet(data)) return [Math.max(0, 1 - call - jam), call, jam];
    const three = get(opener?.vsOpenThreeBet?.[seat]);
    return [Math.max(0, 1 - call - three - jam), call, three, jam];
  }
  if (stage.kind === "vsThreeBet") {
    if (!me) return foldOnly();
    const call = get(me.vsThreeBetCall?.[stage.threeBettor]);
    const jam = get(me.vsThreeBetJam?.[stage.threeBettor]);
    return [Math.max(0, 1 - call - jam), call, jam];
  }
  if (stage.kind === "vsFourBet") {
    const call = get(data.seats[stage.opener]?.vsFourBetCall?.[seat]);
    return [Math.max(0, 1 - call), call];
  }
  if (stage.kind === "vsFlat") {
    const o = data.seats[stage.opener];
    const jam = get(o?.vsFlatJam?.[stage.caller]?.[seat]);
    if (!canOvercall(data)) return [Math.max(0, 1 - jam), jam];
    const call = get(o?.vsFlatCall?.[stage.caller]?.[seat]);
    return [Math.max(0, 1 - call - jam), call, jam];
  }
  if (stage.kind === "vsSqueeze") {
    const o = data.seats[stage.opener];
    const table = stage.iOpened ? o?.vsSqueezeOpenerCall : o?.vsSqueezeCallerCall;
    const call = get(table?.[stage.caller]?.[stage.squeezer]);
    return [Math.max(0, 1 - call), call];
  }
  if (stage.iOpened) {
    if (!me) return foldOnly();
    const call = get(me.callJam?.[stage.jammer]);
    return [Math.max(0, 1 - call), call];
  }
  if (stage.opener) {
    // 풀린 빈도가 없으니 EV로 최선 대응한다. 콜이 폴드보다 나으면 콜.
    const ev = squeezeCallEv(data, seat, stage.opener, stage.jammer, hand);
    const call = ev !== null && ev > -postedOf(data, seat) ? 1 : 0;
    return [1 - call, call];
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
  const actions = actionsFor(data, stage);
  return actions[pick(freqAt(data, seat, stage, hand), rnd)];
}

// ── 한 판 ───────────────────────────────────────────────────────────────

export type Outcome =
  | { kind: "folded"; winner: string }
  | { kind: "allin"; a: string; b: string }
  | { kind: "flop"; opener: string; caller: string }
  /** 크기 있는 3벳에 오프너가 콜했다. 3벳 팟 플랍으로 간다. */
  | { kind: "threebetFlop"; opener: string; threeBettor: string }
  /** 플랫 뒤 오버콜로 셋이 플랍에 간다. 3인 플랍 전략은 없어 플랍 전에 끝난다. */
  | { kind: "multiwayFlop"; opener: string; caller: string; overcaller: string };

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
  /** 크기 있는 3벳을 한 자리. 3벳이 없으면 null. */
  threeBettor?: string | null;
  /** 오픈에 플랫한 자리. 스퀴즈가 있는 데이터에서만 뒤 자리가 이어서 답한다. */
  caller?: string | null;
  /** 플랫 뒤에 스퀴즈 올인한 자리. */
  squeezer?: string | null;
  /** 플랫 뒤에 따라 들어온 자리(3인 팟). */
  overcaller?: string | null;
};

const posted = (data: SeatsData, seats: string[], seat: string) =>
  seat === seats[seats.length - 1]
    ? 1 + data.anteBb
    : seat === seats[seats.length - 2]
      ? 0.5
      : 0;

/**
 * @param facingJam 올인을 마주하고 있는가. 그때의 콜은 오픈 콜이 아니라 스택
 *   전부다 — 이걸 모르면 올인에 콜한 자리가 2.5bb만 낸 것으로 적혀, 팟 표시와
 *   런의 칩 정산이 둘 다 틀린다.
 */
function stepFor(
  data: SeatsData,
  seats: string[],
  seat: string,
  action: SeatAction,
  keptBb?: number,
  facingJam = false,
  /** 3벳에 콜하면 그 3벳액까지 낸다. 없으면 오픈 콜이다. */
  callToBb?: number,
): PreflopStep {
  const ante = seat === seats[seats.length - 1] ? data.anteBb : 0;
  if (action === "threebet") {
    return { seat, kind: "raise", committedBb: threeBetToOf(data, seat) + ante };
  }
  if (action === "call" && callToBb !== undefined && !facingJam) {
    return { seat, kind: "call", committedBb: callToBb + ante };
  }
  if (action === "fold") {
    // 이미 오픈한 자리가 접으면 오픈액은 팟에 남는다. 블라인드로 되돌리면
    // 자리 앞의 칩이 줄어든다.
    return { seat, kind: "fold", committedBb: keptBb ?? posted(data, seats, seat) };
  }
  if (action === "jam") return { seat, kind: "allin", committedBb: data.stackBb };
  if (action === "open") return { seat, kind: "raise", committedBb: data.openToBb + ante };
  if (facingJam) return { seat, kind: "call", committedBb: data.stackBb };
  return { seat, kind: "call", committedBb: data.openToBb + ante };
}

/**
 * 액션이 닫힌 뒤 뒤에 남은 자리들을 접는다.
 *
 * 첫 콜러가 나오면 그 뒤는 접는 것으로 본다(멀티웨이 데이터가 없어서다).
 * 그런데 그걸 스텝으로 남기지 않으면, 화면에서는 그 자리들이 카드를 든 채
 * 있다가 플랍으로 넘어가는 순간 한꺼번에 접힌다. 다섯 자리가 동시에 접는
 * 장면은 포커에 없다.
 *
 * 모델이 이미 접은 것으로 치고 있으니, 스텝으로도 그렇게 적는다. 그러면
 * 화면이 다른 폴드와 똑같이 하나씩 보여준다.
 */
function foldRest(data: SeatsData, s: GameState) {
  for (let i = s.cursor; i < s.seats.length; i++) {
    s.steps.push(stepFor(data, s.seats, s.seats[i], "fold"));
  }
  s.cursor = s.seats.length;
}

/** 3벳 올인에 뒷자리가 콜했다. 콜러는 한 명까지라 오프너는 접는다. */
function foldOpenerAfterSqueeze(data: SeatsData, s: GameState) {
  if (!s.jammer || !s.opener) return;
  s.steps.push(stepFor(data, s.seats, s.opener, "fold", data.openToBb));
}

/** 이 상황의 차례를 만든다. 흐름이 상황을 직접 정하는 곳(3벳·4벳)에서 쓴다. */
function turnWith(data: SeatsData, state: GameState, seat: string, stage: Stage): Turn {
  return { stage, actions: actionsFor(data, stage), evBb: evAt(data, seat, stage, state.hands[seat]) };
}

/**
 * 크기 있는 3벳이 나왔다. 뒤 자리들은 이미 접었고(콜드 콜·콜드 4벳은 다루지
 * 않는다) 오프너가 답한다: 폴드 | 콜 → 3벳 팟 | 4벳 올인.
 */
function answerThreeBet(data: SeatsData, s: GameState, rnd: () => number): GameState {
  const opener = s.opener!;
  const threeBettor = s.threeBettor!;
  const stage: Stage = { kind: "vsThreeBet", threeBettor };
  if (opener === s.heroSeat) {
    s.turn = turnWith(data, s, opener, stage);
    return s;
  }
  const reply = sampleAction(data, opener, stage, s.hands[opener], rnd);
  return settleThreeBetReply(data, s, reply, rnd);
}

/** 오프너가 3벳에 답한 뒤. 히어로의 답과 상대의 답이 같은 길을 간다. */
function settleThreeBetReply(
  data: SeatsData,
  s: GameState,
  reply: SeatAction,
  rnd: () => number,
): GameState {
  const opener = s.opener!;
  const threeBettor = s.threeBettor!;
  // 폴드는 오픈액을 남기고, 콜은 3벳액까지 낸다.
  s.steps.push(
    stepFor(data, s.seats, opener, reply, data.openToBb, false, threeBetToOf(data, threeBettor)),
  );
  s.turn = null;
  if (reply === "fold") {
    s.outcome = { kind: "folded", winner: threeBettor };
    return s;
  }
  if (reply === "call") {
    s.outcome = { kind: "threebetFlop", opener, threeBettor };
    return s;
  }
  s.jammer = opener;
  return answerFourBet(data, s, rnd);
}

/** 오프너가 4벳 올인했다. 3벳한 자리가 답한다: 폴드 | 콜. */
function answerFourBet(data: SeatsData, s: GameState, rnd: () => number): GameState {
  const opener = s.opener!;
  const threeBettor = s.threeBettor!;
  const stage: Stage = { kind: "vsFourBet", opener };
  if (threeBettor === s.heroSeat) {
    s.turn = turnWith(data, s, threeBettor, stage);
    return s;
  }
  const reply = sampleAction(data, threeBettor, stage, s.hands[threeBettor], rnd);
  return settleFourBetReply(data, s, reply);
}

function settleFourBetReply(data: SeatsData, s: GameState, reply: SeatAction): GameState {
  const opener = s.opener!;
  const threeBettor = s.threeBettor!;
  // 폴드는 3벳액을 남기고, 콜은 스택 전부다.
  s.steps.push(stepFor(data, s.seats, threeBettor, reply, threeBetPut(data, threeBettor), true));
  s.turn = null;
  s.outcome =
    reply === "fold"
      ? { kind: "folded", winner: opener }
      : { kind: "allin", a: opener, b: threeBettor };
  return s;
}

/**
 * 플랫 뒤에 스퀴즈 올인이 나왔다. 오프너가 먼저 답하고, 오프너가 접으면 플랫한
 * 자리가 답한다. 콜은 한 명까지다(오프너가 콜하면 플랫한 자리는 접는다).
 */
function askSqueeze(data: SeatsData, s: GameState, iOpened: boolean, rnd: () => number): GameState {
  const who = iOpened ? s.opener! : s.caller!;
  const stage: Stage = {
    kind: "vsSqueeze",
    opener: s.opener!,
    caller: s.caller!,
    squeezer: s.squeezer!,
    iOpened,
  };
  if (who === s.heroSeat) {
    s.turn = turnWith(data, s, who, stage);
    return s;
  }
  const reply = sampleAction(data, who, stage, s.hands[who], rnd);
  return settleSqueeze(data, s, iOpened, reply, rnd);
}

function settleSqueeze(
  data: SeatsData,
  s: GameState,
  iOpened: boolean,
  reply: SeatAction,
  rnd: () => number,
): GameState {
  const who = iOpened ? s.opener! : s.caller!;
  // 폴드는 이미 낸 것(오픈액 / 플랫액)을 남기고, 콜은 스택 전부다.
  const kept = iOpened ? data.openToBb : flatPut(data, who);
  s.steps.push(stepFor(data, s.seats, who, reply, kept, true));
  s.turn = null;
  if (reply === "call") {
    if (iOpened) s.steps.push(stepFor(data, s.seats, s.caller!, "fold", flatPut(data, s.caller!)));
    s.outcome = { kind: "allin", a: who, b: s.squeezer! };
    return s;
  }
  if (iOpened) return askSqueeze(data, s, false, rnd);
  s.outcome = { kind: "folded", winner: s.squeezer! };
  return s;
}

function stageFor(state: GameState, seat: string): Stage {
  if (state.caller && state.opener && !state.jammer) {
    return { kind: "vsFlat", opener: state.opener, caller: state.caller };
  }
  if (state.jammer) {
    const iOpened = state.opener === seat;
    return {
      kind: "vsJam",
      jammer: state.jammer,
      iOpened,
      ...(state.opener && !iOpened ? { opener: state.opener } : {}),
    };
  }
  if (state.opener) return { kind: "vsOpen", opener: state.opener };
  return { kind: "firstIn" };
}

function turnFor(data: SeatsData, state: GameState, seat: string): Turn {
  const stage = stageFor(state, seat);
  return { stage, actions: actionsFor(data, stage), evBb: evAt(data, seat, stage, state.hands[seat]) };
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
    // "먼저 여는" 선택지가 없다. 판정은 자리 순서로 한다 — 오픈 레인지 유무로
    // 하면 오픈이 없는 푸시/폴드 깊이에서 UTG가 BB로 취급되어 판이 끝난다.
    if (!s.opener && !s.jammer && seat === s.seats[s.seats.length - 1]) {
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
    s.steps.push(stepFor(data, s.seats, seat, action, undefined, Boolean(s.jammer)));
    s.cursor += 1;

    if (stage.kind === "vsFlat") {
      if (action === "call") {
        // 오버콜. 셋이 플랍에 가고 뒤 자리는 접는다(4인 이상은 다루지 않는다).
        s.overcaller = seat;
        foldRest(data, s);
        s.turn = null;
        s.outcome = { kind: "multiwayFlop", opener: s.opener!, caller: s.caller!, overcaller: seat };
        return s;
      }
      if (action !== "jam") continue;
      // 플랫 뒤 스퀴즈 올인. 뒤에 남은 자리는 접고 오프너부터 답한다.
      s.squeezer = seat;
      foldRest(data, s);
      return askSqueeze(data, s, true, rnd);
    }

    if (action === "jam") {
      // 3벳 올인. 오프너가 있으면 그쪽 응답을 받아야 한다.
      if (s.opener) {
        if (s.opener === s.heroSeat) {
          s.jammer = seat;
          // 올인 뒤의 자리들이 먼저 접고, 그다음에 내가 답한다. 여기서 안
          // 접으면 내가 답하는 사이 그 자리들이 카드를 든 채로 남는다.
          foldRest(data, s);
          s.turn = turnFor(data, s, s.opener);
          return s;
        }
        // 오프너는 아직 답하지 않는다. 실제 순서대로 올인 뒤의 자리가 먼저
        // 답하고(히어로 포함), 다들 접으면 한 바퀴가 끝난 뒤 오프너가 답한다.
      }
      s.jammer = seat;
      continue;
    }

    if (action === "open") {
      s.opener = seat;
      continue;
    }

    if (action === "threebet") {
      // 뒤 자리들이 차례로 접고(단순화), 그다음 오프너가 답한다.
      s.threeBettor = seat;
      foldRest(data, s);
      return answerThreeBet(data, s, rnd);
    }

    if (action === "call") {
      if (!s.jammer && canSqueeze(data)) {
        // 플랫. 액션이 닫히지 않는다 — 뒤 자리가 스퀴즈로 답할 수 있다.
        s.caller = seat;
        continue;
      }
      foldRest(data, s);
      foldOpenerAfterSqueeze(data, s);
      s.turn = null;
      s.outcome = s.jammer
        ? { kind: "allin", a: s.jammer, b: seat }
        : { kind: "flop", opener: s.opener!, caller: seat };
      return s;
    }
  }

  // 플랫 뒤 자리들이 모두 접었다. 오프너와 플랫한 자리가 플랍으로 간다.
  if (s.caller && s.opener) {
    s.turn = null;
    s.outcome = { kind: "flop", opener: s.opener, caller: s.caller };
    return s;
  }

  // 한 바퀴가 다 돌았다. 오픈 위에 3벳 올인이 나왔고 다들 접었으면 이제 오프너가
  // 답한다. 오프너가 히어로면 올인이 나온 즉시 물었으므로 여기 오지 않는다.
  if (s.jammer && s.opener && s.opener !== s.heroSeat) {
    const openerStage: Stage = { kind: "vsJam", jammer: s.jammer, iOpened: true };
    const reply = sampleAction(data, s.opener, openerStage, s.hands[s.opener], rnd);
    s.steps.push(stepFor(data, s.seats, s.opener, reply, data.openToBb, true));
    s.turn = null;
    s.outcome =
      reply === "fold"
        ? { kind: "folded", winner: s.jammer }
        : { kind: "allin", a: s.opener, b: s.jammer };
    return s;
  }
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
  const stage = state.turn.stage;

  // 크기 있는 3벳의 세 갈래. 스텝은 각 갈래가 알맞은 금액으로 적는다.
  if (action === "threebet") {
    const s: GameState = {
      ...state,
      steps: [...state.steps, stepFor(data, state.seats, state.heroSeat, "threebet")],
      turn: null,
      cursor: state.cursor + 1,
      threeBettor: state.heroSeat,
    };
    foldRest(data, s);
    return answerThreeBet(data, s, rnd);
  }
  if (stage.kind === "vsThreeBet") {
    return settleThreeBetReply(data, { ...state, steps: [...state.steps] }, action, rnd);
  }
  if (stage.kind === "vsFourBet") {
    return settleFourBetReply(data, { ...state, steps: [...state.steps] }, action);
  }
  if (stage.kind === "vsFlat" && action === "call") {
    const s: GameState = {
      ...state,
      steps: [...state.steps, stepFor(data, state.seats, state.heroSeat, "call")],
      turn: null,
      cursor: state.cursor + 1,
      overcaller: state.heroSeat,
    };
    foldRest(data, s);
    s.outcome = {
      kind: "multiwayFlop",
      opener: state.opener!,
      caller: state.caller!,
      overcaller: state.heroSeat,
    };
    return s;
  }
  if (stage.kind === "vsFlat" && action === "jam") {
    const s: GameState = {
      ...state,
      steps: [...state.steps, stepFor(data, state.seats, state.heroSeat, "jam")],
      turn: null,
      cursor: state.cursor + 1,
      squeezer: state.heroSeat,
    };
    foldRest(data, s);
    return askSqueeze(data, s, true, rnd);
  }
  if (stage.kind === "vsSqueeze") {
    return settleSqueeze(data, { ...state, steps: [...state.steps] }, stage.iOpened, action, rnd);
  }

  const facingJam = stage.kind === "vsJam";
  // 내가 열었다가 올인에 접으면 오픈액은 팟에 남는다. 다른 자리는 advance가
  // 같은 처리를 한다.
  const keptBb = facingJam && stage.iOpened ? data.openToBb : undefined;
  const s = {
    ...state,
    steps: [
      ...state.steps,
      stepFor(data, state.seats, state.heroSeat, action, keptBb, facingJam),
    ],
  };
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
    const after = advance(data, s, rnd);
    // 내가 접었으면 내 판은 끝이다. 남은 자리들끼리 플랍에 가는 일은 실제로
    // 일어나지만, 그걸 "flop"으로 돌려주면 내가 접은 판의 플랍에 나를 앉힌다.
    if (
      after.outcome?.kind === "flop" &&
      after.outcome.opener !== s.heroSeat &&
      after.outcome.caller !== s.heroSeat
    ) {
      return { ...after, outcome: { kind: "folded", winner: after.outcome.caller } };
    }
    return after;
  }
  if (action === "call") {
    s.cursor += 1;
    if (!s.jammer && canSqueeze(data)) {
      // 내 플랫. 뒤 자리가 스퀴즈로 답할 수 있어 액션이 닫히지 않는다.
      s.caller = state.heroSeat;
      return advance(data, s, rnd);
    }
    // 내 콜로 액션이 닫힌다. 뒤에 남은 자리도 접는 것으로 적어야, 화면에서
    // 하나씩 접히고 플랍 직전에 한꺼번에 사라지지 않는다.
    foldRest(data, s);
    foldOpenerAfterSqueeze(data, s);
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

/** 기록에 남기는 상황 이름. 복습이 review.ts의 parseStage로 되살린다. */
export function stageLine(stage: Stage): string {
  if (stage.kind === "firstIn") return "firstIn";
  if (stage.kind === "vsOpen") return `vsOpen:${stage.opener}`;
  if (stage.kind === "vsThreeBet") return `vsThreeBet:${stage.threeBettor}`;
  if (stage.kind === "vsFourBet") return `vsFourBet:${stage.opener}`;
  if (stage.kind === "vsFlat") return `vsFlat:${stage.opener}:${stage.caller}`;
  if (stage.kind === "vsSqueeze") {
    const who = stage.iOpened ? "o" : "c";
    return `vsSqueeze:${stage.opener}:${stage.caller}:${stage.squeezer}:${who}`;
  }
  return `vsJam:${stage.jammer}${stage.opener ? `:${stage.opener}` : ""}`;
}

/**
 * 이 상황에서 액션마다 그 자리가 치는 레인지. 격자를 칠할 때 쓴다. 풀린
 * 레인지가 없는 액션(폴드, 스퀴즈 콜)은 null이다.
 *
 * 화면마다 따로 만들면 새 상황이 생길 때 한쪽만 고쳐져 격자가 틀린 색을 칠한다.
 */
export function rangesAt(
  data: SeatsData,
  seat: string,
  stage: Stage,
  actions: SeatAction[],
): (Record<string, number> | null)[] {
  const me = data.seats[seat];
  return actions.map((a) => {
    if (stage.kind === "firstIn") {
      return a === "open" ? (me?.open ?? null) : a === "jam" ? (me?.openJam ?? null) : null;
    }
    if (stage.kind === "vsOpen") {
      const opener = data.seats[stage.opener];
      if (a === "call") return opener?.vsOpenCall?.[seat] ?? null;
      if (a === "threebet") return opener?.vsOpenThreeBet?.[seat] ?? null;
      if (a === "jam") return opener?.vsOpenJam?.[seat] ?? null;
      return null;
    }
    if (stage.kind === "vsThreeBet") {
      if (a === "call") return me?.vsThreeBetCall?.[stage.threeBettor] ?? null;
      if (a === "jam") return me?.vsThreeBetJam?.[stage.threeBettor] ?? null;
      return null;
    }
    if (stage.kind === "vsFourBet") {
      return a === "call" ? (data.seats[stage.opener]?.vsFourBetCall?.[seat] ?? null) : null;
    }
    if (stage.kind === "vsFlat") {
      const o = data.seats[stage.opener];
      if (a === "jam") return o?.vsFlatJam?.[stage.caller]?.[seat] ?? null;
      if (a === "call") return o?.vsFlatCall?.[stage.caller]?.[seat] ?? null;
      return null;
    }
    if (stage.kind === "vsSqueeze") {
      const o = data.seats[stage.opener];
      const table = stage.iOpened ? o?.vsSqueezeOpenerCall : o?.vsSqueezeCallerCall;
      return a === "call" ? (table?.[stage.caller]?.[stage.squeezer] ?? null) : null;
    }
    if (a !== "call") return null;
    // 3벳 올인 뒷자리는 솔버가 푼 레인지가 없다. 격자 없이 EV만 보여준다.
    if (stage.opener) return null;
    return stage.iOpened
      ? (me?.callJam?.[stage.jammer] ?? null)
      : (data.seats[stage.jammer]?.vsJamCall?.[seat] ?? null);
  });
}

/**
 * 기록에 남기는 액션 종류. DB의 허용 값(fold/call/open/raise/allin …)에 맞춘다 —
 * 3벳은 레이즈다. 3벳이었다는 사실은 상황 이름(stageLine)이 갖고 있다.
 */
export function recordKind(action: SeatAction): string {
  if (action === "jam") return "allin";
  if (action === "threebet") return "raise";
  return action;
}
