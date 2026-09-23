"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import preflopData from "@/data/preflop-btn-bb.json";
import { actionEvFor, actionLabel, type SolvedSpot } from "@/lib/tree";
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
import { applyPreflop, evLoss, startPreflop, type PreflopState } from "@/lib/handFlow";
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

const PREFLOP = preflopData as unknown as PreflopData;
const tableHand = ALL_HANDS[0];

/** 한 스텝이 화면에 나타나고 다음으로 넘어가기까지. 폴드는 실제로도 빠르다. */
const STEP_MS = 620;
const FOLD_STEP_MS = 320;

type Row = { label: string; evBb: number | null; lossBb: number | null };
type Feedback = {
  title: string;
  grade: Grade | null;
  chosen: string;
  lossBb: number | null;
  rows: Row[];
};

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

function gradeRows(
  labels: string[],
  evBb: (number | null)[],
): { rows: Row[]; losses: (number | null)[] } {
  const losses = evLoss(evBb);
  return {
    rows: labels.map((label, i) => ({ label, evBb: evBb[i], lossBb: losses[i] })),
    losses,
  };
}

export default function HandTrainer() {
  const [entries, setEntries] = useState<SpotEntry[] | null>(null);
  const [round, setRound] = useState<Round | null>(freshRound);
  const [phase, setPhase] = useState<Phase>("preflop");
  const [revealed, setRevealed] = useState(0);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timers = useRef<number[]>([]);

  const tableSize = DEFAULT_SCENARIO.tableSize;

  const clearTimers = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  }, []);

  const newRound = useCallback(() => {
    clearTimers();
    setFeedback(null);
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
          // 이 보드의 레인지에 없는 조합이다. 판단할 근거가 없으니 여기서 끝낸다.
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
  useEffect(() => {
    if (phase !== "postflop" || !round?.post?.node || !round.spot || postHeroTurn || feedback) return;
    const t = window.setTimeout(() => {
      setRound((cur) => {
        if (!cur?.post?.node || !cur.spot || !cur.deal) return cur;
        const node = cur.post.node;
        const idx = sampleActionIndex(node, cur.deal.handIdx[node.player], Math.random);
        const next = applyAction(cur.spot, cur.post, idx);
        if (next.node === null) {
          setFeedback({
            title: `상대 ${actionLabel(node.actions[idx])}`,
            grade: null,
            chosen: "",
            lossBb: null,
            rows: [],
          });
        }
        return { ...cur, post: next };
      });
    }, 700);
    timers.current.push(t);
    return () => window.clearTimeout(t);
  }, [phase, round, postHeroTurn, feedback]);

  const choosePreflop = (action: PreflopAction) => {
    if (!round?.pre.turn || feedback || !allRevealed) return;
    const turn = round.pre.turn;
    const labels = turn.actions.map((a) => actionLabelAt(PREFLOP, turn.node, a));
    const { rows, losses } = gradeRows(labels, turn.evBb);
    const i = turn.actions.indexOf(action);
    const loss = losses[i];
    setFeedback({
      title: "프리플랍",
      grade: loss === null ? null : gradeByEvLoss(loss),
      chosen: labels[i],
      lossBb: loss,
      rows,
    });
    setRound((cur) => (cur ? { ...cur, pre: applyPreflop(PREFLOP, cur.pre, action, Math.random) } : cur));
  };

  const choosePostflop = (index: number) => {
    if (!round?.post?.node || !round.spot || !round.deal || !postHeroTurn || feedback) return;
    const node = round.post.node;
    const ev = actionEvFor(node, round.deal.handIdx[round.deal.heroPlayer]);
    const labels = node.actions.map(actionLabel);
    const { rows, losses } = gradeRows(labels, ev);
    const loss = losses[index];
    const next = applyAction(round.spot, round.post, index);
    if (next.node === null) {
      setFeedback({
        title: round.post.street.toUpperCase(),
        grade: loss === null ? null : gradeByEvLoss(loss),
        chosen: labels[index],
        lossBb: loss,
        rows,
      });
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

  const heroSeat = round.heroSeat;
  const villainSeat = heroSeat === "BTN" ? "BB" : "BTN";
  const foldedSeats = seatNames(tableSize).filter((s) => s !== heroSeat && s !== villainSeat);
  const preTurnReady = Boolean(round.pre.turn && allRevealed && !feedback);
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
            awaitingAction={preTurnReady || (phase === "postflop" && postHeroTurn && !feedback)}
            hand={tableHand}
            heroCards={heroCards}
            board={phase === "postflop" ? round.post?.board : undefined}
            potBbOverride={phase === "postflop" ? round.post?.potBb : undefined}
            dealKey={String(round.id)}
            actionSeat={phase === "postflop" ? postActionSeat : undefined}
            foldedSeats={foldedSeats}
            preflopScript={round.pre.steps}
            revealedSteps={phase === "postflop" ? undefined : revealed}
          />
        </div>
      </div>

      {/* 프리플랍 선택지 */}
      {!feedback && round.pre.turn && phase === "preflop" && (
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
      {!feedback && phase === "postflop" && round.post?.node && (
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

      {(feedback || phase === "over") && (
        <section className="absolute inset-x-0 bottom-0 z-30 max-h-full overflow-y-auto border-t border-[var(--gw-border)] bg-[var(--gw-surface-1)] px-4 pb-3 pt-5 shadow-[0_-18px_40px_rgba(0,0,0,0.42)] animate-[gw-result-enter_220ms_cubic-bezier(0.22,1,0.36,1)]">
          <div className="mx-auto flex max-w-sm flex-col items-center">
            {feedback?.grade ? (
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
              <p className="text-xs font-bold text-[var(--gw-text-secondary)]">
                {feedback?.title ?? (outcome?.kind === "folded" ? `${outcome.by} 폴드` : "핸드 종료")}
              </p>
            )}
            {feedback?.grade && feedback.lossBb !== null && feedback.lossBb > 0 && (
              <div className="mt-1 text-xs font-bold tabular-nums text-[var(--gw-text-muted)]">
                {formatEvLoss(feedback.lossBb)}
              </div>
            )}
            {feedback?.chosen && (
              <div className="mt-1 text-xs text-[var(--gw-text-muted)]">
                선택 {feedback.chosen}
              </div>
            )}

            {feedback && feedback.rows.length > 0 && (
              <div className="mt-4 w-full space-y-1.5">
                {feedback.rows.map((row) => {
                  const rowGrade = row.lossBb === null ? null : gradeByEvLoss(row.lossBb);
                  const chosen = row.label === feedback.chosen;
                  return (
                    <div
                      key={row.label}
                      className="flex items-center gap-2 rounded-[var(--gw-radius-control)] border-2 bg-[var(--gw-table-header)] px-2.5 py-2"
                      style={{ borderColor: chosen && rowGrade ? rowGrade.color : "transparent" }}
                    >
                      {rowGrade ? (
                        <GradeIcon id={rowGrade.id} color={rowGrade.color} />
                      ) : (
                        <span className="h-4 w-4 shrink-0" />
                      )}
                      <span className="flex-1 text-sm font-bold text-[var(--gw-text-primary)]">
                        {row.label}
                      </span>
                      <span className="w-20 shrink-0 text-right text-[11px] tabular-nums text-[var(--gw-text-muted)]">
                        {row.lossBb === null ? "—" : row.lossBb === 0 ? "BEST" : formatEvLoss(row.lossBb)}
                      </span>
                      <span className="w-20 shrink-0 text-right text-sm font-bold tabular-nums text-[var(--gw-text-secondary)]">
                        {row.evBb === null ? "—" : formatEv(row.evBb)}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}

            <button
              type="button"
              onClick={newRound}
              className="mt-4 w-full rounded-[var(--gw-radius-control)] bg-[var(--gw-accent)] py-3 text-xs font-bold text-[var(--gw-bg)] transition active:scale-[0.98]"
            >
              다음 핸드
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
