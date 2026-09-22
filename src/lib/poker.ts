export type Position = "UTG" | "MP" | "CO" | "BTN" | "SB";

export const POSITIONS: Position[] = ["UTG", "MP", "CO", "BTN", "SB"];

export const POSITION_LABEL: Record<Position, string> = {
  UTG: "UTG (얼리 포지션)",
  MP: "MP (미들 포지션)",
  CO: "CO (컷오프)",
  BTN: "BTN (버튼)",
  SB: "SB (스몰 블라인드)",
};

const RANKS = ["A", "K", "Q", "J", "T", "9", "8", "7", "6", "5", "4", "3", "2"] as const;
type Rank = (typeof RANKS)[number];

const RANK_VALUE: Record<Rank, number> = {
  A: 14, K: 13, Q: 12, J: 11, T: 10, "9": 9, "8": 8, "7": 7, "6": 6, "5": 5, "4": 4, "3": 3, "2": 2,
};

// Chen formula card values, used only to rank hands relative to each other.
const CHEN_VALUE: Record<Rank, number> = {
  A: 10, K: 8, Q: 7, J: 6, T: 5, "9": 4.5, "8": 4, "7": 3.5, "6": 3, "5": 2.5, "4": 2, "3": 1.5, "2": 1,
};

export interface HandInfo {
  code: string; // e.g. "AKs", "72o", "TT"
  high: Rank;
  low: Rank;
  suited: boolean;
  pair: boolean;
  combos: number;
}

function chenScore(hand: HandInfo): number {
  if (hand.pair) return Math.max(CHEN_VALUE[hand.high] * 2, 5);
  let score = CHEN_VALUE[hand.high];
  if (hand.suited) score += 2;
  const gap = RANK_VALUE[hand.high] - RANK_VALUE[hand.low] - 1;
  if (gap === 1) score -= 1;
  else if (gap === 2) score -= 2;
  else if (gap === 3) score -= 4;
  else if (gap >= 4) score -= 5;
  if (gap <= 1 && RANK_VALUE[hand.high] < RANK_VALUE.Q) score += 1;
  return score;
}

export const ALL_HANDS: HandInfo[] = (() => {
  const hands: HandInfo[] = [];
  for (let i = 0; i < RANKS.length; i++) {
    hands.push({ code: RANKS[i] + RANKS[i], high: RANKS[i], low: RANKS[i], suited: false, pair: true, combos: 6 });
  }
  for (let i = 0; i < RANKS.length; i++) {
    for (let j = i + 1; j < RANKS.length; j++) {
      hands.push({ code: RANKS[i] + RANKS[j] + "s", high: RANKS[i], low: RANKS[j], suited: true, pair: false, combos: 4 });
      hands.push({ code: RANKS[i] + RANKS[j] + "o", high: RANKS[i], low: RANKS[j], suited: false, pair: false, combos: 12 });
    }
  }
  return hands;
})();

const RANKED_HANDS = [...ALL_HANDS].sort((a, b) => {
  const diff = chenScore(b) - chenScore(a);
  if (diff !== 0) return diff;
  return RANK_VALUE[b.high] + RANK_VALUE[b.low] - (RANK_VALUE[a.high] + RANK_VALUE[a.low]);
});

const TOTAL_COMBOS = ALL_HANDS.reduce((sum, h) => sum + h.combos, 0); // 1326

// 단순화된 6-max 오픈레인지 목표 비율. 추후 검증된 솔버 데이터로 교체 예정 (session-brief.md 참고).
const OPEN_PCT: Record<Position, number> = {
  UTG: 0.15,
  MP: 0.18,
  CO: 0.27,
  SB: 0.35,
  BTN: 0.45,
};

const OPEN_RANGE: Record<Position, Set<string>> = (() => {
  const result = {} as Record<Position, Set<string>>;
  for (const pos of POSITIONS) {
    const target = TOTAL_COMBOS * OPEN_PCT[pos];
    let cumulative = 0;
    const set = new Set<string>();
    for (const hand of RANKED_HANDS) {
      if (cumulative >= target) break;
      set.add(hand.code);
      cumulative += hand.combos;
    }
    result[pos] = set;
  }
  return result;
})();

export type Action = "open" | "fold";

export function correctAction(position: Position, handCode: string): Action {
  return OPEN_RANGE[position].has(handCode) ? "open" : "fold";
}

export function randomHand(): HandInfo {
  let r = Math.random() * TOTAL_COMBOS;
  for (const hand of ALL_HANDS) {
    r -= hand.combos;
    if (r <= 0) return hand;
  }
  return ALL_HANDS[ALL_HANDS.length - 1];
}

export function randomPosition(): Position {
  return POSITIONS[Math.floor(Math.random() * POSITIONS.length)];
}
