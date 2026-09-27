// 3인 팟(오픈 + 플랫 + 오버콜)에서 각자가 팟을 얼마나 가져가는가.
//
// 실행: STACK=30 node --experimental-strip-types scripts/multiway-values.ts
//   SAMPLES(핸드당 표본, 기본 600), OUT(출력 경로, 기본 src/data/multiway-<깊이>bb.json)
//
// 포스트플랍 솔버는 2인 전용이라 3인 플랍 전략은 풀 수 없다. 대신 가치는 이렇게 잰다.
//   몫 = 팟 × 포지션 비율 × 승률^ALPHA, 그리고 세 사람 몫의 레인지 평균 합 = 팟
// 승률은 두 상대의 조합을 레인지에서(카드 겹침 없이) 뽑고 보드 다섯 장을 뽑아 센다.
// 포지션 비율은 이미 푼 2인 표(BTN 오픈-BB 콜)에서 잰다: 플랍 몫 ÷ (승률 × 팟), 조합 가중.
// 플랍에서 마지막에 치는 자리는 IP 비율, 처음 치는 자리는 OOP 비율, 가운데는 평균.
//
// ALPHA(기본 2)는 3인 팟의 가정이다. 약한 핸드는 두 사람에게 지배당하고, 블러프가
// 통하려면 둘 다 접어야 해서 승률만큼 못 가져간다. 강한 핸드는 두 사람에게서 가치를
// 받는다. 승률을 볼록하게 펴는 것이 그 모양이다. 첫 시도는 승률^(1/비율)이라 IP(1.14)
// 에서 지수가 1보다 작아졌고, 약한 핸드일수록 몫이 부풀었다 — UTG 오픈 · CO 플랫 뒤
// BTN이 핸드의 66%로 오버콜했다. 2인 표로는 이 기울기를 잴 수 없다(2인 레인지에는
// 약한 핸드가 거의 없고, 2인에서 IP의 약한 핸드는 폴드 에퀴티로 승률 이상을 가져간다).
// 2는 맞춘 값이다. 합을 팟에 맞춘 뒤 "이익인 오버콜"(스퀴즈를 빼고 본 상한)이
// UTG 오픈 · CO 플랫 뒤 BTN 26%, BTN 오픈 · SB 플랫 뒤 BB 39%가 된다. 1.25면 49%·76%,
// 1.5면 38%·66%로, 앤티 게임의 알려진 풀이(BTN 오버콜 10% 안팎, 액션을 닫는 BB 절반
// 안팎)보다 한참 넓다. 스퀴즈가 BTN의 몫을 더 깎는다.
// 마지막에 합을 팟에 맞춘다. 돈은 새로 생기지도 사라지지도 않는다.
//
// 근사다. 3인 팟에서 포지션과 레인지가 몫을 어떻게 바꾸는지는 2인에서 잰 비율로 대신한다.
// 무엇을 썼는지 출력 파일의 note와 realization에 남긴다.

import { readFileSync, writeFileSync } from "node:fs";
import { ANTE_BB, OPEN_TO_BB, withDepth } from "./game.ts";
import { evaluate7, parseCard } from "./evaluator.ts";
import type { SeatsData } from "../src/lib/seatGame.ts";

type EquityTable = { hands: string[]; equity: number[] };
type FlopTable = { hands: string[]; startingPotBb: number; flopEvBb: [(number | null)[], (number | null)[]] };

const SEATS = ["UTG", "UTG1", "UTG2", "LJ", "HJ", "CO", "BTN", "SB", "BB"];
/** 플랍에서 치는 순서. 앞일수록 먼저 친다(OOP). */
const POSTFLOP = ["SB", "BB", "UTG", "UTG1", "UTG2", "LJ", "HJ", "CO", "BTN"];
const SAMPLES = Number(process.env.SAMPLES ?? 600);
const ALPHA = Number(process.env.ALPHA ?? 2);
const OUT = process.env.OUT ?? withDepth("src/data/multiway.json");

