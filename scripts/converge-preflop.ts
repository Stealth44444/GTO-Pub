// 프리플랍 레인지가 더 이상 움직이지 않을 때까지 피드백 루프를 돈다.
//
// 실행: node --experimental-strip-types scripts/converge-preflop.ts
//   FLOPS=140 ROUNDS=6 TARGET_PCT=0.5 로 조절.
//
// 한 바퀴는 이렇다.
//   1. 표본 플랍마다 포스트플랍을 푼다 (지금의 프리플랍 레인지를 가정으로)
//   2. 플랍 루트 EV를 169개 클래스로 접는다
//   3. 그 값으로 프리플랍을 푼다
//   4. 레인지가 지난 바퀴와 얼마나 달라졌는지 잰다
//
// 플랍은 22100가지를 질감으로 층화해서 뽑는다. 플랍 EV의 분산은 대부분 질감에서
// 오므로, 층마다 비례해 뽑으면 같은 표본 수로 오차가 훨씬 작다. 그 잡음이 한계
// 핸드의 판단을 좌우하기 때문에 여기에 표본을 쓰는 값어치가 있다.
//
// 루트 EV는 런아웃과 무관하다(모든 런아웃을 포함한 값이다). 그래서 표본은
// 플랍당 한 번만 풀고 트리도 내보내지 않는다 — 21KB, 27초.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";

const EXPORTER = "tools/spot-exporter/target/release/spot-exporter.exe";
const SAMPLE_DIR = "scripts/data/flopev";
const SOLVED = "src/data/preflop-btn-bb.json";

// 초반 바퀴는 레인지를 대략 맞추는 게 목적이라 표본이 작아도 된다. 마지막
// 한 바퀴만 크게 돌려 정밀한 값을 얻는다. 씨앗이 같아 큰 표본은 작은 표본을
// 그대로 포함하므로, 바꿔도 값이 튀지 않는다.
const FLOP_COUNT = Number(process.env.FLOPS ?? 60);
const FINAL_FLOP_COUNT = Number(process.env.FINAL_FLOPS ?? 240);
const MAX_ROUNDS = Number(process.env.ROUNDS ?? 6);
const SETTLE_PP = Number(process.env.SETTLE_PP ?? 2.0);
const TARGET_PCT = process.env.TARGET_PCT ?? "0.5";

// 포스트플랍 스팟과 같은 게임 조건이어야 한다.
const POT_CHIPS = 65;
const STACK_CHIPS = 165;

const RANKS = "23456789TJQKA";
const SUITS = "cdhs";

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export type SampledFlop = { flop: string; weight: number };

/**
 * 층. 플랍 EV의 분산은 대부분 보드 질감에서 온다 — A 하이 드라이와 로우 커넥티드는
 * 같은 핸드라도 값이 전혀 다르다. 그래서 질감으로 나눈 뒤 층마다 비례해서 뽑는다.
 * 그냥 균등하게 뽑는 것보다 같은 표본 수로 오차가 훨씬 작아진다.
 */
function stratumOf(cards: string[]): string {
  const idx = cards.map((c) => RANKS.indexOf(c[0])).sort((a, b) => b - a);
  const suits = new Set(cards.map((c) => c[1])).size; // 3=레인보우 2=투톤 1=모노톤
  const paired = idx[0] === idx[1] || idx[1] === idx[2];
  const high = idx[0] >= 12 ? "A" : idx[0] >= 10 ? "KQ" : idx[0] >= 7 ? "JT9" : idx[0] >= 4 ? "864" : "low";
  // 연결성도 전략을 크게 가른다. 가장 높은 두 장의 간격으로 거칠게 나눈다.
  const gap = idx[0] - idx[2] <= 4 ? "connected" : "spread";
  return `${high}|${paired ? "paired" : "unpaired"}|${suits}|${gap}`;
}

/** 22100가지를 층으로 나누고, 층 크기에 비례해 뽑는다. */
function sampleFlops(count: number, seed = 20260924): SampledFlop[] {
  const deck: string[] = [];
  for (const r of RANKS) for (const s of SUITS) deck.push(`${r}${s}`);

  const strata = new Map<string, string[]>();
  for (let a = 0; a < deck.length; a++) {
    for (let b = a + 1; b < deck.length; b++) {
      for (let c = b + 1; c < deck.length; c++) {
        const cards = [deck[a], deck[b], deck[c]];
        const key = stratumOf(cards);
        const list = strata.get(key);
        if (list) list.push(cards.join(""));
        else strata.set(key, [cards.join("")]);
      }
    }
  }

  const total = 22100;
  const rnd = lcg(seed);
  const out: SampledFlop[] = [];
  // 층 순서를 고정해야 씨앗이 같을 때 결과가 같다.
  const keys = [...strata.keys()].sort();

  for (const key of keys) {
    const pool = strata.get(key)!;
    const share = pool.length / total;
    // 층마다 최소 하나는 뽑는다. 작은 층이 통째로 빠지면 층화의 의미가 없다.
    const take = Math.max(1, Math.round(share * count));
    const picked = new Set<string>();
    while (picked.size < Math.min(take, pool.length)) {
      picked.add(pool[Math.floor(rnd() * pool.length)]);
    }
    // 이 층이 전체에서 차지하는 몫을 뽑은 개수로 나눠 나눠 갖는다.
    for (const flop of picked) out.push({ flop, weight: share / picked.size });
  }
  return out;
}

