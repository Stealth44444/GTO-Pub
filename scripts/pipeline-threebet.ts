// 3벳 팟의 플랍 가치를 솔버로 구하고, 그 값으로 프리플랍을 다시 푸는 것을
// 레인지가 멈출 때까지 되풀이한다.
//
// 실행: STACK=30 node --experimental-strip-types scripts/pipeline-threebet.ts
//   ROUNDS(기본 3), FLOPS(기본 60), TARGET_PCT(솔버 목표 착취가능성, 기본 0.5),
//   STOP_PP(레인지 변화가 이 %p 아래면 멈춘다, 기본 0.5)
//
// 한 바퀴:
//   1. 지금 프리플랍 풀이에서 구간마다 3벳한 쪽과 3벳에 콜하는 오프너의 레인지를 뽑는다
//   2. 표본 플랍마다 3벳 팟을 푼다(--ev-only: 루트 EV만)
//   3. 핸드별 루트 EV를 169개 클래스로 접어 src/data/flopev3-<구간>-<깊이>bb.json에 둔다
//   4. solve-preflop-3bet.ts로 프리플랍을 다시 푼다
//   5. 3벳 빈도가 지난 바퀴와 얼마나 달라졌는지, 플랍 도달률이 얼마인지 잰다
//
// 플랍을 풀 때 쓰는 레인지는 "그 액션이 폴드보다 나은 핸드 전부"다. 풀이가 실제로
// 섞는 빈도를 그대로 쓰지 않는다. 0회차(3벳 팟 = 승률 × 팟)에서는 크기 있는 3벳이
// 0.3%밖에 안 쓰여 그 레인지로 플랍을 풀면 표본이 거의 비고, 그러면 "작은 3벳은
// 안 쓴다"는 출발점에서 빠져나올 수 없다. 3벳이 폴드보다 나은 핸드는 3벳을
// 한다면 만나게 될 레인지에 가깝다. 근사이며, 그렇게 풀었다는 것을 파일에 남긴다.
//
// 중간에 끊겨도 다시 돌리면 이어서 한다. 바퀴마다 폴더가 따로이고, 이미 나온
// 플랍 파일은 건너뛴다(쓰다 만 파일은 JSON이 깨져 있으므로 지우고 다시 푼다).

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { ANTE_BB, OPEN_TO_BB, flopChips, threeBetChips, withDepth } from "./game.ts";
import { sampleFlops } from "./flop-sample.ts";
import { flopReach, lcg } from "./flop-reach.ts";
import type { SeatsData } from "../src/lib/seatGame.ts";

const EXPORTER = process.env.EXPORTER ?? "tools/spot-exporter/target/release/spot-exporter.exe";
const SEATS_FILE = withDepth("src/data/preflop-seats.json");
const STATUS = withDepth("scripts/data/threebet-status.json");
const ROUNDS = Number(process.env.ROUNDS ?? 3);
const FLOP_COUNT = Number(process.env.FLOPS ?? 60);
const TARGET_PCT = process.env.TARGET_PCT ?? "0.5";
const STOP_PP = Number(process.env.STOP_PP ?? 0.5);

/**
 * 3벳 팟 구간. 오프너 구간 × 3벳 종류마다 대표 조합 하나. 이름은
 * solve-preflop-3bet.ts의 flop3Name(`<오프너 구간>-<ip|bb|sb>`)과 같아야 한다.
 */
const BUCKETS = [
  { name: "early-ip", opener: "UTG1", threeBettor: "CO" },
  { name: "early-bb", opener: "UTG1", threeBettor: "BB" },
  { name: "early-sb", opener: "UTG1", threeBettor: "SB" },
  { name: "middle-ip", opener: "HJ", threeBettor: "BTN" },
  { name: "middle-bb", opener: "HJ", threeBettor: "BB" },
  { name: "middle-sb", opener: "HJ", threeBettor: "SB" },
  { name: "late-ip", opener: "CO", threeBettor: "BTN" },
  { name: "late-bb", opener: "BTN", threeBettor: "BB" },
  { name: "late-sb", opener: "BTN", threeBettor: "SB" },
  { name: "sb-bb", opener: "SB", threeBettor: "BB" },
].filter((b) => !process.env.ONLY || process.env.ONLY.split(",").includes(b.name));

