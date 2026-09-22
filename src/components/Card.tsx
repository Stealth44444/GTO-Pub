export type Suit = "s" | "h";

// 유니코드 슈트 글리프는 폰/OS마다 렌더링이 달라서, 실제 카드처럼 벡터 아이콘으로 그립니다.
const SUIT_PATH: Record<Suit, string> = {
  s: "M12 2C8 6 4 10 4 14a4 4 0 0 0 7 2.6c-.3 2-1 3-2.5 4.4h7c-1.5-1.4-2.2-2.4-2.5-4.4A4 4 0 0 0 20 14c0-4-4-8-8-12z",
  h: "M12 21s-7-4.35-9.5-8.5C.5 9 2 5.5 5.5 5.5c2 0 3.5 1.2 4.5 2.7 1-1.5 2.5-2.7 4.5-2.7 3.5 0 5 3.5 3 7C19 16.65 12 21 12 21z",
};

function SuitIcon({ suit, className }: { suit: Suit; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d={SUIT_PATH[suit]} />
    </svg>
  );
}

export default function Card({ rank, suit }: { rank: string; suit: Suit }) {
  return (
    <div className="flex h-14 w-10 flex-col items-center justify-center gap-0.5 rounded-lg bg-emerald-600 shadow-lg shadow-black/40 sm:h-16 sm:w-11">
      <SuitIcon suit={suit} className="h-2.5 w-2.5 text-white/70" />
      <span className="text-xl font-extrabold leading-none text-white sm:text-2xl">{rank}</span>
    </div>
  );
}
