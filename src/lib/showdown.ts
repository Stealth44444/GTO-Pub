// 한 판이 어떻게 끝났는지.
//
// EV 등급만 주고 끝내면 "그래서 이겼나?"가 남는다. 결과를 알아야 판이 기억에
// 남고, 상대가 무엇을 들고 그렇게 쳤는지를 봐야 레인지를 읽는 눈이 생긴다.
//
// 주의: 결과는 참고일 뿐 채점 근거가 아니다. 좋은 판단이 지는 일은 늘 있고,
// 결과로 판단을 평가하기 시작하면 배우는 게 반대로 뒤집힌다.

import { evaluate7, categoryOf, Category } from "./evaluator.ts";

const RANKS = "23456789TJQKA";
// 평가기의 수트 순서. 카드 문자열의 c/d/h/s와 맞춰야 한다.
const SUITS = "shdc";

const CATEGORY_KO: Record<Category, string> = {
  [Category.HighCard]: "하이카드",
  [Category.Pair]: "원페어",
  [Category.TwoPair]: "투페어",
  [Category.Trips]: "트립스",
  [Category.Straight]: "스트레이트",
  [Category.Flush]: "플러시",
  [Category.FullHouse]: "풀하우스",
  [Category.Quads]: "포카드",
  [Category.StraightFlush]: "스트레이트 플러시",
};

/** "Ah" → 0~51. 알 수 없는 카드는 -1. */
function toCard(text: string): number {
  const r = RANKS.indexOf(text[0]);
  const s = SUITS.indexOf(text[1]);
  return r < 0 || s < 0 ? -1 : r * 4 + s;
}

export type Showdown = {
  /** "hero" | "villain" | "tie" */
  winner: "hero" | "villain" | "tie";
  heroHandName: string;
  villainHandName: string;
};

/**
 * 보드 5장이 다 깔린 상태에서만 판정한다. 그 전에 끝난 핸드는 쇼다운이 없다.
 *
 * @param board 5장 ("Td","9d","6h","2c","7s")
 * @param heroCards / villainCards 각 2장
 */
export function judge(
  board: string[],
  heroCards: [string, string],
  villainCards: [string, string],
): Showdown | null {
  if (board.length < 5) return null;
  const b = board.map(toCard);
  const h = heroCards.map(toCard);
  const v = villainCards.map(toCard);
  if ([...b, ...h, ...v].some((c) => c < 0)) return null;

  const heroScore = evaluate7([...b, ...h]);
  const villainScore = evaluate7([...b, ...v]);
  return {
    winner: heroScore > villainScore ? "hero" : heroScore < villainScore ? "villain" : "tie",
    heroHandName: CATEGORY_KO[categoryOf(heroScore)],
    villainHandName: CATEGORY_KO[categoryOf(villainScore)],
  };
}
