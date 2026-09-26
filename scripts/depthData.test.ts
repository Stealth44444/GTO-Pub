// 푸시/폴드 데이터를 한 판 엔진 모양으로 옮긴 값이 원본과 같은지.
// 실행: node --experimental-strip-types scripts/depthData.test.ts

import { readFileSync } from "node:fs";
import {
  buildDepthData,
  PUSHFOLD_DEPTHS,
  type CallsJson,
  type PushfoldJson,
} from "../src/lib/depthData.ts";
import { evAt, startGame } from "../src/lib/seatGame.ts";
import { seatNames } from "../src/lib/poker.ts";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) pass += 1;
  else {
    fail += 1;
    console.error(`  실패: ${name}`);
  }
}
const near = (a: number | null | undefined, b: number) =>
  typeof a === "number" && Math.abs(a - b) < 0.0015;

const push = JSON.parse(readFileSync("src/data/pushfold.json", "utf8")) as PushfoldJson;
const calls = JSON.parse(readFileSync("src/data/pushfold-calls.json", "utf8")) as CallsJson;
const SEATS = seatNames(9);
const d15 = buildDepthData(push, calls, 15, SEATS);
const idx = (h: string) => push.hands.indexOf(h);
const spot = (pos: string) =>
  push.spots.find((s) => s.tableSize === 9 && s.stackBb === 15 && s.position === pos)!;
const callSpot = (shover: string, caller: string) =>
  calls.callSpots.find(
    (s) =>
      s.tableSize === 9 &&
      s.stackBb === 15 &&
      s.shoverPosition === shover &&
      s.callerPositions.includes(caller),
  )!;

check("깊이", d15.stackBb === 15);
check("오픈 없음", d15.openToBb === 0);
check("앤티", d15.anteBb === push.anteBb);
check("BB도 자리가 있다", d15.seats.BB !== undefined);
check("UTG 올인 빈도는 원본 그대로", d15.seats.UTG.openJam?.["55"] === spot("UTG").shove["55"]);

// UTG는 블라인드가 없어 절대 EV = 폴드 대비 EV.
check(
  "UTG 올인 EV",
  near(d15.seats.UTG.ev.openJam[idx("AKo")], spot("UTG").shoveEvBb[idx("AKo")]),
);
// SB는 0.5를 냈다. 절대 EV는 0.5만큼 낮고, 폴드와의 차이는 원본과 같다.
{
  const ev = evAt(d15, "SB", { kind: "firstIn" }, "K9o");
  check("SB 첫 진입은 폴드/올인 두 값", ev.length === 2);
  check("SB 폴드 -0.5", ev[0] === -0.5);
  check(
    "SB 올인과 폴드의 차이는 원본 EV",
    near((ev[1] ?? 0) - (ev[0] ?? 0), spot("SB").shoveEvBb[idx("K9o")]),
  );
}
// 배열 함정: "66"을 문자열 키로 읽으면 인덱스 66이 나온다.
{
  const ev = evAt(d15, "UTG", { kind: "firstIn" }, "66");
  check("66은 hands 색인으로 읽는다", near(ev[1], spot("UTG").shoveEvBb[idx("66")]));
  check("인덱스 66과 다르다", idx("66") !== 66);
}
// 콜. BB는 1 + 앤티를 냈다.
{
  const src = callSpot("BTN", "BB");
  check("BTN 올인에 BB 콜 빈도", d15.seats.BTN.vsJamCall?.BB === src.call);
  const ev = evAt(d15, "BB", { kind: "vsJam", jammer: "BTN", iOpened: false }, "A7o");
  check("BB 폴드 EV", ev[0] === -(1 + push.anteBb));
  check(
    "BB 콜과 폴드의 차이는 원본 EV",
    near((ev[1] ?? 0) - (ev[0] ?? 0), src.callEvBb[idx("A7o")]),
  );
}
check(
  "블라인드 아닌 콜러는 공유 스팟",
  d15.seats.UTG.vsJamCall?.CO === callSpot("UTG", "CO").call,
);

// 엔진이 이 데이터로 판을 돌린다.
{
  const hands = Object.fromEntries(SEATS.map((s) => [s, "72o"]));
  const g = startGame(d15, SEATS, "UTG", hands, () => 0.5);
  check("UTG 차례에 폴드/올인", JSON.stringify(g.turn?.actions) === '["fold","jam"]');
}

for (const depth of PUSHFOLD_DEPTHS) {
  let ok = true;
  try {
    buildDepthData(push, calls, depth, SEATS);
  } catch {
    ok = false;
  }
  check(`${depth}bb를 만든다`, ok);
}
{
  let threw = false;
  try {
    buildDepthData(push, calls, 13, SEATS);
  } catch {
    threw = true;
  }
  check("없는 깊이는 거절한다", threw);
}

console.log(`통과 ${pass}, 실패 ${fail}`);
process.exit(fail > 0 ? 1 : 0);
