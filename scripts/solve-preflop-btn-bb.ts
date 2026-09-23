// BTN 오픈 대 BB 디펜스를 푼다. 포스트플랍 데이터가 있는 유일한 프리플랍이라
// 실제 EV로 채점할 수 있는 판단도 여기까지다.
//
// 실행: node --experimental-strip-types scripts/solve-preflop-btn-bb.ts
//
// 트리 (9인, 20bb, BB 앤티 1bb, UTG~CO와 SB는 폴드로 고정):
//
//   BTN : 폴드 | 오픈 2.5
//     BB : 폴드 | 콜 | 3벳 올인 20
//       BTN : 폴드 | 콜
//
// 값의 출처가 셋이다. 폴드는 상수, 콜은 포스트플랍 스팟에서 뽑은 플랍 EV,
// 올인은 169×169 승률표다. 그래서 범용 프리플랍 솔버가 필요 없다.
//
// SB를 폴드로 고정하는 건 단순화다. SB가 받는 팟의 포스트플랍 데이터가 없어서
// 그 가지를 값매길 방법이 없다.

import { readFileSync, writeFileSync } from "node:fs";

const OUT = "src/data/preflop-btn-bb.json";

type EquityTable = { hands: string[]; equity: number[] };
type FlopValues = {
  startingPotBb: number;
  effectiveStackBb: number;
  boardCount: number;
  hands: string[];
  flopEvBb: [(number | null)[], (number | null)[]];
};

const eqRaw = JSON.parse(readFileSync("scripts/data/equity.json", "utf8")) as EquityTable;
const flopRaw = JSON.parse(readFileSync("src/data/preflop-flopev.json", "utf8")) as FlopValues;

const HANDS = eqRaw.hands;
const N = HANDS.length;
const EQ = eqRaw.equity;
const COMBOS = HANDS.map((c) => (c.length === 2 ? 6 : c.endsWith("s") ? 4 : 12));

// flopEv는 poker.ts의 ALL_HANDS 순서라 승률표 순서와 다르다. 이름으로 맞춘다.
const flopIndex = new Map(flopRaw.hands.map((h, i) => [h, i]));
const FLOP_EV: [number[], number[]] = [[], []];
for (const player of [0, 1] as const) {
  for (const code of HANDS) {
    const i = flopIndex.get(code);
    const v = i === undefined ? null : flopRaw.flopEvBb[player][i];
    FLOP_EV[player].push(v ?? Number.NaN);
  }
}

// 게임 조건. 포스트플랍 스팟이 풀린 조건과 같아야 한다.
const STACK = 20;
const ANTE = 1;
const SB = 0.5;
const OPEN = (flopRaw.startingPotBb - SB - ANTE) / 2; // 2.5
const DEAD_TO_BTN = SB + 1 + ANTE; // BTN이 오픈해서 모두 폴드하면 가져가는 돈
const ALLIN_POT = 2 * STACK + SB; // 둘이 올인하면 SB의 죽은 돈까지 간다

const BTN_IN_ON_CALL = OPEN; // 2.5
const BB_IN_ON_CALL = OPEN + ANTE; // 3.5 — 앤티는 죽은 돈이라 콜 금액에 안 들어간다
const BB_IN_ON_FOLD = 1 + ANTE; // 블라인드 + 앤티

/** 상대 레인지에 대한 승률. 조합 수로 가중한다. */
function equityVsRange(i: number, range: Float64Array): number {
  let weighted = 0;
  let total = 0;
  const base = i * N;
  for (let j = 0; j < N; j++) {
    const w = range[j] * COMBOS[j];
    if (w === 0) continue;
    weighted += w * EQ[base + j];
    total += w;
  }
  return total === 0 ? 0 : weighted / total;
}

function frequency(range: Float64Array): number {
  let sum = 0;
  let all = 0;
  for (let j = 0; j < N; j++) {
    sum += range[j] * COMBOS[j];
    all += COMBOS[j];
  }
  return sum / all;
}

