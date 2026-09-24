// 아홉 자리 전부의 프리플랍을 푼다.
//
// 실행: node --experimental-strip-types scripts/solve-preflop-seats.ts
//
// 구조는 solve-pushfold.ts를 그대로 따른다. 그쪽은 검증된 9인 순차 게임 솔버이고,
// 핵심은 "뒤 자리 중 누가 첫 번째로 받는가"를 순서대로 계산하는 부분이다.
//
//   let survive = 1;
//   for (k of behind) { first[k] = survive * freq[k]; survive *= 1 - freq[k]; }
//
// 이걸 "뒤 자리들의 대응 빈도를 합쳐서" 근사하면 7명이 동시에 받는 것처럼 되어
// 오픈이 언제나 가망 없는 선택이 된다. 실제로 그렇게 만들었다가 모든 자리가
// 오픈 0% / 오픈 올인 33%라는 답을 얻었다.
//
// 자리마다 스팟을 따로 푼다. 각 스팟은 "앞은 전부 접었고 내 차례"이고, 내
// 오픈/올인에 뒤 자리들이 어떻게 대응하는지를 같은 피셔스 플레이 안에서 함께
// 푼다. 그 대응 레인지가 곧 그 자리의 vsOpen 레인지가 된다.
//
// 20bb에서 3벳은 사실상 올인이라 4벳은 넣지 않았다. 첫 콜러가 나오면 그 뒤는
// 접는 것으로 본다 — 멀티웨이 팟의 포스트플랍 데이터가 없어서이고, 단순화다.

import { readFileSync, writeFileSync } from "node:fs";

const OUT = "src/data/preflop-seats.json";

type EquityTable = { hands: string[]; equity: number[] };
type FlopValues = {
  startingPotBb: number;
  hands: string[];
  flopEvBb: [(number | null)[], (number | null)[]];
};

const eq = JSON.parse(readFileSync("scripts/data/equity.json", "utf8")) as EquityTable;
const flopRaw = JSON.parse(readFileSync("src/data/preflop-flopev.json", "utf8")) as FlopValues;

const HANDS = eq.hands;
const N = HANDS.length;
const EQ = eq.equity;
const COMBOS = HANDS.map((c) => (c.length === 2 ? 6 : c.endsWith("s") ? 4 : 12));

const flopIndex = new Map(flopRaw.hands.map((h, i) => [h, i]));
const FLOP_EV: [number[], number[]] = [[], []];
for (const p of [0, 1] as const) {
  for (const code of HANDS) {
    const i = flopIndex.get(code);
    FLOP_EV[p].push(i === undefined ? Number.NaN : (flopRaw.flopEvBb[p][i] ?? Number.NaN));
  }
}

const SEATS = ["UTG", "UTG1", "UTG2", "LJ", "HJ", "CO", "BTN", "SB", "BB"];
const STACK = 20;
const ANTE = 1;
const OPEN = (flopRaw.startingPotBb - 0.5 - ANTE) / 2; // 2.5
const posted = (seat: string) => (seat === "BB" ? 1 + ANTE : seat === "SB" ? 0.5 : 0);
const DEAD = 0.5 + (1 + ANTE); // SB + BB + 앤티

function equityVsRange(i: number, range: Float64Array): number {
  let w = 0;
  let t = 0;
  const base = i * N;
  for (let j = 0; j < N; j++) {
    const x = range[j] * COMBOS[j];
    if (x === 0) continue;
    w += x * EQ[base + j];
    t += x;
  }
  return t === 0 ? 0 : w / t;
}

function freq(range: Float64Array): number {
  let s = 0;
  let a = 0;
  for (let j = 0; j < N; j++) {
    s += range[j] * COMBOS[j];
    a += COMBOS[j];
  }
  return s / a;
}

/** 오프너가 3벳 올인을 받았을 때의 순EV. 걸리는 건 스택 전부다. */
function callJamEv(h: number, jamRange: Float64Array, jammerPosted: number): number {
  const pot = 2 * STACK + (DEAD - jammerPosted);
  return equityVsRange(h, jamRange) * pot - STACK;
}

type SeatResult = {
  /** 앞이 다 접었을 때. */
  open: Float64Array;
  openJam: Float64Array;
  /** 내 오픈에 3벳 올인이 왔을 때 받을지. */
  /** 3벳한 자리별로 받을지. 누가 3벳했는지에 따라 답이 다르다. */
  callJam: Record<string, Float64Array>;
  /** 앞에서 열렸을 때 (자리별 대응). 자리 이름 → 레인지. */
  vsOpenCall: Record<string, Float64Array>;
  vsOpenJam: Record<string, Float64Array>;
  /** 앞에서 올인이 나왔을 때 받을지. */
  vsJamCall: Record<string, Float64Array>;
};

const ITERS = Number(process.env.ITERS ?? 3000);

/**
 * 한 자리의 스팟을 푼다. 앞은 전부 접었고, 뒤 자리들이 내 오픈/올인에 대응한다.
 */
