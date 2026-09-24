// 플랍 전략 모델을 학습하고, 처음 보는 플랍에서 솔버와 비교한다.
//
// 실행: node --experimental-strip-types scripts/nn/train.ts
//
// 판정 기준은 채점이다. 앱은 액션별 EV 손실로 5단계 등급을 매기므로, 모델이
// 매긴 등급이 솔버가 매긴 등급과 같은지를 본다. 전략 빈도나 EV 오차는 참고다.
//
// 플랍 단위로 나눈다(핸드 단위로 섞으면 같은 보드를 학습과 검증에서 둘 다 보게
// 되어 점수가 부풀려진다). 뒤쪽 20%의 플랍이 검증용이다.

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { gradeByEvLoss } from "../../src/lib/grading.ts";
import { equityVsRange, FEATURE_COUNT, handFeatures } from "../../src/lib/nn/features.ts";
import { forward, type Layer, type StrategyModel } from "../../src/lib/nn/mlp.ts";

const DIR = process.env.NN_DIR ?? "scripts/data/nn/flops";
const OUT = process.env.NN_OUT ?? "scripts/data/nn";
const EQ_SAMPLES = Number(process.env.EQ_SAMPLES ?? 300);
const HIDDEN = Number(process.env.HIDDEN ?? 64);
const EPOCHS = Number(process.env.EPOCHS ?? 40);
const LR = Number(process.env.LR ?? 0.002);
const BATCH = 256;
const EV_WEIGHT = 4;

type FlopFile = {
  flop: string;
  potBb: number;
  handsByPlayer: [string[], string[]];
  weightsByPlayer: [number[], number[]];
  nodes: Record<string, { player: 0 | 1; actions: { kind: string; amountBb: number }[]; strategy: number[]; actionEv: number[] }>;
};

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

type Sample = { x: Float32Array; strat: number[]; evPot: number[]; ev: number[]; weight: number; flop: string };

/** 승률 계산이 가장 느리므로 플랍마다 한 번 계산해 곁에 둔다. */
function featuresFor(file: FlopFile): { equity: [number[], number[]]; rangeEq: [number, number] } {
  const cache = `${OUT}/features/${file.flop}-${EQ_SAMPLES}.json`;
  if (existsSync(cache)) return JSON.parse(readFileSync(cache, "utf8"));
  const flop = file.flop.match(/../g)!;
  const rnd = lcg(7);
  const equity = [0, 1].map((p) =>
    file.handsByPlayer[p].map((h) =>
      equityVsRange(flop, h, file.handsByPlayer[1 - p], file.weightsByPlayer[1 - p], EQ_SAMPLES, rnd),
    ),
  ) as [number[], number[]];
  const rangeEq = [0, 1].map((p) => {
    let s = 0, t = 0;
    equity[p].forEach((e, i) => { s += e * file.weightsByPlayer[p][i]; t += file.weightsByPlayer[p][i]; });
    return t ? s / t : 0.5;
  }) as [number, number];
  mkdirSync(`${OUT}/features`, { recursive: true });
  writeFileSync(cache, JSON.stringify({ equity, rangeEq }));
  return { equity, rangeEq };
}

const files = readdirSync(DIR)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => JSON.parse(readFileSync(`${DIR}/${f}`, "utf8")) as FlopFile);
if (files.length < 10) {
  console.error(`플랍이 ${files.length}개뿐입니다. 먼저 gen-flops.ts를 돌리세요.`);
  process.exit(1);
}
// 이름순 정렬은 무작위 플랍 목록에서 사실상 무작위 분할이다. 재현만 되면 된다.
const split = Math.floor(files.length * 0.8);
console.log(`플랍 ${files.length}개 · 학습 ${split} · 검증 ${files.length - split}`);

const t0 = Date.now();
const feats = files.map((f, i) => {
  if (i % 25 === 0) console.log(`  승률 계산 ${i}/${files.length}`);
  return featuresFor(f);
});
console.log(`  승률 계산 ${((Date.now() - t0) / 1000).toFixed(0)}초`);

function samplesFor(line: string, range: [number, number]): Sample[] {
  const out: Sample[] = [];
  for (let fi = range[0]; fi < range[1]; fi++) {
    const file = files[fi];
    const node = file.nodes[line];
    const p = node.player;
    const hands = file.handsByPlayer[p];
    const n = node.actions.length;
    const flop = file.flop.match(/../g)!;
    hands.forEach((h, hi) => {
      const weight = file.weightsByPlayer[p][hi];
      if (weight <= 0) return;
      const strat = Array.from({ length: n }, (_, a) => node.strategy[a * hands.length + hi]);
      const ev = Array.from({ length: n }, (_, a) => node.actionEv[a * hands.length + hi]);
      out.push({
        x: handFeatures(flop, h, feats[fi].equity[p][hi], feats[fi].rangeEq[p]),
        strat,
        ev,
        evPot: ev.map((v) => v / file.potBb),
        weight,
        flop: file.flop,
      });
    });
  }
  return out;
}

