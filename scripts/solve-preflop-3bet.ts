// 크기 있는 3벳까지 넣은 자리별 프리플랍 솔버.
//
// 실행: STACK=30 node --experimental-strip-types scripts/solve-preflop-3bet.ts
//   ITERS(기본 3000)로 반복 수를 조절한다.
//
// 구조는 solve-preflop-seats.ts와 같다. 자리마다 "앞은 다 접었고 내가 첫
// 진입"인 스팟을 따로 풀고, 뒤 자리들이 내 오픈에 대응하는 것을 같은 피셔스
// 플레이 안에서 함께 푼다. 뒤 자리 중 누가 먼저 받는지는 순서대로 흘린다.
//
// 여기서 더한 것:
//   오픈 대응   폴드 | 콜 | 3벳(IP 7.5 / 블라인드 9) | 올인
//   3벳 대응    (오프너) 폴드 | 콜 → 3벳 팟 플랍 | 4벳 올인
//   4벳 대응    (3벳한 자리) 폴드 | 콜
// 3벳이 나오면 그 뒤 자리는 접는다(콜드 콜·콜드 4벳은 다루지 않는다).
//
// 3벳 팟 플랍의 가치는 src/data/flopev3-<오프너 구간>-<ip|bb|sb>[-깊이].json이
// 있으면 그 표(솔버가 푼 플랍 루트 EV)를, 없으면 "승률 × 팟"을 쓴다. SPR이 1
// 안팎이라 출발점으로는 쓸 만하지만 근사다 — 어느 쪽을 썼는지 출력하고 파일의
// note에도 남긴다.
//
// EV는 전부 "판을 시작할 때 대비 순손익"이다. 폴드는 이미 낸 돈의 마이너스다.
//
// solve-preflop-seats.ts와 달리 올인 계열 EV를 폴드 대비가 아니라 순손익으로
// 계산한다. 그쪽은 올인·올인 콜을 "승률 × 팟 − (스택 − 낸 블라인드)"(폴드 대비
// 값)로 내면서 폴드를 "−낸 블라인드"(순손익)로 두어, 블라인드의 올인 계열이
// 낸 블라인드만큼(BB 2bb, SB 0.5bb) 좋게 매겨진다. 또 오프너가 SB일 때 3벳
// 올인으로 뺏는 몫에 SB의 0.5를 두 번 센다. 여기서는 관여하지 않은 자리의 죽은
// 돈(rest)을 따로 세어 둘 다 없앤다.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { ANTE_BB, OPEN_TO_BB, STACK_BB, threeBetChips, threeBetTo, withDepth } from "./game.ts";

const OUT = withDepth("src/data/preflop-seats.json");
const ITERS = Number(process.env.ITERS ?? 3000);

type EquityTable = { hands: string[]; equity: number[] };
type FlopValues = {
  startingPotBb: number;
  hands: string[];
  flopEvBb: [(number | null)[], (number | null)[]];
};

const eq = JSON.parse(readFileSync("scripts/data/equity.json", "utf8")) as EquityTable;
const HANDS = eq.hands;
const N = HANDS.length;
const EQ = eq.equity;
const COMBOS = HANDS.map((c) => (c.length === 2 ? 6 : c.endsWith("s") ? 4 : 12));

const SEATS = ["UTG", "UTG1", "UTG2", "LJ", "HJ", "CO", "BTN", "SB", "BB"];
const STACK = STACK_BB;
const ANTE = ANTE_BB;
const OPEN = OPEN_TO_BB;
const posted = (seat: string) => (seat === "BB" ? 1 + ANTE : seat === "SB" ? 0.5 : 0);
const DEAD = 0.5 + (1 + ANTE);

/** 오프너 o와 상대 k 말고 판에 남은 죽은 돈(블라인드·앤티). */
const rest = (o: string, k: string) => DEAD - posted(o) - posted(k);
/** 3벳한 자리가 낸 총액. BB의 앤티는 3벳액과 따로 이미 낸 돈이다. */
const threeBetPut = (k: string) => threeBetTo(k) + (k === "BB" ? ANTE : 0);
/** 3벳 팟의 플랍 팟. 오프너는 3벳액만큼(블라인드 포함) 냈다. */
const pot3 = (o: string, k: string) => threeBetTo(k) + threeBetPut(k) + rest(o, k);
/** 올인 대결의 팟. 스택에는 블라인드·앤티가 들어 있다. */
const allinPot = (o: string, k: string) => 2 * STACK + rest(o, k);

// 팟 계산이 파이프라인(game.ts)과 한 칩이라도 어긋나면 보드와 풀이가 다른
// 게임이 된다. 시작할 때 모든 조합을 맞춰 본다.
for (let a = 0; a < SEATS.length - 1; a++) {
  for (let b = a + 1; b < SEATS.length; b++) {
    const o = SEATS[a];
    const k = SEATS[b];
    const want = threeBetChips(o, k).pot / 10;
    if (Math.abs(pot3(o, k) - want) > 1e-9) {
      throw new Error(`3벳 팟이 game.ts와 다릅니다: ${o}/${k} ${pot3(o, k)} ≠ ${want}`);
    }
  }
}