/** 두 레인지를 곱한 것(예: 오픈했고 그 중 콜한 부분). */
function intersect(a: Float64Array, b: Float64Array): Float64Array {
  const out = new Float64Array(N);
  for (let j = 0; j < N; j++) out[j] = a[j] * b[j];
  return out;
}

// ── 전략 ──────────────────────────────────────────────────────────────
// 각 배열은 핸드별 빈도(0~1)다.
const btnOpen = new Float64Array(N).fill(0.5);
const btnCallShove = new Float64Array(N).fill(0.5);
const bbCall = new Float64Array(N).fill(0.4);
const bbShove = new Float64Array(N).fill(0.1);

// 피셔스 플레이용 누적(평균 전략이 균형에 수렴한다).
const accOpen = new Float64Array(N);
const accCallShove = new Float64Array(N);
const accBbCall = new Float64Array(N);
const accBbShove = new Float64Array(N);

/** BTN이 3벳 올인에 콜했을 때의 순EV. */
function btnCallShoveEv(h: number, shoveRange: Float64Array): number {
  return equityVsRange(h, shoveRange) * ALLIN_POT - STACK;
}

/** BB가 올인했을 때의 순EV. BTN의 콜 레인지가 상대다. */
function bbShoveEv(g: number, openRange: Float64Array, callRange: Float64Array): number {
  const called = intersect(openRange, callRange);
  const foldedWeight = frequency(openRange) - frequency(called);
  const calledWeight = frequency(called);
  const total = foldedWeight + calledWeight;
  if (total <= 0) return DEAD_TO_BTN - BB_IN_ON_FOLD;

  // BTN이 접으면 BB가 오픈액과 SB를 가져간다.
  const winUncalled = OPEN + SB;
  const whenCalled = equityVsRange(g, called) * ALLIN_POT - STACK;
  return (foldedWeight * winUncalled + calledWeight * whenCalled) / total;
}

const ITERS = Number(process.env.ITERS ?? 3000);

for (let t = 1; t <= ITERS; t++) {
  // 이번 회차의 상대는 전부 "지난 회차까지의 평균"이어야 한다. 방금 갱신한 순수
  // 최적반응을 같은 회차 안에서 상대로 쓰면 평균과 순수가 섞여 흔들린다.
  const oppOpen = Float64Array.from(btnOpen);
  const oppCallShove = Float64Array.from(btnCallShove);
  const oppShove = Float64Array.from(bbShove);

  // 1) BTN: 3벳 올인에 콜할지.
  for (let h = 0; h < N; h++) {
    btnCallShove[h] = btnCallShoveEv(h, oppShove) > -OPEN ? 1 : 0;
  }

  // 2) BB: 오픈에 어떻게 대응할지. 셋 중 가장 좋은 것.
  for (let g = 0; g < N; g++) {
    const evFold = -BB_IN_ON_FOLD;
    const evCall = Number.isNaN(FLOP_EV[0][g]) ? -Infinity : FLOP_EV[0][g] - BB_IN_ON_CALL;
    const evShove = bbShoveEv(g, oppOpen, oppCallShove);
    const best = Math.max(evFold, evCall, evShove);
    bbCall[g] = evCall === best ? 1 : 0;
    bbShove[g] = evShove === best && evCall !== best ? 1 : 0;
  }

  // 3) BTN: 열지 말지.
  const bbFoldF = 1 - frequency(bbCall) - frequency(bbShove);
  const shoveF = frequency(bbShove);
  const callF = frequency(bbCall);
  for (let h = 0; h < N; h++) {
    const vsShove = btnCallShove[h] > 0.5 ? btnCallShoveEv(h, oppShove) : -OPEN;
    const vsCall = Number.isNaN(FLOP_EV[1][h]) ? -OPEN : FLOP_EV[1][h] - BTN_IN_ON_CALL;
    btnOpen[h] = bbFoldF * DEAD_TO_BTN + callF * vsCall + shoveF * vsShove > 0 ? 1 : 0;
  }

  for (let j = 0; j < N; j++) {
    accOpen[j] += btnOpen[j];
    accCallShove[j] += btnCallShove[j];
    accBbCall[j] += bbCall[j];
    accBbShove[j] += bbShove[j];
    btnOpen[j] = accOpen[j] / t;
    btnCallShove[j] = accCallShove[j] / t;
    bbCall[j] = accBbCall[j] / t;
    bbShove[j] = accBbShove[j] / t;
  }

  if (process.env.TRACE && (t === 1 || t % Math.max(1, Math.floor(ITERS / 8)) === 0)) {
    console.log(
      `  t=${String(t).padStart(6)}  BTN열기 ${(frequency(btnOpen) * 100).toFixed(1)}%` +
        `  BTN콜 ${(frequency(btnCallShove) * 100).toFixed(1)}%` +
        `  BB콜 ${(frequency(bbCall) * 100).toFixed(1)}%` +
        `  BB올인 ${(frequency(bbShove) * 100).toFixed(1)}%`,
    );
  }
}