/**
 * 단일 레이즈 팟의 BB가 아닌 콜러. 이 표가 없으면 솔버가 모든 콜러를 BB(OOP)로
 * 매긴다 — 뒷자리 플랫이 포지션을 잃은 값으로 매겨져, CO 오픈에 BTN이 1.2%만
 * 콜하고 3벳 올인을 13.4% 하는 답이 나왔다(2026-09-27). 이름은 보드 파이프라인의
 * 구간(pipeline-boards.ts)과 같다.
 *
 * **기본으로 끈다(CALLERS=1일 때만 푼다).** 이 표를 넣으면 반대쪽으로 무너진다:
 * 엔진은 첫 콜러가 나오면 뒤 자리가 접는다고 보므로, 뒷자리 플랫이 블라인드와
 * 앤티(2.5bb)를 공짜로 가져간다. 포지션까지 제값을 받으면 CO가 UTG 오픈에
 * 42.5%, BTN이 CO 오픈에 49%를 플랫하고 플랍 도달률이 78%가 됐다(2026-09-27).
 * BB 표로 매기는 원래 방식은 포지션을 빼서 그 공짜 돈을 우연히 상쇄하고 있었다.
 * 제대로 고치려면 플랫 뒤에 블라인드가 스퀴즈·콜로 답하는 것을 모델에 넣어야 한다.
 */
const CALL_BUCKETS = (process.env.CALLERS === "1" ? [
  { name: "early-ip", opener: "UTG1", caller: "CO" },
  { name: "middle-ip", opener: "HJ", caller: "BTN" },
  { name: "late-ip", opener: "CO", caller: "BTN" },
  { name: "early-sb", opener: "UTG1", caller: "SB" },
  { name: "middle-sb", opener: "HJ", caller: "SB" },
  { name: "late-sb", opener: "BTN", caller: "SB" },
] : []).filter((b) => !process.env.ONLY || process.env.ONLY.split(",").includes(b.name));

type EquityTable = { hands: string[]; equity: number[] };
const EQUITY = JSON.parse(readFileSync("scripts/data/equity.json", "utf8")) as EquityTable;

/**
 * 콜 레인지의 씨앗: 오픈 레인지를 상대로 "승률 × 플랍 팟 − 콜액"이 폴드보다
 * 나은 핸드. 승률을 다 실현한다고 보는 근사라 다음 바퀴부터는 풀린 콜 EV로 바꾼다.
 */
function equitySeed(d: SeatsData, openHands: string[], opener: string, caller: string): string[] {
  const n = EQUITY.hands.length;
  const combos = EQUITY.hands.map((h) => (h.length === 2 ? 6 : h.endsWith("s") ? 4 : 12));
  const open = new Set(openHands);
  const { pot } = flopChips(opener, caller);
  const paid = OPEN_TO_BB + (caller === "BB" ? ANTE_BB : 0);
  return d.hands.filter((h) => {
    const i = EQUITY.hands.indexOf(h);
    if (i < 0) return false;
    let w = 0;
    let t = 0;
    for (let j = 0; j < n; j++) {
      if (!open.has(EQUITY.hands[j])) continue;
      w += combos[j] * EQUITY.equity[i * n + j];
      t += combos[j];
    }
    return t > 0 && (w / t) * (pot / 10) - paid > -posted(caller);
  });
}

const posted = (seat: string) => (seat === "BB" ? 1 + ANTE_BB : seat === "SB" ? 0.5 : 0);

/** 3벳 팟에서 3벳한 쪽이 먼저 치는가. solve-preflop-3bet.ts의 threeBettorOop과 같다. */
const threeBettorOop = (opener: string, k: string) =>
  (k === "BB" || k === "SB") && opener !== "SB";

/** 이 액션이 폴드보다 나은 핸드. 1bb의 1/100보다 작은 차이는 같은 것으로 본다. */
function betterThanFold(ev: number[] | undefined, fold: number, hands: string[], only?: Record<string, number>) {
  if (!ev) return [];
  return hands.filter((h, i) => ev[i] > fold + 0.01 && (!only || (only[h] ?? 0) > 0));
}

const rangeString = (hands: string[]) => hands.map((h) => `${h}:1`).join(",");

/** build-preflop-values.ts가 쓰는 표. flopEvBb[0]이 OOP, [1]이 IP. */
type FlopTable = {
  hands: string[];
  startingPotBb: number;
  flopEvBb: [(number | null)[], (number | null)[]];
  [key: string]: unknown;
};

/**
 * 바퀴별 표의 평균. 핸드마다 값이 있는 바퀴만 평균낸다 — 어느 바퀴의 레인지에
 * 없던 핸드는 그 바퀴에 값이 없다(null). 핸드 순서가 다르면 이름으로 맞춘다.
 */
function averageTables(tables: FlopTable[]): FlopTable {
  const last = tables[tables.length - 1];
  const flopEvBb = [0, 1].map((p) =>
    last.hands.map((h) => {
      let sum = 0;
      let n = 0;
      for (const t of tables) {
        const i = t.hands.indexOf(h);
        const v = i < 0 ? null : t.flopEvBb[p][i];
        if (v !== null && v !== undefined) {
          sum += v;
          n += 1;
        }
      }
      return n === 0 ? null : Math.round((sum / n) * 1000) / 1000;
    }),
  ) as FlopTable["flopEvBb"];
  return { ...last, flopEvBb, rounds: tables.length };
}

