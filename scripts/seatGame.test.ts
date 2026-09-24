// 아홉 자리 프리플랍 진행 검증.
// 실행: node --experimental-strip-types scripts/seatGame.test.ts

import { readFileSync } from "node:fs";
import {
  actionsAt,
  applyHeroAction,
  evAt,
  labelFor,
  sampleAction,
  setEquityTable,
  squeezeCallEv,
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

/** 씨앗 고정 난수. 무작위로 돌리면 실패가 재현되지 않는다. */
function lcg(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 4294967296;
  };
}

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


// ── 접는 자리는 하나씩 접힌다 ───────────────────────────────────────────
//
// 액션이 닫히면 뒤에 남은 자리를 스텝에 안 적고 끝내던 때가 있었다. 화면에서는
// 그 자리들이 카드를 든 채 있다가 플랍으로 넘어가는 순간 한꺼번에 접혔다.
// 다섯 자리가 동시에 접는 장면은 포커에 없다.

{
  const SEATS9 = seatNames(9);
  const rnd = lcg(20260925);
  let handsChecked = 0;
  let missingSeats = 0;
  let heroNotInFlop = 0;

  for (let i = 0; i < 600; i++) {
    const hands: Record<string, string> = {};
    for (const seat of SEATS9) hands[seat] = data.hands[Math.floor(rnd() * data.hands.length)];
    const hero = SEATS9[Math.floor(rnd() * SEATS9.length)];
    let g = startGame(data, SEATS9, hero, hands, rnd);
    let guard = 0;
    while (g.turn && guard++ < 10) {
      g = applyHeroAction(data, g, sampleAction(data, hero, g.turn.stage, hands[hero], rnd), rnd);
    }
    handsChecked += 1;

    // 액션한 자리는 전부 스텝에 있어야 한다. BB만 예외다 — 다들 접으면 BB는
    // 칠 일 없이 그냥 가져간다.
    const seen = new Set(g.steps.map((s) => s.seat));
    const gone = SEATS9.filter((s) => !seen.has(s) && s !== "BB");
    if (gone.length > 0) missingSeats += 1;

    // 앞자리 둘이서 팟을 만들어 내 차례가 오기 전에 플랍이 정해질 수 있다.
    // 엔진으로서는 맞는 결과다 — 실제 테이블에서도 구경만 하는 판이 있다.
    // 다만 그런 판은 내가 고른 것이 없으므로 트레이너가 새로 돌려야 한다.
    if (g.outcome?.kind === "flop") {
      const mine = g.outcome.opener === hero || g.outcome.caller === hero;
      if (!mine) {
        heroNotInFlop += 1;
        // 내 스텝이 있다면 폴드여야 한다. 액션이 닫힌 뒤 뒷자리를 접는 것은
        // 엔진의 단순화이고, 내 자리도 거기 포함된다. 트레이너는 이런 판을
        // 화면에 올리지 않고 다시 돌린다.
        const mineStep = g.steps.find((s) => s.seat === hero);
        if (mineStep) expect(mineStep.kind, "fold", "안 낀 판에서 내 스텝은 폴드뿐이다");
      }
    }
  }

  expect(handsChecked, 600, "600판을 돌렸다");
  expect(missingSeats, 0, "스텝 없이 사라지는 자리가 없다");
  // 안 낀 판이 있다는 것 자체는 정상이다. 여기서 세어 두는 이유는 그 비율이
  // 갑자기 커지면 (예: 레인지가 넓어져 앞자리 콜이 흔해지면) 트레이너가
  // 빈 판을 자주 돌리게 되기 때문이다.
  expect(heroNotInFlop < 120, true, `안 낀 판이 600판 중 ${heroNotInFlop}판 (20% 미만)`);
}

