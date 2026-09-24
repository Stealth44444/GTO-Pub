// 세션 회고 집계.
//
// 실행: node --experimental-strip-types scripts/sessionRun.test.ts
//
// 채점 못 한 판단을 0으로 세면 평균이 좋아진다. 레인지를 벗어나 헤맨 판이
// 오히려 잘한 판으로 보이게 되는데, 이건 학습 도구에서 가장 나쁜 거짓말이다.

import type { Decision } from "../src/lib/decisions.ts";
import { summarizeRun, toRunDecisions, type RunDecision } from "../src/lib/session-run.ts";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) pass += 1;
  else {
    fail += 1;
    console.error(`  실패: ${name}`);
  }
}

function row(lossBb: number | null, over: Partial<RunDecision> = {}): RunDecision {
  return { street: "FLOP", handCode: "A7s", seat: "BTN", chosen: "체크", lossBb, ...over };
}

{
  const s = summarizeRun(2, [row(0), row(0.5), row(1.5)]);
  check("판 수를 그대로 쓴다", s.hands === 2);
  check("판단 수를 센다", s.decisions === 3);
  check("총 손실을 더한다", s.lostBb === 2);
  check("평균은 판단당", Math.abs(s.avgLossBb - 2 / 3) < 0.001);
  check("무난 이상 비율", s.cleanPct === 33);
  check("가장 비싼 판단을 고른다", s.worst?.lossBb === 1.5);
}

{
  // 채점 못 한 판단은 평균에서 빠진다. 0으로 채우면 안 된다.
  const s = summarizeRun(1, [row(1.0), row(null), row(null)]);
  check("채점된 것만 평균에 넣는다", s.avgLossBb === 1);
  check("채점된 수를 따로 센다", s.graded === 1);
  check("판단 수에는 전부 포함", s.decisions === 3);
}

{
  const s = summarizeRun(1, [row(null)]);
  check("채점된 게 없으면 평균 0", s.avgLossBb === 0);
  check("채점된 게 없으면 최악도 없다", s.worst === null);
  check("채점된 게 없으면 비율 0", s.cleanPct === 0);
  const empty = summarizeRun(0, []);
  check("빈 세션도 터지지 않는다", empty.decisions === 0 && empty.worst === null);
}

{
  // 전체 등급은 평균 손실을 판단 하나와 같은 기준으로 매긴다.
  check("잘한 세션은 최선", summarizeRun(1, [row(0), row(0)]).grade.id === "best");
  check("망한 세션은 큰 실수", summarizeRun(1, [row(3), row(3)]).grade.id === "blunder");
}

{
  // 한 판의 판단을 세션 기록으로 옮길 때 자리와 패가 함께 붙어야, 회고에서
  // "어떤 자리의 어떤 패였나"를 말할 수 있다.
  const decisions = [
    { street: "PREFLOP", chosen: "폴드", chosenKind: "fold", bestKind: "open", lossBb: 1.2, grade: null, rows: [], board: [] },
  ] as unknown as Decision[];
  const rows = toRunDecisions(decisions, "CO", "QJs");
  check("자리를 붙인다", rows[0].seat === "CO");
  check("패를 붙인다", rows[0].handCode === "QJs");
  check("고른 것을 붙인다", rows[0].chosen === "폴드");
  check("손실을 옮긴다", rows[0].lossBb === 1.2);
}

console.log(`통과 ${pass}, 실패 ${fail}`);
process.exit(fail > 0 ? 1 : 0);