// ── 단일 레이즈 팟 플랍 EV (solve-preflop-seats.ts와 같다) ─────────────────

const BUCKET_OF: Record<string, string> = {
  UTG: "early",
  UTG1: "early",
  UTG2: "early",
  LJ: "middle",
  HJ: "middle",
  CO: "late",
  BTN: "late",
  SB: "sb",
};

function readValues(path: string): FlopValues | null {
  return existsSync(path) ? (JSON.parse(readFileSync(path, "utf8")) as FlopValues) : null;
}

function toTable(src: FlopValues): [number[], number[]] {
  const idx = new Map(src.hands.map((h, i) => [h, i]));
  const out: [number[], number[]] = [[], []];
  for (const p of [0, 1] as const) {
    for (const code of HANDS) {
      const i = idx.get(code);
      out[p].push(i === undefined ? Number.NaN : (src.flopEvBb[p][i] ?? Number.NaN));
    }
  }
  return out;
}

const DEFAULT_FLOPEV = existsSync(withDepth("src/data/preflop-flopev.json"))
  ? withDepth("src/data/preflop-flopev.json")
  : withDepth("src/data/flopev-late.json");
const DEFAULT_EV = toTable(readValues(DEFAULT_FLOPEV)!);
const BUCKET_EV: Record<string, [number[], number[]]> = {};
for (const name of new Set(Object.values(BUCKET_OF))) {
  const v = readValues(withDepth(`src/data/flopev-${name}.json`));
  if (v) BUCKET_EV[name] = toTable(v);
}
const flopTableFor = (opener: string) => BUCKET_EV[BUCKET_OF[opener] ?? ""] ?? DEFAULT_EV;

/**
 * BB가 아닌 콜러의 단일 레이즈 팟 표(flopev-<구간>-ip / -sb). pipeline-threebet.ts가
 * 만든다. 없으면 BB 콜러 표로 떨어지는데, 그러면 뒷자리 플랫이 포지션 없는
 * 값으로 매겨진다 — CO 오픈에 BTN이 1.2%만 콜하는 답이 그렇게 나왔다.
 */
const CALLER_EV: Record<string, [number[], number[]]> = {};
for (const name of new Set(Object.values(BUCKET_OF))) {
  for (const kind of ["ip", "sb"]) {
    const v = readValues(withDepth(`src/data/flopev-${name}-${kind}.json`));
    if (v) CALLER_EV[`${name}-${kind}`] = toTable(v);
  }
}

/**
 * 오프너 o의 오픈에 k가 콜했을 때 쓸 표와, 그 표에서 콜러가 OOP(0번)인지.
 * 블라인드 콜러는 오프너보다 먼저 치고, 그 밖의 콜러는 뒤에서 친다. SB 콜러
 * 표는 SB를 OOP로 풀었다. BB 콜러 표는 BB를 OOP로 풀었다(SB 오픈도 그렇게
 * 풀려 있다 — 실제로는 SB가 먼저 친다. 알려진 근사다).
 */
function callTable(o: string, k: string): { table: [number[], number[]]; callerOop: boolean } {
  const bucket = BUCKET_OF[o] ?? "";
  if (k === "BB") return { table: flopTableFor(o), callerOop: true };
  const own = CALLER_EV[`${bucket}-${k === "SB" ? "sb" : "ip"}`];
  if (own) return { table: own, callerOop: k === "SB" };
  return { table: flopTableFor(o), callerOop: true };
}

// ── 3벳 팟 플랍 EV ───────────────────────────────────────────────────────

/** 3벳한 쪽의 종류. 블라인드는 오프너보다 먼저 치고, SB 오픈에는 BB만 3벳한다. */
const threeBetKind = (k: string) => (k === "BB" ? "bb" : k === "SB" ? "sb" : "ip");
const flop3Name = (o: string, k: string) => `${BUCKET_OF[o]}-${threeBetKind(k)}`;

/**
 * 3벳 팟에서 3벳한 쪽이 플랍에서 먼저 치는가(OOP).
 * 블라인드 3벳은 오프너보다 먼저 친다. 단 SB 오픈에 BB가 3벳하면 SB가 먼저다.
 */
const threeBettorOop = (o: string, k: string) => threeBetKind(k) !== "ip" && o !== "SB";

const FLOP3_EV: Record<string, [number[], number[]]> = {};
for (const o of Object.keys(BUCKET_OF)) {
  for (const k of SEATS.slice(SEATS.indexOf(o) + 1)) {
    const name = flop3Name(o, k);
    if (name in FLOP3_EV) continue;
    const v = readValues(withDepth(`src/data/flopev3-${name}.json`));
    if (v) FLOP3_EV[name] = toTable(v);
  }
}
const flop3Used = Object.keys(FLOP3_EV);

// ── 3인 팟 몫 ────────────────────────────────────────────────────────────

