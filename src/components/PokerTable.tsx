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
  shoverPosition,
  hand,
}: {
  tableSize: number;
  heroPosition: string;
  stackBb: number;
  anteBb: number;
  /** 히어로 앞에서 이미 올인한 자리. 없으면 null. */
  shoverPosition: string | null;
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

  // 누가 이미 올인했다면 그 스택이 통째로 팟에 들어가 있다. 이미 낸 블라인드는
  // 그 스택에 포함돼 있으므로 중복해서 더하지 않는다.
  const potBb = shoverPosition
    ? preflopPot(anteBb) + stackBb - postedBlind(tableSize, shoverPosition, anteBb)
    : preflopPot(anteBb);

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

        <div
          className="absolute left-1/2 flex -translate-x-1/2 -translate-y-1/2 items-center gap-1.5 text-base font-bold tabular-nums text-[var(--gw-text-muted)]"
          style={{ top: `${TABLE_FELT.top + TABLE_FELT.height / 2}%` }}
        >
          <span className="h-2.5 w-2.5 rounded-full bg-sky-400" />
          POT {potBb}bb
        </div>

        {seats.map(({ seat, top, left }) => {
          const isHero = seat === heroPosition;
          const isShover = seat === shoverPosition;
          // 올인한 사람은 히어로보다 앞이지만 폴드가 아니다.
          const folded = !isHero && !isShover && isFoldedBeforeHero(tableSize, seat, heroPosition);
          const posted = isShover ? stackBb : postedBlind(tableSize, seat, anteBb);
          const seatStack = stackBb - posted;
          // 낸 칩은 실제 테이블처럼 자기 앞, 팟 쪽에 둔다. 좌석에서 테이블 중심을
          // 향하는 방향으로 밀어내면 위아래 좌석도 옆이 아니라 앞에 놓인다.
          // top은 높이 기준 %, left는 너비 기준 %라 가로 성분에 비율을 곱해야
          // 화면상의 실제 방향이 된다.
          const towardPotX = (50 - parseFloat(left)) * aspect;
          const towardPotY = TABLE_FELT.top + TABLE_FELT.height / 2 - parseFloat(top);
          const reach = Math.hypot(towardPotX, towardPotY) || 1;
          // 좌석 원 반지름이 28~32px이므로 그보다 넉넉히 떨어뜨려 붙지 않게 한다.
          // 히어로는 자기 앞에 카드가 놓여 있어 팟 쪽으로 밀면 카드에 가린다.
          // 그 자리만 옆으로 뺀다.
          const chipX = isHero ? 46 : (towardPotX / reach) * 62;
          const chipY = isHero ? 0 : (towardPotY / reach) * 62;
          return (
            <div
              key={seat}
              // 원과 같은 크기로 고정해 translate(-50%,-50%)가 원 자체를 좌표에 중심 정렬하게 한다.
              className="absolute h-14 w-14 -translate-x-1/2 -translate-y-1/2 sm:h-16 sm:w-16"
              style={{ top, left }}
            >
              <div className="absolute bottom-full left-1/2 z-20 mb-1 flex -translate-x-1/2">
                {isHero ? (
                  <div className="flex gap-1">
                    <Card rank={hand.high} suit={highSuit} />
                    <Card rank={hand.low} suit={lowSuit} />
                  </div>
                ) : !folded || isShover ? (
                  <div className="flex gap-0.5">
                    <span className="h-5 w-3.5 rounded-sm bg-[var(--gw-border-strong)]" />
                    <span className="h-5 w-3.5 rounded-sm bg-[var(--gw-border-strong)]" />
                  </div>
                ) : null}
              </div>

              {posted > 0 && (
                <span
                  className="absolute z-10 flex items-center gap-1 whitespace-nowrap text-[11px] font-bold tabular-nums text-[var(--gw-text-secondary)]"
                  style={{
                    left: `calc(50% + ${chipX}px)`,
                    top: `calc(50% + ${chipY}px)`,
                    transform: "translate(-50%, -50%)",
                  }}
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-sky-400 ring-1 ring-sky-200/60" />
                  {posted}bb
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
                  {folded ? "폴드" : isShover ? "올인" : seatStack}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
