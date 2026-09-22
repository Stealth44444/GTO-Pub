import {
  getTableSeats,
  isFoldedBeforeHero,
  SEAT_STACK,
  PREFLOP_POT,
  type HandInfo,
  type Position,
} from "@/lib/poker";
import Card from "./Card";

export default function PokerTable({ heroPosition, hand }: { heroPosition: Position; hand: HandInfo }) {
  // flex-1 부모의 계산된 높이를 자식의 height:100%가 안정적으로 못 읽는 경우가 있어
  // absolute + inset-0으로 부모 박스를 직접 채운 뒤, 그 안에서 퍼센트 좌표로 좌석을 배치합니다.
  return (
    <div className="absolute inset-0">
      <div className="relative mx-auto h-full w-full max-w-sm px-2">
        {/* 테이블 펠트 — GTOWizard의 --table-radius: 999px는 완전한 타원이 아니라
            좌우는 직선, 위아래만 반원인 스타디움 형태. --clr-table-back: transparent라 채움 없이 외곽선만 사용 */}
        <div className="absolute left-[8%] top-[6%] h-[84%] w-[84%] rounded-[999px] border-2 border-[var(--gw-surface-3)]" />

        {/* 팟 표시 (테이블 중앙) */}
        <div className="absolute left-1/2 top-[38%] flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 text-xs font-medium text-slate-400">
          <span className="h-2 w-2 rounded-full bg-sky-400" />
          POT {PREFLOP_POT}bb
        </div>

        {getTableSeats(heroPosition).map(({ seat, top, left }) => {
          const isHero = seat === heroPosition;
          const folded = !isHero && isFoldedBeforeHero(seat, heroPosition);
          return (
            <div
              key={seat}
              className="absolute flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1"
              style={{ top, left }}
            >
              {seat === "BTN" && (
                <span className="absolute -right-3 -top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-white text-[10px] font-bold text-slate-900 shadow">
                  D
                </span>
              )}

              {isHero ? (
                <div className="mb-0.5 flex">
                  <div className="-mr-2 rotate-[-8deg]">
                    <Card rank={hand.high} suit="s" />
                  </div>
                  <div className="rotate-[8deg]">
                    <Card rank={hand.low} suit={hand.suited ? "s" : "h"} />
                  </div>
                </div>
              ) : !folded ? (
                <div className="flex gap-0.5">
                  <span className="h-6 w-4 rounded-sm bg-[var(--gw-surface-3)]" />
                  <span className="h-6 w-4 rounded-sm bg-[var(--gw-surface-3)]" />
                </div>
              ) : (
                <div className="h-6" />
              )}

              <div
                className={`flex h-16 w-16 flex-col items-center justify-center rounded-full border text-center sm:h-20 sm:w-20 ${
                  isHero
                    ? "border-emerald-400 bg-emerald-500/10 text-emerald-300"
                    : folded
                      ? "border-[var(--gw-surface-2)] bg-transparent text-slate-600"
                      : "border-[var(--gw-surface-3)] bg-[var(--gw-table-header)] text-slate-400"
                }`}
              >
                <span className="text-xs font-bold leading-tight sm:text-sm">{seat}</span>
                <span className="text-[10px] leading-tight tabular-nums sm:text-xs">
                  {folded ? "폴드" : SEAT_STACK[seat]}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