// ── 학습 ────────────────────────────────────────────────────────────────

function initLayer(inDim: number, outDim: number, rnd: () => number): Layer {
  const scale = Math.sqrt(2 / inDim);
  return {
    inDim,
    outDim,
    w: Array.from({ length: inDim * outDim }, () => (rnd() * 2 - 1) * scale),
    b: new Array(outDim).fill(0),
  };
}

function train(line: string, actions: string[], data: Sample[]): StrategyModel {
  const n = actions.length;
  const mean = new Array(FEATURE_COUNT).fill(0);
  const std = new Array(FEATURE_COUNT).fill(0);
  for (const s of data) for (let i = 0; i < FEATURE_COUNT; i++) mean[i] += s.x[i] / data.length;
  for (const s of data) for (let i = 0; i < FEATURE_COUNT; i++) std[i] += (s.x[i] - mean[i]) ** 2 / data.length;
  for (let i = 0; i < FEATURE_COUNT; i++) std[i] = Math.sqrt(std[i]) || 1;

  const rnd = lcg(42);
  const dims = [FEATURE_COUNT, HIDDEN, HIDDEN, 2 * n];
  const layers = dims.slice(1).map((d, i) => initLayer(dims[i], d, rnd));
  // Adam 상태
  const m = layers.map((l) => ({ w: new Float64Array(l.w.length), b: new Float64Array(l.b.length) }));
  const v = layers.map((l) => ({ w: new Float64Array(l.w.length), b: new Float64Array(l.b.length) }));
  let step = 0;
  const xs = data.map((s) => Array.from(s.x, (val, i) => (val - mean[i]) / std[i]));
  const totalW = data.reduce((a, s) => a + s.weight, 0) / data.length;

  for (let epoch = 0; epoch < EPOCHS; epoch++) {
    const order = data.map((_, i) => i);
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    let lossSum = 0;
    const lr = LR * (epoch < EPOCHS * 0.7 ? 1 : 0.2);
    for (let start = 0; start < order.length; start += BATCH) {
      const batch = order.slice(start, start + BATCH);
      const gw = layers.map((l) => ({ w: new Float64Array(l.w.length), b: new Float64Array(l.b.length) }));
      for (const idx of batch) {
        const s = data[idx];
        const sw = s.weight / totalW / batch.length;
        // 순전파. 층마다 활성값을 남긴다.
        const acts: number[][] = [xs[idx]];
        layers.forEach((l, li) => {
          const inp = acts[acts.length - 1];
          const out = new Array<number>(l.outDim);
          for (let o = 0; o < l.outDim; o++) {
            let z = l.b[o];
            const row = o * l.inDim;
            for (let k = 0; k < l.inDim; k++) z += l.w[row + k] * inp[k];
            out[o] = li < layers.length - 1 ? Math.max(0, z) : z;
          }
          acts.push(out);
        });
        const y = acts[acts.length - 1];
        const logits = y.slice(0, n);
        const mx = Math.max(...logits);
        const ex = logits.map((z) => Math.exp(z - mx));
        const sum = ex.reduce((a, b) => a + b, 0);
        const p = ex.map((e) => e / sum);
        // 손실: 전략은 교차 엔트로피, EV는 제곱 오차.
        const grad = new Array<number>(2 * n);
        for (let a = 0; a < n; a++) {
          lossSum -= sw * s.strat[a] * Math.log(p[a] + 1e-9);
          grad[a] = sw * (p[a] - s.strat[a]);
          const d = y[n + a] - s.evPot[a];
          lossSum += sw * EV_WEIGHT * d * d;
          grad[n + a] = sw * EV_WEIGHT * 2 * d;
        }
        // 역전파
        let delta = grad;
        for (let li = layers.length - 1; li >= 0; li--) {
          const l = layers[li];
          const inp = acts[li];
          const prev = new Array<number>(l.inDim).fill(0);
          for (let o = 0; o < l.outDim; o++) {
            const dz = delta[o];
            if (dz === 0) continue;
            gw[li].b[o] += dz;
            const row = o * l.inDim;
            for (let k = 0; k < l.inDim; k++) {
              gw[li].w[row + k] += dz * inp[k];
              prev[k] += dz * l.w[row + k];
            }
          }
          if (li > 0) delta = prev.map((g, k) => (acts[li][k] > 0 ? g : 0));
        }
      }
      // Adam 갱신
      step += 1;
      const b1 = 0.9, b2 = 0.999, eps = 1e-8;
      layers.forEach((l, li) => {
        for (const key of ["w", "b"] as const) {
          const param = l[key];
          const g = gw[li][key];
          const mm = m[li][key];
          const vv = v[li][key];
          for (let k = 0; k < param.length; k++) {
            mm[k] = b1 * mm[k] + (1 - b1) * g[k];
            vv[k] = b2 * vv[k] + (1 - b2) * g[k] * g[k];
            const mh = mm[k] / (1 - b1 ** step);
            const vh = vv[k] / (1 - b2 ** step);
            param[k] -= lr * mh / (Math.sqrt(vh) + eps);
          }
        }
      });
    }
    if (epoch % 5 === 4 || epoch === EPOCHS - 1) {
      console.log(`    [${line || "root"}] epoch ${epoch + 1} 손실 ${(lossSum / (order.length / BATCH)).toFixed(4)}`);
    }
  }
  return { line, actions, mean, std, layers };
}

