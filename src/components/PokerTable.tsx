"use client";

import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  getTableSeats,
  randomSuits,
  seatNames,
  TABLE_FELT,
  type HandInfo,
  type Suit,
} from "@/lib/poker";
import {
  committedBySeat,
  potFromScript,
  pushFoldScript,
  stepLabel,
  type PreflopStep,
} from "@/lib/preflop";
import Card from "./Card";

// 딜마다 증가하는 키. 링 애니메이션을 다시 돌리는 용도로만 쓴다.
let dealCounter = 0;

/**
 * 앞자리 하나가 생각하고 액션하기까지의 시간. 사람처럼 들쭉날쭉해야 자동 진행처럼
 * 보이지 않으므로 기본값에 약간의 폭을 더한다.
 */
const SEAT_WAIT_MIN_MS = 520;
const SEAT_WAIT_SPREAD_MS = 420;

/**
 * 폴드는 실제로도 빠르다. 전원이 같은 속도로 고민하면 9인 테이블의 프리플랍에만
 * 7초가 걸려 매 판 기다리는 시간이 된다. 돈이 오가는 액션에만 시간을 준다.
 */
const FOLD_WAIT_MIN_MS = 260;
const FOLD_WAIT_SPREAD_MS = 200;

/** 마지막 액션이 화면에 머무는 시간. 바로 다음 스트릿으로 넘어가면 못 보고 지나간다. */
const LAST_ACTION_HOLD_MS = 620;

