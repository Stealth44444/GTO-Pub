// 토너먼트 런과 판 손익 검증.
// 실행: node --experimental-strip-types scripts/run.test.ts

import { postflopNet, preflopNet } from "../src/lib/handNet.ts";
import {
  applyHand,
  HANDS_PER_LEVEL,
  levelOf,
  playDepth,
  RUN_HANDS,
  RUN_START_BB,
  stackBb,
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

console.log(`\n통과 ${passed}, 실패 ${failed}`);
if (failed > 0) process.exit(1);
