// 플랍 도달률 도구가 맞게 재는지. 지금 20bb 풀이로 잰 값(35.9%, 2026-09-27)이
// 재현돼야 한다. 다른 세션의 14.9%(faa9e53)는 정의가 다른 값이다(히어로 기준으로
// 보인다) — 여기서는 "모든 판 중 플랍에 간 판"으로 잰다.
// 실행: node --experimental-strip-types scripts/flopReach.test.ts

import { readFileSync } from "node:fs";
import { flopReach, lcg } from "./flop-reach.ts";
import type { SeatsData } from "../src/lib/seatGame.ts";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) pass += 1;
  else {
    fail += 1;
    console.error(`  실패: ${name}`);
  }
}

const data = JSON.parse(readFileSync("src/data/preflop-seats.json", "utf8")) as SeatsData;
const r = flopReach(data, lcg(1), 20000);
console.log(`  20bb 플랍 도달 ${(r.flop * 100).toFixed(1)}%`);
check("20bb 플랍 도달이 35.9% 근처(33~39%)", r.flop > 0.33 && r.flop < 0.39);
check("3벳 필드가 없으면 3벳 팟은 0", r.threebetFlop === 0);
check("결과 비율의 합은 1", Math.abs(r.flop + r.threebetFlop + r.allin + r.folded - 1) < 1e-9);

console.log(`통과 ${pass}, 실패 ${fail}`);
process.exit(fail > 0 ? 1 : 0);
