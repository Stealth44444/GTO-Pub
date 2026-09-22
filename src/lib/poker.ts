export type Position = "UTG" | "HJ" | "CO" | "BTN" | "SB";

export const POSITIONS: Position[] = ["UTG", "HJ", "CO", "BTN", "SB"];

export const POSITION_LABEL: Record<Position, string> = {
  UTG: "UTG (얼리 포지션)",
  HJ: "HJ (하이잭)",
  CO: "CO (컷오프)",
  BTN: "BTN (버튼)",
  SB: "SB (스몰 블라인드)",
};

// 6-max 테이블 시각화용 — BB는 학습 대상 포지션은 아니지만 테이블에는 항상 표시됨.
export type Seat = Position | "BB";

export const SEATS: Seat[] = ["UTG", "HJ", "CO", "BTN", "SB", "BB"];

export const SEAT_LABEL: Record<Seat, string> = {
  ...POSITION_LABEL,
  BB: "BB (빅 블라인드)",
};

// 테이블 펠트 외곽선 위치/크기 (컨테이너 기준 %). PokerTable의 펠트 렌더링과
// 아래 SLOT_LAYOUT이 이 값을 공유해서, 좌석 서클 중심이 항상 외곽선 위에 오도록 한다.
export const TABLE_FELT = { left: 8, top: 6, width: 84, height: 84 } as const;

const feltLeft = TABLE_FELT.left;
const feltRight = TABLE_FELT.left + TABLE_FELT.width;
const feltTop = TABLE_FELT.top;
const feltBottom = TABLE_FELT.top + TABLE_FELT.height;

// 오벌 테이블 위 좌석 슬롯 좌표 (컨테이너 기준 %, translate(-50%,-50%)로 중심 정렬).
// GTOWizard 트레이너처럼 히어로는 항상 bottom 슬롯에 고정하고, 나머지 포지션을
// 히어로 기준 시계방향 순서로 회전 배치한다 (getTableSeats 참고).
// 상/하단 좌석은 펠트의 top/bottom 엣지에, 좌/우측 좌석은 펠트의 left/right 엣지에
// 좌석 원의 중심이 오도록 맞춰서 테이블 선이 정확히 원의 중앙을 지나가게 한다.
type SlotKey = "bottom" | "leftLower" | "leftUpper" | "top" | "rightUpper" | "rightLower";

const SLOT_ORDER: SlotKey[] = ["bottom", "leftLower", "leftUpper", "top", "rightUpper", "rightLower"];

export const SLOT_LAYOUT: Record<SlotKey, { top: string; left: string }> = {
  bottom: { top: `${feltBottom}%`, left: "50%" },
  leftLower: { top: "64%", left: `${feltLeft}%` },
  leftUpper: { top: "22%", left: `${feltLeft}%` },
  top: { top: `${feltTop}%`, left: "50%" },
  rightUpper: { top: "22%", left: `${feltRight}%` },
  rightLower: { top: "64%", left: `${feltRight}%` },
};

export function getTableSeats(heroPosition: Position): { seat: Seat; top: string; left: string }[] {
  const heroIdx = SEATS.indexOf(heroPosition);
  return SLOT_ORDER.map((slot, i) => {
    const seat = SEATS[(heroIdx + i) % SEATS.length];
    return { seat, ...SLOT_LAYOUT[slot] };
  });
}

// 히어로가 레이즈 퍼스트 인(RFI) 하는 스팟이므로, 액션 순서상 히어로보다 앞선
// 포지션은 전부 폴드했다고 가정한다 (카드를 보여주지 않음). 히어로 뒤 포지션은
// 아직 액션 전이라 카드 뒷면을 보여준다.
export function isFoldedBeforeHero(seat: Seat, heroPosition: Position): boolean {
  return SEATS.indexOf(seat) < SEATS.indexOf(heroPosition);
}

const STACK_BASE = 200;

// 블라인드 포스트 반영한 프리플랍 시작 스택 (표시용)
export const SEAT_STACK: Record<Seat, number> = {
  UTG: STACK_BASE,
  HJ: STACK_BASE,
  CO: STACK_BASE,
  BTN: STACK_BASE,
  SB: STACK_BASE - 0.5,
  BB: STACK_BASE - 1,
};

export const PREFLOP_POT = 1.5; // SB(0.5) + BB(1)

// 오픈 사이징 표시용 (그레이딩에는 사용되지 않는 참고용 수치)
export const OPEN_SIZE: Record<Position, number> = {
  UTG: 2.5,
  HJ: 2.3,
  CO: 2.2,
  BTN: 2.2,
  SB: 3,
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
  HJ: 0.18,
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
