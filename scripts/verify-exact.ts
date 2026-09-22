// 특정 매치업을 보드 전수 열거로 정확히 계산해 샘플링 결과를 검증한다.
// 샘플링 오차가 0이므로, 여기서 나온 값이 참값이다.
//
// 실행: node --experimental-strip-types scripts/verify-exact.ts [핸드A] [핸드B]

import { readFileSync } from "node:fs";
import { evaluate7 } from "./evaluator.ts";

const RANKS = "23456789TJQKA";

function combosOf(code: string): number[][] {
  const hi = RANKS.indexOf(code[0]);
  const lo = RANKS.indexOf(code[1]);
  const out: number[][] = [];
  if (code.length === 2) {
    for (let s1 = 0; s1 < 4; s1++)
      for (let s2 = s1 + 1; s2 < 4; s2++) out.push([hi * 4 + s1, hi * 4 + s2]);
    return out;
  }
  const suited = code[2] === "s";
  for (let s1 = 0; s1 < 4; s1++) {
    for (let s2 = 0; s2 < 4; s2++) {
      if (suited ? s1 === s2 : s1 !== s2) out.push([hi * 4 + s1, lo * 4 + s2]);
    }
  }
  return out;
}

// 한 조합쌍에 대해 남은 48장에서 보드 5장을 전부 열거한다.
function exactPair(a1: number, a2: number, b1: number, b2: number): [number, number, number] {
  const deck: number[] = [];
  for (let c = 0; c < 52; c++) {
    if (c !== a1 && c !== a2 && c !== b1 && c !== b2) deck.push(c);
  }
  const handA = [a1, a2, 0, 0, 0, 0, 0];
  const handB = [b1, b2, 0, 0, 0, 0, 0];
  let win = 0;
  let tie = 0;
  let lose = 0;

  for (let i = 0; i < 44; i++) {
    handA[2] = handB[2] = deck[i];
    for (let j = i + 1; j < 45; j++) {
      handA[3] = handB[3] = deck[j];
      for (let k = j + 1; k < 46; k++) {
        handA[4] = handB[4] = deck[k];
        for (let l = k + 1; l < 47; l++) {
          handA[5] = handB[5] = deck[l];
          for (let m = l + 1; m < 48; m++) {
            handA[6] = handB[6] = deck[m];
            const sa = evaluate7(handA);
            const sb = evaluate7(handB);
            if (sa > sb) win++;
            else if (sa === sb) tie++;
            else lose++;
          }
        }
      }
    }
  }
  return [win, tie, lose];
}

function exactEquity(codeA: string, codeB: string): number {
  let win = 0;
  let tie = 0;
  let lose = 0;
  for (const ca of combosOf(codeA)) {
    for (const cb of combosOf(codeB)) {
      if (ca[0] === cb[0] || ca[0] === cb[1] || ca[1] === cb[0] || ca[1] === cb[1]) continue;
      const [w, t, l] = exactPair(ca[0], ca[1], cb[0], cb[1]);
      win += w;
      tie += t;
      lose += l;
    }
  }
  const total = win + tie + lose;
  return (win + tie / 2) / total;
}

function main() {
  const table = JSON.parse(readFileSync("scripts/data/equity.json", "utf8")) as {
    hands: string[];
    equity: number[];
    targetSamplesPerMatchup: number;
  };
  const n = table.hands.length;
  const index = new Map(table.hands.map((h, i) => [h, i]));

  const args = process.argv.slice(2);
  const pairs: [string, string][] =
    args.length === 2
      ? [[args[0], args[1]]]
      : [
          ["JTs", "AKo"],
          ["AA", "KK"],
          ["AKs", "QQ"],
        ];

  console.log(`샘플링 표: 매치업당 ${table.targetSamplesPerMatchup.toLocaleString()}회\n`);
  for (const [a, b] of pairs) {
    const started = Date.now();
    const exact = exactEquity(a, b);
    const sampled = table.equity[index.get(a)! * n + index.get(b)!];
    const diff = Math.abs(exact - sampled) * 100;
    console.log(
      `${a} vs ${b}\n` +
        `  전수열거 ${(exact * 100).toFixed(3)}%\n` +
        `  샘플링   ${(sampled * 100).toFixed(3)}%\n` +
        `  차이     ${diff.toFixed(3)}%p   (${((Date.now() - started) / 1000).toFixed(1)}초)\n`,
    );
  }
}

main();
