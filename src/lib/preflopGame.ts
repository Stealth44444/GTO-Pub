// BTN 오픈 대 BB 디펜스 한 판. 솔브된 레인지와 EV를 읽어 판단을 채점하고,
// 상대가 어떻게 칠지 정한다.
//
// 트리는 솔버와 같은 모양이어야 한다.
//   BTN: 폴드 | 오픈
//     BB: 폴드 | 콜 | 3벳 올인
//       BTN: 폴드 | 콜
//
// 콜로 끝나면 플랍으로 넘어간다 — 그때부터는 포스트플랍 스팟이 이어받는다.

export type PreflopSeat = "BTN" | "BB";
export type PreflopAction = "fold" | "open" | "call" | "shove";

export type PreflopData = {
  tableSize: number;
  stackBb: number;
  anteBb: number;
  openToBb: number;
  hands: string[];
  btn: {
    open: Record<string, number>;
    callVsShove: Record<string, number>;
    openEvBb: number[];
    callShoveEvBb: number[];
    foldToShoveEvBb: number;
  };
  bb: {
    call: Record<string, number>;
    shove: Record<string, number>;
    evBb: { fold: number; call: number | null; shove: number }[];
  };
};

/** 지금 어떤 판단을 앞두고 있는가. */
export type PreflopNode =
  | { kind: "btnOpen" } // BTN이 열지 말지
  | { kind: "bbDefend" } // BB가 오픈에 대응
  | { kind: "btnVsShove" }; // BTN이 3벳 올인에 대응

export const ACTION_LABEL: Record<PreflopAction, string> = {
  fold: "폴드",
  open: "오픈",
  call: "콜",
  shove: "올인",
};

export function actionsAt(node: PreflopNode): PreflopAction[] {
  if (node.kind === "btnOpen") return ["fold", "open"];
  if (node.kind === "bbDefend") return ["fold", "call", "shove"];
  return ["fold", "call"];
}

export function actionLabelAt(
  data: PreflopData,
  node: PreflopNode,
  action: PreflopAction,
): string {
  if (action === "open") return `오픈 ${data.openToBb}bb`;
  if (action === "shove") return `올인 ${data.stackBb}bb`;
  return ACTION_LABEL[action];
}

function handIndex(data: PreflopData, handCode: string): number {
  return data.hands.indexOf(handCode);
}

/**
 * 이 노드에서 각 액션의 EV(bb). 값이 없는 액션은 null이다 —
 * 레인지 밖 핸드는 플랍 EV가 없어서 콜을 값매길 수 없다.
 */
export function evAt(
  data: PreflopData,
  node: PreflopNode,
  handCode: string,
): (number | null)[] {
  const i = handIndex(data, handCode);
  if (i < 0) return actionsAt(node).map(() => null);

  if (node.kind === "btnOpen") {
    // BTN은 아직 아무것도 안 냈으므로 폴드가 정확히 0이다.
    return [0, data.btn.openEvBb[i]];
  }
  if (node.kind === "bbDefend") {
    const e = data.bb.evBb[i];
    return [e.fold, e.call, e.shove];
  }
  // 이 값은 나중에 추가된 필드다. 없는 데이터로도 화면이 죽지 않게 한다.
  const callEv = data.btn.callShoveEvBb?.[i];
  return [data.btn.foldToShoveEvBb ?? null, callEv ?? null];
}

/** 빈도에 비례해 하나 고른다. 합이 1이 안 되면 나머지는 첫 액션으로 간다. */
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

/**
 * 상대가 고를 액션. 솔브된 빈도대로 친다 — 미리 정한 규칙이 아니라 그 스팟의
 * 해답대로 쳐야 사용자가 상대하는 것이 실제 GTO가 된다.
 */
export function sampleAction(
  data: PreflopData,
  node: PreflopNode,
  handCode: string,
  rnd: () => number,
): PreflopAction {
  if (node.kind === "btnOpen") {
    const open = data.btn.open[handCode] ?? 0;
    return pick([1 - open, open], rnd) === 1 ? "open" : "fold";
  }
  if (node.kind === "bbDefend") {
    const call = data.bb.call[handCode] ?? 0;
    const shove = data.bb.shove[handCode] ?? 0;
    const fold = Math.max(0, 1 - call - shove);
    return (["fold", "call", "shove"] as const)[pick([fold, call, shove], rnd)];
  }
  const call = data.btn.callVsShove[handCode] ?? 0;
  return pick([1 - call, call], rnd) === 1 ? "call" : "fold";
}

/** 핸드 코드를 실제 두 장으로. 보드와 겹치지 않는 조합에서 고른다. */
export function dealCombo(
  handCode: string,
  blocked: Set<string>,
  rnd: () => number,
): [string, string] | null {
  const SUITS = "cdhs";
  const [hi, lo] = [handCode[0], handCode[1]];
  const suited = handCode.endsWith("s");
  const pair = handCode.length === 2;

  const combos: [string, string][] = [];
  for (let a = 0; a < 4; a++) {
    for (let b = 0; b < 4; b++) {
      if (pair && b <= a) continue;
      if (!pair && suited && a !== b) continue;
      if (!pair && !suited && a === b) continue;
      const c1 = `${hi}${SUITS[a]}`;
      const c2 = `${lo}${SUITS[b]}`;
      if (blocked.has(c1) || blocked.has(c2)) continue;
      combos.push([c1, c2]);
    }
  }
  if (combos.length === 0) return null;
  return combos[Math.floor(rnd() * combos.length)];
}
