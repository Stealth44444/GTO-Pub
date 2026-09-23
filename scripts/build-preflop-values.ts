// 프리플랍 판단에 필요한 "콜하고 플랍을 본다"의 가치를 포스트플랍 스팟에서 뽑는다.
//
// 실행: node --experimental-strip-types scripts/build-preflop-values.ts
//
// 스팟마다 플랍 루트의 핸드별 EV가 들어 있다(rootEvByPlayer). 그건 조합 단위라
// 프리플랍에서 쓰려면 169개 클래스로 접어야 하고, 보드마다 값이 다르므로 여러
// 보드에 걸쳐 평균내야 한다.
//
// 평균을 그냥 내면 안 된다. 고른 25개 플랍은 질감을 덮으려고 손으로 뽑은 것이라
// 실제 빈도와 다르다 — 모노톤 플랍은 전체의 5%인데 목록에서는 8%를 차지한다.
// 그래서 각 플랍이 속한 부류가 실제로 얼마나 자주 나오는지로 가중한다.

import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { ALL_HANDS } from "../src/lib/poker.ts";

const DIR = "public/postflop";
const OUT = "src/data/preflop-flopev.json";

type SpotFile = {
  flop: string[];
  startingPotBb: number;
  effectiveStackBb: number;
  handsByPlayer: [string[], string[]];
  handWeightsByPlayer: [number[], number[]];
  rootEvByPlayer: [number[], number[]];
};

const RANKS = "23456789TJQKA";
const SUITS = "cdhs";

/** "AhKs" → "AKo", "AhKh" → "AKs", "AhAs" → "AA" */
function comboToClass(combo: string): string {
  const [r1, s1, r2, s2] = [combo[0], combo[1], combo[2], combo[3]];
  if (r1 === r2) return r1 + r2;
  const hi = RANKS.indexOf(r1) > RANKS.indexOf(r2) ? r1 : r2;
  const lo = hi === r1 ? r2 : r1;
  return hi + lo + (s1 === s2 ? "s" : "o");
}

/**
 * 플랍의 부류. 랭크 배치(3장 다름 / 페어 / 트리플)와 무늬 배치(레인보우 /
 * 투톤 / 모노톤)가 같으면 같은 부류다. 같은 부류 안에서는 전략이 사실상 같다.
 */
function flopShape(cards: string[]): string {
  const ranks = cards.map((c) => c[0]);
  const suits = cards.map((c) => c[1]);
  const rankCounts = new Map<string, number>();
  for (const r of ranks) rankCounts.set(r, (rankCounts.get(r) ?? 0) + 1);
  const rankPattern = [...rankCounts.values()].sort((a, b) => b - a).join("");
  const suitPattern = [...new Set(suits)].length; // 3=레인보우, 2=투톤, 1=모노톤
  // 랭크 자체도 부류의 일부다. A72와 762는 전혀 다른 보드다.
  const sortedRanks = [...ranks].sort((a, b) => RANKS.indexOf(b) - RANKS.indexOf(a)).join("");
  return `${sortedRanks}|${rankPattern}|${suitPattern}`;
}

