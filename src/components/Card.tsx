import type { Suit } from "@/lib/poker";

const SUIT_GLYPH: Record<Suit, string> = { s: "♠", h: "♥", c: "♣" };

// app.gtowizard.com의 실제 CSS에서 확인한 슈트 색상 그대로 사용
// (--clr-spades:#504f4f, --clr-hearts:#ad0e04, --clr-clubs:#0ead2c).
// 배경 심볼은 각 메인 색상을 ~55%로 어둡게 만든 값.
const CARD_BG: Record<Suit, string> = {
  s: "bg-[var(--gw-card-spade)]",
  h: "bg-[var(--gw-card-heart)]",
  c: "bg-[var(--gw-card-club)]",
};

const SYMBOL_COLOR: Record<Suit, string> = {
  s: "text-[var(--gw-card-spade-ink)]",
  h: "text-[var(--gw-card-heart-ink)]",
  c: "text-[var(--gw-card-club-ink)]",
};

export default function Card({ rank, suit }: { rank: string; suit: Suit }) {
  return (
    <div
      // 회전 없이도 overflow-hidden + rounded corner에 걸쳐 잘리는 큰 심볼이 있으면
      // border가 모서리에서 1px 정도 깨져 보일 수 있어, border 대신 inset box-shadow로 테두리를 그림.
      className={`relative h-14 w-10 flex-shrink-0 overflow-hidden rounded-[var(--gw-radius-card)] shadow-[var(--gw-card-shadow)] sm:h-16 sm:w-11 ${CARD_BG[suit]}`}
    >
      <div className="absolute left-1/2 top-1/2 z-[2] -translate-x-1/2 -translate-y-1/2 text-[32px] font-black leading-none text-[var(--gw-text-primary)] sm:text-[38px]">
        {rank}
      </div>
      <div
        className={`absolute bottom-0 right-0 translate-x-[38%] text-[54px] leading-none opacity-90 sm:text-[60px] ${SYMBOL_COLOR[suit]}`}
      >
        {SUIT_GLYPH[suit]}
      </div>
    </div>
  );
}
