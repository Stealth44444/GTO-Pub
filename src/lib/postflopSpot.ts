// 포스트플랍 스팟에서 한 판을 시작하는 데 필요한 것들 — 양쪽 핸드 딜링과
// 상대의 액션 선택.
//
// 상대는 솔브된 전략에서 뽑는다. 미리 정해둔 규칙이 아니라 그 스팟의 해답대로
// 치게 해야, 사용자가 상대하는 것이 실제 GTO가 된다.

import { strategyFor, type SolvedSpot, type TreeNode } from "./tree.ts";

/** 0..1 난수. 테스트에서 고정 수열을 넣을 수 있게 주입받는다. */
export type Rnd = () => number;

export type Deal = {
  /** 사용자가 맡은 자리. 0 = OOP, 1 = IP. */
  heroPlayer: 0 | 1;
  /** [OOP 핸드, IP 핸드] */
  hands: [string, string];
  /** 각 플레이어의 핸드 색인. 전략·EV 조회에 쓴다. */
  handIdx: [number, number];
};

/** "AhAs" → ["Ah", "As"] */
function cardsOf(hand: string): [string, string] {
  return [hand.slice(0, 2), hand.slice(2, 4)];
}

/** 가중치에 비례해 하나 고른다. 후보가 없으면 -1. */
function pickWeighted(weights: number[], allowed: (i: number) => boolean, rnd: Rnd): number {
  let total = 0;
  for (let i = 0; i < weights.length; i++) {
    if (allowed(i)) total += weights[i];
  }
  if (total <= 0) return -1;

  let r = rnd() * total;
  for (let i = 0; i < weights.length; i++) {
    if (!allowed(i)) continue;
    r -= weights[i];
    if (r <= 0) return i;
  }
  // 부동소수 오차로 끝까지 왔을 때의 대비
  for (let i = weights.length - 1; i >= 0; i--) {
    if (allowed(i)) return i;
  }
  return -1;
}

/**
 * 양쪽에 핸드를 돌린다. 레인지의 가중치에 비례해 뽑고, 두 사람이 같은 카드를
 * 쓰지 않게 한다. (보드와의 충돌은 솔버가 이미 걸러 목록에 없다.)
 */
export function dealHands(spot: SolvedSpot, heroPlayer: 0 | 1, rnd: Rnd): Deal {
  const [w0, w1] = spot.handWeightsByPlayer;
  const [h0, h1] = spot.handsByPlayer;

  const i0 = pickWeighted(w0, () => true, rnd);
  const used = new Set(cardsOf(h0[i0]));
  const i1 = pickWeighted(w1, (i) => cardsOf(h1[i]).every((c) => !used.has(c)), rnd);

  return {
    heroPlayer,
    hands: [h0[i0], h1[i1]],
    handIdx: [i0, i1],
  };
}

/**
 * 상대가 고를 액션의 색인. 그 핸드의 전략 빈도에 비례해 뽑는다.
 * 빈도가 전부 0이면(수렴이 덜 된 구석) 첫 액션으로 떨어진다.
 */
export function sampleActionIndex(node: TreeNode, handIdx: number, rnd: Rnd): number {
  const freq = strategyFor(node, handIdx);
  const idx = pickWeighted(freq, () => true, rnd);
  return idx < 0 ? 0 : idx;
}
