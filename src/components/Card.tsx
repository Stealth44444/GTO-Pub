export type Suit = "s" | "h" | "c";

const SUIT_GLYPH: Record<Suit, string> = { s: "♠", h: "♥", c: "♣" };

// app.gtowizard.com의 실제 CSS에서 확인한 슈트 색상(--clr-hearts, --clr-clubs)을 그대로 쓰고,
// 스페이드는 (GTOWizard 실제로는 회색이지만) 요청대로 "파랑" 매핑을 유지하되 값은
// GTOWizard가 쓰는 실제 파랑(--clr-diamonds)을 가져다 씀. 배경 심볼은 각 색을 ~55%로 어둡게.
const CARD_BG: Record<Suit, string> = {
  s: "bg-[#2235c5]",
  h: "bg-[#ad0e04]",
  c: "bg-[#0ead2c]",
};

const SYMBOL_COLOR: Record<Suit, string> = {
  s: "text-[#131d6c]",
  h: "text-[#5f0802]",
  c: "text-[#085f18]",
};

export default function Card({ rank, suit }: { rank: string; suit: Suit }) {
  return (
    <div
      className={`relative h-14 w-10 flex-shrink-0 overflow-hidden rounded-lg border border-[#555a5a] shadow-[0_2px_10px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.12)] sm:h-16 sm:w-11 ${CARD_BG[suit]}`}
    >
      <div className="absolute left-1/2 top-1/2 z-[2] -translate-x-1/2 -translate-y-1/2 text-[32px] font-extrabold leading-none text-[#f0f0f0] sm:text-[38px]">
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
