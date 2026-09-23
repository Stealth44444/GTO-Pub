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
  s: "text-[54px] sm:text-[60px]",
  h: "text-[54px] sm:text-[60px]",
  c: "text-[54px] sm:text-[60px]",
  // 같은 폰트 크기에서도 ♦ 글리프의 실제 폭이 작아 보여 보정한다.
  d: "text-[68px] sm:text-[76px]",
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
      className={`relative h-14 w-10 flex-shrink-0 overflow-hidden rounded-[var(--gw-radius-card)] shadow-[var(--gw-card-shadow)] sm:h-16 sm:w-11 ${CARD_BG[suit]} ${className}`}
    >
      <div className="absolute left-1/2 top-1/2 z-[2] -translate-x-1/2 -translate-y-1/2 text-[32px] font-black leading-none text-[var(--gw-text-primary)] sm:text-[38px]">
        {rank === "T" ? "10" : rank}
      </div>
      <div
        className={`absolute bottom-0 right-0 translate-x-[38%] leading-none opacity-90 ${SYMBOL_SIZE[suit]} ${SYMBOL_COLOR[suit]}`}
      >
        {SUIT_GLYPH[suit]}
      </div>
    </div>
  );
}