function done(file: string): boolean {
  if (!existsSync(file)) return false;
  try {
    JSON.parse(readFileSync(file, "utf8"));
    return true;
  } catch {
    rmSync(file, { force: true });
    return false;
  }
}

function setStatus(step: string, detail?: string) {
  const at = new Date().toISOString();
  mkdirSync("scripts/data", { recursive: true });
  writeFileSync(STATUS, JSON.stringify({ step, detail, at }, null, 1));
  console.log(`[${at.slice(11, 19)}] ${step}${detail ? ` — ${detail}` : ""}`);
}

function readSeats(): SeatsData {
  return JSON.parse(readFileSync(SEATS_FILE, "utf8")) as SeatsData;
}

/** 자리 조합마다 3벳 빈도(조합 가중, %). 바퀴 사이의 변화를 재는 데 쓴다. */
function threeBetFreqs(d: SeatsData): Record<string, number> {
  const combos = d.hands.map((h) => (h.length === 2 ? 6 : h.endsWith("s") ? 4 : 12));
  const total = combos.reduce((a, b) => a + b, 0);
  const out: Record<string, number> = {};
  for (const [opener, s] of Object.entries(d.seats)) {
    for (const [k, r] of Object.entries(s.vsOpenThreeBet ?? {})) {
      out[`${opener}>${k}`] = (100 * d.hands.reduce((a, h, i) => a + (r[h] ?? 0) * combos[i], 0)) / total;
    }
  }
  return out;
}

if (!existsSync(SEATS_FILE) || !readSeats().threeBetToBb) {
  setStatus("실패", `${SEATS_FILE}에 크기 있는 3벳이 없습니다. 먼저 solve-preflop-3bet.ts를 돌리세요`);
  process.exit(1);
}

const sample = sampleFlops(FLOP_COUNT);
setStatus(
  "시작",
  `${ROUNDS}바퀴 × 콜 구간 ${CALL_BUCKETS.length}개 + 3벳 구간 ${BUCKETS.length}개 × 플랍 ${sample.length}개`,
);
let before = threeBetFreqs(readSeats());

/**
 * 한 구간의 표본 플랍을 풀고, 이 바퀴의 표를 만든 뒤, 지금까지 모든 바퀴의
 * 평균을 풀이가 읽는 자리에 쓴다.
 *
 * 마지막 바퀴 표만 쓰면 레인지가 바퀴마다 양쪽으로 튄다(BB의 BTN 3벳 11.8% →
 * 5.6% → 11.7%, 2026-09-27) — 바퀴마다 앞 바퀴에 최선 대응하기 때문이다.
 * 평균을 쓰면 피셔스 플레이처럼 가운데로 모인다.
 */
