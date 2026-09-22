const SUIT_GLYPH = { s: "♠", h: "♥" } as const;

export type Suit = keyof typeof SUIT_GLYPH;

export default function Card({ rank, suit }: { rank: string; suit: Suit }) {
  return (
    <div className="relative flex h-14 w-10 flex-col items-center justify-center rounded-md bg-emerald-600 shadow-lg shadow-black/40 sm:h-16 sm:w-11">
      <span className="absolute right-1 top-0.5 text-[9px] leading-none text-white/70">
        {SUIT_GLYPH[suit]}
      </span>
      <span className="text-xl font-extrabold leading-none text-white sm:text-2xl">{rank}</span>
    </div>
  );
}