const round2 = (v: number) => Math.round(v * 100) / 100;
const asRange = (a: Float64Array) => {
  const out: Record<string, number> = {};
  for (let j = 0; j < N; j++) if (a[j] > 0.005) out[HANDS[j]] = round2(a[j]);
  return out;
};

// 채점에 쓸 액션별 EV. 화면에 그대로 나가는 값이다.
const btnOpenEv: number[] = [];
const bbEv: { fold: number; call: number; shove: number }[] = [];
const bbFoldFreq = 1 - frequency(bbCall) - frequency(bbShove);
for (let h = 0; h < N; h++) {
  const vsShove = Math.max(btnCallShoveEv(h, bbShove), -OPEN);
  const vsCall = Number.isNaN(FLOP_EV[1][h]) ? -OPEN : FLOP_EV[1][h] - BTN_IN_ON_CALL;
  btnOpenEv.push(
    round2(
      bbFoldFreq * DEAD_TO_BTN + frequency(bbCall) * vsCall + frequency(bbShove) * vsShove,
    ),
  );
  bbEv.push({
    fold: -BB_IN_ON_FOLD,
    call: Number.isNaN(FLOP_EV[0][h]) ? Number.NaN : round2(FLOP_EV[0][h] - BB_IN_ON_CALL),
    shove: round2(bbShoveEv(h, btnOpen, btnCallShove)),
  });
}

writeFileSync(
  OUT,
  JSON.stringify(
    {
      note: "BTN 오픈 대 BB 디펜스. EV는 순손익(bb), 폴드 기준이 아니라 이 핸드에서의 손익이다.",
      tableSize: 9,
      stackBb: STACK,
      anteBb: ANTE,
      openToBb: OPEN,
      boardCount: flopRaw.boardCount,
      iterations: ITERS,
      hands: HANDS,
      btn: {
        open: asRange(btnOpen),
        callVsShove: asRange(btnCallShove),
        openEvBb: btnOpenEv,
      },
      bb: {
        call: asRange(bbCall),
        shove: asRange(bbShove),
        evBb: bbEv.map((e) => ({
          fold: e.fold,
          call: Number.isNaN(e.call) ? null : e.call,
          shove: e.shove,
        })),
      },
    },
    null,
    1,
  ),
);

const pct = (a: Float64Array) => `${(frequency(a) * 100).toFixed(1)}%`;
console.log(`BTN 오픈 ${pct(btnOpen)} · 올인에 콜 ${pct(btnCallShove)}`);
console.log(`BB 콜 ${pct(bbCall)} · 3벳 올인 ${pct(bbShove)} · 폴드 ${(bbFoldFreq * 100).toFixed(1)}%`);
console.log(`\n오픈 레인지 상위: ${Object.keys(asRange(btnOpen)).slice(0, 24).join(" ")}`);
console.log(`BB 콜: ${Object.keys(asRange(bbCall)).slice(0, 20).join(" ")}`);
console.log(`BB 3벳: ${Object.keys(asRange(bbShove)).slice(0, 20).join(" ")}`);
console.log(`\n기록: ${OUT}`);
