// 토너먼트 런과 판 손익 검증.
// 실행: node --experimental-strip-types scripts/run.test.ts

import { capCommitted, postflopNet, preflopNet } from "../src/lib/handNet.ts";
import {
  applyHand,
  HANDS_PER_LEVEL,
  levelOf,
  playDepth,
  RUN_DEPTHS,
  RUN_HANDS,
  RUN_START_BB,
  boughtIn,
  rebuy,
  stackBb,
  stakeCap,
  startRun,
} from "../src/lib/run.ts";

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

console.log("프리플랍 손익");
// BTN 2.5 오픈, SB 0.5, BB 2(블라인드+앤티) 접음 → BTN이 5bb 팟을 가져간다.
const steal = { BTN: 2.5, SB: 0.5, BB: 2, UTG: 0 };
expect(preflopNet(steal, "BTN", "hero"), 2.5, "스틸 성공은 남의 블라인드만큼 번다");
expect(preflopNet(steal, "BB", "villain"), -2, "BB는 낸 블라인드와 앤티를 잃는다");
// 20bb 올인 대결: 둘 다 20, 죽은 SB 0.5.
const allin = { CO: 20, BB: 20, SB: 0.5 };
expect(preflopNet(allin, "CO", "hero"), 20.5, "올인 승리");
expect(preflopNet(allin, "CO", "villain"), -20, "올인 패배는 스택 전부");
expect(preflopNet(allin, "CO", "tie"), 0.25, "나누면 죽은 돈 절반");

console.log("포스트플랍 손익");
const step = (player: 0 | 1, kind: string, amountBb: number, street = "flop") =>
  ({ player, street, action: { kind, amountBb } }) as never;
// 팟 6.5, 히어로(0) 프리플랍 2.5. 플랍: 히어로 벳 3.3, 상대 콜 → 턴 체크 체크 → 리버에서 끝.
const hist = [step(0, "bet", 3.3), step(1, "call", 0), step(0, "check", 0, "turn"), step(1, "check", 0, "turn")];
expect(postflopNet(6.5, 2.5, hist, 0, "hero"), 7.3, "이기면 팟 13.1에서 낸 5.8을 뺀다");
expect(postflopNet(6.5, 2.5, hist, 0, "villain"), -5.8, "지면 낸 만큼 잃는다");
// 콜되지 않은 벳: 히어로 벳, 상대 폴드 → 히어로는 원래 팟만큼 번 셈.
const folded = [step(0, "bet", 3.3), step(1, "fold", 0)];
expect(postflopNet(6.5, 2.5, folded, 0, "hero"), 4, "콜 안 된 벳은 돌아온다");

console.log("런");
let r = startRun();
expect(stackBb(r), RUN_START_BB, "시작 스택");
r = applyHand(r, { netBb: 10, lossBb: 0.2, graded: 1 });
expect([r.chips, r.lossBb, r.graded, r.over], [40, 0.2, 1, null], "한 판 반영");
for (let i = 1; i < HANDS_PER_LEVEL; i++) r = applyHand(r, { netBb: 0, lossBb: 0, graded: 0 });
expect(levelOf(r), 1, "여덟 판 뒤 레벨 2");
expect(stackBb(r), 32, "같은 칩이 오른 블라인드로는 더 적은 bb");
r = applyHand(r, { netBb: -50, lossBb: 0, graded: 1 });
expect([r.chips, r.over], [0, "bust"], "스택보다 크게 잃으면 0에서 멈추고 버스트");
expect(applyHand(r, { netBb: 5, lossBb: 0, graded: 1 }).hands, r.hands, "끝난 런은 더 움직이지 않는다");

let d = startRun();
for (let i = 0; i < RUN_HANDS; i++) d = applyHand(d, { netBb: 0, lossBb: 0, graded: 0 });
expect(d.over, "done", "마지막 레벨까지 버티면 완주");

