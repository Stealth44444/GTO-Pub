export type Position = "UTG" | "HJ" | "CO" | "BTN" | "SB";

export const POSITIONS: Position[] = ["UTG", "HJ", "CO", "BTN", "SB"];

// 6-max 테이블 시각화용 — BB는 학습 대상 포지션은 아니지만 테이블에는 항상 표시됨.
export type Seat = Position | "BB";

export const SEATS: Seat[] = ["UTG", "HJ", "CO", "BTN", "SB", "BB"];

// 테이블 펠트 외곽선 위치/크기 (컨테이너 기준 %). PokerTable의 펠트 렌더링과
// 아래 SLOT_LAYOUT이 이 값을 공유해서, 좌석 서클 중심이 항상 외곽선 위에 오도록 한다.
export const TABLE_FELT = { left: 8, top: 6, width: 84, height: 84 } as const;

const feltLeft = TABLE_FELT.left;
const feltTop = TABLE_FELT.top;

// n인 테이블의 자리 이름 (액션 순서, 마지막 둘이 SB/BB).
// 솔버(scripts/solve-pushfold.ts)의 seatNames와 같은 규칙이어야 데이터가 맞물린다.
export function seatNames(tableSize: number): string[] {
  if (tableSize === 6) return ["UTG", "HJ", "CO", "BTN", "SB", "BB"];
  if (tableSize === 9) return ["UTG", "UTG1", "UTG2", "LJ", "HJ", "CO", "BTN", "SB", "BB"];
  const fromBack = ["BB", "SB", "BTN", "CO", "HJ", "LJ", "UTG2", "UTG1", "UTG"];
  return fromBack.slice(0, tableSize).reverse();
}

// 테이블 외곽선(스타디움 = 모서리가 완전히 둥근 사각형) 둘레의 한 점을 구한다.
// 좌표 단위는 "컨테이너 높이의 1%"로 통일한다. 퍼센트를 가로/세로에 그대로 쓰면
// 실제 픽셀 비율이 달라 둘레 계산이 틀어지기 때문이다.
//
// 하단 중앙에서 출발해 왼쪽을 거쳐 한 바퀴 돈다.
function stadiumPoint(
  centerX: number,
  centerY: number,
  width: number,
  height: number,
  fraction: number,
): { x: number; y: number } {
  // CSS의 border-radius: 999px는 짧은 변의 절반으로 잘린다.
  const radius = Math.min(width, height) / 2;
  const straightH = Math.max(0, width - 2 * radius); // 위/아래 직선 구간
  const straightV = Math.max(0, height - 2 * radius); // 좌/우 직선 구간
  const quarter = (Math.PI * radius) / 2;

  const perimeter = 2 * Math.PI * radius + 2 * straightH + 2 * straightV;
  let s = (((fraction % 1) + 1) % 1) * perimeter;

  // 네 모서리 호의 중심
  const cornerX = straightH / 2;
  const cornerY = straightV / 2;

  // 각도가 커질수록 하단(π/2) → 왼쪽(π) → 상단(3π/2) → 오른쪽(2π) 순으로 진행한다.
  // (화면 좌표는 y가 아래로 증가하므로 sin이 양수면 아래쪽이다)
  const onArc = (cx: number, cy: number, fromAngle: number, travelled: number) => {
    const angle = fromAngle + travelled / radius;
    return { x: centerX + cx + radius * Math.cos(angle), y: centerY + cy + radius * Math.sin(angle) };
  };

  // 1. 아래 직선의 왼쪽 절반
  if (s < straightH / 2) return { x: centerX - s, y: centerY + height / 2 };
  s -= straightH / 2;
  // 2. 좌하단 호 (아래 → 왼쪽)
  if (s < quarter) return onArc(-cornerX, cornerY, Math.PI / 2, s);
  s -= quarter;
  // 3. 왼쪽 직선 (아래 → 위)
  if (s < straightV) return { x: centerX - width / 2, y: centerY + cornerY - s };
  s -= straightV;
  // 4. 좌상단 호 (왼쪽 → 위)
  if (s < quarter) return onArc(-cornerX, -cornerY, Math.PI, s);
  s -= quarter;
  // 5. 위 직선 (왼쪽 → 오른쪽)
  if (s < straightH) return { x: centerX - cornerX + s, y: centerY - height / 2 };
  s -= straightH;
  // 6. 우상단 호 (위 → 오른쪽)
  if (s < quarter) return onArc(cornerX, -cornerY, Math.PI * 1.5, s);
  s -= quarter;
  // 7. 오른쪽 직선 (위 → 아래)
  if (s < straightV) return { x: centerX + width / 2, y: centerY - cornerY + s };
  s -= straightV;
  // 8. 우하단 호 (오른쪽 → 아래)
  if (s < quarter) return onArc(cornerX, cornerY, Math.PI * 2, s);
  s -= quarter;
  // 9. 아래 직선의 오른쪽 절반
  return { x: centerX + cornerX - s, y: centerY + height / 2 };
}