/** 52장에서 3장을 뽑는 22100가지를 세어 부류별 실제 빈도를 구한다. */
function flopShapeCounts(): Map<string, number> {
  const deck: string[] = [];
  for (const r of RANKS) for (const s of SUITS) deck.push(`${r}${s}`);

  const counts = new Map<string, number>();
  for (let a = 0; a < deck.length; a++) {
    for (let b = a + 1; b < deck.length; b++) {
      for (let c = b + 1; c < deck.length; c++) {
        const key = flopShape([deck[a], deck[b], deck[c]]);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
  }
  return counts;
}

const index = JSON.parse(readFileSync(`${DIR}/index.json`, "utf8")) as {
  spots: { file: string; flop: string }[];
};
const shapeCounts = flopShapeCounts();

const codes = ALL_HANDS.map((h) => h.code);
const codeIndex = new Map(codes.map((c, i) => [c, i]));

// 플레이어별로 [클래스][ 누적 EV×가중, 누적 가중 ]
const acc: [number[], number[]][] = [
  [new Array(codes.length).fill(0), new Array(codes.length).fill(0)],
  [new Array(codes.length).fill(0), new Array(codes.length).fill(0)],
];

let startingPotBb = 0;
let effectiveStackBb = 0;

for (const entry of index.spots) {
  const spot = JSON.parse(
    gunzipSync(readFileSync(`${DIR}/${entry.file}`)).toString("utf8"),
  ) as SpotFile;
  startingPotBb = spot.startingPotBb;
  effectiveStackBb = spot.effectiveStackBb;

  // 이 보드가 실제로 얼마나 자주 나오는지. 손으로 고른 목록의 편향을 여기서 지운다.
  const boardWeight = shapeCounts.get(flopShape(spot.flop)) ?? 1;

  for (const player of [0, 1] as const) {
    const combos = spot.handsByPlayer[player];
    const weights = spot.handWeightsByPlayer[player];
    const ev = spot.rootEvByPlayer[player];

    // 먼저 이 보드 안에서 클래스별로 접는다. 보드에 쓰인 카드 때문에 클래스마다
    // 남아 있는 조합 수가 다르므로, 조합 가중으로 접어야 한다.
    const evSum = new Array(codes.length).fill(0);
    const wSum = new Array(codes.length).fill(0);
    for (let i = 0; i < combos.length; i++) {
      const ci = codeIndex.get(comboToClass(combos[i]));
      if (ci === undefined) continue;
      evSum[ci] += ev[i] * weights[i];
      wSum[ci] += weights[i];
    }
    for (let ci = 0; ci < codes.length; ci++) {
      if (wSum[ci] <= 0) continue;
      acc[player][0][ci] += (evSum[ci] / wSum[ci]) * boardWeight * wSum[ci];
      acc[player][1][ci] += boardWeight * wSum[ci];
    }
  }
}

const flopEv: [number[], number[]] = [[], []];
const covered: [number, number] = [0, 0];
for (const player of [0, 1] as const) {
  for (let ci = 0; ci < codes.length; ci++) {
    const w = acc[player][1][ci];
    if (w > 0) {
      flopEv[player].push(Math.round((acc[player][0][ci] / w) * 1000) / 1000);
      covered[player]++;
    } else {
      // 이 스팟의 가정 레인지에 없던 핸드다. 플랍을 볼 일이 없으므로 값이 없다.
      flopEv[player].push(Number.NaN);
    }
  }
}

writeFileSync(
  OUT,
  JSON.stringify(
    {
      note: "플랍 루트에서 각 핸드가 가져가는 팟의 몫(bb). 프리플랍 투입은 빼지 않았다.",
      startingPotBb,
      effectiveStackBb,
      boardCount: index.spots.length,
      hands: codes,
      // 0 = OOP(BB), 1 = IP(BTN). 레인지 밖 핸드는 null.
      flopEvBb: flopEv.map((row) => row.map((v) => (Number.isNaN(v) ? null : v))),
    },
    null,
    1,
  ),
);

const show = (p: 0 | 1, code: string) => {
  const v = flopEv[p][codeIndex.get(code)!];
  return Number.isNaN(v) ? "—" : v.toFixed(2);
};
console.log(`보드 ${index.spots.length}개 · 팟 ${startingPotBb}bb · 유효스택 ${effectiveStackBb}bb`);
console.log(`레인지에 포함된 핸드: BB ${covered[0]}/169 · BTN ${covered[1]}/169`);
console.log("\n핸드      BB(OOP)  BTN(IP)   ← 플랍에서 가져가는 몫(bb)");
for (const code of ["AA", "KK", "QQ", "TT", "77", "22", "AKs", "AKo", "A5s", "T9s", "72o"]) {
  console.log(`  ${code.padEnd(6)}  ${show(0, code).padStart(6)}   ${show(1, code).padStart(6)}`);
}
console.log(`\n기록: ${OUT}`);
