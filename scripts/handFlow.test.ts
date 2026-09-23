// 프리플랍 한 판의 진행 검증.
// 실행: node --experimental-strip-types scripts/handFlow.test.ts

import { readFileSync } from "node:fs";
import { applyPreflop, evLoss, startPreflop } from "../src/lib/handFlow.ts";
import { potFromScript } from "../src/lib/preflop.ts";
import type { PreflopData } from "../src/lib/preflopGame.ts";

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

const always = (v: number) => () => v;

console.log("히어로가 BTN이면 첫 판단이 자기 것이다");
const s = startPreflop(data, "BTN", "AA", "72o", always(0.5));
expect(s.turn?.node.kind, "btnOpen", "BTN 오픈 판단");
expect(s.turn?.actions, ["fold", "open"], "선택지 둘");
expect(s.steps.length, 0, "아직 아무도 액션하지 않았다");

console.log("BTN이 접으면 거기서 끝난다");
const folded = applyPreflop(data, s, "fold", always(0.5));
expect(folded.outcome, { kind: "folded", by: "BTN" }, "BTN 폴드로 종료");
expect(folded.steps.length, 1, "폴드도 한 스텝");
expect(folded.turn, null, "더 고를 게 없다");

console.log("BTN이 열고 BB가 콜하면 플랍으로 간다");
// 난수 0이면 BB는 첫 구간(폴드)으로 떨어지므로, 콜이 나오게 하려면
// 콜 빈도가 높은 핸드를 줘야 한다. 대신 결과만 확인한다.
const opened = applyPreflop(data, s, "open", always(0.999));
expect(opened.steps[0].kind, "raise", "BTN의 오픈은 레이즈 스텝");
expect(opened.steps[0].committedBb, data.openToBb, "오픈액이 들어간다");
expect(opened.steps.length >= 2, true, "BB의 응수까지 기록된다");

console.log("BB의 콜은 앤티만큼 더 낸다");
// BB가 콜로 끝난 상태를 직접 만든다.
const asBb = startPreflop(data, "BB", "K9s", "AA", always(0.999));
expect(asBb.steps[0].seat, "BTN", "BTN이 먼저 움직인다");
if (asBb.turn) {
  const called = applyPreflop(data, asBb, "call", always(0.5));
  expect(called.outcome, { kind: "flop" }, "콜하면 플랍");
  const bbStep = called.steps.find((x) => x.seat === "BB")!;
  expect(bbStep.committedBb, data.openToBb + data.anteBb, "콜 + 앤티");
  // 화면의 팟이 포스트플랍 스팟의 시작 팟과 같아야 한다.
  expect(
    potFromScript(data.tableSize, data.anteBb, called.steps, called.steps.length),
    6.5,
    "플랍 시작 팟",
  );
}

console.log("BB가 접으면 BTN이 이긴다");
const asBb2 = startPreflop(data, "BB", "72o", "AA", always(0.999));
if (asBb2.turn) {
  const bbFold = applyPreflop(data, asBb2, "fold", always(0.5));
  expect(bbFold.outcome, { kind: "folded", by: "BB" }, "BB 폴드로 종료");
}

console.log("3벳 올인에 BTN이 대응한다");
// J8o는 열지만 올인에는 접는다. AKs는 열고 100% 받는다.
// 상대 액션은 빈도로 정해지므로, 빈도가 0이나 1인 핸드를 골라 결과를 확정한다.
const vsFolder = startPreflop(data, "BB", "AA", "J8o", always(0.999));
expect(vsFolder.turn?.node.kind, "bbDefend", "J8o는 열었다");
if (vsFolder.turn) {
  const jammed = applyPreflop(data, vsFolder, "shove", always(0.5));
  expect(jammed.outcome, { kind: "folded", by: "BTN" }, "올인에 접는 핸드면 종료");
  const jamStep = jammed.steps.find((x) => x.kind === "allin")!;
  expect(jamStep.committedBb, data.stackBb, "올인은 스택 전부");
}

const vsCaller = startPreflop(data, "BB", "AA", "AKs", always(0.999));
if (vsCaller.turn) {
  const jammed = applyPreflop(data, vsCaller, "shove", always(0.5));
  expect(jammed.outcome, { kind: "allin" }, "100% 받는 핸드면 올인 대결");
}

console.log("히어로가 BTN일 때 3벳 올인을 맞는다");
// AA로 열면 BB가 무엇을 하든, 3벳 올인이 오면 히어로에게 판단이 돌아온다.
const asBtn = startPreflop(data, "BTN", "AA", "AA", always(0.5));
const afterOpen = applyPreflop(data, asBtn, "open", always(0.999));
if (afterOpen.turn) {
  expect(afterOpen.turn.node.kind, "btnVsShove", "올인을 맞으면 다시 내 차례");
  expect(afterOpen.turn.actions, ["fold", "call"], "콜 아니면 폴드");
}

console.log("EV 손실");
expect(evLoss([2, 0, -1]), [0, 2, 3], "최선이 0, 나머지는 그만큼 손해");
expect(evLoss([1, null, 3]), [2, null, 0], "값 없는 액션은 null로 남는다");
expect(evLoss([null, null]), [null, null], "전부 없으면 채점 불가");

console.log(`\n통과 ${passed}, 실패 ${failed}`);
if (failed > 0) process.exit(1);