/**
 * 플랫 뒤 오버콜로 셋이 플랍에 갔을 때 각자의 몫(bb). scripts/multiway-values.ts가
 * 만든다. 없으면 오버콜을 풀지 않는다(플랫 뒤는 폴드 / 스퀴즈뿐).
 */
type Trio = { opener: (number | null)[]; caller: (number | null)[]; overcaller: (number | null)[] };
const MW_PATH = withDepth("src/data/multiway.json");
const MW: { hands: string[]; trios: Record<string, Record<string, Record<string, Trio>>> } | null =
  existsSync(MW_PATH) ? JSON.parse(readFileSync(MW_PATH, "utf8")) : null;
/** 3인 팟 몫을 HANDS 순서의 배열로. 값이 없는 핸드는 NaN. */
function mwShares(o: string, k: string, m: string): { o: number[]; k: number[]; m: number[] } | null {
  const t = MW?.trios?.[o]?.[k]?.[m];
  if (!MW || !t) return null;
  const idx = new Map(MW.hands.map((h, i) => [h, i]));
  const conv = (arr: (number | null)[]) =>
    HANDS.map((h) => {
      const i = idx.get(h);
      const v = i === undefined ? null : arr[i];
      return v === null || v === undefined ? Number.NaN : v;
    });
  return { o: conv(t.opener), k: conv(t.caller), m: conv(t.overcaller) };
}

// ── 승률 ────────────────────────────────────────────────────────────────

