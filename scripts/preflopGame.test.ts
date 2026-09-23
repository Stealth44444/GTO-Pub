// 프리플랍 한 판의 규칙 검증.
// 실행: node --experimental-strip-types scripts/preflopGame.test.ts

import { readFileSync } from "node:fs";
import {
  actionsAt,
  actionLabelAt,
  dealCombo,
  evAt,
  sampleAction,
  type PreflopData,
} from "../src/lib/preflopGame.ts";

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

const data = JSON.parse(
  readFileSync("src/data/preflop-btn-bb.json", "utf8"),
) as PreflopData;

console.log("노드별 선택지");
expect(actionsAt({ kind: "btnOpen" }), ["fold", "open"], "BTN은 열거나 접는다");
expect(actionsAt({ kind: "bbDefend" }), ["fold", "call", "shove"], "BB는 셋 중 하나");
expect(actionsAt({ kind: "btnVsShove" }), ["fold", "call"], "올인에는 콜 아니면 폴드");

console.log("라벨에 금액이 붙는다");
expect(actionLabelAt(data, { kind: "btnOpen" }, "open"), `오픈 ${data.openToBb}bb`, "오픈 라벨");
expect(actionLabelAt(data, { kind: "bbDefend" }, "shove"), `올인 ${data.stackBb}bb`, "올인 라벨");
expect(actionLabelAt(data, { kind: "bbDefend" }, "fold"), "폴드", "폴드 라벨");

console.log("EV");
// BTN은 아직 아무것도 내지 않았으므로 폴드가 정확히 0이어야 한다.
expect(evAt(data, { kind: "btnOpen" }, "AA")[0], 0, "BTN 폴드는 0");
const aaOpen = evAt(data, { kind: "btnOpen" }, "AA")[1]!;
const trashOpen = evAt(data, { kind: "btnOpen" }, "72o")[1]!;
expect(aaOpen > trashOpen, true, "AA 오픈이 72o 오픈보다 낫다");
expect(aaOpen > 0, true, "AA는 여는 게 접는 것보다 낫다");

// BB는 블라인드와 앤티를 이미 냈으므로 폴드가 그만큼 마이너스다.
expect(evAt(data, { kind: "bbDefend" }, "AA")[0], -(1 + data.anteBb), "BB 폴드는 블라인드+앤티");
const aaBb = evAt(data, { kind: "bbDefend" }, "AA");
expect(Math.max(...(aaBb.filter((v) => v !== null) as number[])) > aaBb[0]!, true, "AA는 접지 않는다");

// 레인지 밖 핸드는 EV가 없다.
expect(evAt(data, { kind: "btnOpen" }, "없는핸드"), [null, null], "모르는 핸드는 전부 null");

console.log("상대 액션은 솔브된 빈도를 따른다");
const seq = (values: number[]) => {
  let i = 0;
  return () => values[i++ % values.length];
};
// AA는 BTN이 100% 연다.
expect(sampleAction(data, { kind: "btnOpen" }, "AA", seq([0.99])), "open", "AA는 무조건 오픈");
expect(sampleAction(data, { kind: "btnOpen" }, "72o", seq([0.99])), "fold", "72o는 접는다");
// 난수 0이면 늘 첫 구간(폴드)으로 떨어진다.
expect(sampleAction(data, { kind: "bbDefend" }, "72o", seq([0.001])), "fold", "BB 쓰레기는 폴드");

console.log("핸드 코드를 실제 카드로");
const combo = dealCombo("AKs", new Set(), seq([0.0]))!;
expect(combo[0][0], "A", "첫 장은 A");
expect(combo[1][0], "K", "둘째 장은 K");
expect(combo[0][1], combo[1][1], "수티드는 무늬가 같다");

const off = dealCombo("AKo", new Set(), seq([0.0]))!;
expect(off[0][1] === off[1][1], false, "오프수트는 무늬가 다르다");

const pair = dealCombo("AA", new Set(), seq([0.0]))!;
expect(pair[0] !== pair[1], true, "페어도 두 장이 다른 카드");

// 보드에 깔린 카드는 피한다.
const blocked = new Set(["Ac", "Ad", "Ah"]);
const forced = dealCombo("AKs", blocked, seq([0.0]))!;
expect(forced[0], "As", "막히지 않은 A는 스페이드뿐");

// 전부 막히면 null.
const allBlocked = new Set(["Ac", "Ad", "Ah", "As"]);
expect(dealCombo("AA", allBlocked, seq([0.0])), null, "낼 조합이 없으면 null");

console.log(`\n통과 ${passed}, 실패 ${failed}`);
if (failed > 0) process.exit(1);
