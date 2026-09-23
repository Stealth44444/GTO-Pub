"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  getTableSeats,
  isFoldedBeforeHero,
  seatNames,
  postedBlind,
  randomSuits,
  TABLE_FELT,
  preflopPot,
  type HandInfo,
} from "@/lib/poker";
import Card from "./Card";

// 딜마다 증가하는 키. 링 애니메이션을 다시 돌리는 용도로만 쓴다.
let dealCounter = 0;

/** 앞자리 하나가 생각하고 액션하기까지의 시간. 9인에서 전부 돌면 약 1.5초다. */
const SEAT_STEP_MS = 220;

export default function PokerTable({
  tableSize,
  heroPosition,
  stackBb,
  anteBb,
  shoverPosition,
  awaitingAction,
  hand,
}: {
  tableSize: number;
  heroPosition: string;
  stackBb: number;
  anteBb: number;
  /** 히어로 앞에서 이미 올인한 자리. 없으면 null. */
  shoverPosition: string | null;
  /** 아직 액션을 고르지 않은 상태. 차례인 자리를 발광시킬지 결정한다. */
  awaitingAction: boolean;
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

  // 링 애니메이션은 마운트될 때 한 번 돈다. 새 핸드마다 다시 돌리려면 요소를
  // 갈아끼워야 하므로, hand가 바뀔 때만 새 키를 만든다. 값 자체는 의미가 없고
  // 직전과 다르기만 하면 된다.
  const dealId = useMemo(() => `${hand.code}-${++dealCounter}`, [hand]);

  // 액션 순서. 히어로 앞자리들이 차례로 액션한 뒤 히어로 차례가 온다.
  const order = useMemo(() => seatNames(tableSize), [tableSize]);
  const heroOrderIdx = order.indexOf(heroPosition);

  // 지금 몇 번째 자리까지 액션이 왔는가. 앞자리들이 하나씩 생각하고 액션하는
  // 모습을 보여주기 위한 값이다. heroOrderIdx에 도달하면 히어로 차례다.
  const [acted, setActed] = useState(0);
  const [seenDeal, setSeenDeal] = useState(dealId);
  if (seenDeal !== dealId) {
    // 새 핸드다. 렌더 중 상태 조정 — 이펙트로 되돌리면 한 프레임 깜빡인다.
    setSeenDeal(dealId);
    setActed(0);
  }

  useEffect(() => {
    if (heroOrderIdx <= 0) return;
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      const t = window.setTimeout(() => setActed(heroOrderIdx), 0);
      return () => window.clearTimeout(t);
    }
    const timers = Array.from({ length: heroOrderIdx }, (_, i) =>
      window.setTimeout(() => setActed(i + 1), (i + 1) * SEAT_STEP_MS),
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [dealId, heroOrderIdx]);

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
          // 이 자리가 액션 순서상 몇 번째인지, 그리고 지금 어느 단계인지.
          const orderIdx = order.indexOf(seat);
          const resolved = orderIdx < acted; // 이미 액션을 마쳤다
          const acting = orderIdx === acted; // 지금 이 자리 차례다
          // 히어로는 사용자가 고를 때까지, 앞자리는 타이머가 넘어갈 때까지 발광한다.
          const glowing = acting && (isHero ? awaitingAction : true);
          // 올인한 사람은 히어로보다 앞이지만 폴드가 아니다.
          const folded = !isHero && !isShover && isFoldedBeforeHero(tableSize, seat, heroPosition);
          // 확정된 액션 문구. 액션을 마친 자리만 갖는다.
          const actionText = resolved ? (folded ? "폴드" : isShover ? "올인" : null) : null;
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
                ) : !(resolved && folded) || isShover ? (
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

              {/* 액션 순서대로 테두리가 차오른다. 히어로 뒤 자리는 아직 액션 전이라 비운다. */}
              {orderIdx <= acted && (
                <svg
                  key={dealId}
                  viewBox="0 0 100 100"
                  // 좌석 원보다 조금 크게 잡아 테두리 바깥에 그린다. 같은 자리에
                  // 겹쳐 그리면 원래 테두리와 구분이 안 된다.
                  className="pointer-events-none absolute -inset-1 -rotate-90"
                  aria-hidden
                >
                  <circle
                    cx="50"
                    cy="50"
                    r="47"
                    fill="none"
                    strokeWidth="5"
                    strokeLinecap="round"
                    strokeDasharray="295.3"
                    style={{
                      // CSS 변수는 SVG 속성값에서 해석되지 않는다. 스타일로 줘야 한다.
                      color: isHero
                        ? "var(--gw-accent)"
                        : isShover
                          ? "var(--gw-accent-strong)"
                          : "var(--gw-border-strong)",
                      stroke: "currentColor",
                      // 차례가 된 순간 이 요소가 처음 그려지므로 지연 없이 바로 찬다.
                      animation: glowing
                        ? "gw-seat-sweep 180ms ease-out both, gw-seat-glow 1400ms ease-in-out 180ms infinite"
                        : "gw-seat-sweep 180ms ease-out both",
                    }}
                  />
                </svg>
              )}

              <div
                className={`flex h-full w-full flex-col items-center justify-center rounded-full border-[3px] text-center ${
                  isHero
                    ? "border-[var(--gw-accent)] bg-[var(--gw-table-header)] text-[var(--gw-text-secondary)]"
                    : resolved && folded
                      ? "border-[var(--gw-surface-2)] bg-[var(--gw-bg)] text-neutral-500"
                      : "border-[var(--gw-border)] bg-[var(--gw-table-header)] text-[var(--gw-text-secondary)]"
                }`}
              >
                <span className="text-[11px] font-bold leading-tight sm:text-xs">{seat}</span>
                {/* 분기마다 key를 달리해 요소를 갈아끼운다. 같은 자리에서 글자만
                    바꾸면 React가 DOM을 재사용해 애니메이션이 다시 돌지 않는다. */}
                {actionText ? (
                  <span
                    key="acted"
                    className="text-[11px] font-black leading-tight animate-[gw-action-pop_260ms_cubic-bezier(0.34,1.56,0.64,1)_both] motion-reduce:animate-none"
                  >
                    {actionText}
                  </span>
                ) : acting && !isHero ? (
                  <span
                    key="thinking"
                    className="text-[11px] font-bold leading-none animate-[gw-thinking_900ms_ease-in-out_infinite] motion-reduce:animate-none"
                  >
                    …
                  </span>
                ) : (
                  <span key="stack" className="text-[10px] font-bold leading-tight tabular-nums">
                    {seatStack}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