{
  // 히어로가 콜해서 액션이 닫히는 경우. 뒤에 남은 자리가 전부 스텝에 있어야 한다.
  const SEATS9 = seatNames(9);
  const rnd = lcg(7);
  let checked = 0;
  for (let i = 0; i < 400 && checked < 5; i++) {
    const hands: Record<string, string> = {};
    for (const seat of SEATS9) hands[seat] = data.hands[Math.floor(rnd() * data.hands.length)];
    const hero = "LJ";
    const g0 = startGame(data, SEATS9, hero, hands, rnd);
    if (!g0.turn || !g0.turn.actions.includes("call")) continue;
    const g = applyHeroAction(data, g0, "call", rnd);
    if (g.outcome?.kind !== "flop") continue;
    checked += 1;
    const seen = new Set(g.steps.map((s) => s.seat));
    const behind = SEATS9.slice(SEATS9.indexOf(hero) + 1);
    expect(
      behind.every((s) => seen.has(s)),
      true,
      "내 콜 뒤의 자리도 스텝에 적힌다",
    );
  }
  expect(checked > 0, true, "검사할 판을 찾았다");
}

{
  // 오픈 위에 3벳 올인이 나오면 올인 뒤 자리가 먼저 답하고, 오프너는 그 뒤에 답한다.
  const eq = JSON.parse(readFileSync("scripts/data/equity.json", "utf8")) as {
    hands: string[];
    equity: number[];
  };
  setEquityTable({ ...eq, index: new Map(eq.hands.map((h, i) => [h, i])) });

  // AA는 3벳 올인에 늘 콜할 만하고, 72o는 늘 접을 만하다.
  expect((squeezeCallEv(data, "BTN", "UTG", "CO", "AA") ?? -99) > 0, true, "AA는 콜 EV가 양수");
  expect(
    (squeezeCallEv(data, "BTN", "UTG", "CO", "72o") ?? 0) < 0,
    true,
    "72o는 콜 EV가 폴드(0)보다 낮다",
  );

  const rnd = lcg(11);
  let heroAsked = 0;
  let orderChecked = 0;
  for (let i = 0; i < 20000; i++) {
    const hands: Record<string, string> = {};
    for (const seat of SEATS) hands[seat] = data.hands[Math.floor(rnd() * data.hands.length)];
    const hero = SEATS[Math.floor(rnd() * SEATS.length)];
    const g = startGame(data, SEATS, hero, hands, rnd);
    const at = (seat: string) => SEATS.indexOf(seat);
    const raise = g.steps.find((s) => s.kind === "raise");
    const jam = raise && g.steps.find((s) => s.kind === "allin" && at(s.seat) > at(raise.seat));
    if (!raise || !jam) continue;

    if (g.turn) {
      // 히어로가 3벳 올인 뒤에 앉았으면 오프너보다 먼저 물어야 한다.
      if (g.turn.stage.kind === "vsJam" && g.turn.stage.opener) {
        heroAsked += 1;
        expect(at(hero) > at(jam.seat), true, "물어보는 자리는 올인 뒤");
        expect(
          g.steps.filter((s) => s.seat === raise.seat).length,
          1,
          "오프너는 아직 답하지 않았다",
        );
      }
      continue;
    }
    // 판이 끝났으면 오프너의 두 번째 액션은 올인 뒤 자리들이 다 친 다음에 나온다.
    const replyIdx = g.steps.findIndex((s, k) => s.seat === raise.seat && k > g.steps.indexOf(raise));
    if (replyIdx < 0) continue;
    orderChecked += 1;
    const behind = SEATS.slice(at(jam.seat) + 1);
    const lastBehind = Math.max(...behind.map((b) => g.steps.findIndex((s) => s.seat === b)));
    expect(replyIdx > lastBehind, true, "오프너 응답은 뒷자리 다음");
    // 오프너가 접었으면 오픈액은 그대로 팟에 남는다.
    if (g.steps[replyIdx].kind === "fold") {
      expect(g.steps[replyIdx].committedBb, data.openToBb, "접은 오프너의 칩은 오픈액");
    }
  }
  expect(heroAsked > 0, true, "3벳 올인 뒤의 히어로에게 차례가 온다");
  expect(orderChecked > 0, true, "오프너 응답 순서를 검사했다");
  setEquityTable(null);
}

console.log(`
통과 ${passed}, 실패 ${failed}`);
if (failed > 0) process.exit(1);
