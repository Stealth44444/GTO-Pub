// 플랍 전략 모델의 입력. 학습(scripts/nn)과 앱이 같은 코드를 써야 같은 값이 나온다.
//
// 카드를 그대로 넣지 않고 포커의 말로 바꿔 넣는다 — "탑페어 A키커",
// "넛 플러시 드로우", "상대 레인지 상대 승률 62%". 보드 수백 개로 학습하려면
// 모델이 카드 조합을 외우는 게 아니라 이런 성질에서 전략을 배워야 한다.
//
// import에 .ts를 붙이는 이유는 hand.ts와 같다(node와 Next 양쪽에서 로드).

import { evaluate7, parseCard } from "../evaluator.ts";

const rankOf = (c: number) => (c / 4) | 0;
const suitOf = (c: number) => c % 4;

/** A-5부터 T-A까지 스트레이트 창 10개. 에이스는 0과 13 양쪽에 선다. */
const WINDOWS = Array.from({ length: 10 }, (_, i) => [i - 1, i, i + 1, i + 2, i + 3]);
function inWindow(rank: number, w: number[]): boolean {
  return w.includes(rank) || (rank === 12 && w.includes(-1));
}

function straightDraws(ranks: number[]): { made: boolean; oesd: boolean; gutshot: boolean } {
  const set = new Set(ranks);
  const has = (r: number) => (r === -1 ? set.has(12) : set.has(r));
  let made = false;
  let outs = 0;
  const missing = new Set<number>();
  for (const w of WINDOWS) {
    const miss = w.filter((r) => !has(r));
    if (miss.length === 0) made = true;
    if (miss.length === 1) missing.add(miss[0] === -1 ? 12 : miss[0]);
  }
  outs = missing.size;
  return { made, oesd: !made && outs >= 2, gutshot: !made && outs === 1 };
}

export const FEATURE_NAMES = [
  "b.hi", "b.mid", "b.lo", "b.paired", "b.trips", "b.mono", "b.twotone", "b.spread", "b.windows",
  "h.hi", "h.lo", "h.pocket", "h.suited",
  "m.high", "m.pair", "m.twopair", "m.trips", "m.straight", "m.flush", "m.boat",
  "p.over", "p.top", "p.second", "p.bottom", "p.under", "p.kicker",
  "d.fd", "d.nutfd", "d.bdfd", "d.oesd", "d.gut", "d.overcards",
  "e.equity", "e.equity2", "r.equity",
] as const;

export const FEATURE_COUNT = FEATURE_NAMES.length;

/**
 * 한 핸드의 입력 벡터.
 *
 * equity는 이 보드에서 상대 레인지를 상대로 한 승률(0~1), rangeEquity는 내
 * 레인지 전체가 상대 레인지를 상대로 가진 승률이다. 둘 다 보드에만 달린 값이
 * 아니라서 따로 계산해 넣는다(equityVsRange).
 */