console.log("칠 깊이");
expect(playDepth(34, [20]), 20, "풀린 깊이가 하나면 그것");
expect(playDepth(34, [20, 30]), 30, "가까운 쪽");
expect(playDepth(22, [20, 30]), 20, "가까운 쪽 2");
expect(playDepth(26, [20, 30]), 20, "가깝더라도 스택보다 깊은 쪽은 고르지 않는다");
expect(playDepth(13.3, RUN_DEPTHS), 12, "13.3bb는 12bb");
expect(playDepth(40, RUN_DEPTHS), 20, "20bb를 넘으면 20bb");
expect(playDepth(5, RUN_DEPTHS), 8, "가장 얕은 깊이보다 적으면 그 깊이");

console.log("리바이");
{
  let s = applyHand(startRun(), { netBb: -RUN_START_BB, lossBb: 0, graded: 1 });
  expect([s.over, s.rebuysLeft], ["bust", 1], "버스트해도 리바이가 남아 있다");
  s = rebuy(s);
  expect([s.over, s.chips, s.rebuysLeft], [null, RUN_START_BB, 0], "리바이하면 시작 칩");
  expect(boughtIn(s), RUN_START_BB * 2, "들인 칩은 두 번");
  s = applyHand(s, { netBb: -RUN_START_BB, lossBb: 0, graded: 1 });
  expect(s.over, "bust", "다시 버스트");
  expect(rebuy(s), s, "리바이가 없으면 그대로");
  const done = { ...startRun(), over: "done" as const };
  expect(rebuy(done), done, "버스트가 아니면 그대로");
}

console.log("운");
{
  // 20bb 올인을 이겼는데(+20.5) 그 순간 승률로는 +12.4였다 → 운 +8.1.
  let s = applyHand(startRun(), { netBb: 20.5, evNetBb: 12.4, lossBb: 0, graded: 1 });
  expect(s.luck, 8.1, "실제 − 승률 기준 = 운");
  // 레벨 2(×1.25)에서 -10으로 졌는데 승률 기준으로는 +2였다 → 운 -12bb = -15칩.
  s = { ...s, hands: HANDS_PER_LEVEL };
  s = applyHand(s, { netBb: -10, evNetBb: 2, lossBb: 0, graded: 1 });
  expect(s.luck, -6.9, "레벨이 오르면 같은 bb가 더 많은 칩");
  expect(applyHand(startRun(), { netBb: 3, lossBb: 0, graded: 1 }).luck, 0, "올인이 아니면 운 0");
}

console.log("부스러기 없는 버스트");
{
  // 레벨 3(×1.5)에서 1.25칩 = 0.833bb. 다 잃은 손익은 반올림되어 -0.83으로 온다.
  // 남는 0.005칩으로 0bb 판을 치게 하면 안 된다.
  const s = { ...startRun(), hands: HANDS_PER_LEVEL * 2, chips: 1.25 };
  const after = applyHand(s, { netBb: -0.83, lossBb: 0, graded: 1 });
  expect([after.chips, after.over], [0, "bust"], "반올림 부스러기는 버스트다");
}

console.log("거는 금액의 상한");
{
  const full = startRun();
  expect(stakeCap(full, 20), undefined, "스택이 충분하면 상한 없음");
  const short = { ...startRun(), chips: 5 };
  expect(stakeCap(short, 8), 5, "5bb로 8bb 판을 치면 5에서 자른다");
  // 5bb만 걸고 8bb 올인 대결을 이기면 +5.5(상대 5 + SB 0.5). 자르지 않으면 +8.5.
  const committed = capCommitted({ UTG: 0, SB: 0.5, BB: 8, BTN: 8 }, 5);
  expect(preflopNet(committed, "BTN", "hero"), 5.5, "자른 금액만큼만 이긴다");
  expect(preflopNet(committed, "BTN", "villain"), -5, "자른 금액만큼만 잃는다");
}

console.log(`\n통과 ${passed}, 실패 ${failed}`);
if (failed > 0) process.exit(1);
