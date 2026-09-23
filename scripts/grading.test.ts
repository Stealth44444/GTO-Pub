// 채점 기준 검증. 경계값이 학습자가 보는 등급을 그대로 결정하므로,
// 실제 스팟의 EV 손실을 넣어 등급이 상식에 맞는지 확인한다.
//
// 실행: node --experimental-strip-types scripts/grading.test.ts

import { readFileSync } from "node:fs";
import { gradeByEvLoss, gradeByFrequency, isCleanChoice } from "../src/lib/grading.ts";

let passed = 0;
let failed = 0;

function expectGrade(evLossBb: number, expected: string, label: string) {
  const actual = gradeByEvLoss(evLossBb).id;
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    console.log(`  FAIL [${label}] ${evLossBb}bb: 기대 ${expected}, 실제 ${actual}`);
  }
}

console.log("경계값");
expectGrade(0, "best", "손실 없음");
expectGrade(0.01, "best", "최선 구간 경계 (솔버 자체 오차)");
expectGrade(0.011, "correct", "최선 구간 바로 밖");
expectGrade(0.05, "correct", "무난 경계");
expectGrade(0.051, "inaccuracy", "무난 바로 밖");
expectGrade(0.25, "inaccuracy", "부정확 경계");
expectGrade(0.251, "wrong", "부정확 바로 밖");
expectGrade(1.0, "wrong", "실수 경계");
expectGrade(1.01, "blunder", "큰 실수 시작");

// 음수 손실은 나올 수 없지만(최선을 골랐으면 0), 들어와도 최선으로 처리한다.
expectGrade(-0.5, "best", "음수 방어");

console.log("\n실제 스팟 (src/data/pushfold.json에서 읽음)");
type Spot = {
  tableSize: number;
  stackBb: number;
  position: string;
  // 핸드 이름이 아니라 최상위 hands 순서의 배열이다. 배열에 문자열 키로 접근하면
  // "66" 같은 이름이 인덱스 66으로 해석돼 엉뚱한 핸드의 EV가 조용히 나온다.
  shoveEvBb: number[];
};
const data = JSON.parse(readFileSync("src/data/pushfold.json", "utf8")) as {
  hands: string[];
  spots: Spot[];
};
const handIndex = new Map(data.hands.map((h, i) => [h, i]));
const find = (tableSize: number, stackBb: number, position: string) =>
  data.spots.find(
    (s) => s.tableSize === tableSize && s.stackBb === stackBb && s.position === position,
  )!;
function evOf(tableSize: number, stackBb: number, position: string, hand: string): number {
  const i = handIndex.get(hand);
  if (i === undefined) throw new Error(`알 수 없는 핸드: ${hand}`);
  const ev = find(tableSize, stackBb, position).shoveEvBb[i];
  if (!Number.isFinite(ev)) throw new Error(`EV가 없다: ${tableSize}/${stackBb}/${position}/${hand}`);
  return ev;
}

// 폴드의 EV가 0이므로 shoveEvBb가 곧 두 액션의 EV 차이다.
// 올인을 골랐을 때의 손실은 EV가 음수일 때 그 절댓값이다.
function shoveLoss(tableSize: number, stackBb: number, position: string, hand: string) {
  return Math.max(0, -evOf(tableSize, stackBb, position, hand));
}
function foldLoss(tableSize: number, stackBb: number, position: string, hand: string) {
  return Math.max(0, evOf(tableSize, stackBb, position, hand));
}

function expectSpot(loss: number, expected: string, label: string) {
  const actual = gradeByEvLoss(loss).id;
  if (actual === expected) {
    passed++;
    console.log(`  OK   ${label}  (${loss.toFixed(3)}bb → ${actual})`);
  } else {
    failed++;
    console.log(`  FAIL ${label}  (${loss.toFixed(3)}bb → 기대 ${expected}, 실제 ${actual})`);
  }
}

// 20bb UTG에서 72o 올인은 어떤 기준으로도 큰 실수여야 한다.
expectSpot(shoveLoss(9, 20, "UTG", "72o"), "blunder", "9인 20bb UTG에서 72o 올인");
// AA 폴드는 말할 것도 없다.
expectSpot(foldLoss(9, 20, "UTG", "AA"), "blunder", "9인 20bb UTG에서 AA 폴드");
// 혼합 전략 핸드는 무차별점에 있으므로 어느 쪽을 골라도 최선이어야 한다.
expectSpot(shoveLoss(9, 20, "UTG", "66"), "best", "9인 20bb UTG에서 66 올인 (혼합)");
expectSpot(foldLoss(9, 20, "UTG", "66"), "best", "9인 20bb UTG에서 66 폴드 (혼합)");
// 8bb 버튼에서 A9s 올인은 명백한 정답이라 폴드가 손해여야 한다.
expectSpot(foldLoss(9, 8, "BTN", "A9s"), "blunder", "9인 8bb BTN에서 A9s 폴드");

console.log("\n빈도 대체 채점 (EV 데이터 없는 모드)");
if (gradeByFrequency(100).id === "best") passed++;
else {
  failed++;
  console.log("  FAIL 빈도 100%는 best여야 한다");
}
if (gradeByFrequency(0).id === "blunder") passed++;
else {
  failed++;
  console.log("  FAIL 빈도 0%는 blunder여야 한다");
}

console.log("\n정확도 집계 기준");
if (isCleanChoice(gradeByEvLoss(0.05)) && !isCleanChoice(gradeByEvLoss(0.06))) passed++;
else {
  failed++;
  console.log("  FAIL 무난까지는 맞음으로, 부정확부터는 틀림으로 쳐야 한다");
}

console.log(`\n통과 ${passed}, 실패 ${failed}`);
if (failed > 0) process.exit(1);
