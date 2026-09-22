export type Suit = "s" | "h" | "c";

const SUIT_GLYPH: Record<Suit, string> = { s: "♠", h: "♥", c: "♣" };

// app.gtowizard.com의 실제 CSS에서 확인한 슈트 색상 그대로 사용
// (--clr-spades:#504f4f, --clr-hearts:#ad0e04, --clr-clubs:#0ead2c).
// 배경 심볼은 각 메인 색상을 ~55%로 어둡게 만든 값.
const CARD_BG: Record<Suit, string> = {
  s: "bg-[#504f4f]",
  h: "bg-[#ad0e04]",
  c: "bg-[#0ead2c]",
};

const SYMBOL_COLOR: Record<Suit, string> = {
  s: "text-[#2b2a2a]",
  h: "text-[#5f0802]",
  c: "text-[#085f18]",
};

export default function Card({ rank, suit }: { rank: string; suit: Suit }) {
  return (
    <div
      // 회전 없이도 overflow-hidden + rounded corner에 걸쳐 잘리는 큰 심볼이 있으면
      // border가 모서리에서 1px 정도 깨져 보일 수 있어, border 대신 inset box-shadow로 테두리를 그림.
      className={`relative h-14 w-10 flex-shrink-0 overflow-hidden rounded-lg shadow-[0_2px_10px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.12),inset_0_0_0_1px_#555a5a] sm:h-16 sm:w-11 ${CARD_BG[suit]}`}
    >
      <div className="absolute left-1/2 top-1/2 z-[2] -translate-x-1/2 -translate-y-1/2 text-[32px] font-black leading-none text-[#f0f0f0] sm:text-[38px]">
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
