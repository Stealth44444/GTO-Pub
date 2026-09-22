import { SEATS, SEAT_LAYOUT, SEAT_STACK, PREFLOP_POT, type HandInfo, type Position } from "@/lib/poker";
import Card from "./Card";

export default function PokerTable({ heroPosition, hand }: { heroPosition: Position; hand: HandInfo }) {
  return (
    <div className="relative mx-auto h-full w-full max-w-sm px-2">
      {/* 테이블 펠트 */}
      <div className="absolute left-[14%] top-[13%] h-[60%] w-[72%] rounded-[50%] border-2 border-slate-700/50 bg-slate-900/40" />

      {/* 팟 + 히어로 핸드 (테이블 중앙) */}
      <div className="absolute left-1/2 top-[38%] flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-3">
        <div className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
          <span className="h-2 w-2 rounded-full bg-sky-400" />
          POT {PREFLOP_POT}bb
        </div>
        <div className="flex gap-2">
          <Card rank={hand.high} suit="s" />
          <Card rank={hand.low} suit={hand.suited ? "s" : "h"} />
        </div>
      </div>

      {SEATS.map((seat) => {
        const isHero = seat === heroPosition;
        const layout = SEAT_LAYOUT[seat];
        return (
          <div
            key={seat}
            className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
            style={{ top: layout.top, left: layout.left }}
          >
            {seat === "BTN" && (
              <span className="absolute -right-3 -top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-white text-[10px] font-bold text-slate-900 shadow">
                D
              </span>
            )}
            {!isHero && (
              <div className="flex gap-0.5">
                <span className="h-6 w-4 rounded-sm bg-slate-700" />
                <span className="h-6 w-4 rounded-sm bg-slate-700" />
              </div>
            )}
            <div
              className={`flex flex-col items-center rounded-full border px-3 py-1 text-center ${
                isHero
                  ? "border-emerald-400 bg-emerald-500/10 text-emerald-300"
                  : "border-slate-700 bg-slate-900/80 text-slate-400"
              }`}
            >
              <span className="text-[11px] font-bold leading-tight">{seat}</span>
              <span className="text-[10px] leading-tight tabular-nums">{SEAT_STACK[seat]}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
