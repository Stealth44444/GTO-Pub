"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  getTableSeats,
  isFoldedBeforeHero,
  postedBlind,
  randomSuits,
  TABLE_FELT,
  preflopPot,
  type HandInfo,
} from "@/lib/poker";
import Card from "./Card";

export default function PokerTable({
  tableSize,
  heroPosition,
  stackBb,
  anteBb,
  hand,
}: {
  tableSize: number;
  heroPosition: string;
  stackBb: number;
  anteBb: number;
  hand: HandInfo;
}) {
  const boxRef = useRef<HTMLDivElement>(null);
  // 좌석을 외곽선 위에 정확히 놓으려면 컨테이너의 실제 가로/세로 비율이 필요하다.
  const [aspect, setAspect] = useState(0.66);

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const update = () => {
      if (box.clientHeight > 0) setAspect(box.clientWidth / box.clientHeight);
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  const [highSuit, lowSuit] = useMemo(() => randomSuits(hand.suited), [hand.suited]);
  const seats = useMemo(
    () => getTableSeats(tableSize, heroPosition, aspect),
    [tableSize, heroPosition, aspect],
  );

  return (
    <div className="absolute inset-0">
      <div ref={boxRef} className="relative mx-auto h-full w-full max-w-sm px-2">
        {/* 테이블 펠트 — GTOWizard의 --table-radius: 999px는 완전한 타원이 아니라
            좌우는 직선, 위아래만 반원인 스타디움 형태. --clr-table-back: transparent라
            채움 없이 외곽선만 사용. 좌석 좌표는 이 값을 공유한다(poker.ts 참고). */}
        <div
          className="absolute rounded-[999px] border-[3px] border-[var(--gw-border)]"
          style={{
            left: `${TABLE_FELT.left}%`,
            top: `${TABLE_FELT.top}%`,
            width: `${TABLE_FELT.width}%`,
            height: `${TABLE_FELT.height}%`,
          }}
        />

        <div className="absolute left-1/2 top-[38%] flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 text-xs font-medium text-[var(--gw-text-muted)]">
          <span className="h-2 w-2 rounded-full bg-sky-400" />
          POT {preflopPot(anteBb)}bb
        </div>

        {seats.map(({ seat, top, left }) => {
          const isHero = seat === heroPosition;
          const folded = !isHero && isFoldedBeforeHero(tableSize, seat, heroPosition);
          const posted = postedBlind(tableSize, seat, anteBb);
          const seatStack = stackBb - posted;
          // 칩은 테이블 중앙(팟) 쪽에 붙인다. 좌표가 왼쪽 절반이면 오른쪽에,
          // 오른쪽 절반이면 왼쪽에 놓아야 안쪽을 향한다.
          const chipsInside = parseFloat(left) < 50 ? "left-full ml-1" : "right-full mr-1";
          return (
            <div
              key={seat}
              // 원과 같은 크기로 고정해 translate(-50%,-50%)가 원 자체를 좌표에 중심 정렬하게 한다.
              className="absolute h-14 w-14 -translate-x-1/2 -translate-y-1/2 sm:h-16 sm:w-16"
              style={{ top, left }}
            >
              <div className="absolute bottom-full left-1/2 mb-1 flex -translate-x-1/2">
                {isHero ? (
                  <div className="flex gap-1">
                    <Card rank={hand.high} suit={highSuit} />
                    <Card rank={hand.low} suit={lowSuit} />
                  </div>
                ) : !folded ? (
                  <div className="flex gap-0.5">
                    <span className="h-5 w-3.5 rounded-sm bg-[var(--gw-border-strong)]" />
                    <span className="h-5 w-3.5 rounded-sm bg-[var(--gw-border-strong)]" />
                  </div>
                ) : null}
              </div>

              {posted > 0 && (
                <span
                  className={`absolute top-1/2 z-10 flex -translate-y-1/2 items-center gap-1 whitespace-nowrap rounded-full bg-[var(--gw-bg)]/90 px-1.5 py-0.5 text-[9px] font-bold tabular-nums text-[var(--gw-text-secondary)] ring-1 ring-[var(--gw-border)] ${chipsInside}`}
                >
                  <span className="h-2 w-2 shrink-0 rounded-full bg-sky-400 ring-1 ring-sky-200/60" />
                  {posted}
                </span>
              )}

              {seat === "BTN" && (
                <span className="absolute -right-2 -top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--gw-text-primary)] text-[10px] font-bold text-[var(--gw-bg)] shadow">
                  D
                </span>
              )}

              <div
                className={`flex h-full w-full flex-col items-center justify-center rounded-full border-[3px] text-center ${
                  isHero
                    ? "border-[var(--gw-accent)] bg-[var(--gw-table-header)] text-[var(--gw-text-secondary)]"
                    : folded
                      ? "border-[var(--gw-surface-2)] bg-[var(--gw-bg)] text-neutral-500"
                      : "border-[var(--gw-border)] bg-[var(--gw-table-header)] text-[var(--gw-text-secondary)]"
                }`}
              >
                <span className="text-[11px] font-bold leading-tight sm:text-xs">{seat}</span>
                <span className="text-[10px] font-bold leading-tight tabular-nums">
                  {folded ? "폴드" : seatStack}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
