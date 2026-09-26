// 올인이 콜된 순간의 승률. 운과 실력을 나누는 기준이다.
//
// 칩 결과는 실제로 깔린 카드로 정해진다. 같은 판단을 백 번 했으면 받았을 몫은
// "그 순간 승률 × 팟"이다. 둘의 차이가 운이다.
//
// 카드가 두 장 이하로 남으면 전수로 센다(플랍 990가지, 턴 44가지). 프리플랍은
// 170만 가지라 샘플링한다 — 2만 번이면 오차 ±0.3%p로, 정산 표시에는 충분하다.

import { evaluate7, parseCard } from "./evaluator.ts";

const DECK = Array.from({ length: 52 }, (_, i) => i);

/** 씨앗 고정 난수. 같은 판을 다시 그려도 보정값이 흔들리지 않게 한다. */
export function seeded(seed: number): () => number {
  let x = seed >>> 0 || 1;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 4294967296;
  };
}

export function allinEquity(
  hero: string[],
  villain: string[],
  board: string[],
  rnd: () => number,
  samples = 20000,
): number {
  const h = hero.map(parseCard);
  const v = villain.map(parseCard);
  const b = board.map(parseCard);
  const used = new Set([...h, ...v, ...b]);
  const deck = DECK.filter((c) => !used.has(c));
  const need = 5 - b.length;

  let won = 0;
  let count = 0;
  const tally = (full: number[]) => {
    const hs = evaluate7([...full, ...h]);
    const vs = evaluate7([...full, ...v]);
    won += hs > vs ? 1 : hs === vs ? 0.5 : 0;
    count += 1;
  };

  if (need <= 0) {
    tally(b);
  } else if (need === 1) {
    for (const a of deck) tally([...b, a]);
  } else if (need === 2) {
    for (let i = 0; i < deck.length; i++) {
      for (let j = i + 1; j < deck.length; j++) tally([...b, deck[i], deck[j]]);
    }
  } else {
    const d = [...deck];
    for (let k = 0; k < samples; k++) {
      for (let i = 0; i < need; i++) {
        const j = i + Math.floor(rnd() * (d.length - i));
        [d[i], d[j]] = [d[j], d[i]];
      }
      tally([...b, ...d.slice(0, need)]);
    }
  }
  return won / count;
}