export type TableSeat = { seat: string; top: string; left: string };

// 히어로를 하단 중앙에 고정하고 나머지를 액션 순서대로 외곽선 둘레에 균등 배치한다.
// aspect = 컨테이너 가로/세로 픽셀 비율. 이걸 받아야 좌석이 실제 선 위에 놓인다.
export function getTableSeats(
  tableSize: number,
  heroPosition: string,
  aspect: number,
): TableSeat[] {
  const names = seatNames(tableSize);
  const heroIdx = names.indexOf(heroPosition);

  // 높이를 100으로 두면 가로는 100*aspect가 된다.
  const widthUnits = 100 * aspect;
  const feltWidth = (TABLE_FELT.width / 100) * widthUnits;
  const feltHeight = TABLE_FELT.height;
  const centerX = (feltLeft / 100) * widthUnits + feltWidth / 2;
  const centerY = feltTop + feltHeight / 2;

  return names.map((_, i) => {
    const seat = names[(heroIdx + i) % names.length];
    const { x, y } = stadiumPoint(centerX, centerY, feltWidth, feltHeight, i / names.length);
    return { seat, left: `${(x / widthUnits) * 100}%`, top: `${y}%` };
  });
}

// 히어로가 첫 액션을 하는 스팟이므로, 액션 순서상 히어로보다 앞선 자리는
// 전부 폴드했다고 본다 (카드를 보여주지 않는다). 뒤 자리는 아직 액션 전이라
// 카드 뒷면을 보여준다.
export function isFoldedBeforeHero(
  tableSize: number,
  seat: string,
  heroPosition: string,
): boolean {
  const names = seatNames(tableSize);
  return names.indexOf(seat) < names.indexOf(heroPosition);
}

// 자리별로 이미 낸 블라인드 (SB 0.5, BB 1, 나머지 0)
// 이 자리가 액션 전에 이미 넣은 돈. BB 앤티는 BB가 내므로 BB의 금액에 포함된다
// (솔버의 postedByseat와 같은 규칙이어야 화면의 팟과 정답 레인지가 어긋나지 않는다).
export function postedBlind(tableSize: number, seat: string, anteBb = 0): number {
  const names = seatNames(tableSize);
  const idx = names.indexOf(seat);
  if (idx === names.length - 1) return 1 + anteBb;
  if (idx === names.length - 2) return 0.5;
  return 0;
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

// 액션 시작 시점의 팟: SB(0.5) + BB(1) + BB 앤티
export function preflopPot(anteBb = 0): number {
  return 1.5 + anteBb;
}

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

// 푸시/폴드의 올인은 딥스택 오픈레이즈와 다른 액션이다. 기록에서 둘을 구분해야
// 나중에 분석할 수 있다 (scenarios.ts의 ActionId와 같은 집합).
export type Action = "shove" | "call" | "open" | "fold";

export type ActionFrequency = {
  open: number;
  fold: number;
};

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

const ACTION_FREQUENCIES: Record<Position, Map<string, ActionFrequency>> = (() => {
  const result = {} as Record<Position, Map<string, ActionFrequency>>;
  for (const pos of POSITIONS) {
    const target = TOTAL_COMBOS * OPEN_PCT[pos];
    let remaining = target;
    const frequencies = new Map<string, ActionFrequency>();
    for (const hand of RANKED_HANDS) {
      const open = Math.max(0, Math.min(1, remaining / hand.combos));
      frequencies.set(hand.code, {
        open: Math.round(open * 100),
        fold: Math.round((1 - open) * 100),
      });
      remaining -= hand.combos;
    }
    result[pos] = frequencies;
  }
  return result;
})();

export function getActionFrequency(position: Position, handCode: string): ActionFrequency {
  return ACTION_FREQUENCIES[position].get(handCode) ?? { open: 0, fold: 100 };
}

export function correctAction(position: Position, handCode: string): Action {
  return getActionFrequency(position, handCode).open >= 50 ? "open" : "fold";
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

// 카드 표시용 슈트.
export type Suit = "s" | "h" | "c" | "d";

const ALL_SUITS: Suit[] = ["s", "h", "c", "d"];

// 수티드면 두 카드에 같은 슈트를, 오프수트/페어면 서로 다른 슈트 두 개를 무작위로 배정.
export function randomSuits(suited: boolean): [Suit, Suit] {
  const first = ALL_SUITS[Math.floor(Math.random() * ALL_SUITS.length)];
  if (suited) return [first, first];
  const rest = ALL_SUITS.filter((s) => s !== first);
  const second = rest[Math.floor(Math.random() * rest.length)];
  return [first, second];
}