/** 레인지 하나에 대한 169개 핸드 각각의 승률. 조합 수로 가중한다. */
function equityVector(range: Float64Array): Float64Array {
  const out = new Float64Array(N);
  let total = 0;
  for (let j = 0; j < N; j++) total += range[j] * COMBOS[j];
  if (total === 0) return out;
  for (let i = 0; i < N; i++) {
    const base = i * N;
    let w = 0;
    for (let j = 0; j < N; j++) {
      const x = range[j] * COMBOS[j];
      if (x !== 0) w += x * EQ[base + j];
    }
    out[i] = w / total;
  }
  return out;
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

function times(a: Float64Array, b: Float64Array): Float64Array {
  const out = new Float64Array(N);
  for (let i = 0; i < N; i++) out[i] = a[i] * b[i];
  return out;
}

const flat = (v: number) => new Float64Array(N).fill(v);

// ── 한 자리의 스팟 ──────────────────────────────────────────────────────

type Strategy = {
  open: Float64Array;
  openJam: Float64Array;
  /** 뒤 자리 k마다. */
  vCall: Float64Array[];
  vThree: Float64Array[];
  vJam: Float64Array[];
  vJamCall: Float64Array[];
  /** 오프너가 k의 3벳 올인에 콜. */
  cJam: Float64Array[];
  /** 오프너가 k의 3벳에 콜 / 4벳 올인. */
  oCall3: Float64Array[];
  oJam4: Float64Array[];
  /** k가 오프너의 4벳에 콜. */
  kCall4: Float64Array[];
  /**
   * 플랫 뒤 스퀴즈. [k = 플랫한 자리][m = k 뒤의 자리 순번(behind.slice(k + 1))].
   * m의 스퀴즈 올인, 오프너의 콜, (오프너가 접은 뒤) k의 콜.
   */
  sq: Float64Array[][];
  /** [k][m]: m의 오버콜(3인 팟). 3인 팟 몫 표가 없으면 쓰지 않는다. */
  oc: Float64Array[][];
  oSq: Float64Array[][];
  kSq: Float64Array[][];
};

type Values = {
  open: Float64Array;
  openJam: Float64Array;
  callJam: Float64Array[];
  call3: Float64Array[];
  jam4: Float64Array[];
  vsCall: Float64Array[];
  vsThree: Float64Array[];
  vsJam: Float64Array[];
  vsJamCall: Float64Array[];
  call4: Float64Array[];
  /** k가 플랫했을 때 오프너의 가치(스퀴즈를 맞을 수 있다). */
  flatOpener: Float64Array[];
  /** [k][m]: m의 스퀴즈 EV, 오프너의 스퀴즈 콜 EV, k의 스퀴즈 콜 EV. */
  sqEv: Float64Array[][];
  oSqCall: Float64Array[][];
  kSqCall: Float64Array[][];
  /** [k][m]: m의 오버콜 EV. 표가 없으면 -Infinity(고르지 않는다). */
  ocEv: Float64Array[][];
};

/**
 * 지금 전략을 상대로 각 결정의 액션별 EV(순손익, bb). 반복과 최종 출력이
 * 같은 식을 쓴다 — 식이 두 벌이면 하나만 고쳐져 채점 EV와 전략이 어긋난다.
 */
function values(hero: string, behind: string[], s: Strategy): Values {
  const heroPosted = posted(hero);
  // 콜러마다 표가 다르다(포지션과 레인지가 다르다).
  const callTables = behind.map((k) => callTable(hero, k));
  const nK = behind.length;

  // 뒤 자리 중 누가 먼저 받는가.
  const firstCall: number[] = [];
  const firstThree: number[] = [];
  const firstJam: number[] = [];
  let survive = 1;
  for (let k = 0; k < nK; k++) {
    const c = freq(s.vCall[k]);
    const t = freq(s.vThree[k]);
    const j = freq(s.vJam[k]);
    firstCall.push(survive * c);
    firstThree.push(survive * t);
    firstJam.push(survive * j);
    survive *= Math.max(0, 1 - c - t - j);
  }
  const allFold = survive;

  const firstJamCall: number[] = [];
  let surviveJam = 1;
  for (let k = 0; k < nK; k++) {
    const c = freq(s.vJamCall[k]);
    firstJamCall.push(surviveJam * c);
    surviveJam *= 1 - c;
  }

  const openFreq = freq(s.open);
  const v: Values = {
    open: new Float64Array(N),
    openJam: new Float64Array(N),
    callJam: [],
    call3: [],
    jam4: [],
    vsCall: [],
    vsThree: [],
    vsJam: [],
    vsJamCall: [],
    call4: [],
    flatOpener: [],
    sqEv: [],
    oSqCall: [],
    kSqCall: [],
    ocEv: [],
  };

  for (let k = 0; k < nK; k++) {
    const seat = behind[k];
    const r = rest(hero, seat);
    const aPot = allinPot(hero, seat);
    const p3 = pot3(hero, seat);
    const t = threeBetTo(seat);
    const kInv = threeBetPut(seat);
    const table3 = FLOP3_EV[flop3Name(hero, seat)];
    const kOop = threeBettorOop(hero, seat);

    // 오프너 쪽
    const eqVsJam3 = equityVector(s.vJam[k]);
    const eqVsThree = equityVector(s.vThree[k]);
    const threeAndCall4 = times(s.vThree[k], s.kCall4[k]);
    const threeFreq = freq(s.vThree[k]);
    const c4 = threeFreq > 0 ? freq(threeAndCall4) / threeFreq : 0;
    const eqVsCall4 = equityVector(threeAndCall4);

    const callJam = new Float64Array(N);
    const call3 = new Float64Array(N);
    const jam4 = new Float64Array(N);
    for (let h = 0; h < N; h++) {
      callJam[h] = eqVsJam3[h] * aPot - STACK;
      const tv = table3?.[kOop ? 1 : 0][h];
      const share = tv !== undefined && !Number.isNaN(tv) ? tv : eqVsThree[h] * p3;
      call3[h] = share - t;
      jam4[h] = (1 - c4) * (kInv + r) + c4 * (eqVsCall4[h] * aPot - STACK);
    }
    v.callJam.push(callJam);
    v.call3.push(call3);
    v.jam4.push(jam4);

    // 뒤 자리 쪽. 오프너의 대응 비율은 "열었다는 조건 아래"여야 한다 — 전체
    // 핸드 기준이면 오픈 레인지 밖 핸드까지 분모에 들어가 3벳이 공짜가 된다.
    const openCallJam = times(s.open, s.cJam[k]);
    const openCall3 = times(s.open, s.oCall3[k]);
    const openJam4 = times(s.open, s.oJam4[k]);
    const pj3 = openFreq > 0 ? freq(openCallJam) / openFreq : 0;
    const pc = openFreq > 0 ? freq(openCall3) / openFreq : 0;
    const pj = openFreq > 0 ? freq(openJam4) / openFreq : 0;
    const eqVsOpenCallJam = equityVector(openCallJam);
    const eqVsOpenCall3 = equityVector(openCall3);
    const eqVsOpenJam4 = equityVector(openJam4);
    const eqVsOpenJam = equityVector(s.openJam);

    const vsCall = new Float64Array(N);
    const vsThree = new Float64Array(N);
    const vsJam = new Float64Array(N);
    const vsJamCall = new Float64Array(N);
    const call4 = new Float64Array(N);
    const paid = OPEN + (seat === "BB" ? ANTE : 0);

    // ── 플랫 뒤 스퀴즈 ──────────────────────────────────────────────────
    // k 뒤의 자리 m이 차례로 스퀴즈 올인할 수 있다. 오프너가 먼저 답하고, 접으면
    // k가 답한다. 콜은 한 명까지. 이게 없으면 플랫이 블라인드·앤티를 공짜로
    // 먹어 뒷자리 플랫이 49%까지 넓어진다(2026-09-27).
    const after = behind.slice(k + 1);
    const flatFreq = freq(s.vCall[k]);
    let noSq = 1;
    const firstSq: number[] = [];
    const firstOc: number[] = [];
    const ocEv: Float64Array[] = [];
    const mwAfter = after.map((m) => mwShares(hero, seat, m));
    const pO: number[] = [];
    const sqEv: Float64Array[] = [];
    const oSqCall: Float64Array[] = [];
    const kSqCall: Float64Array[] = [];
    for (let mi = 0; mi < after.length; mi++) {
      const m = after[mi];
      const f = freq(s.sq[k][mi]);
      const g = mwAfter[mi] ? freq(s.oc[k][mi]) : 0;
      firstSq.push(noSq * f);
      firstOc.push(noSq * g);
      noSq *= Math.max(0, 1 - f - g);
      // m의 오버콜: 3인 팟 몫 − 낸 것. 몫이 없으면 고르지 않는다.
      const mw = mwAfter[mi];
      const oce = new Float64Array(N).fill(Number.NEGATIVE_INFINITY);
      if (mw) {
        const mPut = OPEN + (m === "BB" ? ANTE : 0);
        for (let x = 0; x < N; x++) if (!Number.isNaN(mw.m[x])) oce[x] = mw.m[x] - mPut;
      }
      ocEv.push(oce);
      // 셋 말고 판에 남은 죽은 돈
      const r3 = DEAD - posted(hero) - posted(seat) - posted(m);
      const potO = 2 * STACK + paid + r3; // 오프너가 콜: 플랫한 k의 돈은 죽는다
      const potK = 2 * STACK + OPEN + r3; // k가 콜: 오프너의 오픈액은 죽는다
      const eqVsSq = equityVector(s.sq[k][mi]);
      const oc = new Float64Array(N);
      const kc = new Float64Array(N);
      for (let i = 0; i < N; i++) {
        oc[i] = eqVsSq[i] * potO - STACK;
        kc[i] = eqVsSq[i] * potK - STACK;
      }
      oSqCall.push(oc);
      kSqCall.push(kc);

      // 스퀴즈한 쪽. 대응 비율은 "열었다 / 플랫했다는 조건 아래".
      const openCallSq = times(s.open, s.oSq[k][mi]);
      const po = openFreq > 0 ? freq(openCallSq) / openFreq : 0;
      const flatCallSq = times(s.vCall[k], s.kSq[k][mi]);
      const pk = flatFreq > 0 ? freq(flatCallSq) / flatFreq : 0;
      pO.push(po);
      const eqVsOC = equityVector(openCallSq);
      const eqVsKC = equityVector(flatCallSq);
      const winAll = OPEN + paid + r3;
      const se = new Float64Array(N);
      for (let x = 0; x < N; x++) {
        se[x] =
          (1 - po) * (1 - pk) * winAll +
          po * (eqVsOC[x] * potO - STACK) +
          (1 - po) * pk * (eqVsKC[x] * potK - STACK);
      }
      sqEv.push(se);
    }
    v.sqEv.push(sqEv);
    v.oSqCall.push(oSqCall);
    v.kSqCall.push(kSqCall);
    v.ocEv.push(ocEv);

    const ct = callTables[k];
    const flatOpener = new Float64Array(N);
    for (let h = 0; h < N; h++) {
      const fv = ct.table[ct.callerOop ? 1 : 0][h];
      let e = noSq * (Number.isNaN(fv) ? -OPEN : fv - OPEN);
      for (let mi = 0; mi < after.length; mi++) {
        e += firstSq[mi] * Math.max(-OPEN, oSqCall[mi][h]);
        // 3인 팟. 몫이 없는 핸드는 팟을 못 가져가는 것으로 본다.
        const mw = mwAfter[mi];
        if (firstOc[mi] > 0 && mw) e += firstOc[mi] * ((Number.isNaN(mw.o[h]) ? 0 : mw.o[h]) - OPEN);
      }
      flatOpener[h] = e;
    }
    v.flatOpener.push(flatOpener);

    for (let j = 0; j < N; j++) {
      const fv = ct.table[ct.callerOop ? 0 : 1][j];
      let e = noSq * (Number.isNaN(fv) ? -paid : fv - paid);
      // 오프너가 콜하면 k는 접고 낸 것을 잃는다. 오프너가 접으면 k가 고른다.
      for (let mi = 0; mi < after.length; mi++) {
        e += firstSq[mi] * (pO[mi] * -paid + (1 - pO[mi]) * Math.max(-paid, kSqCall[mi][j]));
        const mw = mwAfter[mi];
        if (firstOc[mi] > 0 && mw) e += firstOc[mi] * ((Number.isNaN(mw.k[j]) ? 0 : mw.k[j]) - paid);
      }
      vsCall[j] = e;

      // 3벳 올인: 오프너가 접으면 오픈액과 죽은 돈을 가져온다.
      vsJam[j] = (1 - pj3) * (OPEN + r) + pj3 * (eqVsOpenCallJam[j] * aPot - STACK);

      // 크기 있는 3벳
      call4[j] = eqVsOpenJam4[j] * aPot - STACK;
      const tv = table3?.[kOop ? 0 : 1][j];
      const share = tv !== undefined && !Number.isNaN(tv) ? tv : eqVsOpenCall3[j] * p3;
      vsThree[j] =
        Math.max(0, 1 - pc - pj) * (OPEN + r) +
        pc * (share - kInv) +
        pj * Math.max(-kInv, call4[j]);

      // 오프너의 오픈 올인에 콜
      vsJamCall[j] = eqVsOpenJam[j] * aPot - STACK;
    }
    v.vsCall.push(vsCall);
    v.vsThree.push(vsThree);
    v.vsJam.push(vsJam);
    v.vsJamCall.push(vsJamCall);
    v.call4.push(call4);
  }

  // 오프너의 첫 진입. 오픈 올인을 받는 레인지의 승률은 핸드마다 다시 셀 필요가
  // 없다 — 자리마다 한 번만 센다.
  const eqVsJamCall = behind.map((_, k) =>
    firstJamCall[k] > 0 ? equityVector(s.vJamCall[k]) : null,
  );
  for (let h = 0; h < N; h++) {
    let evOpen = allFold * (DEAD - heroPosted);
    for (let k = 0; k < nK; k++) {
      if (firstCall[k] > 0) evOpen += firstCall[k] * v.flatOpener[k][h];
      if (firstJam[k] > 0) evOpen += firstJam[k] * Math.max(v.callJam[k][h], -OPEN);
      if (firstThree[k] > 0) {
        evOpen += firstThree[k] * Math.max(-OPEN, v.call3[k][h], v.jam4[k][h]);
      }
    }
    v.open[h] = evOpen;

    let evJam = surviveJam * (DEAD - heroPosted);
    for (let k = 0; k < nK; k++) {
      const e = eqVsJamCall[k];
      if (!e) continue;
      evJam += firstJamCall[k] * (e[h] * allinPot(hero, behind[k]) - STACK);
    }
    v.openJam[h] = evJam;
  }
  return v;
}

/** 이 핸드가 고를 액션: EV가 가장 높은 것 하나. 동률이면 앞의 것(소극적인 쪽). */
function bestIndex(evs: number[]): number {
  let best = 0;
  for (let i = 1; i < evs.length; i++) if (evs[i] > evs[best] + 1e-12) best = i;
  return best;
}

type SeatResult = { strategy: Strategy; values: Values; behind: string[] };

function solveSeat(heroIdx: number): SeatResult {
  const hero = SEATS[heroIdx];
  const behind = SEATS.slice(heroIdx + 1);
  const nK = behind.length;
  const s: Strategy = {
    open: flat(0.2),
    openJam: flat(0.05),
    vCall: behind.map(() => flat(0.15)),
    vThree: behind.map(() => flat(0.06)),
    vJam: behind.map(() => flat(0.04)),
    vJamCall: behind.map(() => flat(0.2)),
    cJam: behind.map(() => flat(0.4)),
    oCall3: behind.map(() => flat(0.4)),
    oJam4: behind.map(() => flat(0.1)),
    kCall4: behind.map(() => flat(0.3)),
    sq: behind.map((_, k) => behind.slice(k + 1).map(() => flat(0.05))),
    oSq: behind.map((_, k) => behind.slice(k + 1).map(() => flat(0.3))),
    kSq: behind.map((_, k) => behind.slice(k + 1).map(() => flat(0.3))),
    oc: behind.map((_, k) => behind.slice(k + 1).map(() => flat(MW ? 0.05 : 0))),
  };
  const heroFold = -posted(hero);

  for (let iter = 0; iter < ITERS; iter++) {
    const v = values(hero, behind, s);
    const rate = 1 / (iter + 2);
    const step = (a: Float64Array, i: number, target: number) => {
      a[i] += (target - a[i]) * rate;
    };
    for (let h = 0; h < N; h++) {
      const b = bestIndex([heroFold, v.open[h], v.openJam[h]]);
      step(s.open, h, b === 1 ? 1 : 0);
      step(s.openJam, h, b === 2 ? 1 : 0);
      for (let k = 0; k < nK; k++) {
        step(s.cJam[k], h, v.callJam[k][h] > -OPEN ? 1 : 0);
        const r3 = bestIndex([-OPEN, v.call3[k][h], v.jam4[k][h]]);
        step(s.oCall3[k], h, r3 === 1 ? 1 : 0);
        step(s.oJam4[k], h, r3 === 2 ? 1 : 0);
      }
    }
    for (let k = 0; k < nK; k++) {
      const seat = behind[k];
      const fold = -posted(seat);
      const kInv = threeBetPut(seat);
      for (let j = 0; j < N; j++) {
        const b = bestIndex([fold, v.vsCall[k][j], v.vsThree[k][j], v.vsJam[k][j]]);
        step(s.vCall[k], j, b === 1 ? 1 : 0);
        step(s.vThree[k], j, b === 2 ? 1 : 0);
        step(s.vJam[k], j, b === 3 ? 1 : 0);
        step(s.vJamCall[k], j, v.vsJamCall[k][j] > fold ? 1 : 0);
        step(s.kCall4[k], j, v.call4[k][j] > -kInv ? 1 : 0);
      }
      // 플랫 뒤 스퀴즈: m의 스퀴즈, 오프너의 콜, k의 콜.
      const paid = OPEN + (seat === "BB" ? ANTE : 0);
      behind.slice(k + 1).forEach((m, mi) => {
        const mFold = -posted(m);
        for (let x = 0; x < N; x++) {
          // 폴드 / 오버콜 / 스퀴즈 중 가장 나은 것.
          const b = bestIndex([mFold, v.ocEv[k][mi][x], v.sqEv[k][mi][x]]);
          step(s.oc[k][mi], x, b === 1 ? 1 : 0);
          step(s.sq[k][mi], x, b === 2 ? 1 : 0);
          step(s.oSq[k][mi], x, v.oSqCall[k][mi][x] > -OPEN ? 1 : 0);
          step(s.kSq[k][mi], x, v.kSqCall[k][mi][x] > -paid ? 1 : 0);
        }
      });
    }
  }
  return { strategy: s, values: values(hero, behind, s), behind };
}

/**
 * 결정당 평균 후회(bb). 각 결정에서 "최선 액션의 EV − 지금 섞은 전략의 EV"를
 * 그 결정에 올 확률(조합 수 × 도달 빈도)로 가중해 평균낸다. 0에 가까울수록
 * 수렴했다. 착취가능성 자체는 아니지만 수렴을 확인하는 데는 충분하다.
 */
function regret(hero: string, r: SeatResult): { avg: number; worst: number; worstAt: string } {
  const { strategy: s, values: v, behind } = r;
  let sum = 0;
  let weight = 0;
  let worst = 0;
  let worstAt = "";
  const add = (name: string, w: number, evs: number[], mix: number[]) => {
    if (w <= 0) return;
    const best = Math.max(...evs);
    let played = 0;
    for (let a = 0; a < evs.length; a++) played += mix[a] * evs[a];
    const g = best - played;
    sum += w * g;
    weight += w;
    if (g > worst && w > 0.5) {
      worst = g;
      worstAt = name;
    }
  };
  const heroFold = -posted(hero);
  for (let h = 0; h < N; h++) {
    const o = s.open[h];
    const jm = s.openJam[h];
    add(`${hero} ${HANDS[h]} 첫 진입`, COMBOS[h], [heroFold, v.open[h], v.openJam[h]], [
      Math.max(0, 1 - o - jm),
      o,
      jm,
    ]);
  }
  behind.forEach((seat, k) => {
    const fold = -posted(seat);
    for (let j = 0; j < N; j++) {
      const c = s.vCall[k][j];
      const t = s.vThree[k][j];
      const jm = s.vJam[k][j];
      add(
        `${seat} ${HANDS[j]} vs ${hero} 오픈`,
        COMBOS[j],
        [fold, v.vsCall[k][j], v.vsThree[k][j], v.vsJam[k][j]],
        [Math.max(0, 1 - c - t - jm), c, t, jm],
      );
    }
    for (let h = 0; h < N; h++) {
      const c = s.oCall3[k][h];
      const jm = s.oJam4[k][h];
      add(
        `${hero} ${HANDS[h]} vs ${seat} 3벳`,
        COMBOS[h] * s.open[h],
        [-OPEN, v.call3[k][h], v.jam4[k][h]],
        [Math.max(0, 1 - c - jm), c, jm],
      );
    }
  });
  return { avg: weight > 0 ? sum / weight : 0, worst, worstAt };
}

// ── 풀고 쓰기 ────────────────────────────────────────────────────────────

console.log(
  `${STACK}bb · 반복 ${ITERS} · 3벳 IP ${threeBetTo("BTN")} / 블라인드 ${threeBetTo("BB")}\n` +
    `3벳 팟 플랍 EV: ${flop3Used.length > 0 ? flop3Used.join(", ") : "없음 — 승률 × 팟으로 근사"}
` +
    `BB 아닌 콜러 표: ${Object.keys(CALLER_EV).length > 0 ? Object.keys(CALLER_EV).join(", ") : "없음 — BB 콜러 표로 대신"}`,
);

const started = Date.now();
const results: Record<string, SeatResult> = {};
SEATS.forEach((seat, i) => {
  if (seat === "BB") return;
  results[seat] = solveSeat(i);
  console.log(`  ${seat} 완료 · ${((Date.now() - started) / 1000).toFixed(0)}초`);
});

const asEv = (a: Float64Array) => Array.from(a, (x) => Math.round(x * 100) / 100);
const asRange = (a: Float64Array) => {
  const out: Record<string, number> = {};
  for (let j = 0; j < N; j++) if (a[j] > 0.005) out[HANDS[j]] = Math.round(a[j] * 100) / 100;
  return out;
};

const seatsOut: Record<string, unknown> = {};
for (const [seat, r] of Object.entries(results)) {
  const { strategy: s, values: v, behind } = r;
  const per = <T,>(arr: T[], f: (x: T) => unknown) =>
    Object.fromEntries(behind.map((b, k) => [b, f(arr[k])]));
  // [플랫한 자리][그 뒤의 자리] — 엔진의 vsFlatJam 등과 같은 모양.
  const perFlat = <T,>(arr: T[][], f: (x: T) => unknown) =>
    Object.fromEntries(
      behind.map((b, k) => [
        b,
        Object.fromEntries(behind.slice(k + 1).map((m, mi) => [m, f(arr[k][mi])])),
      ]),
    );
  seatsOut[seat] = {
    open: asRange(s.open),
    openJam: asRange(s.openJam),
    callJam: per(s.cJam, asRange),
    vsOpenCall: per(s.vCall, asRange),
    vsOpenJam: per(s.vJam, asRange),
    vsJamCall: per(s.vJamCall, asRange),
    vsOpenThreeBet: per(s.vThree, asRange),
    vsThreeBetCall: per(s.oCall3, asRange),
    vsThreeBetJam: per(s.oJam4, asRange),
    vsFourBetCall: per(s.kCall4, asRange),
    vsFlatJam: perFlat(s.sq, asRange),
    vsSqueezeOpenerCall: perFlat(s.oSq, asRange),
    vsSqueezeCallerCall: perFlat(s.kSq, asRange),
    // 3인 팟 몫 표가 있을 때만 오버콜을 싣는다. 없으면 엔진이 오버콜을 열지 않는다.
    ...(MW ? { vsFlatCall: perFlat(s.oc, asRange) } : {}),
    foldEvBb: -posted(seat),
    ev: {
      open: asEv(v.open),
      openJam: asEv(v.openJam),
      vsOpenCall: per(v.vsCall, asEv),
      vsOpenJam: per(v.vsJam, asEv),
      callJam: per(v.callJam, asEv),
      vsJamCall: per(v.vsJamCall, asEv),
      vsOpenThreeBet: per(v.vsThree, asEv),
      vsThreeBetCall: per(v.call3, asEv),
      vsThreeBetJam: per(v.jam4, asEv),
      vsFourBetCall: per(v.call4, asEv),
      vsFlatJam: perFlat(v.sqEv, asEv),
      vsSqueezeOpenerCall: perFlat(v.oSqCall, asEv),
      vsSqueezeCallerCall: perFlat(v.kSqCall, asEv),
      ...(MW ? { vsFlatCall: perFlat(v.ocEv, asEv) } : {}),
    },
  };
}

writeFileSync(
  OUT,
  JSON.stringify(
    {
      note:
        `자리별 프리플랍, 크기 있는 3벳 포함(scripts/solve-preflop-3bet.ts). ` +
        `3벳 팟 플랍: ${flop3Used.length > 0 ? `솔버 표 ${flop3Used.join(", ")}` : "승률 × 팟 근사(0회차)"}.`,
      tableSize: 9,
      stackBb: STACK,
      anteBb: ANTE,
      openToBb: OPEN,
      threeBetToBb: { ip: threeBetTo("BTN"), blind: threeBetTo("BB") },
      iterations: ITERS,
      hands: HANDS,
      seats: seatsOut,
    },
    null,
    1,
  ),
);

// ── 요약 ────────────────────────────────────────────────────────────────

const pct = (x: number) => `${(x * 100).toFixed(1)}%`.padStart(6);
console.log("\n자리    오픈  오픈올인 │ BB 대응: 콜 / 3벳 / 올인 │ 3벳 받은 오프너: 폴드 / 콜 / 4벳  │ 후회(평균·최대)");
let regretSum = 0;
let regretN = 0;
for (const [seat, r] of Object.entries(results)) {
  const { strategy: s, behind } = r;
  const k = behind.indexOf("BB");
  const bb =
    k >= 0
      ? `${pct(freq(s.vCall[k]))} ${pct(freq(s.vThree[k]))} ${pct(freq(s.vJam[k]))}`
      : "     —      —      —";
  const of = freq(s.open);
  const vs3 =
    k >= 0 && of > 0
      ? (() => {
          const c = freq(times(s.open, s.oCall3[k])) / of;
          const j = freq(times(s.open, s.oJam4[k])) / of;
          return `${pct(1 - c - j)} ${pct(c)} ${pct(j)}`;
        })()
      : "     —      —      —";
  const g = regret(seat, r);
  regretSum += g.avg;
  regretN += 1;
  console.log(
    `  ${seat.padEnd(5)}${pct(of)}${pct(freq(s.openJam))} │ ${bb} │ ${vs3} │ ${g.avg.toFixed(4)} · ${g.worst.toFixed(3)} (${g.worstAt})`,
  );
}
console.log("\n플랫과 스퀴즈");
for (const [opener, flatter] of [
  ["UTG", "CO"],
  ["CO", "BTN"],
  ["BTN", "SB"],
]) {
  const r = results[opener];
  const k = r.behind.indexOf(flatter);
  const bb = r.behind.slice(k + 1).indexOf("BB");
  console.log(
    `  ${opener} 오픈에 ${flatter} 플랫 ${pct(freq(r.strategy.vCall[k]))}` +
      ` · 그 뒤 BB 스퀴즈 ${bb >= 0 ? pct(freq(r.strategy.sq[k][bb])) : "  —"}` +
      ` · 오버콜 ${bb >= 0 && MW ? pct(freq(r.strategy.oc[k][bb])) : "  —"}`,
  );
}
console.log(`\n평균 후회 ${(regretSum / regretN).toFixed(4)}bb · ${((Date.now() - started) / 1000).toFixed(0)}초`);
console.log(`기록: ${OUT}`);
