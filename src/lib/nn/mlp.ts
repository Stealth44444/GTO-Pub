// 플랍 전략 모델의 추론. 학습은 scripts/nn/train.ts가 하고 같은 모양의 JSON을 쓴다.
//
// 작은 다층 퍼셉트론이라 라이브러리 없이 돈다. 출력은 액션 수 × 2 —
// 앞쪽 절반은 전략(소프트맥스 전 로짓), 뒤쪽 절반은 액션별 EV(팟 대비).

export type Layer = { inDim: number; outDim: number; w: number[]; b: number[] };

export type StrategyModel = {
  /** 이 모델이 답하는 노드. 루트는 "". */
  line: string;
  actions: string[];
  /** 입력 정규화. 학습 데이터의 평균과 표준편차. */
  mean: number[];
  std: number[];
  layers: Layer[];
};

export function forward(model: StrategyModel, x: Float32Array): { strategy: number[]; evPot: number[] } {
  let h: number[] = Array.from(x, (v, i) => (v - model.mean[i]) / model.std[i]);
  model.layers.forEach((layer, li) => {
    const out = new Array<number>(layer.outDim);
    for (let o = 0; o < layer.outDim; o++) {
      let s = layer.b[o];
      const row = o * layer.inDim;
      for (let i = 0; i < layer.inDim; i++) s += layer.w[row + i] * h[i];
      // 마지막 층만 선형이다.
      out[o] = li < model.layers.length - 1 ? Math.max(0, s) : s;
    }
    h = out;
  });
  const n = model.actions.length;
  const logits = h.slice(0, n);
  const max = Math.max(...logits);
  const exps = logits.map((v) => Math.exp(v - max));
  const sum = exps.reduce((a, b) => a + b, 0);
  return { strategy: exps.map((v) => v / sum), evPot: h.slice(n, 2 * n) };
}
