// 플랍 EV를 셀 표본 플랍. 여러 파이프라인이 같은 표본을 쓴다.
//
// 22100가지 플랍을 질감으로 층화해서 뽑는다. 플랍 EV의 분산은 대부분 질감에서
// 오므로, 층마다 비례해 뽑으면 같은 표본 수로 오차가 훨씬 작다. 무게는 그
// 층이 실제로 나오는 비율을 층 안의 표본 수로 나눈 것이다.

const RANKS = "23456789TJQKA";
const SUITS = "cdhs";

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** 질감으로 층을 나눈다. 플랍 EV의 분산은 대부분 여기서 온다. */
export function stratumOf(cards: string[]): string {
  const idx = cards.map((c) => RANKS.indexOf(c[0])).sort((a, b) => b - a);
  const suits = new Set(cards.map((c) => c[1])).size;
  const paired = idx[0] === idx[1] || idx[1] === idx[2];
  const high =
    idx[0] >= 12 ? "A" : idx[0] >= 10 ? "KQ" : idx[0] >= 7 ? "JT9" : idx[0] >= 4 ? "864" : "low";
  const gap = idx[0] - idx[2] <= 4 ? "connected" : "spread";
  return `${high}|${paired ? "paired" : "unpaired"}|${suits}|${gap}`;
}

export function sampleFlops(count: number, seed = 20260925): { flop: string; weight: number }[] {
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
  const rnd = lcg(seed);
  const out: { flop: string; weight: number }[] = [];
  for (const key of [...strata.keys()].sort()) {
    const pool = strata.get(key)!;
    const share = pool.length / 22100;
    const take = Math.max(1, Math.round(share * count));
    const picked = new Set<string>();
    while (picked.size < Math.min(take, pool.length)) {
      picked.add(pool[Math.floor(rnd() * pool.length)]);
    }
    for (const flop of picked) out.push({ flop, weight: share / picked.size });
  }
  return out;
}