const posted = (seat: string) => (seat === "BB" ? 1 + ANTE_BB : seat === "SB" ? 0.5 : 0);
const DEAD = 0.5 + 1 + ANTE_BB;
/** 이 자리가 오픈이나 콜로 낸 총액. BB는 앤티까지. */
const putIn = (seat: string) => OPEN_TO_BB + (seat === "BB" ? ANTE_BB : 0);

const EQUITY = JSON.parse(readFileSync("scripts/data/equity.json", "utf8")) as EquityTable;
const HANDS = EQUITY.hands;
const N = HANDS.length;
const COMBOS = HANDS.map((h) => (h.length === 2 ? 6 : h.endsWith("s") ? 4 : 12));

// ── 카드 ────────────────────────────────────────────────────────────────

const SUITS = "shdc";
/** 클래스마다 가능한 두 장(정수 카드). */
const PAIRS: [number, number][][] = HANDS.map((code) => {
  const pair = code.length === 2;
  const suited = code.endsWith("s");
  const out: [number, number][] = [];
  for (let a = 0; a < 4; a++) {
    for (let b = 0; b < 4; b++) {
      if (pair && b <= a) continue;
      if (!pair && suited && a !== b) continue;
      if (!pair && !suited && a === b) continue;
      out.push([parseCard(code[0] + SUITS[a]), parseCard(code[1] + SUITS[b])]);
    }
  }
  return out;
});

function lcg(seed: number): () => number {
  let x = seed >>> 0 || 1;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 4294967296;
  };
}

/** 레인지(빈도)에서 조합 수 가중으로 클래스를 뽑는 표. */
function sampler(range: Float64Array): { cum: Float64Array; total: number } {
  const cum = new Float64Array(N);
  let t = 0;
  for (let i = 0; i < N; i++) {
    t += range[i] * COMBOS[i];
    cum[i] = t;
  }
  return { cum, total: t };
}

