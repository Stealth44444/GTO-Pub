// 프리플랍 시퀀스 검증.
// 실행: node --experimental-strip-types scripts/preflop.test.ts

import {
  committedBySeat,
  potFromScript,
  pushFoldScript,
  singleRaisedPotScript,
  stepLabel,
} from "../src/lib/preflop.ts";

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

console.log("싱글레이즈 팟 (BTN 2.5 오픈, BB 콜)");
const srp = singleRaisedPotScript(9, "BTN", "BB", 2.5, 0);
expect(srp.map((s) => s.seat), ["UTG", "UTG1", "UTG2", "LJ", "HJ", "CO", "BTN", "SB", "BB"], "콜러까지 재생");
expect(srp.map((s) => s.kind).slice(-3), ["raise", "fold", "call"], "BTN 레이즈 → SB 폴드 → BB 콜");
expect(srp[srp.length - 1].committedBb, 2.5, "콜러는 오픈액까지 맞춘다");
// 포스트플랍 스팟의 startingPotBb가 5.5다. 화면 팟이 이 숫자에 도달해야 한다.
expect(potFromScript(9, 0, srp, srp.length), 5.5, "최종 팟이 스팟의 시작 팟과 같다");

console.log("팟이 단계별로 자란다");
// 블라인드만 낸 상태 → 1.5. 순간이동하지 않고 이 값에서 출발해야 한다.
expect(potFromScript(9, 0, srp, 0), 1.5, "액션 전에는 블라인드뿐");
expect(potFromScript(9, 0, srp, 7), 4, "BTN 레이즈 직후 1.5 + 2.5");
expect(potFromScript(9, 0, srp, 8), 4, "SB 폴드는 팟을 바꾸지 않는다");
expect(potFromScript(9, 0, srp, 9), 5.5, "BB 콜로 5.5");

console.log("폴드한 블라인드는 팟에 남는다");
const committed = committedBySeat(9, 0, srp, srp.length);
expect(committed.SB, 0.5, "폴드한 SB의 0.5는 죽은 돈으로 남는다");
expect(committed.UTG, 0, "블라인드를 안 낸 자리는 0");
expect(committed.BB, 2.5, "BB는 콜해서 2.5");

console.log("푸시/폴드");
const pf = pushFoldScript(6, "BTN", null, 20, 1);
expect(pf.map((s) => s.seat), ["UTG", "HJ", "CO"], "히어로 앞자리만 액션한다");
expect(pf.every((s) => s.kind === "fold"), true, "올인한 사람이 없으면 전부 폴드");
// BB 앤티 1bb는 BB가 낸다. 블라인드 합은 0.5 + (1 + 1) = 2.5
expect(potFromScript(6, 1, pf, pf.length), 2.5, "앤티가 BB 금액에 포함된다");

console.log("푸시/폴드 — 앞자리 올인");
const vs = pushFoldScript(6, "BB", "CO", 20, 1);
expect(vs.find((s) => s.seat === "CO")?.kind, "allin", "CO가 올인한다");
expect(vs.find((s) => s.seat === "CO")?.committedBb, 20, "올인은 스택 전부");
expect(vs.map((s) => s.seat), ["UTG", "HJ", "CO", "BTN", "SB"], "BB 앞 다섯 자리");
// 2.5(블라인드) - 0(CO는 블라인드를 안 냄) + 20 = 22.5
expect(potFromScript(6, 1, vs, vs.length), 22.5, "올인 스택이 팟에 더해진다");

console.log("블라인드가 올인한 경우 스택에 블라인드가 이미 포함된다");
const sbShove = pushFoldScript(6, "BB", "SB", 20, 1);
// SB의 0.5는 20 안에 포함되므로 중복해서 더하면 안 된다. 팟 = 20 + (1+1) = 22
expect(potFromScript(6, 1, sbShove, sbShove.length), 22, "SB 올인은 0.5를 중복 계산하지 않는다");

console.log("라벨");
expect(stepLabel({ seat: "CO", kind: "allin", committedBb: 20 }), "ALL-IN", "올인 라벨");
expect(stepLabel({ seat: "CO", kind: "raise", committedBb: 2.5 }), "RAISE", "레이즈 라벨");

console.log(`\n통과 ${passed}, 실패 ${failed}`);
if (failed > 0) process.exit(1);
