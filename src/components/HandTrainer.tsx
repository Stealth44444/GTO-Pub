"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import preflopData from "@/data/preflop-btn-bb.json";
import { actionEvFor, actionLabel, type SolvedSpot } from "@/lib/tree";
import { makeDecision, type Decision } from "@/lib/decisions";
import { buildTableView } from "@/lib/tableView";
import { judge, type Showdown } from "@/lib/showdown";
import HandResult from "./HandResult";
import { applyAction, startHand, type HandState } from "@/lib/hand";
import { sampleActionIndex, type Deal } from "@/lib/postflopSpot";
import { ALL_HANDS, seatNames } from "@/lib/poker";
import {
  actionLabelAt,
  dealCombo,
  type PreflopAction,
  type PreflopData,
  type PreflopSeat,
} from "@/lib/preflopGame";
import { applyPreflop, startPreflop, type PreflopState } from "@/lib/handFlow";
import {
  loadSpot,
  loadSpotIndex,
  pickSpotEntry,
  prefetchSpot,
  type SpotEntry,
} from "@/lib/spotLibrary";
import { DEFAULT_SCENARIO } from "@/lib/scenarios";
import PokerTable from "./PokerTable";

const PREFLOP = preflopData as unknown as PreflopData;
const tableHand = ALL_HANDS[0];

/** 한 스텝이 화면에 나타나고 다음으로 넘어가기까지. 폴드는 실제로도 빠르다. */
const STEP_MS = 620;
const FOLD_STEP_MS = 320;

type Phase = "preflop" | "postflop" | "over";

type Round = {
  id: number;
  heroSeat: PreflopSeat;
  pre: PreflopState;
  entry: SpotEntry | null;
  spot: SolvedSpot | null;
  post: HandState | null;
  deal: Deal | null;
};

/** 169개 클래스에서 조합 수에 비례해 하나 뽑는다. */
function dealHandCode(rnd: () => number): string {
  const total = ALL_HANDS.reduce((s, h) => s + h.combos, 0);
  let r = rnd() * total;
  for (const h of ALL_HANDS) {
    r -= h.combos;
    if (r <= 0) return h.code;
  }
  return ALL_HANDS[0].code;
}

/** 새 판의 초기 상태. 마운트 이펙트에서 setState를 부르지 않으려고 분리했다. */
function freshRound(): Round {
  const heroSeat: PreflopSeat = Math.random() < 0.5 ? "BTN" : "BB";
  const heroHand = dealHandCode(Math.random);
  const villainHand = dealHandCode(Math.random);
  return {
    id: Date.now() + Math.floor(Math.random() * 1000),
    heroSeat,
    pre: startPreflop(PREFLOP, heroSeat, heroHand, villainHand, Math.random),
    entry: null,
    spot: null,
    post: null,
    deal: null,
  };
}