function pickClass(s: { cum: Float64Array; total: number }, rnd: () => number): number {
  const r = rnd() * s.total;
  let lo = 0;
  let hi = N - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (s.cum[mid] < r) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** 쓰이지 않은 조합 하나. 다 막혀 있으면 null. */
function pickPair(cls: number, used: Uint8Array, rnd: () => number): [number, number] | null {
  const list = PAIRS[cls];
  const start = Math.floor(rnd() * list.length);
  for (let t = 0; t < list.length; t++) {
    const p = list[(start + t) % list.length];
    if (!used[p[0]] && !used[p[1]]) return p;
  }
  return null;
}

/**
 * 핸드 클래스 h를 든 사람이 레인지 a, b를 든 두 사람을 상대로 쇼다운에서 가져가는
 * 팟의 비율(무승부는 나눈다). 표본이 끝까지 안 뽑히면(레인지가 겹쳐 막힘) NaN.
 */
function equity3(h: number, a: ReturnType<typeof sampler>, b: ReturnType<typeof sampler>, rnd: () => number): number {
  if (a.total === 0 || b.total === 0) return Number.NaN;
  const used = new Uint8Array(52);
  const board = new Array<number>(5);
  let won = 0;
  let n = 0;
  for (let t = 0; t < SAMPLES * 3 && n < SAMPLES; t++) {
    used.fill(0);
    const hp = PAIRS[h][Math.floor(rnd() * PAIRS[h].length)];
    used[hp[0]] = 1;
    used[hp[1]] = 1;
    const ap = pickPair(pickClass(a, rnd), used, rnd);
    if (!ap) continue;
    used[ap[0]] = 1;
    used[ap[1]] = 1;
    const bp = pickPair(pickClass(b, rnd), used, rnd);
    if (!bp) continue;
    used[bp[0]] = 1;
    used[bp[1]] = 1;
    for (let k = 0; k < 5; k++) {
      let c = Math.floor(rnd() * 52);
      while (used[c]) c = Math.floor(rnd() * 52);
      used[c] = 1;
      board[k] = c;
    }
    const sh = evaluate7([...board, hp[0], hp[1]]);
    const sa = evaluate7([...board, ap[0], ap[1]]);
    const sb = evaluate7([...board, bp[0], bp[1]]);
    const best = Math.max(sh, sa, sb);
    if (sh === best) won += 1 / ((sa === best ? 1 : 0) + (sb === best ? 1 : 0) + 1);
    n += 1;
  }
  return n === 0 ? Number.NaN : won / n;
}

// ── 레인지 ──────────────────────────────────────────────────────────────

const data = JSON.parse(readFileSync(withDepth("src/data/preflop-seats.json"), "utf8")) as SeatsData;
const vec = (r: Record<string, number> | undefined) => {
  const out = new Float64Array(N);
  if (!r) return out;
  HANDS.forEach((h, i) => (out[i] = r[h] ?? 0));
  return out;
};
const size = (v: Float64Array) => v.reduce((s, x) => s + (x > 0 ? 1 : 0), 0);

/** 오픈 레인지를 상대로 승률 순 상위 frac(조합 기준). 씨앗 레인지로 쓴다. */
function topByEquity(open: Float64Array, frac: number): Float64Array {
  const eqs = HANDS.map((_, i) => {
    let w = 0;
    let t = 0;
    for (let j = 0; j < N; j++) {
      const x = open[j] * COMBOS[j];
      w += x * EQUITY.equity[i * N + j];
      t += x;
    }
    return { i, e: t > 0 ? w / t : 0 };
  }).sort((x, y) => y.e - x.e);
  const out = new Float64Array(N);
  const total = COMBOS.reduce((a, b) => a + b, 0);
  let took = 0;
  for (const { i } of eqs) {
    if (took / total >= frac) break;
    out[i] = 1;
    took += COMBOS[i];
  }
  return out;
}

/** 콜 레인지: 풀린 빈도가 있으면 그것, 너무 좁으면(씨앗) 오픈 상대 승률 상위 20%. */
function callRange(opener: string, seat: string, r: Record<string, number> | undefined): Float64Array {
  const v = vec(r);
  if (size(v) >= 10) return v;
  return topByEquity(vec(data.seats[opener]?.open), 0.2);
}

// ── 실현 비율 ────────────────────────────────────────────────────────────

/**
 * 2인 표(BTN 오픈-BB 콜)에서 잰 실현 비율. 표의 몫을 같은 레인지에 대한 승률 × 팟으로
 * 나눈다. 표를 만든 레인지와 지금 레인지가 다를 수 있어 근사다.
 */
function realization(): { oop: number; ip: number } {
  const t = JSON.parse(readFileSync(withDepth("src/data/flopev-late.json"), "utf8")) as FlopTable;
  const open = vec(data.seats.BTN?.open);
  const call = vec(data.seats.BTN?.vsOpenCall?.BB);
  const idx = new Map(t.hands.map((h, i) => [h, i]));
  const eqVs = (i: number, r: Float64Array) => {
    let w = 0;
    let s = 0;
    for (let j = 0; j < N; j++) {
      const x = r[j] * COMBOS[j];
      w += x * EQUITY.equity[i * N + j];
      s += x;
    }
    return s > 0 ? w / s : Number.NaN;
  };
  const ratio = (player: 0 | 1, mine: Float64Array, theirs: Float64Array) => {
    let share = 0;
    let raw = 0;
    for (let i = 0; i < N; i++) {
      const k = idx.get(HANDS[i]);
      const v = k === undefined ? null : t.flopEvBb[player][k];
      if (v === null || v === undefined || mine[i] <= 0) continue;
      const e = eqVs(i, theirs);
      if (Number.isNaN(e)) continue;
      const w = mine[i] * COMBOS[i];
      share += w * v;
      raw += w * e * t.startingPotBb;
    }
    return raw > 0 ? share / raw : 1;
  };
  return { oop: ratio(0, call, open), ip: ratio(1, open, call) };
}

// ── 계산 ────────────────────────────────────────────────────────────────

const R = realization();
console.log(`실현 비율: OOP ${R.oop.toFixed(3)} · IP ${R.ip.toFixed(3)} · ALPHA ${ALPHA} · 표본 ${SAMPLES}`);
const rnd = lcg(20260928);
const started = Date.now();

type Trio = { opener: number[]; caller: number[]; overcaller: number[]; pot: number };
const out: Record<string, Record<string, Record<string, Trio>>> = {};
let trios = 0;

for (let a = 0; a < SEATS.length - 2; a++) {
  const opener = SEATS[a];
  const o = data.seats[opener];
  if (!o) continue;
  const openR = vec(o.open);
  if (size(openR) === 0) continue;
  for (let b = a + 1; b < SEATS.length - 1; b++) {
    const caller = SEATS[b];
    const flatR = callRange(opener, caller, o.vsOpenCall?.[caller]);
    for (let c = b + 1; c < SEATS.length; c++) {
      const over = SEATS[c];
      const ocR = callRange(opener, over, o.vsFlatCall?.[caller]?.[over]);
      // 셋이 낸 것 + 판에 안 낀 블라인드·앤티. 오프너의 오픈액에는 자기 블라인드가 들어 있다.
      const pot =
        OPEN_TO_BB + putIn(caller) + putIn(over) + DEAD - posted(opener) - posted(caller) - posted(over);
      // 플랍 순서로 실현 비율을 정한다.
      const order = [opener, caller, over].sort((x, y) => POSTFLOP.indexOf(x) - POSTFLOP.indexOf(y));
      const factor = (seat: string) =>
        seat === order[2] ? R.ip : seat === order[0] ? R.oop : (R.ip + R.oop) / 2;
      const S = { opener: sampler(openR), caller: sampler(flatR), over: sampler(ocR) };
      const shares = (me: "opener" | "caller" | "over") => {
        const [x, y] = (["opener", "caller", "over"] as const).filter((r) => r !== me);
        const seat = me === "opener" ? opener : me === "caller" ? caller : over;
        const f = factor(seat);
        return HANDS.map((_, h) => {
          const e = equity3(h, S[x], S[y], rnd);
          return Number.isNaN(e) ? null : pot * f * Math.pow(e, ALPHA);
        });
      };
      const raw = { opener: shares("opener"), caller: shares("caller"), over: shares("over") };
      // 세 사람 몫의 레인지 평균 합을 팟에 맞춘다.
      const mean = (v: (number | null)[], r: Float64Array) => {
        let w = 0;
        let t = 0;
        v.forEach((x, i) => {
          if (x === null || r[i] <= 0) return;
          w += x * r[i] * COMBOS[i];
          t += r[i] * COMBOS[i];
        });
        return t > 0 ? w / t : 0;
      };
      const sum = mean(raw.opener, openR) + mean(raw.caller, flatR) + mean(raw.over, ocR);
      const k = sum > 0 ? pot / sum : 1;
      // 한 사람이 팟보다 많이 가져갈 수는 없다.
      const fix = (v: (number | null)[]) =>
        v.map((x) => (x === null ? null : Math.round(Math.min(pot, x * k) * 1000) / 1000));
      (out[opener] ??= {})[caller] ??= {};
      out[opener][caller][over] = {
        opener: fix(raw.opener) as number[],
        caller: fix(raw.caller) as number[],
        overcaller: fix(raw.over) as number[],
        pot,
      };
      trios += 1;
    }
    console.log(`  ${opener} 오픈 · ${caller} 플랫 완료 · ${((Date.now() - started) / 1000).toFixed(0)}초`);
  }
}

writeFileSync(
  OUT,
  JSON.stringify({
    note:
      "3인 팟 몫(bb) = 팟 × 포지션 비율 × 3인 쇼다운 승률^ALPHA, 세 사람 합 = 팟으로 맞춤." +
      " 포지션 비율은 2인 표(BTN-BB)에서 잰 값." +
      " 포스트플랍 솔버가 2인 전용이라 3인 플랍 전략은 풀지 않았다.",
    stackBb: data.stackBb,
    samples: SAMPLES,
    alpha: ALPHA,
    realization: R,
    hands: HANDS,
    trios: out,
  }),
);
console.log(`${trios}개 조합 · ${((Date.now() - started) / 1000).toFixed(0)}초 · 기록 ${OUT}`);