// ── 평가 ────────────────────────────────────────────────────────────────

function evaluate(model: StrategyModel, data: Sample[], potBb: Map<string, number>) {
  let w = 0, bestOk = 0, gradeOk = 0, bigMiss = 0, evErr = 0, tv = 0, gradeN = 0, pickedOk = 0;
  const rank = (loss: number) => gradeByEvLoss(loss).rank;
  for (const s of data) {
    const pot = potBb.get(s.flop)!;
    const out = forward(model, s.x);
    const predEv = out.evPot.map((e) => e * pot);
    const n = s.ev.length;
    const trueBest = Math.max(...s.ev);
    const predBest = Math.max(...predEv);
    const pickIdx = predEv.indexOf(predBest);
    w += s.weight;
    // 모델이 고른 최선이 실제로 최선 구간(0.01bb) 안인가.
    if (trueBest - s.ev[pickIdx] <= 0.01) bestOk += s.weight;
    for (let a = 0; a < n; a++) {
      const tr = rank(trueBest - s.ev[a]);
      const pr = rank(predBest - predEv[a]);
      if (tr === pr) gradeOk += s.weight;
      if (Math.abs(tr - pr) >= 2) bigMiss += s.weight;
      // 사용자가 실제로 고를 법한 액션(솔버 빈도대로)에서의 일치
      pickedOk += s.weight * s.strat[a] * (tr === pr ? 1 : 0);
      evErr += s.weight * Math.abs(predEv[a] - s.ev[a]);
      gradeN += s.weight;
    }
    tv += s.weight * 0.5 * out.strategy.reduce((acc, q, a) => acc + Math.abs(q - s.strat[a]), 0);
  }
  return {
    최선일치: +(bestOk / w * 100).toFixed(1),
    등급일치: +(gradeOk / gradeN * 100).toFixed(1),
    등급일치_빈도가중: +(pickedOk / w * 100).toFixed(1),
    두단계이상틀림: +(bigMiss / gradeN * 100).toFixed(1),
    EV평균오차bb: +(evErr / gradeN).toFixed(3),
    전략차이: +(tv / w * 100).toFixed(1),
  };
}

const potBb = new Map(files.map((f) => [f.flop, f.potBb]));
const report: Record<string, unknown> = {};
for (const line of Object.keys(files[0].nodes)) {
  const actions = files[0].nodes[line].actions.map((a) => `${a.kind}${a.amountBb || ""}`);
  const trainSet = samplesFor(line, [0, split]);
  const testSet = samplesFor(line, [split, files.length]);
  console.log(`[${line || "root"}] 학습 ${trainSet.length} · 검증 ${testSet.length} · 액션 ${actions.join("/")}`);
  const t1 = Date.now();
  const model = train(line, actions, trainSet);
  console.log(`  학습 ${((Date.now() - t1) / 1000).toFixed(0)}초`);
  report[line || "root"] = { 학습: evaluate(model, trainSet, potBb), 검증: evaluate(model, testSet, potBb) };
  writeFileSync(`${OUT}/model-${line || "root"}.json`, JSON.stringify(model));
}
console.log(JSON.stringify(report, null, 2));
writeFileSync(`${OUT}/report.json`, JSON.stringify({ flops: files.length, split, EQ_SAMPLES, HIDDEN, EPOCHS, report }, null, 2));
