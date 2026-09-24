// 테이블 표시값 검증.
// 실행: node --experimental-strip-types scripts/tableView.test.ts

import { readFileSync } from "node:fs";
import { buildTableView } from "../src/lib/tableView.ts";
import { applyAction, startHand } from "../src/lib/hand.ts";
import { type SolvedSpot } from "../src/lib/tree.ts";
import { makeDecision, scoreHand } from "../src/lib/decisions.ts";
import { judge } from "../src/lib/showdown.ts";

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

const spot = JSON.parse(
  readFileSync("scripts/fixtures/sample-spot.json", "utf8"),
) as SolvedSpot;
const POT = spot.startingPotBb;

console.log("액션 전");
let st = startHand(spot);
let v = buildTableView(st, POT, "BB", "BTN", 0);
expect(v.totalPotBb, POT, "팟은 시작 팟 그대로");
expect(v.frontBb, 0, "자리 앞에 칩 없음");
expect(v.closed, false, "아직 라운드가 닫히지 않았다");
expect(Object.keys(v.actions).length, 0, "표시할 액션 없음");

console.log("OOP 체크 → IP 벳");
st = applyAction(spot, st, 0); // OOP 체크
v = buildTableView(st, POT, "BB", "BTN", 0);
expect(v.actions.BB?.label, "CHECK", "체크가 좌석에 뜬다");
expect(v.chips.BB, 0, "체크는 칩을 안 낸다");

st = applyAction(spot, st, 1); // IP 벳 2.8
v = buildTableView(st, POT, "BB", "BTN", 0);
expect(v.actions.BTN?.label, "BET", "벳이 좌석에 뜬다");
expect(v.chips.BTN, 2.8, "벳한 금액이 자리 앞에 놓인다");
expect(v.frontBb, 2.8, "앞에 나온 칩 합계");
expect(v.totalPotBb, Number((POT + 2.8).toFixed(2)), "팟은 벳을 포함한 전체");
// 화면 팟 = 전체 - 앞에 나온 칩. 실제 테이블처럼 아직 안 쓸어 담았다.
expect(Number((v.totalPotBb - v.frontBb).toFixed(2)), POT, "표시 팟은 아직 시작 팟");

console.log("스트릿을 닫는 액션도 보여야 한다");
// OOP 폴드로 핸드 종료. 이때도 그 폴드가 화면에 남아야 한다.
const folded = applyAction(spot, st, 0);
const fv = buildTableView(folded, POT, "BB", "BTN", 0);
expect(fv.actions.BB?.label, "FOLD", "핸드를 끝낸 액션이 사라지지 않는다");
expect(fv.closed, true, "핸드가 끝나면 칩을 쓸어 담는다");

console.log("판단 채점");
const d = makeDecision("FLOP", ["체크", "벳 2.8bb"], [5.8, 6.0], 1);
expect(d.lossBb, 0, "더 나은 쪽을 골랐으면 손실 0");
expect(d.rows[0].lossBb, 0.2, "다른 액션의 손실");
expect(d.grade?.id, "best", "최선 등급");

const bad = makeDecision("FLOP", ["체크", "벳 2.8bb"], [5.8, 6.0], 0);
expect(bad.lossBb, 0.2, "나쁜 쪽은 그만큼 손해");

console.log("도달확률 0인 상황은 채점하지 않는다");
const dead = makeDecision("TURN", ["체크", "벳", "올인"], [0, 0, 0], 1);
expect(dead.lossBb, null, "전부 0이면 채점 불가");
expect(dead.grade, null, "등급도 없다");
expect(dead.rows.every((r) => r.lossBb === null), true, "표의 모든 줄이 채점 불가");

// 폴드가 있는 노드는 폴드 EV가 원래 정확히 0이다. 하나가 0인 것만으로
// 채점 불가로 보면 정상 노드를 버리게 된다.
const withFold = makeDecision("FLOP", ["폴드", "콜"], [0, -1.15], 0);
expect(withFold.lossBb, 0, "폴드 EV 0은 정상이다");

console.log("핸드 전체 점수");
const score = scoreHand([d, bad, dead]);
expect(score.gradedCount, 2, "채점된 판단 수");
expect(score.ungradedCount, 1, "채점 못 한 판단 수");
expect(score.totalLossBb, 0.2, "손실 합계는 채점된 것만");
// 0.2bb는 inaccuracy 구간(0.25bb 이하)이다.
expect(score.grade?.id, "inaccuracy", "가장 나빴던 판단(0.2bb)으로 등급을 정한다");

console.log("채점한 판단이 하나도 없으면 등급이 없다");
// 손실 0으로 계산하면 "최선"이 뜬다. 레인지 밖으로 나가 아무것도 비교하지
// 못한 판이 완벽한 판으로 보이는 셈이라, 등급 자체가 없어야 한다.
const allDead = scoreHand([dead, dead]);
expect(allDead.grade, null, "채점된 게 없으면 등급도 없다");
expect(allDead.gradedCount, 0, "채점된 판단 0개");
expect(allDead.ungradedCount, 2, "전부 채점 불가");

console.log("값이 없는 액션은 0으로 취급하면 안 된다");
// BB가 레인지 밖 핸드로 마주하는 상황: 폴드 -2, 콜은 값 없음, 올인 -2.65.
// 콜을 0으로 채우면 최선이 되어버린다.
const partial = makeDecision("PREFLOP", ["폴드", "콜", "올인"], [-2, null, -2.65], 1);
expect(partial.rows[1].evBb, null, "값 없는 액션은 EV가 null");
expect(partial.rows[1].lossBb, null, "값 없는 액션은 채점 불가");
expect(partial.rows[0].lossBb, 0, "아는 것 중 폴드가 최선");
expect(partial.rows[2].lossBb, 0.65, "올인은 그만큼 손해");
expect(partial.lossBb, null, "고른 것이 값 없는 액션이면 채점 불가");

console.log("쇼다운");
const BOARD = ["Td", "9d", "6h", "2c", "7s"];
// 보드가 6-7-9-T라 8을 들면 스트레이트가 된다. 44는 아무것도 못 맞춘다.
expect(judge(BOARD, ["Ah", "As"], ["4h", "4s"])?.winner, "hero", "AA가 44를 이긴다");
expect(judge(BOARD, ["Ah", "As"], ["8h", "8c"])?.winner, "villain", "88은 스트레이트라 AA를 이긴다");
expect(judge(BOARD, ["4h", "4s"], ["Ah", "As"])?.winner, "villain", "자리를 바꿔도 같다");
// 보드에 9가 있으니 99는 세트다.
expect(judge(BOARD, ["9h", "9s"], ["Ah", "As"])?.winner, "hero", "세트가 오버페어를 이긴다");
expect(judge(BOARD, ["9h", "9s"], ["Ah", "As"])?.heroHandName, "트립스", "족보 이름");
// 8과 J로 7-8-9-T-J 스트레이트.
expect(judge(BOARD, ["Jh", "8c"], ["Ah", "As"])?.heroHandName, "스트레이트", "스트레이트 판정");
expect(judge(BOARD, ["Ah", "Ks"], ["Ac", "Kh"])?.winner, "tie", "같은 족보는 무승부");
// 보드가 덜 깔렸으면 판정하지 않는다.
expect(judge(["Td", "9d", "6h"], ["Ah", "As"], ["8h", "8s"]), null, "플랍에서는 쇼다운 없음");

console.log(`\n통과 ${passed}, 실패 ${failed}`);
if (failed > 0) process.exit(1);
