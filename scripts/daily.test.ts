// 오늘의 문제 검증.
// 실행: node --experimental-strip-types scripts/daily.test.ts

import { readFileSync } from "node:fs";
import {
  DAILY_COUNT,
  dailySpots,
  dailyStreak,
  dateKey,
  recordDaily,
  type DailyLog,
} from "../src/lib/daily.ts";
import { evAt, stageLine, type SeatsData } from "../src/lib/seatGame.ts";
import { spotGap } from "../src/lib/spotValue.ts";

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

{
  const a = dailySpots(data, "2026-09-28");
  const b = dailySpots(data, "2026-09-28");
  const c = dailySpots(data, "2026-09-29");
  check("열 문제", a.length === DAILY_COUNT);
  check("같은 날은 같은 문제", JSON.stringify(a) === JSON.stringify(b));
  check("다른 날은 다른 문제", JSON.stringify(a) !== JSON.stringify(c));
  const ids = new Set(a.map((d) => `${d.seat}|${stageLine(d.stage)}|${d.hand}`));
  check("같은 스팟은 한 번", ids.size === a.length);
  check(
    "모두 근소한 스팟(0.05~0.25bb)",
    a.every((d) => {
      const g = spotGap(evAt(data, d.seat, d.stage, d.hand));
      return g !== null && g >= 0.05 && g <= 0.25;
    }),
  );
  check("상황 종류가 섞인다", new Set(a.map((d) => d.kind)).size >= 3);
  check("종류와 상황이 맞다", a.every((d) => d.stage.kind === d.kind));
}

{
  let log: DailyLog = {};
  log = recordDaily(log, "2026-09-26", { clean: 5, n: 10, lossBb: 1 });
  log = recordDaily(log, "2026-09-27", { clean: 6, n: 10, lossBb: 1 });
  log = recordDaily(log, "2026-09-28", { clean: 7, n: 10, lossBb: 1 });
  const again = recordDaily(log, "2026-09-28", { clean: 10, n: 10, lossBb: 0 });
  check("그날의 첫 기록만 남긴다", again["2026-09-28"].clean === 7);
  check("사흘 연속", dailyStreak(log, "2026-09-28") === 3);
  check("오늘 아직 안 풀었어도 어제까지 이어지면 센다", dailyStreak(log, "2026-09-29") === 3);
  check("하루 거르면 끊긴다", dailyStreak(log, "2026-09-30") === 0);
  check("날짜 문자열", dateKey(new Date(2026, 0, 5)) === "2026-01-05");
  // 월 경계
  const edge = recordDaily(recordDaily({}, "2026-08-31", { clean: 1, n: 10, lossBb: 1 }), "2026-09-01", {
    clean: 1,
    n: 10,
    lossBb: 1,
  });
  check("달이 바뀌어도 이어진다", dailyStreak(edge, "2026-09-01") === 2);
}

console.log(`통과 ${pass}, 실패 ${fail}`);
process.exit(fail > 0 ? 1 : 0);
