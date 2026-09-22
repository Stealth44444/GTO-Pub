// 프리플랍 올인 승률표를 계산한다 (169 × 169).
//
// 방법: 각 핸드 조합(예: AKs vs 77)에 대해 유효한 카드 조합쌍을 전부 순회하고,
// 조합쌍마다 보드 5장을 무작위로 샘플링한다. 조합 가중치는 정확하고,
// 보드만 샘플링하므로 오차는 보드 분산에서만 나온다.
//
// 실행: node --experimental-strip-types scripts/build-equity.ts [샘플수]

import { writeFileSync } from "node:fs";
import { evaluate7 } from "./evaluator.ts";

const RANKS = "23456789TJQKA"; // 인덱스 0='2' ... 12='A'

type CanonicalHand = {
  code: string; // "AKs", "72o", "TT"
  combos: number[][]; // 각 원소는 [card1, card2]
};

function buildCanonicalHands(): CanonicalHand[] {
  const hands: CanonicalHand[] = [];

  for (let hi = 12; hi >= 0; hi--) {
    // 포켓 페어
    const pairCombos: number[][] = [];
    for (let s1 = 0; s1 < 4; s1++) {
      for (let s2 = s1 + 1; s2 < 4; s2++) {
        pairCombos.push([hi * 4 + s1, hi * 4 + s2]);
      }
    }
    hands.push({ code: RANKS[hi] + RANKS[hi], combos: pairCombos });

    for (let lo = hi - 1; lo >= 0; lo--) {
      const suited: number[][] = [];
      const offsuit: number[][] = [];
      for (let s1 = 0; s1 < 4; s1++) {
        for (let s2 = 0; s2 < 4; s2++) {
          const pair = [hi * 4 + s1, lo * 4 + s2];
          if (s1 === s2) suited.push(pair);
          else offsuit.push(pair);
        }
      }
      hands.push({ code: RANKS[hi] + RANKS[lo] + "s", combos: suited });
      hands.push({ code: RANKS[hi] + RANKS[lo] + "o", combos: offsuit });
    }
  }

  return hands;
}

// xorshift128 — Math.random보다 빠르고 재현 가능한 시드를 쓴다.
let s0 = 0x9e3779b9;
let s1 = 0x243f6a88;
let s2 = 0xb7e15162;
let s3 = 0xdeadbeef;
function nextRandom(): number {
  const t = s1 << 9;
  let r = s1 * 5;
  r = ((r << 7) | (r >>> 25)) * 9;
  s2 ^= s0;
  s3 ^= s1;
  s1 ^= s2;
  s0 ^= s3;
  s2 ^= t;
  s3 = (s3 << 11) | (s3 >>> 21);
  return (r >>> 0) / 4294967296;
}

const handA = new Array<number>(7);
const handB = new Array<number>(7);
const deck = new Int8Array(48);

// 한 조합쌍에 대해 보드를 샘플링하고 [A승, 무, B승] 카운트를 누적한다.
function simulatePair(
  a1: number,
  a2: number,
  b1: number,
  b2: number,
  boards: number,
  out: Int32Array,
): void {
  let n = 0;
  for (let c = 0; c < 52; c++) {
    if (c !== a1 && c !== a2 && c !== b1 && c !== b2) deck[n++] = c;
  }

  handA[0] = a1;
  handA[1] = a2;
  handB[0] = b1;
  handB[1] = b2;

  for (let i = 0; i < boards; i++) {
    // 앞 5장만 부분 셔플
    for (let k = 0; k < 5; k++) {
      const j = k + ((nextRandom() * (48 - k)) | 0);
      const tmp = deck[k];
      deck[k] = deck[j];
      deck[j] = tmp;
    }
    for (let k = 0; k < 5; k++) {
      handA[2 + k] = deck[k];
      handB[2 + k] = deck[k];
    }
    const sa = evaluate7(handA);
    const sb = evaluate7(handB);
    if (sa > sb) out[0]++;
    else if (sa === sb) out[1]++;
    else out[2]++;
  }
}

