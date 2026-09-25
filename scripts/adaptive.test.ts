// 적응형 딜 검증.
// 실행: node --experimental-strip-types scripts/adaptive.test.ts

import { readFileSync } from "node:fs";
import {
  acceptSituation,
  recordLoss,
  situationKey,
  weightFor,
  type SkillMap,
} from "../src/lib/adaptive.ts";
import { startGame, type SeatsData } from "../src/lib/seatGame.ts";
import { seatNames } from "../src/lib/poker.ts";

let passed = 0;
let failed = 0;
function expect(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) passed++;
  else {
    failed++;
    console.log(`  FAIL [${label}] 기대 ${e}, 실제 ${a}`);
  }
}

function lcg(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 4294967296;
  };
}

console.log("상황 이름");
expect(situationKey("BB", { kind: "vsOpen", opener: "CO" }), "BB:vsOpen", "오픈 대응");
expect(situationKey("UTG", { kind: "firstIn" }), "UTG:first", "첫 진입");
expect(situationKey("CO", { kind: "vsJam", jammer: "BTN", iOpened: true }), "CO:vsJamOpened", "내가 연 뒤 올인");
expect(
  situationKey("BTN", { kind: "vsJam", jammer: "HJ", iOpened: false, opener: "UTG" }),
  "BTN:vsSqueeze",
  "3벳 올인 뒷자리",
);

console.log("기록");
let m: SkillMap = {};
m = recordLoss(m, "BB:vsOpen", 1);
expect(m["BB:vsOpen"], { n: 1, ema: 1 }, "첫 기록은 그 값");
m = recordLoss(m, "BB:vsOpen", 0);
expect(m["BB:vsOpen"], { n: 2, ema: 0.8 }, "지수이동평균 0.2");

console.log("무게");
expect(weightFor({}, "X"), 1.5, "처음 보는 상황");
expect(weightFor({ X: { n: 2, ema: 1 } }, "X"), 1.5, "표본 셋 미만은 처음 보는 것과 같다");
expect(weightFor({ X: { n: 10, ema: 0 } }, "X"), 0.75, "잘하는 상황도 0으로 빠지지 않는다");
expect(weightFor({ X: { n: 10, ema: 2 } }, "X"), 3, "상한 3");

console.log("딜 시뮬레이션");
const data = JSON.parse(readFileSync("src/data/preflop-seats.json", "utf8")) as SeatsData;
const SEATS = seatNames(9);

/** HandTrainer.freshRound와 같은 방식으로 딜했을 때 BB 오픈 대응 판의 비율. */
function shareOf(target: string, skills: SkillMap, seed: number): number {
  const rnd = lcg(seed);
  let hit = 0;
  const N = 3000;
  for (let i = 0; i < N; i++) {
    let key = "";
    for (let tries = 0; tries < 60; tries++) {
      const hero = SEATS[Math.floor(rnd() * SEATS.length)];
      const hands = Object.fromEntries(SEATS.map((s) => [s, data.hands[Math.floor(rnd() * data.hands.length)]]));
      const g = startGame(data, SEATS, hero, hands, rnd);
      if (!g.turn) continue;
      key = situationKey(hero, g.turn.stage);
      if (acceptSituation(skills, key, rnd)) break;
    }
    if (key === target) hit += 1;
  }
  return hit / N;
}

// 모든 상황을 잘한다고 두고 BB 오픈 대응만 약하다고 두면, 그 판이 늘어야 한다.
const strong: SkillMap = {};
for (const seat of SEATS) {
  for (const s of ["first", "vsOpen", "vsJam", "vsJamOpened", "vsSqueeze"]) {
    strong[`${seat}:${s}`] = { n: 10, ema: 0 };
  }
}
const weak = { ...strong, "BB:vsOpen": { n: 10, ema: 0.5 } };
const base = shareOf("BB:vsOpen", strong, 1);
const tuned = shareOf("BB:vsOpen", weak, 1);
console.log(`  BB 오픈 대응 비율 ${(base * 100).toFixed(1)}% → ${(tuned * 100).toFixed(1)}%`);
expect(tuned > base * 2, true, "약한 상황이 두 배 넘게 자주 나온다");

console.log(`\n통과 ${passed}, 실패 ${failed}`);
if (failed > 0) process.exit(1);
