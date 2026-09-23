// 트리 조회와 핸드 진행 검증.
// 실행: node --experimental-strip-types scripts/hand.test.ts

import { readFileSync } from "node:fs";
import {
  actionKey,
  actionLabel,
  boardAt,
  actionEvFor,
  findNode,
  handIndex,
  strategyFor,
  type SolvedSpot,
} from "../src/lib/tree.ts";
import { applyAction, evLossByAction, isOver, startHand } from "../src/lib/hand.ts";

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

console.log("핸드별 전략·EV 색인");
const root = findNode(spot, "")!;
// strategy = [체크(AhAs), 체크(7c2d), 벳(AhAs), 벳(7c2d)]
expect(handIndex(spot, 0, "AhAs"), 0, "OOP 첫 핸드 색인");
expect(handIndex(spot, 0, "7c2d"), 1, "OOP 둘째 핸드 색인");
expect(handIndex(spot, 1, "8h3s"), 1, "IP 둘째 핸드 색인");
expect(handIndex(spot, 0, "QsQd"), -1, "레인지 밖 핸드는 -1");
expect(strategyFor(root, 0), [0.2, 0.8], "AhAs는 체크 0.2 / 벳 0.8");
expect(strategyFor(root, 1), [0.8, 0.2], "7c2d는 체크 0.8 / 벳 0.2");
expect(actionEvFor(root, 0), [5.8, 6.0], "AhAs는 체크 5.8 / 벳 6.0 → 벳이 낫다");
expect(actionEvFor(root, 1), [1.2, 0.9], "7c2d는 체크 1.2 / 벳 0.9 → 체크가 낫다");

const faced = findNode(spot, "check/bet2.8")!;
// 액션 3개 × 핸드 2개 = [폴드(h0),폴드(h1), 콜(h0),콜(h1), 레이즈(h0),레이즈(h1)]
expect(strategyFor(faced, 0), [0.1, 0.6, 0.3], "AhAs는 폴드0.1/콜0.6/레이즈0.3");
expect(strategyFor(faced, 1), [0.6, 0.3, 0.1], "7c2d는 폴드0.6/콜0.3/레이즈0.1");

console.log("핸드 진행");
let st = startHand(spot);
expect(st.line, "", "시작 라인은 빈 문자열");
expect(st.street, "flop", "시작은 플랍");
expect(st.board, ["Td", "9d", "6h"], "시작 보드는 3장");
expect(st.potBb, 5.5, "시작 팟");
expect(st.node?.player, 0, "OOP가 먼저 액션");
expect(isOver(st), false, "시작은 진행 중");

st = applyAction(spot, st, 0); // OOP 체크
expect(st.line, "check", "체크 후 라인");
expect(st.street, "flop", "아직 플랍");
expect(st.node?.player, 1, "이제 IP 차례");

st = applyAction(spot, st, 0); // IP 체크 → 턴
expect(st.line, "check/check", "양쪽 체크 후 라인");
expect(st.street, "turn", "턴으로 넘어감");
expect(st.board, ["Td", "9d", "6h", "2c"], "턴 카드가 깔림");
expect(st.history.length, 2, "히스토리 2개");

console.log("종료 판정");
let f = startHand(spot);
f = applyAction(spot, f, 0); // OOP 체크
f = applyAction(spot, f, 1); // IP 벳 2.8
expect(f.line, "check/bet2.8", "벳 후 라인");
expect(f.potBb, 8.3, "벳이 팟에 반영됨");
f = applyAction(spot, f, 0); // OOP 폴드
expect(isOver(f), true, "폴드하면 종료");
expect(f.node, null, "종료 노드는 null");

console.log("액션별 EV 손실");
// 최선 대비 손실이므로 최선 액션은 0이어야 한다.
// 픽스처의 실제 값을 쓴다: AhAs가 벳에 직면했을 때 폴드0 / 콜5.5 / 레이즈5.2
const losses = evLossByAction(actionEvFor(faced, 0));
expect(losses, [5.5, 0, 0.3], "콜이 최선, 폴드는 5.5bb 손해");
expect(evLossByAction(actionEvFor(faced, 1)), [0, 0.9, 1.4], "7c2d는 폴드가 최선");

const allBest = evLossByAction([2.0, 2.0, 2.0]);
expect(allBest, [0, 0, 0], "전부 같으면 손실 없음");

console.log(`\n통과 ${passed}, 실패 ${failed}`);
if (failed > 0) process.exit(1);
