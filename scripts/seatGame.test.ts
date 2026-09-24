// 아홉 자리 프리플랍 진행 검증.
// 실행: node --experimental-strip-types scripts/seatGame.test.ts

import { readFileSync } from "node:fs";
import {
  actionsAt,
  applyHeroAction,
  evAt,
  labelFor,
  startGame,
  type SeatsData,
} from "../src/lib/seatGame.ts";
import { seatNames } from "../src/lib/poker.ts";
import { potFromScript } from "../src/lib/preflop.ts";

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

const data = JSON.parse(readFileSync("src/data/preflop-seats.json", "utf8")) as SeatsData;
const SEATS = seatNames(9);
const always = (v: number) => () => v;

/** 모든 자리에 같은 핸드를 쥐여 준다. 진행 규칙만 보는 테스트다. */
const allHands = (code: string) =>
  Object.fromEntries(SEATS.map((s) => [s, code])) as Record<string, string>;

console.log("상태별 선택지");
expect(actionsAt({ kind: "firstIn" }), ["fold", "open", "jam"], "첫 진입");
expect(actionsAt({ kind: "vsOpen", opener: "UTG" }), ["fold", "call", "jam"], "오픈 대응");
expect(actionsAt({ kind: "vsJam", jammer: "BB", iOpened: true }), ["fold", "call"], "올인 대응");

console.log("라벨에 금액이 붙는다");
expect(labelFor(data, "open"), `오픈 ${data.openToBb}bb`, "오픈");
expect(labelFor(data, "jam"), `올인 ${data.stackBb}bb`, "올인");
expect(labelFor(data, "fold"), "폴드", "폴드");

console.log("UTG는 첫 진입 상태로 시작한다");
const utg = startGame(data, SEATS, "UTG", allHands("72o"), always(0.5));
expect(utg.turn?.stage.kind, "firstIn", "앞에 아무도 없다");
expect(utg.steps.length, 0, "아직 아무도 액션하지 않았다");

console.log("아무 자리에나 앉을 수 있다");
for (const seat of SEATS) {
  const g = startGame(data, SEATS, seat, allHands("AA"), always(0.001));
  // 난수가 0에 가까우면 앞 자리들은 전부 첫 구간(폴드)으로 떨어진다.
  expect(g.heroSeat, seat, `${seat} 로 앉기`);
  // 히어로 차례가 오거나 판이 끝나거나 둘 중 하나여야 한다.
  expect(Boolean(g.turn) || Boolean(g.outcome), true, `${seat} 는 차례를 받거나 판이 끝난다`);
}

console.log("앞이 다 접으면 BB가 이긴다");
// 난수 0.001이면 모든 자리가 폴드를 고른다. BB는 firstIn 상태가 없으므로
// 아무도 열지 않은 채 한 바퀴가 끝난다.
const walked = startGame(data, SEATS, "BB", allHands("72o"), always(0.001));
expect(walked.turn, null, "BB는 고를 것이 없다");
expect(walked.outcome, { kind: "folded", winner: "BB" }, "BB가 그냥 가져간다");

console.log("히어로가 열면 뒤 자리들이 대응한다");
const opener = startGame(data, SEATS, "CO", allHands("AA"), always(0.001));
if (opener.turn) {
  const after = applyHeroAction(data, opener, "open", always(0.001));
  const myStep = after.steps.find((s) => s.seat === "CO");
  expect(myStep?.kind, "raise", "내 오픈이 기록된다");
  expect(myStep?.committedBb, data.openToBb, "오픈액");
  // 뒤가 전부 접으면 내가 가져간다.
  expect(after.outcome?.kind, "folded", "뒤가 다 접으면 종료");
}

console.log("히어로가 접으면 뒤로 넘어간다");
const folder = startGame(data, SEATS, "UTG", allHands("72o"), always(0.001));
if (folder.turn) {
  const after = applyHeroAction(data, folder, "fold", always(0.001));
  expect(after.turn, null, "내 차례는 끝났다");
  expect(after.steps[0].kind, "fold", "폴드가 기록된다");
  expect(after.outcome !== null, true, "판은 계속되어 끝난다");
}

console.log("팟 계산");
// BTN이 열고 BB가 콜하면 포스트플랍 스팟의 시작 팟과 같아야 한다.
const btn = startGame(data, SEATS, "BTN", allHands("AA"), always(0.001));
if (btn.turn) {
  const opened = applyHeroAction(data, btn, "open", always(0.999));
  // 난수가 크면 뒤 자리가 콜이나 올인을 고른다. 콜로 끝났을 때만 검사한다.
  if (opened.outcome?.kind === "flop") {
    expect(
      potFromScript(9, data.anteBb, opened.steps, opened.steps.length),
      6.5,
      "플랍 시작 팟",
    );
  }
}

console.log("EV");
const ev = evAt(data, "BTN", { kind: "firstIn" }, "AA");
expect(ev[0], 0, "BTN 폴드는 0 (낸 돈이 없다)");
expect(typeof ev[1], "number", "오픈 EV가 있다");
const bbEv = evAt(data, "BB", { kind: "vsOpen", opener: "BTN" }, "AA");
expect(bbEv[0], -(1 + data.anteBb), "BB 폴드는 블라인드+앤티만큼 마이너스");
const trash = evAt(data, "BTN", { kind: "firstIn" }, "없는핸드");
expect(trash, [null, null, null], "모르는 핸드는 전부 null");

console.log("AA는 접지 않는다");
for (const seat of ["UTG", "CO", "BTN"]) {
  const e = evAt(data, seat, { kind: "firstIn" }, "AA").filter((v): v is number => v !== null);
  expect(Math.max(...e) > e[0], true, `${seat} AA는 폴드가 최선이 아니다`);
}

console.log(`\n통과 ${passed}, 실패 ${failed}`);
if (failed > 0) process.exit(1);
