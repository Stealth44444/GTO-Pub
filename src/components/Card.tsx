import type { CSSProperties } from "react";
import type { Suit } from "@/lib/poker";

const SUIT_GLYPH: Record<Suit, string> = { s: "♠", h: "♥", c: "♣", d: "♦" };

// 카드 시스템의 슈트별 배경색과 어두운 문양색을 사용한다.
// 배경 심볼은 각 메인 색상을 ~55%로 어둡게 만든 값.
const CARD_BG: Record<Suit, string> = {
  s: "bg-[var(--gw-card-spade)]",
  h: "bg-[var(--gw-card-heart)]",
  c: "bg-[var(--gw-card-club)]",
  d: "bg-[var(--gw-card-diamond)]",
};

const SYMBOL_COLOR: Record<Suit, string> = {
  s: "text-[var(--gw-card-spade-ink)]",
  h: "text-[var(--gw-card-heart-ink)]",
  c: "text-[var(--gw-card-club-ink)]",
  d: "text-[var(--gw-card-diamond-ink)]",
};

const SYMBOL_SIZE: Record<Suit, string> = {
  s: "text-[48px] sm:text-[54px]",
  h: "text-[48px] sm:text-[54px]",
  c: "text-[48px] sm:text-[54px]",
  // ♦만 작다. 아래 주석 참고.
  d: "text-[36px] sm:text-[40px]",
};

/**
 * ♦는 마름모라 다른 슈트와 다르게 다뤄야 한다.
 *
 * ♥·♣·♠는 둥근 덩어리여서 모서리에서 잘려도 덩어리로 남지만, 마름모는 잘리면
 * 늘 긴 직선 사선이 남아 카드를 가로지르는 것처럼 보인다. 예전에는 폭이 좁아
 * 보인다고 글자 크기를 키웠는데, 그러면 높이까지 같이 커져서 사선이 더
 * 길어졌다.
 *
 * 그래서 반대로 간다. 크기를 줄여 사선을 짧게 만들고, 모자란 폭은 가로로만
 * 늘려 채우고, 아래로 조금 더 밀어 다른 슈트와 같은 자리에 앉힌다.
 */
const SYMBOL_TRANSFORM: Record<Suit, string> = {
  s: "translateX(38%)",
  h: "translateX(38%)",
  c: "translateX(38%)",
  d: "translateX(40%) translateY(18%) scaleX(1.4)",
};

export default function Card({
  rank,
  suit,
  className = "",
  style,
}: {
  rank: string;
  suit: Suit;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      // 회전 없이도 overflow-hidden + rounded corner에 걸쳐 잘리는 큰 심볼이 있으면
      // border가 모서리에서 1px 정도 깨져 보일 수 있어, border 대신 inset box-shadow로 테두리를 그림.
      style={style}
      className={`relative h-[50px] w-9 flex-shrink-0 overflow-hidden rounded-[var(--gw-radius-card)] shadow-[var(--gw-card-shadow)] sm:h-[58px] sm:w-10 ${CARD_BG[suit]} ${className}`}
    >
      <div className="absolute left-1/2 top-1/2 z-[2] -translate-x-1/2 -translate-y-1/2 text-[29px] font-black leading-none text-[var(--gw-text-primary)] sm:text-[34px]">
        {rank === "T" ? "10" : rank}
      </div>
      <div
        style={{ transform: SYMBOL_TRANSFORM[suit] }}
        className={`absolute bottom-0 right-0 leading-none opacity-90 ${SYMBOL_SIZE[suit]} ${SYMBOL_COLOR[suit]}`}
      >
        {SUIT_GLYPH[suit]}
      </div>
    </div>
  );
}