function solveSeat(heroIdx: number): SeatResult {
  const hero = SEATS[heroIdx];
  const behind = SEATS.slice(heroIdx + 1);
  const heroPosted = posted(hero);

  const open = new Float64Array(N).fill(0.2);
  const openJam = new Float64Array(N).fill(0.05);
  const cJam = behind.map(() => new Float64Array(N).fill(0.4));
  // 뒤 자리별 대응
  const vCall = behind.map(() => new Float64Array(N).fill(0.15));
  const vJam = behind.map(() => new Float64Array(N).fill(0.08));
  const vJamCall = behind.map(() => new Float64Array(N).fill(0.2));

  const nOpen = new Float64Array(N);
  const nOpenJam = new Float64Array(N);
  const nCJam = behind.map(() => new Float64Array(N));
  const nVCall = behind.map(() => new Float64Array(N));
  const nVJam = behind.map(() => new Float64Array(N));
  const nVJamCall = behind.map(() => new Float64Array(N));

  for (let iter = 0; iter < ITERS; iter++) {
    // ── 뒤 자리 중 누가 먼저 반응하는가. 순서대로 흘려야 한다.
    const fCall = vCall.map(freq);
    const fJam = vJam.map(freq);
    const firstCall = new Array(behind.length).fill(0);
    const firstJam = new Array(behind.length).fill(0);
    let survive = 1;
    for (let k = 0; k < behind.length; k++) {
      firstCall[k] = survive * fCall[k];
      firstJam[k] = survive * fJam[k];
      survive *= Math.max(0, 1 - fCall[k] - fJam[k]);
    }
    const allFold = survive;

    // 내 오픈 올인을 누가 받는가.
    const fJamCall = vJamCall.map(freq);
    const firstJamCall = new Array(behind.length).fill(0);
    let surviveJam = 1;
    for (let k = 0; k < behind.length; k++) {
      firstJamCall[k] = surviveJam * fJamCall[k];
      surviveJam *= 1 - fJamCall[k];
    }

    // ── 내 판단
    for (let h = 0; h < N; h++) {
      // 오픈했을 때
      let evOpen = allFold * (DEAD - heroPosted);
      for (let k = 0; k < behind.length; k++) {
        if (firstCall[k] > 0) {
          const v = FLOP_EV[1][h];
          evOpen += firstCall[k] * (Number.isNaN(v) ? -OPEN : v - OPEN);
        }
        if (firstJam[k] > 0) {
          // 3벳 올인을 맞았다. 그 자리에 대한 내 콜 판단을 따른다.
          const ev = callJamEv(h, vJam[k], posted(behind[k]));
          evOpen += firstJam[k] * Math.max(ev, -OPEN);
        }
      }

      // 바로 올인했을 때
      let evJam = surviveJam * (DEAD - heroPosted);
      for (let k = 0; k < behind.length; k++) {
        if (firstJamCall[k] === 0) continue;
        const pot = 2 * STACK + (DEAD - heroPosted - posted(behind[k]));
        evJam += firstJamCall[k] * (equityVsRange(h, vJamCall[k]) * pot - (STACK - heroPosted));
      }

      const evFold = -heroPosted;
      const best = Math.max(evFold, evOpen, evJam);
      nOpen[h] = evOpen === best ? 1 : 0;
      nOpenJam[h] = evJam === best && evOpen !== best ? 1 : 0;

      // 3벳 올인을 맞았을 때 받을지 — 3벳한 자리마다 따로 정한다.
      //
      // 하나로 뭉치면 앞쪽 자리의 타이트한 3벳이 평균을 끌어내려, 맨 뒤 자리의
      // 넓은 3벳까지 덩달아 접게 된다. 그 틈으로 BB가 82% 3벳하는 답이 나왔다.
      for (let k = 0; k < behind.length; k++) {
        nCJam[k][h] = callJamEv(h, vJam[k], posted(behind[k])) > -OPEN ? 1 : 0;
      }
    }

    // ── 뒤 자리들의 판단
    for (let k = 0; k < behind.length; k++) {
      const seat = behind[k];
      const seatPosted = posted(seat);
      // 내 오픈에 대응.
      //
      // 오프너가 3벳을 받는 비율은 전체 핸드 기준이 아니라 "열었다는 조건
      // 아래"여야 한다. 전체 기준으로 재면 오픈 레인지 밖의 핸드까지 분모에
      // 들어가 오프너가 거의 안 받는 것처럼 보이고, 3벳이 공짜가 된다.
      const openFreq = freq(open);
      const openAndCall = openRangeCalling(open, cJam[k]);
      const myCallJamFreq = openFreq > 0 ? freq(openAndCall) / openFreq : 0;
      const jamPot = 2 * STACK + (DEAD - seatPosted - heroPosted);
      for (let j = 0; j < N; j++) {
        const evFold = -seatPosted;
        const v = FLOP_EV[0][j];
        const paid = OPEN + (seat === "BB" ? ANTE : 0);
        const evCall = Number.isNaN(v) ? -paid : v - paid;
        const win = OPEN + DEAD - seatPosted;
        const whenCalled = equityVsRange(j, openAndCall) * jamPot - (STACK - seatPosted);
        const evJam3 = (1 - myCallJamFreq) * win + myCallJamFreq * whenCalled;
        const best = Math.max(evFold, evCall, evJam3);
        nVCall[k][j] = evCall === best ? 1 : 0;
        nVJam[k][j] = evJam3 === best && evCall !== best ? 1 : 0;

        // 내 오픈 올인에 받을지
        const pot = 2 * STACK + (DEAD - seatPosted - heroPosted);
        nVJamCall[k][j] = equityVsRange(j, openJam) * pot - (STACK - seatPosted) > evFold ? 1 : 0;
      }
    }

    const rate = 1 / (iter + 2);
    for (let i = 0; i < N; i++) {
      open[i] += (nOpen[i] - open[i]) * rate;
      openJam[i] += (nOpenJam[i] - openJam[i]) * rate;
      for (let k = 0; k < behind.length; k++) {
        cJam[k][i] += (nCJam[k][i] - cJam[k][i]) * rate;
        vCall[k][i] += (nVCall[k][i] - vCall[k][i]) * rate;
        vJam[k][i] += (nVJam[k][i] - vJam[k][i]) * rate;
        vJamCall[k][i] += (nVJamCall[k][i] - vJamCall[k][i]) * rate;
      }
    }
  }

  const byName = <T>(vals: T[]) =>
    Object.fromEntries(behind.map((s, k) => [s, vals[k]])) as Record<string, T>;
  return {
    open,
    openJam,
    callJam: byName(cJam),
    vsOpenCall: byName(vCall),
    vsOpenJam: byName(vJam),
    vsJamCall: byName(vJamCall),
  };
}