export default function PokerTable({
  tableSize,
  heroPosition,
  stackBb,
  anteBb,
  shoverPosition,
  awaitingAction,
  hand,
  heroCards,
  board,
  potBbOverride,
  dealKey,
  actionSeat,
  foldedSeats,
  onSequenceComplete,
  preflopScript,
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
  heroCards?: [string, string];
  board?: string[];
  potBbOverride?: number;
  dealKey?: string;
  /** 포스트플랍처럼 외부 핸드 상태가 액션 순서를 제어할 때 현재 액션 자리. */
  actionSeat?: string | null;
  /** 테이블에 남은 두 자리 외에 이미 폴드한 자리. */
  foldedSeats?: string[];
  /** 기존 좌석 순서 effect가 끝난 뒤 외부 액션 제어로 전환한다. */
  onSequenceComplete?: () => void;
  /**
   * 재생할 프리플랍 액션 순서. 주지 않으면 푸시/폴드 스팟으로 본다
   * (히어로 앞자리는 전부 폴드, shoverPosition만 올인).
   */
  preflopScript?: PreflopStep[];
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

  const parsedHeroCards = heroCards?.map((card) => ({
    rank: card[0],
    suit: card[1] as Suit,
  }));
  const parsedBoard = board?.map((card) => ({ rank: card[0], suit: card[1] as Suit }));

  // 링 애니메이션은 마운트될 때 한 번 돈다. 새 핸드마다 다시 돌리려면 요소를
  // 갈아끼워야 하므로, hand가 바뀔 때만 새 키를 만든다. 값 자체는 의미가 없고
  // 직전과 다르기만 하면 된다.
  const dealId = useMemo(() => `${hand.code}-${dealKey ?? ++dealCounter}`, [dealKey, hand]);

  // 재생할 프리플랍 액션 순서. 스팟마다 모양이 다르므로 데이터로 받는다.
  const script = useMemo(
    () => preflopScript ?? pushFoldScript(tableSize, heroPosition, shoverPosition, stackBb, anteBb),
    [preflopScript, tableSize, heroPosition, shoverPosition, stackBb, anteBb],
  );

  // 스크립트를 몇 스텝까지 재생했는가. 앞자리들이 하나씩 생각하고 액션하는
  // 모습을 보여주기 위한 값이다. script.length에 도달하면 히어로 차례다.
  const order = useMemo(() => seatNames(tableSize), [tableSize]);
  const [acted, setActed] = useState(0);
  const [seenDeal, setSeenDeal] = useState(dealId);
  if (seenDeal !== dealId) {
    // 새 핸드다. 렌더 중 상태 조정 — 이펙트로 되돌리면 한 프레임 깜빡인다.
    setSeenDeal(dealId);
    setActed(0);
  }

  useEffect(() => {
    if (actionSeat !== undefined) return;
    if (script.length === 0) {
      onSequenceComplete?.();
      return;
    }
    const reduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) {
      const t = window.setTimeout(() => {
        setActed(script.length);
        onSequenceComplete?.();
      }, 0);
      return () => window.clearTimeout(t);
    }
    let at = 0;
    const timers = script.map((step, i) => {
      at +=
        step.kind === "fold"
          ? FOLD_WAIT_MIN_MS + Math.random() * FOLD_WAIT_SPREAD_MS
          : SEAT_WAIT_MIN_MS + Math.random() * SEAT_WAIT_SPREAD_MS;
      return window.setTimeout(() => setActed(i + 1), at);
    });
    // 마지막 액션을 한 박자 보여준 뒤에 넘긴다. 같은 렌더에서 넘기면 그 액션이
    // 뜨자마자 지워져 아무도 못 본다.
    timers.push(window.setTimeout(() => onSequenceComplete?.(), at + LAST_ACTION_HOLD_MS));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [actionSeat, dealId, script, onSequenceComplete]);

  const [highSuit, lowSuit] = useMemo(() => randomSuits(hand.suited), [hand.suited]);
  const externallyControlled = actionSeat !== undefined;

  // 자리 앞의 칩과 팟은 같은 출처에서 나온다. 팟이 칩보다 먼저 커지면
  // 아무도 넣지 않은 돈이 팟에 있는 것처럼 보인다.
  const committed = useMemo(
    () => committedBySeat(tableSize, anteBb, script, acted),
    [tableSize, anteBb, script, acted],
  );
  const potBb = potBbOverride ?? potFromScript(tableSize, anteBb, script, acted);
  // 플랍이 깔리면 프리플랍 칩은 팟으로 쓸려 들어간다. 그대로 두면 이미 팟에
  // 더해진 돈이 자리 앞에도 남아 두 번 세는 것처럼 보인다.
  const chipsSwept = Boolean(board?.length);
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
          className="absolute left-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-1.5 text-base font-bold tabular-nums text-[var(--gw-text-muted)]"
          style={{ top: `${TABLE_FELT.top + TABLE_FELT.height / 2}%` }}
        >
          {parsedBoard && (
            <div className="flex gap-1">
              {parsedBoard.map((card, index) => (
                <Card
                  key={`${card.rank}${card.suit}-${index}`}
                  rank={card.rank}
                  suit={card.suit}
                  className="animate-[gw-card-deal_420ms_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:animate-none"
                  style={{ animationDelay: `${index * 100}ms` }}
                />
              ))}
            </div>
          )}
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-sky-400" />
            POT {potBb}bb
          </div>
        </div>

        {seats.map(({ seat, top, left }) => {
          const isHero = seat === heroPosition;
          const isShover = seat === shoverPosition;
          // 이 자리가 스크립트에서 몇 번째로 액션하는지, 그리고 지금 어느 단계인지.
          const stepIdx = script.findIndex((s) => s.seat === seat);
          const step = stepIdx >= 0 ? script[stepIdx] : null;
          const played = stepIdx >= 0 && stepIdx < acted; // 이 자리의 액션이 이미 재생됐다
          const resolved = externallyControlled
            ? Boolean(foldedSeats?.includes(seat))
            : played;
          const acting = externallyControlled
            ? seat === actionSeat
            : stepIdx === acted && stepIdx >= 0;
          // 히어로는 사용자가 고를 때까지, 앞자리는 타이머가 넘어갈 때까지 발광한다.
          // 히어로는 스크립트에 없으므로 스크립트가 끝나면 차례가 온다.
          const heroTurn = isHero && !externallyControlled && acted >= script.length;
          const glowing = (acting || heroTurn) && (isHero ? awaitingAction : true);
          const folded = externallyControlled
            ? Boolean(foldedSeats?.includes(seat))
            : step?.kind === "fold";
          // 확정된 액션 문구. 액션을 마친 자리만 갖는다.
          const actionText = resolved ? (step ? stepLabel(step) : folded ? "FOLD" : null) : null;
          // 폴드만 붉게, 나머지 액션(레이즈·콜·올인)은 강조색으로 튀어나온다.
          const actionAnimationClass =
            actionText === "FOLD"
              ? "animate-[gw-action-pop-fold_420ms_cubic-bezier(0.34,1.8,0.64,1)_both]"
              : "animate-[gw-action-pop-allin_420ms_cubic-bezier(0.34,1.8,0.64,1)_both]";
          const posted = chipsSwept ? 0 : (committed[seat] ?? 0);
          const seatStack = stackBb - (committed[seat] ?? 0);
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
          const chipX = isHero ? 0 : (towardPotX / reach) * 62;
          const chipY = isHero ? -110 : (towardPotY / reach) * 62;
          // 칩은 committed에서 나오므로, 그 자리가 실제로 액션하기 전에는 블라인드만
          // 놓여 있다. 딜과 동시에 레이즈 칩이 놓여 미리 준비된 것처럼 보이지 않는다.
          const chipVisible = posted > 0;
          // 액션해서 나온 칩은 그 순간이 곧 액션 순간이라 지연이 없다.
          // 딜과 동시에 놓이는 블라인드만 SB→BB 순으로 살짝 어긋나게 낸다.
          const chipDelayMs = played ? 0 : seat === order[order.length - 1] ? 90 : 0;
          return (
            <div
              key={seat}
              // 원과 같은 크기로 고정해 translate(-50%,-50%)가 원 자체를 좌표에 중심 정렬하게 한다.
              className="absolute h-14 w-14 -translate-x-1/2 -translate-y-1/2 sm:h-16 sm:w-16"
              style={{ top, left }}
            >
              <div className="absolute bottom-full left-1/2 z-20 mb-1 flex -translate-x-1/2">
                {isHero && parsedHeroCards ? (
                  <div className="flex gap-1">
                    {parsedHeroCards.map((card, index) => (
                      <Card key={`${card.rank}${card.suit}-${index}`} rank={card.rank} suit={card.suit} />
                    ))}
                  </div>
                ) : isHero ? (
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

              {chipVisible && (
                <span
                  key={`${dealId}-${seat}-${posted}`}
                  className="absolute z-10 animate-[gw-chip-enter_520ms_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:animate-none"
                  style={
                    {
                      left: `calc(50% + ${chipX}px)`,
                      top: `calc(50% + ${chipY}px)`,
                      transform: "translate(-50%, -50%)",
                      // 키프레임이 이 거리만큼 되돌린 지점에서 출발한다.
                      "--gw-chip-dx": `${chipX}px`,
                      "--gw-chip-dy": `${chipY}px`,
                      animationDelay: `${chipDelayMs}ms`,
                    } as CSSProperties
                  }
                >
                  <span className="flex items-center gap-1 whitespace-nowrap text-[11px] font-bold tabular-nums text-[var(--gw-text-secondary)]">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-sky-400 ring-1 ring-sky-200/60" />
                    {posted}bb
                  </span>
                </span>
              )}

              {seat === "BTN" && (
                <span className="absolute -right-2 -top-1 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--gw-text-primary)] text-[10px] font-bold text-[var(--gw-bg)] shadow">
                  D
                </span>
              )}

              {/* 액션 순서대로 테두리가 차오른다. 히어로 뒤 자리는 아직 액션 전이라 비운다. */}
              {/* 테두리를 SVG로 그린다. div의 border 위에 링을 덧그리면 테두리가
                  두 겹이 되므로, 늘 보이는 트랙과 차오르는 호를 한 자리에 겹친다.
                  선 굵기 5.4는 56px 원에서 약 3px — 원래 border-[3px]과 같다. */}
              <svg
                viewBox="0 0 100 100"
                className="pointer-events-none absolute inset-0 -rotate-90"
                aria-hidden
              >
                <circle
                  cx="50"
                  cy="50"
                  r="47.3"
                  fill="none"
                  strokeWidth="5.4"
                  style={{
                    stroke:
                      resolved && folded ? "var(--gw-surface-2)" : "var(--gw-border)",
                  }}
                />
                {(externallyControlled
                  ? acting
                  : (stepIdx >= 0 && stepIdx <= acted) || heroTurn) && (
                  <circle
                    key={dealId}
                    cx="50"
                    cy="50"
                    r="47.3"
                    fill="none"
                    strokeWidth="5.4"
                    strokeLinecap="round"
                    strokeDasharray="297.2"
                    style={{
                      // CSS 변수는 SVG 속성값에서 해석되지 않는다. 스타일로 줘야 한다.
                      color: isHero
                        ? "var(--gw-accent)"
                        : isShover
                          ? "var(--gw-accent-strong)"
                          : acting
                            ? "var(--gw-accent)"
                            : "var(--gw-border-strong)",
                      stroke: "currentColor",
                      // 차례가 된 순간 이 요소가 처음 그려지므로 지연 없이 바로 찬다.
                      animation: glowing
                        ? "gw-seat-sweep 260ms ease-out both, gw-seat-glow 1400ms ease-in-out 260ms infinite"
                        : "gw-seat-sweep 260ms ease-out both",
                    }}
                  />
                )}
              </svg>

              <div
                className={`flex h-full w-full flex-col items-center justify-center rounded-full text-center ${
                  resolved && folded
                    ? "bg-[var(--gw-bg)] text-neutral-500"
                    : "bg-[var(--gw-table-header)] text-[var(--gw-text-secondary)]"
                }`}
              >
                <span className="text-[11px] font-bold leading-tight sm:text-xs">{seat}</span>
                {/* 분기마다 key를 달리해 요소를 갈아끼운다. 같은 자리에서 글자만
                    바꾸면 React가 DOM을 재사용해 애니메이션이 다시 돌지 않는다. */}
                {actionText ? (
                  <span
                    key="acted"
                    className={`text-xs font-black leading-tight ${actionAnimationClass} motion-reduce:animate-none`}
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
