// 아홉 자리 프리플랍 진행 검증.
// 실행: node --experimental-strip-types scripts/seatGame.test.ts

import { readFileSync } from "node:fs";
import {
  actionsAt,
  applyHeroAction,
  canOpen,
  canSqueeze,
  canThreeBet,
  evAt,
  labelFor,
  sampleAction,
  setEquityTable,
  squeezeCallEv,
  startGame,
  type GameState,
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

console.log("상대 BB의 응답");
{
  // BB는 먼저 여는 스팟이 없어 데이터에 자리가 없다. 그래도 오프너의 데이터로
  // 응답해야 한다. AA로 BTN 오픈에 접는 BB는 없다.
  const rnd = lcg(7);
  let folds = 0;
  for (let i = 0; i < 200; i++) {
    if (sampleAction(data, "BB", { kind: "vsOpen", opener: "BTN" }, "AA", rnd) === "fold") folds++;
  }
  expect(folds, 0, "BB는 AA로 BTN 오픈에 접지 않는다");

  let calls = 0;
  for (let i = 0; i < 200; i++) {
    if (sampleAction(data, "BB", { kind: "vsJam", jammer: "BTN", iOpened: false }, "AA", rnd) === "call") calls++;
  }
  expect(calls, 200, "BB는 AA로 BTN 올인에 콜한다");
}

console.log("올인에 콜한 자리의 투입");
{
  // 올인에 콜하면 스택 전부를 낸다. 오픈 콜 금액(2.5 + 앤티)으로 적으면 팟 표시와
  // 런의 칩 정산이 둘 다 틀린다.
  const r = lcg(5);
  let checked = 0;
  let wrong = 0;
  for (let n = 0; n < 3000; n++) {
    const hands = Object.fromEntries(SEATS.map((s) => [s, data.hands[Math.floor(r() * 169)]]));
    const g = startGame(data, SEATS, "__nobody__", hands, r);
    if (g.outcome?.kind !== "allin") continue;
    for (const seat of [g.outcome.a, g.outcome.b]) {
      const last = [...g.steps].reverse().find((st) => st.seat === seat);
      checked++;
      if (last?.committedBb !== data.stackBb) wrong++;
    }
  }
  expect(checked > 0, true, "올인 대결이 나온다");
  expect(wrong, 0, "올인 대결의 두 자리는 모두 스택 전부를 낸다");

  // 히어로가 열고 3벳 올인에 접으면 오픈액은 팟에 남는다.
  const r2 = lcg(9);
  let heroFolds = 0;
  let lost = 0;
  for (let n = 0; n < 20000 && heroFolds < 20; n++) {
    const hands = Object.fromEntries(SEATS.map((s) => [s, data.hands[Math.floor(r2() * 169)]]));
    const g = startGame(data, SEATS, "CO", hands, r2);
    if (g.turn?.stage.kind !== "firstIn") continue;
    const opened = applyHeroAction(data, g, "open", r2);
    if (opened.turn?.stage.kind !== "vsJam") continue;
    const folded = applyHeroAction(data, opened, "fold", r2);
    heroFolds++;
    const last = [...folded.steps].reverse().find((st) => st.seat === "CO");
    if (last?.committedBb !== data.openToBb) lost++;
  }
  expect(heroFolds > 0, true, "히어로가 열고 올인을 맞는 판이 나온다");
  expect(lost, 0, "열고 접은 히어로의 오픈액은 남는다");
}

console.log("오픈 없는 깊이");
{
  // 핸드 두 개짜리 가짜 푸시/폴드 데이터. AA만 올인하고 AA만 콜한다.
  // ev 배열은 hands 순서: [AA, 72o].
  const pfSeats: SeatsData["seats"] = {};
  for (const s of SEATS) {
    pfSeats[s] = {
      openJam: s === "BB" ? undefined : { AA: 1 },
      vsJamCall: Object.fromEntries(SEATS.map((c) => [c, { AA: 1 }])),
      foldEvBb: 0,
      ev: {
        open: [],
        openJam: [5, -1],
        vsOpenCall: {},
        vsOpenJam: {},
        callJam: {},
        vsJamCall: Object.fromEntries(SEATS.map((c) => [c, [4, -2]])),
      },
    };
  }
  const pf: SeatsData = {
    tableSize: 9,
    stackBb: 10,
    anteBb: 1,
    openToBb: 0,
    hands: ["AA", "72o"],
    seats: pfSeats,
  };

  expect(canOpen(pf), false, "openToBb 0이면 오픈이 없다");
  expect(canOpen(data), true, "20bb 데이터에는 오픈이 있다");
  expect(actionsAt({ kind: "firstIn" }, false), ["fold", "jam"], "오픈 없는 첫 진입");

  const g = startGame(pf, SEATS, "UTG", allHands("72o"), always(0.5));
  expect(g.turn?.actions, ["fold", "jam"], "UTG 첫 진입은 폴드/올인");
  expect(g.turn?.evBb, [0, -1], "폴드 0, 올인 -1");

  const walk = startGame(pf, SEATS, "BB", allHands("72o"), always(0.5));
  expect(walk.outcome, { kind: "folded", winner: "BB" }, "다 접으면 BB가 가져간다");
  expect(walk.turn, null, "BB에게는 고를 것이 없다");

  const hands = allHands("72o");
  hands.UTG = "AA";
  const vsJam = startGame(pf, SEATS, "SB", hands, always(0.5));
  expect(vsJam.turn?.stage, { kind: "vsJam", jammer: "UTG", iOpened: false }, "SB가 UTG 올인을 마주한다");
  const folded = applyHeroAction(pf, vsJam, "fold", always(0.5));
  expect(folded.outcome, { kind: "folded", winner: "UTG" }, "SB가 접고 BB도 접으면 UTG");
  const called = applyHeroAction(pf, vsJam, "call", always(0.5));
  expect(called.outcome, { kind: "allin", a: "UTG", b: "SB" }, "SB가 콜하면 올인 대결");
  const callStep = called.steps.find((st) => st.seat === "SB");
  expect(callStep?.committedBb, 10, "올인에 콜한 SB는 스택 전부를 낸다");
}

// ── 크기가 있는 3벳 ─────────────────────────────────────────────────────

/**
 * 핸드 세 개짜리 가짜 30bb 데이터. 빈도가 0 아니면 1이라 결과가 정해져 있다.
 * AA·KK만 열고, 뒤 자리는 AA·KK로 3벳한다. 오프너는 3벳에 KK면 콜, AA면 4벳
 * 올인. 3벳한 쪽은 AA면 4벳에 콜한다. ev 배열은 hands 순서 [AA, KK, 72o].
 */
function threeBetData(): SeatsData {
  const seats: SeatsData["seats"] = {};
  for (const s of SEATS) {
    if (s === "BB") continue;
    const behind = SEATS.slice(SEATS.indexOf(s) + 1);
    const per = <T,>(v: T) => Object.fromEntries(behind.map((b) => [b, v])) as Record<string, T>;
    seats[s] = {
      open: { AA: 1, KK: 1 },
      openJam: {},
      callJam: per({}),
      vsOpenCall: per({}),
      vsOpenJam: per({}),
      vsJamCall: per({}),
      vsOpenThreeBet: per({ AA: 1, KK: 1 }),
      vsThreeBetCall: per({ KK: 1 }),
      vsThreeBetJam: per({ AA: 1 }),
      vsFourBetCall: per({ AA: 1 }),
      foldEvBb: 0,
      ev: {
        open: [3, 2, -1],
        openJam: [1, 1, -2],
        vsOpenCall: per([0.5, 0.4, -3]),
        vsOpenJam: per([2, 1, -5]),
        callJam: per([5, 1, -9]),
        vsJamCall: per([6, 2, -9]),
        vsOpenThreeBet: per([4, 3, -4]),
        vsThreeBetCall: per([1, 2, -6]),
        vsThreeBetJam: per([8, 1, -9]),
        vsFourBetCall: per([7, -1, -9]),
      },
    };
  }
  return {
    tableSize: 9,
    stackBb: 30,
    anteBb: 1,
    openToBb: 2.5,
    hands: ["AA", "KK", "72o"],
    seats,
    threeBetToBb: { ip: 7.5, blind: 9 },
  };
}
const tb = threeBetData();
const noTb: SeatsData = { ...tb, threeBetToBb: undefined };
const lastPut = (st: GameState, seat: string) =>
  [...st.steps].reverse().find((x) => x.seat === seat)?.committedBb;

console.log("3벳 — 선택지와 EV");
expect(canThreeBet(tb), true, "3벳 크기가 있으면 3벳이 있다");
expect(canThreeBet(noTb), false, "없으면 없다");
expect(canThreeBet(data), false, "지금 20bb 데이터에는 3벳이 없다");
expect(
  actionsAt({ kind: "vsOpen", opener: "CO" }, true, true),
  ["fold", "call", "threebet", "jam"],
  "오픈 대응에 3벳",
);
expect(actionsAt({ kind: "vsThreeBet", threeBettor: "BTN" }), ["fold", "call", "jam"], "3벳 대응");
expect(actionsAt({ kind: "vsFourBet", opener: "CO" }), ["fold", "call"], "4벳 대응");
expect(labelFor(tb, "threebet", "BTN"), "3벳 7.5bb", "IP 3벳 라벨");
expect(labelFor(tb, "threebet", "BB"), "3벳 9bb", "BB 3벳 라벨");
expect(evAt(tb, "BTN", { kind: "vsOpen", opener: "CO" }, "KK"), [0, 0.4, 3, 1], "오픈 대응 EV 넷");
expect(evAt(noTb, "BTN", { kind: "vsOpen", opener: "CO" }, "KK"), [0, 0.4, 1], "3벳이 없으면 셋");
expect(
  evAt(tb, "CO", { kind: "vsThreeBet", threeBettor: "BTN" }, "KK"),
  [-2.5, 2, 1],
  "오프너의 3벳 대응 EV",
);
expect(evAt(tb, "BTN", { kind: "vsFourBet", opener: "CO" }, "AA"), [-7.5, 7], "BTN의 4벳 대응");
expect(evAt(tb, "BB", { kind: "vsFourBet", opener: "CO" }, "AA"), [-10, 7], "BB는 9 + 앤티를 잃는다");

console.log("3벳 — 흐름과 투입액");
{
  const hands = allHands("72o");
  hands.CO = "KK";
  hands.BTN = "AA";
  const g = startGame(tb, SEATS, "BTN", hands, always(0.5));
  expect(g.turn?.stage, { kind: "vsOpen", opener: "CO" }, "BTN이 CO 오픈을 마주한다");
  expect(g.turn?.actions, ["fold", "call", "threebet", "jam"], "선택지에 3벳");
  const after = applyHeroAction(tb, g, "threebet", always(0.5));
  expect(after.outcome, { kind: "threebetFlop", opener: "CO", threeBettor: "BTN" }, "KK 오프너는 콜");
  expect(lastPut(after, "BTN"), 7.5, "BTN은 7.5를 냈다");
  expect(lastPut(after, "CO"), 7.5, "CO는 3벳액을 콜했다");
  expect(
    ["SB", "BB"].map((s) => after.steps.some((x) => x.seat === s && x.kind === "fold")),
    [true, true],
    "3벳 뒤 블라인드는 접는다",
  );
}
{
  const hands = allHands("72o");
  hands.CO = "AA";
  hands.BTN = "AA";
  const g = startGame(tb, SEATS, "BTN", hands, always(0.5));
  const after = applyHeroAction(tb, g, "threebet", always(0.5));
  expect(after.turn?.stage, { kind: "vsFourBet", opener: "CO" }, "4벳을 마주한다");
  expect(after.turn?.actions, ["fold", "call"], "4벳 대응 선택지");
  const called = applyHeroAction(tb, after, "call", always(0.5));
  expect(called.outcome, { kind: "allin", a: "CO", b: "BTN" }, "콜하면 올인 대결");
  expect([lastPut(called, "BTN"), lastPut(called, "CO")], [30, 30], "둘 다 스택 전부");
  const folded = applyHeroAction(tb, after, "fold", always(0.5));
  expect(folded.outcome, { kind: "folded", winner: "CO" }, "접으면 오프너가 가져간다");
  expect(lastPut(folded, "BTN"), 7.5, "접어도 3벳액은 남는다");
}
{
  const hands = allHands("72o");
  hands.CO = "KK";
  hands.BTN = "AA";
  const g = startGame(tb, SEATS, "CO", hands, always(0.5));
  const opened = applyHeroAction(tb, g, "open", always(0.5));
  expect(opened.turn?.stage, { kind: "vsThreeBet", threeBettor: "BTN" }, "오프너가 3벳을 마주한다");
  const f = applyHeroAction(tb, opened, "fold", always(0.5));
  expect([f.outcome, lastPut(f, "CO")], [{ kind: "folded", winner: "BTN" }, 2.5], "접으면 2.5를 잃는다");
  const c = applyHeroAction(tb, opened, "call", always(0.5));
  expect(c.outcome, { kind: "threebetFlop", opener: "CO", threeBettor: "BTN" }, "콜하면 3벳 팟");
  expect(lastPut(c, "CO"), 7.5, "3벳 콜은 7.5");
  const j = applyHeroAction(tb, opened, "jam", always(0.5));
  expect(j.outcome, { kind: "allin", a: "CO", b: "BTN" }, "4벳에 AA가 콜");
}
{
  const hands = allHands("72o");
  hands.BTN = "KK";
  hands.BB = "AA";
  const g = startGame(tb, SEATS, "BB", hands, always(0.5));
  expect(g.turn?.stage, { kind: "vsOpen", opener: "BTN" }, "BB가 BTN 오픈을 마주한다");
  const after = applyHeroAction(tb, g, "threebet", always(0.5));
  expect(lastPut(after, "BB"), 10, "BB 3벳은 9 + 앤티");
  expect(after.outcome, { kind: "threebetFlop", opener: "BTN", threeBettor: "BB" }, "BTN KK는 콜");
}
{
  const r = lcg(3);
  let found = 0;
  for (let n = 0; n < 5000; n++) {
    const hands = Object.fromEntries(SEATS.map((s) => [s, data.hands[Math.floor(r() * 169)]]));
    const g = startGame(data, SEATS, "__nobody__", hands, r);
    if (g.outcome?.kind === "threebetFlop") found++;
  }
  expect(found, 0, "3벳 필드가 없으면 3벳 팟이 없다");
}

// ── 플랫 뒤 스퀴즈 올인 ─────────────────────────────────────────────────

/**
 * 핸드 넷짜리 가짜 30bb 데이터. KK·QQ로 열고 QQ로 플랫한다. 플랫 뒤에서는 AA가
 * 스퀴즈 올인한다. 스퀴즈에 오프너는 KK로만 콜하고, 플랫한 쪽은 QQ로 콜한다.
 * ev 배열은 hands 순서 [AA, KK, QQ, 72o].
 */
function squeezeData(): SeatsData {
  const seats: SeatsData["seats"] = {};
  for (const s of SEATS) {
    if (s === "BB") continue;
    const behind = SEATS.slice(SEATS.indexOf(s) + 1);
    const per = <T,>(v: T) => Object.fromEntries(behind.map((b) => [b, v])) as Record<string, T>;
    // [플랫한 자리][그 뒤의 자리]
    const perFlat = <T,>(v: T) =>
      Object.fromEntries(
        behind.map((c) => [
          c,
          Object.fromEntries(SEATS.slice(SEATS.indexOf(c) + 1).map((m) => [m, v])),
        ]),
      ) as Record<string, Record<string, T>>;
    seats[s] = {
      open: { KK: 1, QQ: 1 },
      openJam: {},
      callJam: per({}),
      vsOpenCall: per({ QQ: 1 }),
      vsOpenJam: per({}),
      vsJamCall: per({}),
      vsFlatJam: perFlat({ AA: 1 }),
      vsSqueezeOpenerCall: perFlat({ KK: 1 }),
      vsSqueezeCallerCall: perFlat({ QQ: 1 }),
      foldEvBb: 0,
      ev: {
        open: [3, 2, 1, -1],
        openJam: [1, 1, 0, -2],
        vsOpenCall: per([1, 0.8, 0.6, -3]),
        vsOpenJam: per([2, 1, 0, -5]),
        callJam: per([5, 1, 0, -9]),
        vsJamCall: per([6, 2, 0, -9]),
        vsFlatJam: perFlat([9, 1, 0.5, -3]),
        vsSqueezeOpenerCall: perFlat([8, 2, -1, -9]),
        vsSqueezeCallerCall: perFlat([7, 1, 0.3, -9]),
      },
    };
  }
  return {
    tableSize: 9,
    stackBb: 30,
    anteBb: 1,
    openToBb: 2.5,
    hands: ["AA", "KK", "QQ", "72o"],
    seats,
  };
}
const sq = squeezeData();

console.log("스퀴즈 — 선택지와 EV");
expect(canSqueeze(sq), true, "스퀴즈 데이터가 있으면 스퀴즈가 있다");
expect(canSqueeze(data), false, "지금 20bb 데이터에는 없다");
expect(actionsAt({ kind: "vsFlat", opener: "CO", caller: "BTN" }), ["fold", "jam"], "플랫을 마주하면 폴드/올인");
expect(
  actionsAt({ kind: "vsSqueeze", opener: "CO", caller: "BTN", squeezer: "BB", iOpened: true }),
  ["fold", "call"],
  "스퀴즈를 맞으면 폴드/콜",
);
expect(evAt(sq, "BB", { kind: "vsFlat", opener: "CO", caller: "BTN" }, "QQ"), [-2, 0.5], "BB의 스퀴즈 EV");
expect(
  evAt(sq, "CO", { kind: "vsSqueeze", opener: "CO", caller: "BTN", squeezer: "BB", iOpened: true }, "KK"),
  [-2.5, 2],
  "오프너의 스퀴즈 대응 EV",
);
expect(
  evAt(sq, "BTN", { kind: "vsSqueeze", opener: "CO", caller: "BTN", squeezer: "BB", iOpened: false }, "QQ"),
  [-2.5, 0.3],
  "플랫한 쪽의 스퀴즈 대응 EV",
);

console.log("스퀴즈 — 흐름과 투입액");
{
  // CO KK 오픈, BTN QQ 플랫, BB AA 스퀴즈, CO KK 콜 → BTN은 접는다.
  const hands = allHands("72o");
  hands.CO = "KK";
  hands.BTN = "QQ";
  hands.BB = "AA";
  const g = startGame(sq, SEATS, "__nobody__", hands, always(0.5));
  expect(g.outcome, { kind: "allin", a: "CO", b: "BB" }, "오프너가 콜하면 오프너와 스퀴즈한 자리의 올인");
  expect(
    [lastPut(g, "CO"), lastPut(g, "BB"), lastPut(g, "BTN")],
    [30, 30, 2.5],
    "둘은 스택 전부, 플랫한 쪽은 2.5를 잃는다",
  );
}
{
  // CO QQ 오픈(스퀴즈에 접는다), BTN QQ 플랫, BB AA 스퀴즈 → CO 폴드 → BTN 콜.
  const hands = allHands("72o");
  hands.CO = "QQ";
  hands.BTN = "QQ";
  hands.BB = "AA";
  const g = startGame(sq, SEATS, "__nobody__", hands, always(0.5));
  expect(g.outcome, { kind: "allin", a: "BTN", b: "BB" }, "오프너가 접으면 플랫한 쪽이 받는다");
  expect([lastPut(g, "CO"), lastPut(g, "BTN")], [2.5, 30], "오프너는 2.5를 잃고 플랫한 쪽은 스택");
}
{
  // 아무도 스퀴즈하지 않으면 지금처럼 플랍.
  const hands = allHands("72o");
  hands.CO = "KK";
  hands.BTN = "QQ";
  const g = startGame(sq, SEATS, "__nobody__", hands, always(0.5));
  expect(g.outcome, { kind: "flop", opener: "CO", caller: "BTN" }, "스퀴즈가 없으면 플랍");
  expect(
    ["SB", "BB"].map((s) => g.steps.some((x) => x.seat === s && x.kind === "fold")),
    [true, true],
    "블라인드는 차례로 접는다",
  );
}
{
  // 히어로 BB가 플랫을 마주한다.
  const hands = allHands("72o");
  hands.CO = "KK";
  hands.BTN = "QQ";
  hands.BB = "AA";
  const g = startGame(sq, SEATS, "BB", hands, always(0.5));
  expect(g.turn?.stage, { kind: "vsFlat", opener: "CO", caller: "BTN" }, "BB가 플랫을 마주한다");
  const j = applyHeroAction(sq, g, "jam", always(0.5));
  expect(j.outcome, { kind: "allin", a: "CO", b: "BB" }, "스퀴즈에 KK 오프너가 콜");
  const f = applyHeroAction(sq, g, "fold", always(0.5));
  expect(f.outcome?.kind, "folded", "BB가 접으면 히어로의 판은 끝난다");
}
{
  // 히어로 CO(오프너)가 스퀴즈를 맞는다.
  const hands = allHands("72o");
  hands.CO = "QQ";
  hands.BTN = "QQ";
  hands.BB = "AA";
  const g = startGame(sq, SEATS, "CO", hands, always(0.5));
  const opened = applyHeroAction(sq, g, "open", always(0.5));
  expect(
    opened.turn?.stage,
    { kind: "vsSqueeze", opener: "CO", caller: "BTN", squeezer: "BB", iOpened: true },
    "오프너가 스퀴즈를 마주한다",
  );
  const f = applyHeroAction(sq, opened, "fold", always(0.5));
  expect(f.outcome, { kind: "allin", a: "BTN", b: "BB" }, "내가 접으면 플랫한 BTN(QQ)이 콜");
  expect(lastPut(f, "CO"), 2.5, "접어도 오픈액은 남는다");
}
{
  // 히어로 BTN(플랫한 자리)이 오프너가 접은 뒤 스퀴즈를 맞는다.
  const hands = allHands("72o");
  hands.CO = "QQ";
  hands.BTN = "QQ";
  hands.BB = "AA";
  const g = startGame(sq, SEATS, "BTN", hands, always(0.5));
  const flatted = applyHeroAction(sq, g, "call", always(0.5));
  expect(
    flatted.turn?.stage,
    { kind: "vsSqueeze", opener: "CO", caller: "BTN", squeezer: "BB", iOpened: false },
    "플랫한 쪽이 스퀴즈를 마주한다",
  );
  const f = applyHeroAction(sq, flatted, "fold", always(0.5));
  expect([f.outcome, lastPut(f, "BTN")], [{ kind: "folded", winner: "BB" }, 2.5], "접으면 2.5를 잃는다");
}

console.log(`
통과 ${passed}, 실패 ${failed}`);
if (failed > 0) process.exit(1);