export default function HandTrainer() {
  const [entries, setEntries] = useState<SpotEntry[] | null>(null);
  const [round, setRound] = useState<Round | null>(freshRound);
  const [phase, setPhase] = useState<Phase>("preflop");
  const [revealed, setRevealed] = useState(0);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [ending, setEnding] = useState<string | null>(null);
  /**
   * 어느 베팅 라운드를 이미 팟으로 쓸어 담았는지. 불리언으로 두면 라운드가
   * 바뀔 때 되돌릴 이펙트가 필요하지만, 키로 두면 저절로 초기화된다.
   */
  const [sweptKey, setSweptKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timers = useRef<number[]>([]);

  const tableSize = DEFAULT_SCENARIO.tableSize;

  const clearTimers = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  }, []);

  const newRound = useCallback(() => {
    clearTimers();
    setDecisions([]);
    setEnding(null);
    setPhase("preflop");
    setRevealed(0);
    setRound(freshRound());
  }, [clearTimers]);

  useEffect(() => {
    loadSpotIndex()
      .then((list) => {
        setEntries(list);
        prefetchSpot(pickSpotEntry(list, Math.random));
      })
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "보드 목록을 불러오지 못했습니다"),
      );
    return clearTimers;
  }, [clearTimers]);

  // 아직 안 보여준 스텝이 있으면 한 박자씩 넘긴다.
  useEffect(() => {
    if (!round || revealed >= round.pre.steps.length) return;
    const step = round.pre.steps[revealed];
    const wait = step.kind === "fold" ? FOLD_STEP_MS : STEP_MS;
    const t = window.setTimeout(() => setRevealed((n) => n + 1), wait);
    timers.current.push(t);
    return () => window.clearTimeout(t);
  }, [round, revealed]);

  const allRevealed = round ? revealed >= round.pre.steps.length : false;
  const outcome = round?.pre.outcome ?? null;

  // 프리플랍이 끝나고 모든 액션을 다 보여줬으면 결과를 확정한다.
  useEffect(() => {
    if (!round || !allRevealed || !outcome || phase !== "preflop") return;
    if (outcome.kind !== "flop") {
      const t = window.setTimeout(() => setPhase("over"), 500);
      timers.current.push(t);
      return () => window.clearTimeout(t);
    }
    if (!entries) return;
    let alive = true;
    const entry = pickSpotEntry(entries, Math.random, round.entry?.file);
    loadSpot(entry)
      .then((spot) => {
        if (!alive) return;
        // 프리플랍에서 쥔 핸드를 그대로 들고 플랍에 간다. 보드와 겹치지 않는
        // 조합을 골라야 하고, 스팟의 레인지에 실제로 있는 조합이어야 한다.
        const board = new Set(spot.flop);
        const heroPlayer: 0 | 1 = round.heroSeat === "BB" ? 0 : 1;
        const heroCombo = dealCombo(round.pre.heroHand, board, Math.random);
        const blocked = new Set([...board, ...(heroCombo ?? [])]);
        const villainCombo = dealCombo(round.pre.villainHand, blocked, Math.random);
        if (!heroCombo || !villainCombo) {
          setEnding("이 보드와 카드가 겹쳐 플랍을 깔 수 없었습니다");
          setPhase("over");
          return;
        }
        const hands: [string, string] =
          heroPlayer === 0
            ? [heroCombo.join(""), villainCombo.join("")]
            : [villainCombo.join(""), heroCombo.join("")];
        const handIdx: [number, number] = [
          spot.handsByPlayer[0].indexOf(hands[0]),
          spot.handsByPlayer[1].indexOf(hands[1]),
        ];
        if (handIdx[0] < 0 || handIdx[1] < 0) {
          // 솔버가 이 자리에서 이 핸드를 들고 플랍에 오지 않는다. 그래서 플랍
          // 데이터가 없다. 그냥 끝내면 왜 끝났는지 알 수 없으므로 이유를 남긴다.
          setEnding(
            handIdx[0] < 0 && round.heroSeat === "BB"
              ? "솔버는 이 핸드로 콜하지 않아, 플랍부터는 비교할 정답이 없습니다"
              : "이 보드에서는 그 핸드의 플랍 데이터가 없습니다",
          );
          setPhase("over");
          return;
        }
        setRound((cur) =>
          cur
            ? { ...cur, entry, spot, post: startHand(spot), deal: { heroPlayer, hands, handIdx } }
            : cur,
        );
        setPhase("postflop");
        prefetchSpot(pickSpotEntry(entries, Math.random, entry.file));
      })
      .catch(() => setPhase("over"));
    return () => {
      alive = false;
    };
  }, [round, allRevealed, outcome, phase, entries]);

  // 포스트플랍에서 상대 차례면 솔브된 전략대로 친다.
  const postHeroTurn = round?.post?.node?.player === round?.deal?.heroPlayer;

  const heroSeat: PreflopSeat = round?.heroSeat ?? "BTN";
  const villainSeat = heroSeat === "BTN" ? "BB" : "BTN";

  // 좌석 액션·칩·팟은 한 곳에서 뽑는다. 따로 계산하면 서로 어긋난다 —
  // 실제로 팟이 음수로 내려간 적이 있다.
  const view =
    phase === "postflop" && round?.post && round.spot && round.deal
      ? buildTableView(
          round.post,
          round.spot.startingPotBb,
          heroSeat,
          villainSeat,
          round.deal.heroPlayer,
        )
      : null;
  // 베팅이 맞으면 칩이 가운데로 날아가고, 460ms 뒤 팟에 합쳐진다.
  const roundKey = view && round ? `${round.id}-${view.frontBb}-${round.post?.street}` : null;
  const swept = Boolean(view?.closed) && sweptKey === roundKey;
  const chipsShown = Boolean(view) && !swept && (view?.frontBb ?? 0) > 0;
  useEffect(() => {
    if (phase !== "postflop" || !round?.post?.node || !round.spot || postHeroTurn || ending) return;
    const t = window.setTimeout(() => {
      setRound((cur) => {
        if (!cur?.post?.node || !cur.spot || !cur.deal) return cur;
        const node = cur.post.node;
        const idx = sampleActionIndex(node, cur.deal.handIdx[node.player], Math.random);
        const next = applyAction(cur.spot, cur.post, idx);
        if (next.node === null) {
          setEnding(`상대가 ${actionLabel(node.actions[idx])}으로 핸드를 끝냈습니다`);
        }
        return { ...cur, post: next };
      });
    }, 700);
    timers.current.push(t);
    return () => window.clearTimeout(t);
  }, [phase, round, postHeroTurn, ending]);

  // 칩이 팟으로 들어가는 동안만 자리 앞에 남겨 둔다.
  useEffect(() => {
    if (!view?.closed || !roundKey || sweptKey === roundKey) return;
    const t = window.setTimeout(() => setSweptKey(roundKey), 460);
    timers.current.push(t);
    return () => window.clearTimeout(t);
  }, [view?.closed, roundKey, sweptKey]);

  /**
   * 리버까지 갔으면 누가 이겼는지. 상태가 아니라 파생값이다 — 보드와 두 핸드가
   * 정해지면 결과도 정해진다.
   *
   * 결과는 참고일 뿐 채점 근거가 아니다. 좋은 판단이 지는 일은 늘 있고,
   * 결과로 판단을 평가하기 시작하면 배우는 게 반대로 뒤집힌다.
   */
  const showdown: Showdown | null = useMemo(() => {
    if (!ending || !round?.post || !round.deal) return null;
    const { hands, heroPlayer } = round.deal;
    const hero = hands[heroPlayer];
    const villain = hands[1 - heroPlayer];
    return judge(
      round.post.board,
      [hero.slice(0, 2), hero.slice(2, 4)],
      [villain.slice(0, 2), villain.slice(2, 4)],
    );
  }, [ending, round]);

  const choosePreflop = (action: PreflopAction) => {
    if (!round?.pre.turn || ending || !allRevealed) return;
    const turn = round.pre.turn;
    const labels = turn.actions.map((a) => actionLabelAt(PREFLOP, turn.node, a));
    const i = turn.actions.indexOf(action);
    // turn.evBb에는 null이 섞일 수 있다(레인지 밖 핸드의 콜). 그대로 넘긴다.
    setDecisions((prev) => [...prev, makeDecision("PREFLOP", labels, turn.evBb, i)]);
    setRound((cur) =>
      cur ? { ...cur, pre: applyPreflop(PREFLOP, cur.pre, action, Math.random) } : cur,
    );
  };

  const choosePostflop = (index: number) => {
    if (!round?.post?.node || !round.spot || !round.deal || !postHeroTurn || ending) return;
    const node = round.post.node;
    const ev = actionEvFor(node, round.deal.handIdx[round.deal.heroPlayer]);
    const labels = node.actions.map(actionLabel);
    // 핸드를 끝내는 액션이든 아니든 똑같이 채점해서 쌓는다.
    setDecisions((prev) => [
      ...prev,
      makeDecision(round.post!.street.toUpperCase(), labels, ev, index),
    ]);
    const next = applyAction(round.spot, round.post, index);
    if (next.node === null) {
      setEnding(`내가 ${labels[index]}으로 핸드를 끝냈습니다`);
    }
    setRound((cur) => (cur ? { ...cur, post: next } : cur));
  };

  if (error) {
    return (
      <div className="flex h-full items-center justify-center px-8 text-center">
        <p className="text-sm text-[var(--gw-text-muted)]">{error}</p>
      </div>
    );
  }
  if (!round) {
    return (
      <div className="flex h-full items-center justify-center px-8">
        <p className="animate-[gw-thinking_1200ms_ease-in-out_infinite] text-xs font-bold tracking-widest text-[var(--gw-text-muted)]">
          준비 중…
        </p>
      </div>
    );
  }

  const foldedSeats = seatNames(tableSize).filter((x) => x !== heroSeat && x !== villainSeat);
  const preTurnReady = Boolean(round.pre.turn && allRevealed && !ending);
  const street =
    phase === "postflop" && round.post ? round.post.street.toUpperCase() : "PREFLOP";

  // 프리플랍에서는 테이블이 우리가 재생하는 스텝을 따라가고,
  // 플랍부터는 포스트플랍 상태가 액션 순서를 정한다.
  const postActionSeat = round.post?.node
    ? round.post.node.player === round.deal?.heroPlayer
      ? heroSeat
      : villainSeat
    : null;

  const heroCards: [string, string] | undefined =
    phase === "postflop" && round.deal
      ? [
          round.deal.hands[round.deal.heroPlayer].slice(0, 2),
          round.deal.hands[round.deal.heroPlayer].slice(2, 4),
        ]
      : undefined;

  return (
    <div
      className="relative flex h-full min-h-0 flex-col select-none overflow-hidden"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <header className="absolute inset-x-0 top-0 z-20 flex h-12 items-center justify-between bg-[var(--gw-bg)]/90 px-3 backdrop-blur-sm">
        <div className="text-[10px] font-bold tracking-wide text-[var(--gw-text-muted)]">
          {street} · {heroSeat} · {round.pre.heroHand}
        </div>
        <div className="text-[10px] font-bold text-[var(--gw-accent)]">
          {PREFLOP.stackBb}bb · 앤티 {PREFLOP.anteBb}
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        <div className="absolute inset-x-0 bottom-0 top-12">
          <PokerTable
            tableSize={tableSize}
            heroPosition={heroSeat}
            stackBb={PREFLOP.stackBb}
            anteBb={PREFLOP.anteBb}
            shoverPosition={null}
            awaitingAction={preTurnReady || (phase === "postflop" && postHeroTurn && !ending)}
            hand={tableHand}
            heroCards={heroCards}
            board={phase === "postflop" ? round.post?.board : undefined}
            potBbOverride={
              view ? Number((view.totalPotBb - (chipsShown ? view.frontBb : 0)).toFixed(2)) : undefined
            }
            dealKey={String(round.id)}
            actionSeat={phase === "postflop" ? postActionSeat : undefined}
            foldedSeats={foldedSeats}
            preflopScript={round.pre.steps}
            revealedSteps={phase === "postflop" ? undefined : revealed}
            seatActions={view?.actions}
            seatChips={view ? (chipsShown ? view.chips : {}) : undefined}
            collectingChips={Boolean(view?.closed) && !swept}
          />
        </div>
      </div>

      {/* 프리플랍 선택지 */}
      {!ending && round.pre.turn && phase === "preflop" && (
        <div
          className="grid gap-3 px-4 pb-4"
          style={{ gridTemplateColumns: `repeat(${round.pre.turn.actions.length}, minmax(0, 1fr))` }}
        >
          {round.pre.turn.actions.map((action) => (
            <button
              key={action}
              type="button"
              disabled={!preTurnReady}
              onClick={() => choosePreflop(action)}
              className={`rounded-[var(--gw-radius-control)] py-4 text-base font-bold transition active:scale-95 disabled:cursor-wait disabled:opacity-40 sm:text-lg ${
                action === "fold"
                  ? "bg-[var(--gw-danger)] text-[var(--gw-text-primary)]"
                  : action === "call"
                    ? "bg-[var(--gw-accent)] text-[var(--gw-bg)]"
                    : "bg-[var(--gw-accent-strong)] text-[var(--gw-text-primary)]"
              }`}
            >
              {actionLabelAt(PREFLOP, round.pre.turn!.node, action)}
            </button>
          ))}
        </div>
      )}

      {/* 포스트플랍 선택지 */}
      {!ending && phase === "postflop" && round.post?.node && (
        <div
          className="grid gap-3 px-4 pb-4"
          style={{ gridTemplateColumns: `repeat(${round.post.node.actions.length}, minmax(0, 1fr))` }}
        >
          {round.post.node.actions.map((action, index) => (
            <button
              key={`${action.kind}-${action.amountBb}`}
              type="button"
              disabled={!postHeroTurn}
              onClick={() => choosePostflop(index)}
              className={`rounded-[var(--gw-radius-control)] py-4 text-base font-bold transition active:scale-95 disabled:cursor-wait disabled:opacity-40 sm:text-lg ${
                action.kind === "fold"
                  ? "bg-[var(--gw-danger)] text-[var(--gw-text-primary)]"
                  : action.kind === "call"
                    ? "bg-[var(--gw-accent)] text-[var(--gw-bg)]"
                    : action.kind === "check"
                      ? "bg-[var(--gw-surface-3)] text-[var(--gw-text-primary)]"
                      : "bg-[var(--gw-accent-strong)] text-[var(--gw-text-primary)]"
              }`}
            >
              {actionLabel(action)}
            </button>
          ))}
        </div>
      )}

      {(ending || phase === "over") && (
        <HandResult
          decisions={decisions}
          note={
            ending ??
            (outcome?.kind === "folded"
              ? `${outcome.by}가 접어 핸드가 끝났습니다`
              : outcome?.kind === "allin"
                ? "프리플랍 올인으로 끝났습니다"
                : "핸드 종료")
          }
          showdown={
            showdown ? (
              <div className="mt-3 rounded-[var(--gw-radius-card)] border border-[var(--gw-border)] bg-[var(--gw-table-header)] px-3.5 py-3">
                <div className="flex items-center justify-between">
                  <span className="gw-label">
                    {showdown.winner === "hero" ? "WIN" : showdown.winner === "tie" ? "SPLIT" : "LOSE"}
                  </span>
                  <span className="gw-num text-[11px] text-[var(--gw-text-muted)]">쇼다운</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-[13px]">
                  <span className="text-[var(--gw-text-secondary)]">
                    나 · {round.pre.heroHand}
                  </span>
                  <span className="font-semibold text-[var(--gw-text-primary)]">
                    {showdown.heroHandName}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-[13px]">
                  <span className="text-[var(--gw-text-muted)]">
                    상대 · {round.pre.villainHand}
                  </span>
                  <span className="font-semibold text-[var(--gw-text-secondary)]">
                    {showdown.villainHandName}
                  </span>
                </div>
              </div>
            ) : undefined
          }
          onNext={newRound}
        />
      )}

    </div>
  );
}
