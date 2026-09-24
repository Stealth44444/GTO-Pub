// 올인 승률표. 169 × 169 한 장.
//
// 번들에 넣지 않는다. 28561개의 수라 200KB 가까이 되는데, 이 값이 필요한
// 화면은 올인에 콜하는 자리 하나뿐이다. 처음 그 자리에 닿을 때 받아오고
// 그다음부터는 메모리에 둔다.
//
// 조합 가중치는 정확하고 보드만 표본이라, 오차는 보드 분산에서만 온다
// (scripts/build-equity.ts). 근거 숫자로 보여줄 만큼은 정확하다.

export type EquityTable = {
  hands: string[];
  /** 길이 169 × 169. [i * 169 + j] = i가 j를 상대로 이기는 비율. */
  equity: number[];
  index: Map<string, number>;
};

let table: EquityTable | null = null;
let pending: Promise<EquityTable | null> | null = null;

/** 조합 수. 승률을 레인지 전체로 접을 때 무게가 된다 — 페어는 6개, 오프수트는 12개. */
export function combosOf(code: string): number {
  if (code.length === 2) return 6;
  return code[2] === "s" ? 4 : 12;
}

export function loadEquity(): Promise<EquityTable | null> {
  if (table) return Promise.resolve(table);
  pending ??= fetch("/equity.json.gz")
    .then(async (res) => {
      if (!res.ok) throw new Error(String(res.status));
      const stream = res.body?.pipeThrough(new DecompressionStream("gzip"));
      if (!stream) throw new Error("압축을 풀 수 없습니다");
      const raw = JSON.parse(await new Response(stream).text()) as {
        hands: string[];
        equity: number[];
      };
      table = {
        hands: raw.hands,
        equity: raw.equity,
        index: new Map(raw.hands.map((h, i) => [h, i])),
      };
      return table;
    })
    .catch(() => {
      // 근거 숫자가 없어도 채점은 그대로 된다. 그 줄만 안 보인다.
      pending = null;
      return null;
    });
  return pending;
}

/**
 * 이 핸드가 저 레인지를 상대로 올인했을 때의 승률(%).
 *
 * 레인지의 빈도와 조합 수를 함께 무게로 쓴다. 빈도만 쓰면 AA(6조합)와
 * AKo(12조합)가 같은 무게가 되어 상대 레인지가 실제보다 세 보인다.
 *
 * 카드 제거는 반영하지 않는다. 내가 AA를 들고 있으면 상대가 AA일 확률은
 * 낮아지는데, 그 보정까지 하려면 조합 단위로 다시 세야 한다. 이 값은 근거를
 * 보여주기 위한 것이고, 채점에 쓰는 EV는 솔버가 따로 정확히 계산한다.
 */
export function equityVsRange(
  t: EquityTable,
  hand: string,
  range: Record<string, number>,
): number | null {
  const i = t.index.get(hand);
  if (i === undefined) return null;

  let sum = 0;
  let weight = 0;
  for (const [code, freq] of Object.entries(range)) {
    if (freq <= 0) continue;
    const j = t.index.get(code);
    if (j === undefined) continue;
    const w = freq * combosOf(code);
    sum += w * t.equity[i * t.hands.length + j];
    weight += w;
  }
  if (weight <= 0) return null;
  return Math.round((sum / weight) * 1000) / 10;
}