function solveBucket(opts: {
  label: string;
  /** 바퀴 폴더들이 놓일 곳(깊이 꼬리표 포함). */
  base: string;
  /** 풀이가 읽는 평균 표. */
  out: string;
  round: number;
  pot: number;
  stack: number;
  oop: string[];
  ip: string[];
}): number {
  const dir = `${opts.base}/r${opts.round}`;
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/index.json`, JSON.stringify({ flops: sample }, null, 1));
  const started = Date.now();
  let reused = 0;
  sample.forEach((s, i) => {
    if (done(`${dir}/ev-${s.flop}.json`)) {
      reused += 1;
      return;
    }
    execFileSync(
      EXPORTER,
      [
        "--flop", s.flop,
        "--ev-only",
        "--target-pct", TARGET_PCT,
        "--outdir", dir,
        "--tag", "ev",
        "--pot", String(opts.pot),
        "--stack", String(opts.stack),
        "--oop-range", rangeString(opts.oop),
        "--ip-range", rangeString(opts.ip),
      ],
      { stdio: "ignore" },
    );
    if ((i + 1) % 20 === 0) {
      setStatus(opts.label, `${i + 1}/${sample.length} · ${((Date.now() - started) / 60000).toFixed(1)}분`);
    }
  });
  execFileSync("node", ["--experimental-strip-types", "scripts/build-preflop-values.ts"], {
    stdio: "ignore",
    env: { ...process.env, FLOPEV_DIR: dir, FLOPEV_OUT: `${dir}/table.json` },
  });
  const tables: FlopTable[] = [];
  for (let r = 1; r <= opts.round; r++) {
    const path = `${opts.base}/r${r}/table.json`;
    if (existsSync(path)) tables.push(JSON.parse(readFileSync(path, "utf8")) as FlopTable);
  }
  writeFileSync(opts.out, JSON.stringify(averageTables(tables)));
  return reused;
}

for (let round = 1; round <= ROUNDS; round++) {
  const d = readSeats();
  const started = Date.now();

  // 단일 레이즈 팟, BB가 아닌 콜러. BB 콜러 표(flopev-<구간>)는 따로 있다.
  for (const b of CALL_BUCKETS) {
    const o = d.seats[b.opener];
    const openHands = d.hands.filter((h) => (o?.open?.[h] ?? 0) > 0);
    let callHands = betterThanFold(o?.ev?.vsOpenCall?.[b.caller], -posted(b.caller), d.hands);
    let seeded = false;
    if (callHands.length < 10) {
      // 콜러 표가 없을 때 풀린 콜 EV는 BB 표로 매겨져 거의 모든 콜이 폴드보다
      // 못하다. 그 레인지로는 표본이 비므로, 첫 바퀴는 승률로 씨앗을 준다.
      callHands = equitySeed(d, openHands, b.opener, b.caller);
      seeded = true;
    }
    if (openHands.length < 3 || callHands.length < 3) {
      setStatus("건너뜀", `${b.name}: 레인지가 너무 좁다(오픈 ${openHands.length} · 콜 ${callHands.length})`);
      continue;
    }
    const callerOop = b.caller === "SB";
    const { pot, stack } = flopChips(b.opener, b.caller);
    const reused = solveBucket({
      label: `${round}바퀴 콜 ${b.name}`,
      base: withDepth(`scripts/data/flopev-${b.name}`),
      out: withDepth(`src/data/flopev-${b.name}.json`),
      round,
      pot,
      stack,
      oop: callerOop ? callHands : openHands,
      ip: callerOop ? openHands : callHands,
    });
    setStatus(
      `${round}바퀴 콜 ${b.name} 완료`,
      `오픈 ${openHands.length} · 콜 ${callHands.length}핸드${seeded ? "(승률 씨앗)" : ""}${reused ? ` · 플랍 ${reused}개 재사용` : ""}`,
    );
  }

  for (const b of BUCKETS) {
    const o = d.seats[b.opener];
    const oppFold = -posted(b.threeBettor);
    const tbHands = betterThanFold(o?.ev?.vsOpenThreeBet?.[b.threeBettor], oppFold, d.hands);
    const callHands = betterThanFold(o?.ev?.vsThreeBetCall?.[b.threeBettor], -OPEN_TO_BB, d.hands, o?.open);
    if (tbHands.length < 3 || callHands.length < 3) {
      setStatus("건너뜀", `${b.name}: 레인지가 너무 좁다(3벳 ${tbHands.length} · 콜 ${callHands.length})`);
      continue;
    }
    const oop = threeBettorOop(b.opener, b.threeBettor) ? tbHands : callHands;
    const ip = oop === tbHands ? callHands : tbHands;
    const { pot, stack } = threeBetChips(b.opener, b.threeBettor);
    const reused = solveBucket({
      label: `${round}바퀴 3벳 ${b.name}`,
      base: withDepth(`scripts/data/flopev3-${b.name}`),
      out: withDepth(`src/data/flopev3-${b.name}.json`),
      round,
      pot,
      stack,
      oop,
      ip,
    });
    setStatus(
      `${round}바퀴 3벳 ${b.name} 완료`,
      `3벳 ${tbHands.length} · 콜 ${callHands.length}핸드${reused ? ` · 플랍 ${reused}개 재사용` : ""}`,
    );
  }

  setStatus(`${round}바퀴 프리플랍 재솔브`);
  execFileSync("node", ["--experimental-strip-types", "scripts/solve-preflop-3bet.ts"], {
    stdio: "ignore",
  });

  const after = threeBetFreqs(readSeats());
  const change = Math.max(
    ...Object.keys(after).map((key) => Math.abs((after[key] ?? 0) - (before[key] ?? 0))),
  );
  before = after;
  const reach = flopReach(readSeats(), lcg(1), 20000);
  setStatus(
    `${round}바퀴 끝`,
    `플랍 도달 ${((reach.flop + reach.threebetFlop) * 100).toFixed(1)}%` +
      ` (3벳 팟 ${(reach.threebetFlop * 100).toFixed(1)}%)` +
      ` · BB의 BTN 3벳 ${(after["BTN>BB"] ?? 0).toFixed(1)}%` +
      ` · 3벳 빈도 최대 변화 ${change.toFixed(2)}%p` +
      ` · ${((Date.now() - started) / 60000).toFixed(0)}분`,
  );
  if (change < STOP_PP) {
    setStatus("수렴", `3벳 빈도 변화 ${change.toFixed(2)}%p < ${STOP_PP}%p`);
    break;
  }
}

setStatus("완료");
