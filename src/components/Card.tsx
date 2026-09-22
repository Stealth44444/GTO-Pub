export type Suit = "s" | "h";

// Card Design System-html/Main.dc.html 스펙 그대로 반영.
const SUIT_GLYPH: Record<Suit, string> = { s: "♠", h: "♥" };

const RANK_COLOR: Record<Suit, string> = {
  s: "text-[#f0f0f0]",
  h: "text-[#d63045]",
};

const SYMBOL_COLOR: Record<Suit, string> = {
  s: "text-[#3a3f3f]",
  h: "text-[#7a1a1a]",
};

export default function Card({ rank, suit }: { rank: string; suit: Suit }) {
  return (
    <div className="relative h-14 w-10 flex-shrink-0 overflow-hidden rounded-lg border border-[#555a5a] bg-[#8a9090] shadow-[0_2px_10px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.12)] sm:h-16 sm:w-11">
      <div
        className={`absolute left-1/2 top-1/2 z-[2] -translate-x-1/2 -translate-y-1/2 text-[32px] font-extrabold leading-none sm:text-[38px] ${RANK_COLOR[suit]}`}
      >
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
