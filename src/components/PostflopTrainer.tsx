"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { actionEvFor, actionLabel, type SolvedSpot } from "@/lib/tree";
import { applyAction, startHand, type HandState } from "@/lib/hand";
import { dealHands, sampleActionIndex, type Deal } from "@/lib/postflopSpot";
import { ALL_HANDS, seatNames } from "@/lib/poker";
import { singleRaisedPotScript } from "@/lib/preflop";
import {
  loadSpot,
  loadSpotIndex,
  pickSpotEntry,
  prefetchSpot,
  type SpotEntry,
} from "@/lib/spotLibrary";
import { DEFAULT_SCENARIO } from "@/lib/scenarios";
import { formatEv, formatEvLoss, gradeByEvLoss, type Grade } from "@/lib/grading";
import GradeIcon from "./GradeIcon";
import PokerTable from "./PokerTable";

const tableHand = ALL_HANDS[0];

type Feedback = {
  chosen: string;
  losses: number[];
  actionLabels: string[];
  actionEv: number[];
  actionIndex: number;
  grade: Grade | null;
};

type Round = {
  entry: SpotEntry;
  spot: SolvedSpot;
  state: HandState;
  deal: Deal;
  id: number;
};

export default function PostflopTrainer() {
  const [entries, setEntries] = useState<SpotEntry[] | null>(null);
  const [round, setRound] = useState<Round | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [tableReady, setTableReady] = useState(false);

  const tableSize = DEFAULT_SCENARIO.tableSize;

  const startRound = useCallback(async (list: SpotEntry[], avoidFile?: string) => {
    const entry = pickSpotEntry(list, Math.random, avoidFile);
    try {
      const spot = await loadSpot(entry);
      const heroPlayer = Math.random() < 0.5 ? 0 : 1;
      setRound({
        entry,
        spot,
        state: startHand(spot),
        deal: dealHands(spot, heroPlayer, Math.random),
        id: Date.now() + Math.floor(Math.random() * 1000),
      });
      // 다음 판에 쓸 보드를 지금 받아둔다. 판이 끝난 뒤 받으면 그만큼 기다린다.
      prefetchSpot(pickSpotEntry(list, Math.random, entry.file));
    } catch (err) {
      setError(err instanceof Error ? err.message : "보드를 불러오지 못했습니다");
    }
  }, []);

  useEffect(() => {
    let alive = true;
    loadSpotIndex()
      .then((list) => {
        if (!alive) return;
        setEntries(list);
        void startRound(list);
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : "스팟 목록을 불러오지 못했습니다");
      });
    return () => {
      alive = false;
    };
  }, [startRound]);

  const nextHand = useCallback(() => {
    if (!entries) return;
    setFeedback(null);
    setTableReady(false);
    const avoid = round?.entry.file;
    setRound(null);
    void startRound(entries, avoid);
  }, [entries, round, startRound]);

  const heroTurn = round ? round.state.node?.player === round.deal.heroPlayer : false;
  const heroPosition = round?.deal.heroPlayer === 0 ? "BB" : "BTN";
  const opponentPosition = round?.deal.heroPlayer === 0 ? "BTN" : "BB";
  const foldedSeats = useMemo(
    () => seatNames(tableSize).filter((s) => s !== heroPosition && s !== opponentPosition),
    [heroPosition, opponentPosition, tableSize],
  );

  // 이 스팟은 BTN이 오픈하고 BB가 받은 싱글레이즈 팟이다(startingPotBb 5.5).
  // 전제를 화면에서 실제로 재생해야 팟이 1.5에서 5.5로 순간이동하지 않는다.
  const preflopScript = useMemo(() => {
    const openToBb = ((round?.spot.startingPotBb ?? 5.5) - 0.5) / 2;
    return singleRaisedPotScript(tableSize, "BTN", "BB", openToBb, 0);
  }, [round?.spot.startingPotBb, tableSize]);

  const actionSeat = round?.state.node
    ? round.state.node.player === round.deal.heroPlayer
      ? heroPosition
      : opponentPosition
    : null;
  const lastStep = round?.state.history[round.state.history.length - 1];
  const handleTableReady = useCallback(() => setTableReady(true), []);

  // 상대 차례면 솔브된 전략대로 친다.
  useEffect(() => {
    if (!round || !tableReady || !round.state.node || heroTurn || feedback) return;
    const timer = window.setTimeout(() => {
      setRound((current) => {
        if (!current?.state.node) return current;
        const node = current.state.node;
        const actionIndex = sampleActionIndex(
          node,
          current.deal.handIdx[node.player],
          Math.random,
        );
        const action = node.actions[actionIndex];
        const nextState = applyAction(current.spot, current.state, actionIndex);
        if (nextState.node === null) {
          setFeedback({
            chosen: `OPPONENT ${actionLabel(action)}`,
            losses: [],
            actionLabels: [],
            actionEv: [],
            actionIndex: -1,
            grade: null,
          });
        }
        return { ...current, state: nextState };
      });
    }, 650);
    return () => window.clearTimeout(timer);
  }, [feedback, heroTurn, round, tableReady]);

  const chooseAction = (index: number) => {
    if (!round?.state.node || !heroTurn || feedback) return;
    const node = round.state.node;
    const action = node.actions[index];
    if (!action) return;
    const ev = actionEvFor(node, round.deal.handIdx[round.deal.heroPlayer]);
    const best = Math.max(...ev);
    const losses = ev.map((value) => Number((best - value).toFixed(2)));
    const nextState = applyAction(round.spot, round.state, index);
    setFeedback(
      nextState.node === null
        ? {
            chosen: actionLabel(action),
            losses,
            actionLabels: node.actions.map(actionLabel),
            actionEv: ev,
            actionIndex: index,
            grade: gradeByEvLoss(losses[index]),
          }
        : null,
    );
    setRound((current) => (current ? { ...current, state: nextState } : current));
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
      <div className="flex h-full items-center justify-center px-8 text-center">
        <p className="animate-[gw-thinking_1200ms_ease-in-out_infinite] text-xs font-bold tracking-widest text-[var(--gw-text-muted)]">
          보드 준비 중…
        </p>
      </div>
    );
  }

  const { state, deal, spot } = round;
  const displayStreet = tableReady ? state.street.toUpperCase() : "PREFLOP";
  // 프리플랍 동안 팟은 테이블에서 자라는 중이다. 헤더가 최종값을 먼저 보여주면
  // 또 어긋나므로, 그 구간에는 헤더에 팟을 쓰지 않는다.
  const displayPot = tableReady ? `${state.potBb}bb` : null;

  return (
    <div
      className="relative flex h-full min-h-0 flex-col select-none overflow-hidden"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <header className="absolute inset-x-0 top-0 z-20 flex h-12 items-center justify-between bg-[var(--gw-bg)]/90 px-3 backdrop-blur-sm">
        <div className="text-[10px] font-bold tracking-wide text-[var(--gw-text-muted)]">
          POSTFLOP · {displayStreet}
          {displayPot ? ` · ${displayPot}` : ""}
          {lastStep && tableReady && (
            <div className="mt-0.5 text-[9px] text-[var(--gw-text-secondary)]">
              LAST {lastStep.player === deal.heroPlayer ? "YOU" : "OPPONENT"}{" "}
              {actionLabel(lastStep.action)}
            </div>
          )}
        </div>
        <div className="text-[10px] font-bold text-[var(--gw-accent)]">
          {deal.heroPlayer === 0 ? "OOP" : "IP"}
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        <div className="absolute inset-x-0 bottom-0 top-12">
          <PokerTable
            tableSize={tableSize}
            heroPosition={heroPosition}
            stackBb={spot.effectiveStackBb}
            anteBb={0}
            shoverPosition={null}
            awaitingAction={Boolean(heroTurn && !feedback && tableReady)}
            hand={tableHand}
            heroCards={[
              deal.hands[deal.heroPlayer].slice(0, 2),
              deal.hands[deal.heroPlayer].slice(2, 4),
            ]}
            board={tableReady ? state.board : undefined}
            potBbOverride={tableReady ? state.potBb : undefined}
            dealKey={String(round.id)}
            actionSeat={tableReady ? actionSeat : undefined}
            foldedSeats={foldedSeats}
            onSequenceComplete={handleTableReady}
            preflopScript={preflopScript}
          />
        </div>
      </div>

      {!feedback && state.node && (
        <div
          className="grid gap-3 px-4 pb-4"
          style={{ gridTemplateColumns: `repeat(${state.node.actions.length}, minmax(0, 1fr))` }}
          aria-hidden={!heroTurn || !tableReady}
        >
          {state.node.actions.map((action, index) => (
            <button
              key={`${action.kind}-${action.amountBb}`}
              type="button"
              disabled={!heroTurn || !tableReady}
              onClick={() => chooseAction(index)}
              className={`rounded-[var(--gw-radius-control)] py-4 text-base font-bold transition active:scale-95 disabled:cursor-wait disabled:opacity-40 sm:text-lg ${
                action.kind === "fold"
                  ? "bg-[var(--gw-danger)] text-[var(--gw-text-primary)]"
                  : action.kind === "call"
                    ? "bg-[var(--gw-accent)] text-[var(--gw-bg)]"
                    : action.kind === "raise"
                      ? "bg-[var(--gw-accent-strong)] text-[var(--gw-text-primary)]"
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

      {feedback && (
        <section className="absolute inset-x-0 bottom-0 z-30 max-h-full overflow-y-auto border-t border-[var(--gw-border)] bg-[var(--gw-surface-1)] px-4 pb-3 pt-5 shadow-[0_-18px_40px_rgba(0,0,0,0.42)] animate-[gw-result-enter_220ms_cubic-bezier(0.22,1,0.36,1)]">
          <div className="mx-auto flex max-w-sm flex-col items-center">
            {feedback.grade ? (
              <div className="flex items-center gap-2">
                <GradeIcon id={feedback.grade.id} color={feedback.grade.color} className="h-7 w-7" />
                <span
                  className="text-2xl font-black leading-none"
                  style={{ color: feedback.grade.color }}
                >
                  {feedback.grade.label}
                </span>
              </div>
            ) : (
              <p className="text-xs font-bold text-[var(--gw-text-secondary)]">{feedback.chosen}</p>
            )}
            {feedback.grade && feedback.losses[feedback.actionIndex] > 0 && (
              <div className="mt-1 text-xs font-bold tabular-nums text-[var(--gw-text-muted)]">
                {formatEvLoss(feedback.losses[feedback.actionIndex])}
              </div>
            )}
            {feedback.grade && (
              <div className="mt-1 text-xs text-[var(--gw-text-muted)]">
                YOU CHOSE {feedback.chosen}
              </div>
            )}

            {feedback.actionLabels.length > 0 && (
              <div className="mt-4 w-full space-y-1.5">
                {feedback.actionLabels.map((label, index) => {
                  const rowGrade = gradeByEvLoss(feedback.losses[index]);
                  const chosen = index === feedback.actionIndex;
                  return (
                    <div
                      key={label}
                      className="flex items-center gap-2 rounded-[var(--gw-radius-control)] border-2 bg-[var(--gw-table-header)] px-2.5 py-2"
                      style={{ borderColor: chosen ? rowGrade.color : "transparent" }}
                    >
                      <GradeIcon id={rowGrade.id} color={rowGrade.color} />
                      <span className="flex-1 text-sm font-bold text-[var(--gw-text-primary)]">
                        {label}
                      </span>
                      <span className="w-20 shrink-0 text-right text-[11px] tabular-nums text-[var(--gw-text-muted)]">
                        {feedback.losses[index] === 0 ? "BEST" : formatEvLoss(feedback.losses[index])}
                      </span>
                      <span className="w-20 shrink-0 text-right text-sm font-bold tabular-nums text-[var(--gw-text-secondary)]">
                        {formatEv(feedback.actionEv[index])}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
            <button
              type="button"
              onClick={nextHand}
              className="mt-4 w-full rounded-[var(--gw-radius-control)] bg-[var(--gw-accent)] py-3 text-xs font-bold text-[var(--gw-bg)] transition active:scale-[0.98]"
            >
              NEXT HAND
            </button>
          </div>
        </section>
      )}

      {!state.node && !feedback && (
        <button
          type="button"
          onClick={nextHand}
          className="mx-4 mb-4 rounded-[var(--gw-radius-control)] bg-[var(--gw-accent)] py-3 text-xs font-bold text-[var(--gw-bg)]"
        >
          NEXT HAND
        </button>
      )}
    </div>
  );
}
