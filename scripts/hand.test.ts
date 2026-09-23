// 트리 조회와 핸드 진행 검증.
// 실행: node --experimental-strip-types scripts/hand.test.ts

import { readFileSync } from "node:fs";
import { actionKey, actionLabel, type SolvedSpot } from "../src/lib/tree.ts";

let passed = 0;
let failed = 0;

function expect(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
  } else {
    failed++;
    console.log(`  FAIL [${label}] 기대 ${e}, 실제 ${a}`);
  }
}

const spot = JSON.parse(
  readFileSync("scripts/fixtures/sample-spot.json", "utf8"),
) as SolvedSpot;
void spot;

console.log("액션 키와 라벨");
expect(actionKey({ kind: "check", amountBb: 0 }), "check", "체크 키");
expect(actionKey({ kind: "bet", amountBb: 2.8 }), "bet2.8", "벳 키");
expect(actionKey({ kind: "fold", amountBb: 0 }), "fold", "폴드 키");
expect(actionLabel({ kind: "check", amountBb: 0 }), "체크", "체크 라벨");
expect(actionLabel({ kind: "bet", amountBb: 2.8 }), "벳 2.8bb", "벳 라벨");
expect(actionLabel({ kind: "allin", amountBb: 20 }), "올인 20bb", "올인 라벨");

console.log(`\n통과 ${passed}, 실패 ${failed}`);
if (failed > 0) process.exit(1);
