const SUIT_INFO = {
  s: { symbol: "♠", color: "text-slate-900" },
  h: { symbol: "♥", color: "text-red-600" },
} as const;

export type Suit = keyof typeof SUIT_INFO;

export default function Card({ rank, suit }: { rank: string; suit: Suit }) {
  const info = SUIT_INFO[suit];
  return (
    <div className="flex h-24 w-16 flex-col items-center justify-center rounded-lg bg-white text-2xl shadow-lg shadow-black/30 sm:h-32 sm:w-20 sm:text-3xl">
      <span className={`font-bold ${info.color}`}>{rank}</span>
      <span className={info.color}>{info.symbol}</span>
    </div>
  );
}