export function handFeatures(
  flop: string[],
  hand: string,
  equity: number,
  rangeEquity: number,
): Float32Array {
  const board = flop.map(parseCard);
  const hole = [parseCard(hand.slice(0, 2)), parseCard(hand.slice(2, 4))];
  const br = board.map(rankOf).sort((a, b) => b - a);
  const hr = hole.map(rankOf).sort((a, b) => b - a);
  const bs = board.map(suitOf);
  const suitCount = (cards: number[], s: number) => cards.filter((c) => suitOf(c) === s).length;
  const boardSuits = new Set(bs).size;

  const f = new Float32Array(FEATURE_COUNT);
  let k = 0;
  f[k++] = br[0] / 12;
  f[k++] = br[1] / 12;
  f[k++] = br[2] / 12;
  f[k++] = br[0] === br[1] || br[1] === br[2] ? 1 : 0;
  f[k++] = br[0] === br[2] ? 1 : 0;
  f[k++] = boardSuits === 1 ? 1 : 0;
  f[k++] = boardSuits === 2 ? 1 : 0;
  f[k++] = (br[0] - br[2]) / 12;
  f[k++] = WINDOWS.filter((w) => br.filter((r) => inWindow(r, w)).length >= 2).length / 10;

  f[k++] = hr[0] / 12;
  f[k++] = hr[1] / 12;
  f[k++] = hr[0] === hr[1] ? 1 : 0;
  f[k++] = suitOf(hole[0]) === suitOf(hole[1]) ? 1 : 0;

  // 지금 쥔 족보. 5장이라 evaluate7에 넣지 않고 직접 센다.
  const all = [...board, ...hole];
  const counts = new Map<number, number>();
  for (const c of all) counts.set(rankOf(c), (counts.get(rankOf(c)) ?? 0) + 1);
  const groups = [...counts.values()].sort((a, b) => b - a);
  const flushMade = [0, 1, 2, 3].some((s) => suitCount(all, s) >= 5);
  const str = straightDraws(all.map(rankOf));
  const cat = flushMade
    ? 5
    : str.made
      ? 4
      : groups[0] >= 3 && groups[1] >= 2
        ? 6
        : groups[0] >= 4
          ? 6
          : groups[0] === 3
            ? 3
            : groups[0] === 2 && groups[1] === 2
              ? 2
              : groups[0] === 2
                ? 1
                : 0;
  // 보드에만 있는 페어는 내 것이 아니다. 내 카드가 보탠 페어만 센다.
  const heroPairs = hole.some((c) => br.includes(rankOf(c))) || hr[0] === hr[1];
  const madeCat = cat === 1 && !heroPairs ? 0 : cat;
  for (let c = 0; c <= 6; c++) f[k++] = madeCat === c || (c === 6 && madeCat > 6) ? 1 : 0;

  // 페어의 종류. 이게 플랍 전략의 대부분을 가른다.
  const uniq = [...new Set(br)];
  let over = 0, top = 0, second = 0, bottom = 0, under = 0, kicker = 0;
  if (hr[0] === hr[1] && br.includes(hr[0])) {
    // 셋이다. 족보 칸(m.trips)이 이미 말하므로 페어 종류는 비운다.
  } else if (hr[0] === hr[1]) {
    if (hr[0] > br[0]) over = 1;
    else if (hr[0] < uniq[uniq.length - 1]) under = 1;
    else second = 1;
  } else {
    const paired = hr.find((r) => br.includes(r));
    if (paired !== undefined) {
      if (paired === uniq[0]) top = 1;
      else if (paired === uniq[uniq.length - 1]) bottom = 1;
      else second = 1;
      const other = hr[0] === paired ? hr[1] : hr[0];
      kicker = other / 12;
    }
  }
  f[k++] = over;
  f[k++] = top;
  f[k++] = second;
  f[k++] = bottom;
  f[k++] = under;
  f[k++] = kicker;

  // 드로우. 내 카드가 보탠 것만 센다.
  let fd = 0, nutfd = 0, bdfd = 0;
  for (let s = 0; s < 4; s++) {
    const mine = suitCount(hole, s);
    if (mine === 0) continue;
    const total = suitCount(all, s);
    if (total === 4) {
      fd = 1;
      // 보드와 내 카드에 없는 가장 높은 그 무늬 카드를 내가 쥐었는가.
      const present = new Set(all.filter((c) => suitOf(c) === s).map(rankOf));
      let top = 12;
      while (top >= 0 && present.has(top) && !hole.some((c) => suitOf(c) === s && rankOf(c) === top)) top--;
      if (hole.some((c) => suitOf(c) === s && rankOf(c) === top)) nutfd = 1;
    }
    if (total === 3 && mine >= 1) bdfd = 1;
  }
  const heroStr = straightDraws(all.map(rankOf));
  const boardStr = straightDraws(br);
  f[k++] = fd;
  f[k++] = nutfd;
  f[k++] = bdfd;
  f[k++] = heroStr.oesd && !boardStr.oesd ? 1 : 0;
  f[k++] = heroStr.gutshot && !boardStr.gutshot && !boardStr.oesd ? 1 : 0;
  f[k++] = hr.filter((r) => r > br[0]).length / 2;

  f[k++] = equity;
  f[k++] = equity * equity;
  f[k++] = rangeEquity;
  return f;
}

/**
 * 이 보드에서 hand가 상대 레인지(조합과 무게)를 상대로 가진 승률.
 * 턴·리버와 상대 조합을 표본으로 뽑는다. 카드가 겹치는 상대 조합은 건너뛴다.
 */
export function equityVsRange(
  flop: string[],
  hand: string,
  oppHands: string[],
  oppWeights: number[],
  samples: number,
  rnd: () => number,
): number {
  const board = flop.map(parseCard);
  const hole = [parseCard(hand.slice(0, 2)), parseCard(hand.slice(2, 4))];
  const dead = new Set([...board, ...hole]);
  const opp: number[][] = [];
  const w: number[] = [];
  for (let i = 0; i < oppHands.length; i++) {
    const c = [parseCard(oppHands[i].slice(0, 2)), parseCard(oppHands[i].slice(2, 4))];
    if (dead.has(c[0]) || dead.has(c[1]) || oppWeights[i] <= 0) continue;
    opp.push(c);
    w.push(oppWeights[i]);
  }
  if (opp.length === 0) return 0.5;
  const total = w.reduce((a, b) => a + b, 0);
  let won = 0;
  let n = 0;
  for (let s = 0; s < samples; s++) {
    let r = rnd() * total;
    let j = 0;
    while (j < w.length - 1 && (r -= w[j]) > 0) j++;
    const o = opp[j];
    let turn: number, river: number;
    do turn = (rnd() * 52) | 0; while (dead.has(turn) || turn === o[0] || turn === o[1]);
    do river = (rnd() * 52) | 0; while (dead.has(river) || river === o[0] || river === o[1] || river === turn);
    const mine = evaluate7([...hole, ...board, turn, river]);
    const theirs = evaluate7([...o, ...board, turn, river]);
    won += mine > theirs ? 1 : mine === theirs ? 0.5 : 0;
    n += 1;
  }
  return won / n;
}