const counts = new Int32Array(3);

// A의 승률(무승부는 0.5)을 반환한다.
function equity(a: CanonicalHand, b: CanonicalHand, targetSamples: number): number {
  const pairs: number[][] = [];
  for (const ca of a.combos) {
    for (const cb of b.combos) {
      if (ca[0] === cb[0] || ca[0] === cb[1] || ca[1] === cb[0] || ca[1] === cb[1]) continue;
      pairs.push([ca[0], ca[1], cb[0], cb[1]]);
    }
  }
  if (pairs.length === 0) return NaN; // 예: AA vs AA는 가능하지만 KK vs KK 등 일부는 조합이 남음

  const boardsPerPair = Math.max(1, Math.ceil(targetSamples / pairs.length));
  counts[0] = 0;
  counts[1] = 0;
  counts[2] = 0;
  for (const [a1, a2, b1, b2] of pairs) {
    simulatePair(a1, a2, b1, b2, boardsPerPair, counts);
  }

  const total = counts[0] + counts[1] + counts[2];
  return (counts[0] + counts[1] / 2) / total;
}

function main() {
  const targetSamples = Number(process.argv[2] ?? 20000);
  const hands = buildCanonicalHands();
  console.log(`핸드 ${hands.length}종, 매치업당 목표 샘플 ${targetSamples.toLocaleString()}`);

  const n = hands.length;
  const table = new Float64Array(n * n);
  const started = Date.now();
  let done = 0;
  const totalMatchups = (n * (n + 1)) / 2;

  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      const eq = equity(hands[i], hands[j], targetSamples);
      table[i * n + j] = eq;
      table[j * n + i] = 1 - eq;
      done++;
      if (done % 500 === 0) {
        const pct = ((done / totalMatchups) * 100).toFixed(1);
        const elapsed = (Date.now() - started) / 1000;
        const eta = (elapsed / done) * (totalMatchups - done);
        process.stdout.write(
          `\r  ${pct}%  (${done}/${totalMatchups})  경과 ${elapsed.toFixed(0)}초  남은 예상 ${eta.toFixed(0)}초   `,
        );
      }
    }
  }
  process.stdout.write("\n");

  const elapsed = (Date.now() - started) / 1000;
  console.log(`계산 완료: ${elapsed.toFixed(1)}초`);

  const output = {
    generatedAt: new Date().toISOString(),
    method: "monte-carlo-boards-exact-combos",
    targetSamplesPerMatchup: targetSamples,
    hands: hands.map((h) => h.code),
    // 행 = A핸드, 열 = B핸드, 값 = A의 승률(무승부 0.5 반영)
    equity: Array.from(table, (v) => Math.round(v * 10000) / 10000),
  };
  writeFileSync("scripts/data/equity.json", JSON.stringify(output));
  console.log(`저장: scripts/data/equity.json`);

  // 검증: 널리 인용되는 매치업과 대조
  const index = new Map(hands.map((h, i) => [h.code, i]));
  const checks: [string, string, number][] = [
    ["AA", "KK", 0.82],
    ["AA", "72o", 0.875],
    ["AKs", "QQ", 0.46],
    ["AKo", "QQ", 0.43],
    ["AKo", "22", 0.47],
    ["JTs", "AKo", 0.42],
  ];
  console.log("\n검증 (널리 인용되는 값과 대조):");
  for (const [a, b, expected] of checks) {
    const got = table[index.get(a)! * n + index.get(b)!];
    const diff = Math.abs(got - expected) * 100;
    const mark = diff < 1.5 ? "OK" : "확인필요";
    console.log(
      `  ${a.padEnd(4)} vs ${b.padEnd(4)}  계산 ${(got * 100).toFixed(1)}%  통상 ${(expected * 100).toFixed(1)}%  차이 ${diff.toFixed(1)}%p  ${mark}`,
    );
  }
}

main();
