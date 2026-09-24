// 집계.
//
// 실행: node --experimental-strip-types scripts/stats.test.ts
//
// 통계는 틀려도 아무 데서도 터지지 않는다. 그냥 조용히 다른 숫자를 보여주고,
// 사용자는 늘고 있다고 믿거나 줄고 있다고 믿는다. 그래서 세는 방식을 못 박는다.

import { progressByDay, summarize, type Attempt } from "../src/lib/stats.ts";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) pass += 1;
  else {
    fail += 1;
    console.error(`  실패: ${name}`);
  }
}

/** 시간대에 상관없이 서로 다른 날이 되도록 정오를 쓴다. */
function at(dayOffset: number, lossBb: number): Attempt {
  const d = new Date(Date.UTC(2026, 8, 10 + dayOffset, 12, 0, 0));
  return {
    mode: "hand",
    tableSize: 9,
    stackBb: 20,
    position: "BTN",
    shoverPosition: null,
    handCode: "A7s",
    userAction: "call",
    correctAction: "fold",
    evLossBb: lossBb,
    createdAt: d.toISOString(),
    street: "preflop",
    nodeLine: "firstIn",
    board: null,
    heroCards: null,
    spotFile: null,
    heroPlayer: null,
  };
}

// ── 날짜별 추이 ─────────────────────────────────────────────────────────

{
  const days = progressByDay([at(0, 1.0), at(0, 0.0), at(1, 0.2)]);
  check("날짜별로 묶는다", days.length === 2);
  check("같은 날은 한 줄", days[0].decisions === 2);
  check("평균 손실을 낸다", days[0].avgLossBb === 0.5);
  check("오래된 날이 앞에 온다", days[0].day < days[1].day);
  check("둘째 날도 센다", days[1].decisions === 1 && days[1].avgLossBb === 0.2);
}

{
  // 손실 0은 최선이다. 정확도 100%가 나와야 한다.
  const days = progressByDay([at(0, 0), at(0, 0)]);
  check("손실 없는 날은 정확도 100", days[0].accuracyPct === 100);
  const bad = progressByDay([at(0, 2), at(0, 2)]);
  check("큰 실수만 있는 날은 정확도 0", bad[0].accuracyPct === 0);
}

{
  // 기간을 넘는 옛날 기록은 잘라낸다. 남기는 것은 최근 쪽이어야 한다.
  const many = Array.from({ length: 20 }, (_, i) => at(i, 0.1 * i));
  const days = progressByDay(many, 5);
  check("요청한 날수만 남긴다", days.length === 5);
  check("남기는 것은 최근이다", days[days.length - 1].day === progressByDay(many, 20).at(-1)?.day);
}

{
  check("기록이 없으면 빈 목록", progressByDay([]).length === 0);
  const broken = { ...at(0, 0.5), createdAt: "아무말" };
  check("시각을 못 읽는 행은 뺀다", progressByDay([broken]).length === 0);
}

// ── 누적 요약 ───────────────────────────────────────────────────────────

{
  const sum = summarize([at(0, 0), at(0, 0.03), at(0, 0.5), at(0, 2)]);
  check("시도 수를 센다", sum.attempts === 4);
  check("실수는 실수·큰 실수만", sum.mistakes === 2);
  check("총 손실을 더한다", Math.abs(sum.lostBb - 2.53) < 1e-9);
  check("무난까지는 정확으로 친다", sum.accuracyPct === 50);
  check("손실 0인 판단은 최악 목록에 안 넣는다", sum.worst.every((a) => a.evLossBb > 0));
  check("최악은 큰 순서다", sum.worst[0].evLossBb === 2);
}

console.log(`통과 ${pass}, 실패 ${fail}`);
process.exit(fail > 0 ? 1 : 0);
