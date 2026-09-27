// 오늘의 문제. 날짜마다 정해진 열 문제를 모두가 똑같이 받는다.
//
// 드릴은 끝이 없다. 끝이 없으면 "오늘 할 만큼 했다"는 순간도 없고, 다른 사람과
// 비교할 기준도 없다. 하루에 열 문제를 고정해 두면 끝이 생기고, 같은 문제를 푼
// 사람끼리 점수를 견줄 수 있고, 매일 돌아올 이유가 생긴다.
//
// 문제는 드릴과 같은 기준에서 고른다(lib/drill.ts): 최선과 차선의 차이가
// 0.05~0.25bb인 근소한 스팟만, 상황 종류를 돌아가며. 같은 날짜는 같은 씨앗이라
// 어느 기기에서 열어도 같은 열 문제다.
//
// import에 .ts를 붙이는 이유는 hand.ts와 같다(node 테스트와 Next 양쪽에서 로드).

import { stageLine, type SeatsData } from "./seatGame.ts";
import { drillKinds, nextDrill, type Drill, type DrillKind } from "./drill.ts";

export const DAILY_COUNT = 10;

export type DailySpot = Drill & { kind: DrillKind };

/** 기기의 날짜(YYYY-MM-DD). 하루의 경계는 사용자가 사는 곳의 자정이다. */
export function dateKey(d: Date = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function seedOf(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function lcg(seed: number): () => number {
  let x = seed >>> 0 || 1;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 4294967296;
  };
}

/**
 * 그날의 문제. 상황 종류를 돌아가며 하나씩 뽑고, 같은 스팟(자리·상황·핸드)은
 * 두 번 내지 않는다. 데이터에 없는 종류는 건너뛴다.
 */
export function dailySpots(data: SeatsData, key: string, count = DAILY_COUNT): DailySpot[] {
  const rnd = lcg(seedOf(`${key}:${data.stackBb}`));
  const kinds = drillKinds(data);
  const out: DailySpot[] = [];
  const seen = new Set<string>();
  for (let tries = 0; out.length < count && tries < count * 20; tries++) {
    const kind = kinds[tries % kinds.length];
    const d = nextDrill(data, kind, null, rnd, undefined, true);
    if (!d) continue;
    const id = `${d.seat}|${stageLine(d.stage)}|${d.hand}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ ...d, kind });
  }
  return out;
}

// ── 기록 ────────────────────────────────────────────────────────────────

export type DailyResult = { clean: number; n: number; lossBb: number };
export type DailyLog = Record<string, DailyResult>;

/**
 * 그날의 첫 기록만 남긴다. 답을 본 뒤 다시 풀면 점수가 오르는 게 당연하다 —
 * 그건 연습이지 오늘의 점수가 아니다.
 */
export function recordDaily(log: DailyLog, key: string, result: DailyResult): DailyLog {
  if (log[key]) return log;
  return { ...log, [key]: result };
}

/** 오늘(또는 어제)까지 하루도 거르지 않고 푼 날 수. 오늘 아직 안 풀었어도 어제까지 이어졌으면 센다. */
export function dailyStreak(log: DailyLog, today: string): number {
  const day = new Date(`${today}T12:00:00`);
  if (!log[today]) day.setDate(day.getDate() - 1);
  let n = 0;
  while (log[dateKey(day)]) {
    n += 1;
    day.setDate(day.getDate() - 1);
  }
  return n;
}

const KEY = "gto.daily.v1";

export function loadDailyLog(): DailyLog {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as DailyLog;
  } catch {
    return {};
  }
}

export function saveDailyLog(log: DailyLog): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(log));
  } catch {
    // 저장이 막혀도 오늘 푼 결과는 화면에 남는다.
  }
}
