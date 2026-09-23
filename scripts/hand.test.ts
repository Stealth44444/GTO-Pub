// 트리 조회와 핸드 진행 검증.
// 실행: node --experimental-strip-types scripts/hand.test.ts

import { readFileSync } from "node:fs";
import {
  actionKey,
  actionLabel,
  boardAt,
  findNode,
  type SolvedSpot,
} from "../src/lib/tree.ts";

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

console.log("액션 키와 라벨");
expect(actionKey({ kind: "check", amountBb: 0 }), "check", "체크 키");
expect(actionKey({ kind: "bet", amountBb: 2.8 }), "bet2.8", "벳 키");
expect(actionKey({ kind: "fold", amountBb: 0 }), "fold", "폴드 키");
expect(actionLabel({ kind: "check", amountBb: 0 }), "체크", "체크 라벨");
expect(actionLabel({ kind: "bet", amountBb: 2.8 }), "벳 2.8bb", "벳 라벨");
expect(actionLabel({ kind: "allin", amountBb: 20 }), "올인 20bb", "올인 라벨");

console.log("노드 조회");
expect(findNode(spot, "")?.street, "flop", "루트는 플랍");
expect(findNode(spot, "check")?.player, 1, "체크 후엔 IP 차례");
expect(findNode(spot, "check/check")?.street, "turn", "양쪽 체크면 턴");
expect(findNode(spot, "check/bet2.8")?.actions.length, 3, "벳에 직면하면 액션 3개");
expect(findNode(spot, "없는라인"), undefined, "없는 라인은 undefined");

console.log("보드");
expect(boardAt(spot, "flop"), ["Td", "9d", "6h"], "플랍은 3장");
expect(boardAt(spot, "turn"), ["Td", "9d", "6h", "2c"], "턴은 4장");
expect(boardAt(spot, "river"), ["Td", "9d", "6h", "2c", "7s"], "리버는 5장");

console.log(`\n통과 ${passed}, 실패 ${failed}`);
if (failed > 0) process.exit(1);
