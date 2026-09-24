// 7장(홀카드 2 + 보드 5)에서 최고의 5장 족보를 판정한다.
// 카드는 0~51 정수: rank = (card / 4) | 0  (0='2' ... 12='A'), suit = card % 4.
// 반환값은 비교 가능한 정수 점수로, 클수록 강한 족보다.

export const RANK_CHARS = "23456789TJQKA";
export const SUIT_CHARS = "shdc";

export const Category = {
  HighCard: 0,
  Pair: 1,
  TwoPair: 2,
  Trips: 3,
  Straight: 4,
  Flush: 5,
  FullHouse: 6,
  Quads: 7,
  StraightFlush: 8,
} as const;

export type Category = (typeof Category)[keyof typeof Category];

export const CATEGORY_NAMES = [
  "HighCard",
  "Pair",
  "TwoPair",
  "Trips",
  "Straight",
  "Flush",
  "FullHouse",
  "Quads",
  "StraightFlush",
];

function score(cat: number, k1 = 0, k2 = 0, k3 = 0, k4 = 0, k5 = 0): number {
  return (cat << 20) | (k1 << 16) | (k2 << 12) | (k3 << 8) | (k4 << 4) | k5;
}

// 13비트 랭크 마스크에서 스트레이트의 톱 랭크를 찾는다. 없으면 -1.
// 휠(A-2-3-4-5)은 5가 톱이므로 3을 반환한다.
function straightHigh(mask: number): number {
  for (let high = 12; high >= 4; high--) {
    const need = 0b11111 << (high - 4);
    if ((mask & need) === need) return high;
  }
  // 휠: A(12) + 5,4,3,2(3,2,1,0)
  const wheel = (1 << 12) | 0b1111;
  if ((mask & wheel) === wheel) return 3;
  return -1;
}

// 마스크에서 상위 n개 랭크를 내림차순으로 뽑는다.
function topRanks(mask: number, n: number): number[] {
  const out: number[] = [];
  for (let r = 12; r >= 0 && out.length < n; r--) {
    if (mask & (1 << r)) out.push(r);
  }
  return out;
}

// 수억 번 호출되므로 호출마다 배열을 새로 만들지 않고 모듈 스코프 버퍼를 재사용한다.
const rankCount = new Int8Array(13);
const suitCount = new Int8Array(4);
const suitRankMask = new Int16Array(4);

export function evaluate7(cards: number[]): number {
  rankCount.fill(0);
  suitCount.fill(0);
  suitRankMask.fill(0);
  let rankMask = 0;

  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const rank = (card / 4) | 0;
    const suit = card % 4;
    rankCount[rank]++;
    suitCount[suit]++;
    suitRankMask[suit] |= 1 << rank;
    rankMask |= 1 << rank;
  }

  // 플러시 / 스트레이트 플러시
  for (let suit = 0; suit < 4; suit++) {
    if (suitCount[suit] >= 5) {
      const sf = straightHigh(suitRankMask[suit]);
      if (sf >= 0) return score(Category.StraightFlush, sf);
      const top = topRanks(suitRankMask[suit], 5);
      return score(Category.Flush, top[0], top[1], top[2], top[3], top[4]);
    }
  }

  // 같은 랭크 묶음 수집 (높은 랭크 우선)
  const quads: number[] = [];
  const trips: number[] = [];
  const pairs: number[] = [];
  for (let r = 12; r >= 0; r--) {
    if (rankCount[r] === 4) quads.push(r);
    else if (rankCount[r] === 3) trips.push(r);
    else if (rankCount[r] === 2) pairs.push(r);
  }

  if (quads.length > 0) {
    const quad = quads[0];
    const kicker = topRanks(rankMask & ~(1 << quad), 1)[0];
    return score(Category.Quads, quad, kicker);
  }

  // 풀하우스: 트립스 + (페어 또는 두 번째 트립스)
  if (trips.length > 0 && (pairs.length > 0 || trips.length > 1)) {
    const three = trips[0];
    const pair = trips.length > 1 ? Math.max(trips[1], pairs[0] ?? -1) : pairs[0];
    return score(Category.FullHouse, three, pair);
  }

  const st = straightHigh(rankMask);
  if (st >= 0) return score(Category.Straight, st);

  if (trips.length > 0) {
    const three = trips[0];
    const k = topRanks(rankMask & ~(1 << three), 2);
    return score(Category.Trips, three, k[0], k[1]);
  }

  if (pairs.length >= 2) {
    const [hi, lo] = pairs;
    const kicker = topRanks(rankMask & ~(1 << hi) & ~(1 << lo), 1)[0];
    return score(Category.TwoPair, hi, lo, kicker);
  }

  if (pairs.length === 1) {
    const pair = pairs[0];
    const k = topRanks(rankMask & ~(1 << pair), 3);
    return score(Category.Pair, pair, k[0], k[1], k[2]);
  }

  const top = topRanks(rankMask, 5);
  return score(Category.HighCard, top[0], top[1], top[2], top[3], top[4]);
}

export function categoryOf(scoreValue: number): Category {
  return (scoreValue >> 20) as Category;
}

// "As", "Td" 같은 표기를 카드 정수로 변환.
export function parseCard(text: string): number {
  const rank = RANK_CHARS.indexOf(text[0].toUpperCase());
  const suit = SUIT_CHARS.indexOf(text[1].toLowerCase());
  if (rank < 0 || suit < 0) throw new Error(`잘못된 카드 표기: ${text}`);
  return rank * 4 + suit;
}

export function parseCards(text: string): number[] {
  return text.trim().split(/\s+/).map(parseCard);
}

export function cardToString(card: number): string {
  return RANK_CHARS[(card / 4) | 0] + SUIT_CHARS[card % 4];
}