type Solved = {
  btn: { open: Record<string, number>; callVsShove: Record<string, number> };
  bb: { call: Record<string, number>; shove: Record<string, number> };
  hands: string[];
};

const COMBOS = (code: string) => (code.length === 2 ? 6 : code.endsWith("s") ? 4 : 12);

function frequency(range: Record<string, number>, hands: string[]): number {
  let sum = 0;
  let all = 0;
  for (const code of hands) {
    sum += (range[code] ?? 0) * COMBOS(code);
    all += COMBOS(code);
  }
  return sum / all;
}

/** 두 레인지의 거리. 핸드별 빈도 차를 조합 수로 가중해 더한다(퍼센트 포인트). */
function rangeDistance(
  a: Record<string, number>,
  b: Record<string, number>,
  hands: string[],
): number {
  let diff = 0;
  let all = 0;
  for (const code of hands) {
    diff += Math.abs((a[code] ?? 0) - (b[code] ?? 0)) * COMBOS(code);
    all += COMBOS(code);
  }
  return (diff / all) * 100;
}

function run(script: string): string {
  return execFileSync("node", ["--experimental-strip-types", script], {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
}

mkdirSync(SAMPLE_DIR, { recursive: true });

console.log(`플랍 ${FLOP_COUNT}개로 돌리다가, 안정되면 ${FINAL_FLOP_COUNT}개로 마무리`);
console.log(`(22100가지에서 균등 추출) · 최대 ${MAX_ROUNDS}바퀴 · 솔브 목표 팟의 ${TARGET_PCT}%\n`);

let settled = false;

let previous: Solved | null = existsSync(SOLVED)
  ? (JSON.parse(readFileSync(SOLVED, "utf8")) as Solved)
  : null;

for (let round = 1; round <= MAX_ROUNDS; round++) {
  const startedAt = Date.now();
  const isFinal = settled || round === MAX_ROUNDS;
  const sample = sampleFlops(isFinal ? FINAL_FLOP_COUNT : FLOP_COUNT);
  const flops = sample.map((s) => s.flop);
  writeFileSync(`${SAMPLE_DIR}/index.json`, JSON.stringify({ flops: sample }, null, 1));
  console.log(`── ${round}바퀴 ${isFinal ? "(마무리) " : ""}· 플랍 ${flops.length}개 ──`);

  // 1) 표본 플랍을 지금의 레인지 가정으로 푼다.
  const ranges = previous
    ? (await import("./preflop-ranges.ts")).loadRanges(previous.hands)
    : null;
  process.stdout.write(`  포스트플랍 ${flops.length}개 풀기 `);
  flops.forEach((flop, i) => {
    execFileSync(
      EXPORTER,
      [
        "--flop", flop,
        "--ev-only",
        "--target-pct", TARGET_PCT,
        "--outdir", SAMPLE_DIR,
        "--tag", "ev",
        "--pot", String(POT_CHIPS),
        "--stack", String(STACK_CHIPS),
        ...(ranges ? ["--oop-range", ranges.oop, "--ip-range", ranges.ip] : []),
      ],
      { stdio: "ignore" },
    );
    if ((i + 1) % 20 === 0) process.stdout.write(`${i + 1} `);
  });
  console.log(`· ${((Date.now() - startedAt) / 60000).toFixed(1)}분`);

  // 2~3) 플랍 EV를 접고 프리플랍을 푼다.
  run("scripts/build-preflop-values.ts");
  run("scripts/solve-preflop-btn-bb.ts");

  const now = JSON.parse(readFileSync(SOLVED, "utf8")) as Solved;
  const H = now.hands;
  const f = (r: Record<string, number>) => `${(frequency(r, H) * 100).toFixed(1)}%`;
  console.log(
    `  BTN 오픈 ${f(now.btn.open)} · 올인에 콜 ${f(now.btn.callVsShove)}` +
      ` | BB 콜 ${f(now.bb.call)} · 3벳 ${f(now.bb.shove)}`,
  );

  if (previous) {
    const moves = [
      rangeDistance(previous.btn.open, now.btn.open, H),
      rangeDistance(previous.btn.callVsShove, now.btn.callVsShove, H),
      rangeDistance(previous.bb.call, now.bb.call, H),
      rangeDistance(previous.bb.shove, now.bb.shove, H),
    ];
    const worst = Math.max(...moves);
    console.log(`  지난 바퀴 대비 최대 변화 ${worst.toFixed(2)}pp`);
    if (isFinal) {
      console.log(`\n마무리 완료 (${round}바퀴, 플랍 ${flops.length}개)`);
      previous = now;
      break;
    }
    if (worst < SETTLE_PP) {
      console.log(`  안정됨 (${SETTLE_PP}pp 미만) → 다음 바퀴를 큰 표본으로 마무리`);
      settled = true;
    }
  }
  previous = now;
  console.log();
}

console.log(`\n결과: ${SOLVED}`);
