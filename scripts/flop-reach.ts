// 판이 플랍까지 얼마나 가는가.
//
// 실행: STACK=30 node --experimental-strip-types scripts/flop-reach.ts
//   N(기본 20000)으로 판 수를 조절한다.
//
// 풀이가 게임다운지 보는 가장 짧은 지표다. 3벳이 올인 하나뿐이면 30bb에서도
// 오픈에 올인으로 답하는 판이 많아 플랍 도달률이 20bb의 14.9%에서 6.6%로
// 떨어졌다(커밋 faa9e53, 정의가 다른 값). 이 도구의 정의("모든 판 중 플랍에 간
// 판")로는 20bb 35.9%, 30bb 22.4%다. 크기 있는 3벳을 켤지는 이 값으로 정한다.
//
// 모든 자리를 엔진이 풀이대로 친다(히어로 없음). 핸드 클래스는 조합 수에
// 비례해 뽑는다 — 클래스를 고르게 뽑으면 페어가 실제보다 세 배 자주 온다.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { startGame, type SeatsData } from "../src/lib/seatGame.ts";
import { seatNames } from "../src/lib/poker.ts";

export type Reach = {
  hands: number;
  /** 단일 레이즈 팟으로 플랍에 간 비율. */
  flop: number;
  /** 크기 있는 3벳 팟으로 플랍에 간 비율. */
  threebetFlop: number;
  /** 오버콜로 셋이 플랍에 간 비율. */
  multiwayFlop: number;
  allin: number;
  folded: number;
};

export function flopReach(data: SeatsData, rnd: () => number, n: number): Reach {
  const seats = seatNames(data.tableSize);
  const combos = data.hands.map((h) => (h.length === 2 ? 6 : h.endsWith("s") ? 4 : 12));
  const total = combos.reduce((a, b) => a + b, 0);
  const deal = () => {
    let r = rnd() * total;
    for (let i = 0; i < combos.length; i++) {
      r -= combos[i];
      if (r <= 0) return data.hands[i];
    }
    return data.hands[data.hands.length - 1];
  };
  const count = { flop: 0, threebetFlop: 0, multiwayFlop: 0, allin: 0, folded: 0 };
  for (let i = 0; i < n; i++) {
    const hands = Object.fromEntries(seats.map((s) => [s, deal()]));
    const g = startGame(data, seats, "__nobody__", hands, rnd);
    if (g.outcome) count[g.outcome.kind] += 1;
  }
  return {
    hands: n,
    flop: count.flop / n,
    threebetFlop: count.threebetFlop / n,
    multiwayFlop: count.multiwayFlop / n,
    allin: count.allin / n,
    folded: count.folded / n,
  };
}

export function lcg(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 4294967296;
  };
}

// 직접 돌렸을 때만 측정해 출력한다(테스트는 함수만 가져다 쓴다).
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { withDepth } = await import("./game.ts");
  const path = withDepth("src/data/preflop-seats.json");
  const data = JSON.parse(readFileSync(path, "utf8")) as SeatsData;
  const r = flopReach(data, lcg(1), Number(process.env.N ?? 20000));
  const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
  console.log(
    `${path} · ${r.hands}판\n` +
      `  플랍 도달 ${pct(r.flop + r.threebetFlop + r.multiwayFlop)}` +
      ` (단일 레이즈 ${pct(r.flop)} · 3벳 팟 ${pct(r.threebetFlop)} · 3인 팟 ${pct(r.multiwayFlop)})\n` +
      `  올인 ${pct(r.allin)} · 프리플랍에서 끝 ${pct(r.folded)}`,
  );
}