/** 오프너가 3벳 올인을 받는 부분의 레인지. */
function openRangeCalling(open: Float64Array, callJam: Float64Array): Float64Array {
  const out = new Float64Array(N);
  for (let i = 0; i < N; i++) out[i] = open[i] * callJam[i];
  return out;
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const asRange = (a: Float64Array) => {
  const out: Record<string, number> = {};
  for (let j = 0; j < N; j++) if (a[j] > 0.005) out[HANDS[j]] = round2(a[j]);
  return out;
};

const results: Record<string, SeatResult> = {};
// BB는 아무도 안 열면 그냥 이기므로 firstIn 스팟이 없다.
SEATS.forEach((seat, i) => {
  if (seat === "BB") return;
  results[seat] = solveSeat(i);
});

const out: Record<string, unknown> = {};
for (const [seat, r] of Object.entries(results)) {
  out[seat] = {
    open: asRange(r.open),
    openJam: asRange(r.openJam),
    callJam: Object.fromEntries(Object.entries(r.callJam).map(([x, v]) => [x, asRange(v)])),
    vsOpenCall: Object.fromEntries(
      Object.entries(r.vsOpenCall).map(([s, v]) => [s, asRange(v)]),
    ),
    vsOpenJam: Object.fromEntries(Object.entries(r.vsOpenJam).map(([s, v]) => [s, asRange(v)])),
    vsJamCall: Object.fromEntries(Object.entries(r.vsJamCall).map(([s, v]) => [s, asRange(v)])),
  };
}

writeFileSync(
  OUT,
  JSON.stringify(
    {
      note: "자리별 프리플랍. 플랍 EV는 BTN-BB 조건의 근사를 모든 자리에 썼다.",
      tableSize: 9,
      stackBb: STACK,
      anteBb: ANTE,
      openToBb: OPEN,
      iterations: ITERS,
      hands: HANDS,
      seats: out,
    },
    null,
    1,
  ),
);

console.log("자리    오픈  오픈올인  3벳에콜(전체/오픈중)  BB: 콜/3벳");
for (const seat of SEATS) {
  const r = results[seat];
  if (!r) continue;
  const bbCall = r.vsOpenCall.BB ? `${(freq(r.vsOpenCall.BB) * 100).toFixed(1)}%` : "—";
  const bbJam = r.vsOpenJam.BB ? `${(freq(r.vsOpenJam.BB) * 100).toFixed(1)}%` : "—";
  const of = freq(r.open);
  // BB의 3벳에 대한 콜만 본다. 자리마다 다른 값이라 대표로 하나를 찍는다.
  const vsBb = r.callJam.BB ?? new Float64Array(N);
  const cjAll = freq(vsBb);
  const cjCond = of > 0 ? freq(openRangeCalling(r.open, vsBb)) / of : 0;
  console.log(
    `  ${seat.padEnd(5)}${`${(of * 100).toFixed(1)}%`.padStart(6)}` +
      `${`${(freq(r.openJam) * 100).toFixed(1)}%`.padStart(8)}` +
      `${`${(cjAll * 100).toFixed(0)}%`.padStart(9)} /${`${(cjCond * 100).toFixed(0)}%`.padStart(5)}` +
      `        ${bbCall} / ${bbJam}`,
  );
}
console.log(`\n기록: ${OUT}`);
