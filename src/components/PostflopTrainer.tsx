"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { actionEvFor, actionLabel, actionShortLabel, type SolvedSpot } from "@/lib/tree";
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
import { formatEv, formatEvLoss, gradeByEvLoss, isGradable, type Grade } from "@/lib/grading";
import GradeIcon from "./GradeIcon";
import PokerTable from "./PokerTable";

const tableHand = ALL_HANDS[0];

// 타깃 게임의 BB 앤티. 스팟 데이터가 이 값을 전제로 풀렸다(팟 6.5bb).
const ANTE_BB = 1;

/**
 * 히어로가 내린 판단 하나. 핸드가 끝날 때 전부 모아 보여준다.
 *
 * 예전에는 핸드를 끝내는 액션만 채점했다. 그러면 리버까지 가는 판에서 서너 번
 * 내린 판단 중 마지막 하나만 평가받고, 게다가 상대가 핸드를 끝내면 등급도 EV 표도
 * 없이 한 줄만 떠서 판마다 결과 화면이 달라졌다.
 */
type Decision = {
  street: string;
  chosen: string;
  /** 채점할 수 없는 판단이면 null. 앞선 실수로 솔버 레인지를 벗어난 경우다. */
  lossBb: number | null;
  grade: Grade | null;
  rows: { label: string; evBb: number; lossBb: number | null }[];
};

/** 핸드가 어떻게 끝났는지. 판단 목록과 함께 항상 같은 자리에 보여준다. */
type Ending = { note: string };

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
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [ending, setEnding] = useState<Ending | null>(null);
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
    setDecisions([]);
    setEnding(null);
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

  // 이 스팟은 BTN이 오픈하고 BB가 받은 싱글레이즈 팟이다. 전제를 화면에서 실제로
  // 재생해야 팟이 순간이동하지 않는다.
  // 팟 = 오픈 + 콜 + SB 0.5 + 앤티 → 오픈액을 팟에서 거꾸로 구한다.
  const preflopScript = useMemo(() => {
    const openToBb = ((round?.spot.startingPotBb ?? 6.5) - 0.5 - ANTE_BB) / 2;
    return singleRaisedPotScript(tableSize, "BTN", "BB", openToBb, ANTE_BB);
  }, [round?.spot.startingPotBb, tableSize]);

  const actionSeat = round?.state.node
    ? round.state.node.player === round.deal.heroPlayer
      ? heroPosition
      : opponentPosition
    : null;
  const lastStep = round?.state.history[round.state.history.length - 1];

  // 좌석에 띄울 액션.
  //
  // 기준은 "지금 스트릿"이 아니라 "마지막 액션의 스트릿"이다. 콜이나 두 번째
  // 체크는 그 스트릿을 닫으면서 다음 스트릿으로 넘기는데, 지금 스트릿으로 거르면
  // 바로 그 액션이 뜨자마자 걸러져 사라진다. 벳에 콜이 들어와도 아무 표시가
  // 없던 게 이 때문이다.
  const seatActions = useMemo(() => {
    const out: Record<string, { label: string; kind: string }> = {};
    if (!round || round.state.history.length === 0) return out;
    const shown = round.state.history[round.state.history.length - 1].street;
    for (const h of round.state.history) {
      if (h.street !== shown) continue;
      const seat = h.player === round.deal.heroPlayer ? heroPosition : opponentPosition;
      out[seat] = { label: actionShortLabel(h.action), kind: h.action.kind };
    }
    return out;
  }, [round, heroPosition, opponentPosition]);

  /**
   * 스트릿별로 양쪽이 낸 금액. 액션의 amountBb는 "이 액션으로 더 넣는 칩"이고
   * 콜은 0이므로, 콜은 상대가 낸 만큼으로 맞춰 준다.
   *
   * 팟도 여기서 만든다. 노드의 potBb를 쓰면 안 된다 — 핸드를 끝내는 콜은 다음
   * 노드가 없어서 그 콜이 반영되지 않은 값에 멈추고, 거기서 칩을 빼면 팟이
   * 음수로 내려간다.
   */
  const table = useMemo(() => {
    if (!round) return null;
    const perStreet = new Map<string, [number, number]>();
    for (const h of round.state.history) {
      const cur = perStreet.get(h.street) ?? ([0, 0] as [number, number]);
      if (h.action.kind === "call") cur[h.player] = cur[1 - h.player];
      else cur[h.player] += h.action.amountBb;
      perStreet.set(h.street, cur);
    }
    let committed = 0;
    for (const pair of perStreet.values()) committed += pair[0] + pair[1];

    const hist = round.state.history;
    const shown = hist.length > 0 ? hist[hist.length - 1].street : round.state.street;
    const front = perStreet.get(shown) ?? [0, 0];
    const heroP = round.deal.heroPlayer;
    return {
      totalPotBb: Number((round.spot.startingPotBb + committed).toFixed(2)),
      frontBb: Number((front[0] + front[1]).toFixed(2)),
      chips: {
        [heroPosition]: Number(front[heroP].toFixed(2)),
        [opponentPosition]: Number(front[1 - heroP].toFixed(2)),
      },
      // 베팅이 맞았다. 스트릿이 넘어갔거나 핸드가 끝났으면 칩을 쓸어 담는다.
      closed: hist.length > 0 && (round.state.node === null || shown !== round.state.street),
    };
  }, [round, heroPosition, opponentPosition]);

  // 칩이 팟으로 들어가는 동안만 자리 앞에 남겨 두고, 끝나면 팟에 합친다.
  // 어떤 베팅 라운드를 이미 쓸어 담았는지로 기억한다 — 라운드가 바뀌면
  // 자동으로 다시 false가 되므로 이펙트에서 되돌릴 필요가 없다.
  const [sweptKey, setSweptKey] = useState<string | null>(null);
  const closed = table?.closed ?? false;
  const roundKey = table ? `${round?.id}-${table.frontBb}-${round?.state.street}` : null;
  const collected = closed && sweptKey === roundKey;
  useEffect(() => {
    if (!closed || !roundKey || sweptKey === roundKey) return;
    const t = window.setTimeout(() => setSweptKey(roundKey), 460);
    return () => window.clearTimeout(t);
  }, [closed, roundKey, sweptKey]);

  // 자리 앞에 놓인 칩은 아직 팟에 들어가지 않았다. 빼지 않으면 두 번 센다.
  const chipsShown = Boolean(table) && !collected && table!.frontBb > 0;
  const displayPotBb = table
    ? Number((table.totalPotBb - (chipsShown ? table.frontBb : 0)).toFixed(2))
    : 0;
  const handleTableReady = useCallback(() => setTableReady(true), []);

  // 상대 차례면 솔브된 전략대로 친다.
  useEffect(() => {
    if (!round || !tableReady || !round.state.node || heroTurn || ending) return;
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
          setEnding({ note: `상대가 ${actionLabel(action)}으로 핸드를 끝냈습니다` });
        }
        return { ...current, state: nextState };
      });
    }, 650);
    return () => window.clearTimeout(timer);
  }, [ending, heroTurn, round, tableReady]);

  const chooseAction = (index: number) => {
    if (!round?.state.node || !heroTurn || ending) return;
    const node = round.state.node;
    const action = node.actions[index];
    if (!action) return;
    const ev = actionEvFor(node, round.deal.handIdx[round.deal.heroPlayer]);
    const gradable = isGradable(ev);
    const best = Math.max(...ev);
    const losses = ev.map((value) => (gradable ? Number((best - value).toFixed(2)) : null));

    // 핸드를 끝내는 액션이든 아니든 똑같이 기록한다. 채점이 불가능한 상황이면
    // 등급 없이 남겨 둔다 — 근거가 없는 것을 정답으로 보여주면 안 된다.
    setDecisions((prev) => [
      ...prev,
      {
        street: round.state.street.toUpperCase(),
        chosen: actionLabel(action),
        lossBb: losses[index],
        grade: losses[index] === null ? null : gradeByEvLoss(losses[index]),
        rows: node.actions.map((a, i) => ({
          label: actionLabel(a),
          evBb: ev[i],
          lossBb: losses[i],
        })),
      },
    ]);

    const nextState = applyAction(round.spot, round.state, index);
    if (nextState.node === null) {
      setEnding({ note: `내가 ${actionLabel(action)}으로 핸드를 끝냈습니다` });
    }
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
  // 핸드 전체 성적. 가장 나빴던 판단으로 대표한다 — 한 번 크게 틀리면
  // 나머지를 잘 쳐도 그 핸드는 잘 친 게 아니다.
  const graded = decisions.filter((d) => d.lossBb !== null) as (Decision & { lossBb: number })[];
  const ungraded = decisions.length - graded.length;
  const totalLoss = Number(graded.reduce((sum, d) => sum + d.lossBb, 0).toFixed(2));
  const handGrade = gradeByEvLoss(
    graded.length > 0 ? Math.max(...graded.map((d) => d.lossBb)) : 0,
  );
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
            anteBb={ANTE_BB}
            shoverPosition={null}
            awaitingAction={Boolean(heroTurn && !ending && tableReady)}
            hand={tableHand}
            heroCards={[
              deal.hands[deal.heroPlayer].slice(0, 2),
              deal.hands[deal.heroPlayer].slice(2, 4),
            ]}
            board={tableReady ? state.board : undefined}
            potBbOverride={tableReady ? displayPotBb : undefined}
            dealKey={String(round.id)}
            actionSeat={tableReady ? actionSeat : undefined}
            foldedSeats={foldedSeats}
            onSequenceComplete={handleTableReady}
            preflopScript={preflopScript}
            seatActions={tableReady ? seatActions : undefined}
            seatChips={tableReady && table ? (chipsShown ? table.chips : {}) : undefined}
            collectingChips={tableReady && closed && !collected}
          />
        </div>
      </div>

      {!ending && state.node && (
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

      {ending && (
        <section className="absolute inset-x-0 bottom-0 z-30 max-h-full overflow-y-auto border-t border-[var(--gw-border)] bg-[var(--gw-surface-1)] px-4 pb-3 pt-5 shadow-[0_-18px_40px_rgba(0,0,0,0.42)] animate-[gw-result-enter_220ms_cubic-bezier(0.22,1,0.36,1)]">
          <div className="mx-auto flex max-w-sm flex-col">
            {/* 이 핸드 전체의 성적. 판단이 몇 번이든 늘 같은 자리에 같은 모양으로 나온다. */}
            <div className="flex items-center justify-center gap-2">
              <GradeIcon id={handGrade.id} color={handGrade.color} className="h-7 w-7" />
              <span className="text-2xl font-black leading-none" style={{ color: handGrade.color }}>
                {handGrade.label}
              </span>
            </div>
            <p className="mt-1 text-center text-[11px] text-[var(--gw-text-muted)]">
              판단 {decisions.length}번 · 합계 {totalLoss === 0 ? "손실 없음" : formatEvLoss(totalLoss)}
              {ungraded > 0 && ` · ${ungraded}번은 채점 불가`}
            </p>
            {ungraded > 0 && (
              <p className="mt-1 text-center text-[11px] leading-relaxed text-[var(--gw-text-muted)]">
                앞선 판단으로 이 핸드가 GTO 레인지를 벗어나서, 그 뒤 상황은 비교할
                정답이 없습니다.
              </p>
            )}
            <p className="mt-0.5 text-center text-[11px] text-[var(--gw-text-muted)]">{ending.note}</p>

            {decisions.map((d, di) => (
              <div key={`${d.street}-${di}`} className="mt-4">
                <div className="mb-1.5 flex items-center gap-2">
                  {d.grade ? (
                    <GradeIcon id={d.grade.id} color={d.grade.color} />
                  ) : (
                    <span className="h-4 w-4 shrink-0 rounded-full border border-[var(--gw-border-strong)]" />
                  )}
                  <span className="text-[11px] font-bold tracking-wide text-[var(--gw-text-secondary)]">
                    {d.street} · {d.chosen}
                  </span>
                  <span className="ml-auto text-[11px] font-bold tabular-nums text-[var(--gw-text-muted)]">
                    {d.lossBb === null ? "채점 불가" : d.lossBb === 0 ? "BEST" : formatEvLoss(d.lossBb)}
                  </span>
                </div>
                <div className="space-y-1.5">
                  {d.rows.map((row) => {
                    const rowGrade = row.lossBb === null ? null : gradeByEvLoss(row.lossBb);
                    const chosen = row.label === d.chosen;
                    return (
                      <div
                        key={row.label}
                        className="flex items-center gap-2 rounded-[var(--gw-radius-control)] border-2 bg-[var(--gw-table-header)] px-2.5 py-2"
                        style={{
                          borderColor: chosen && rowGrade ? rowGrade.color : "transparent",
                          opacity: rowGrade ? 1 : 0.5,
                        }}
                      >
                        {rowGrade ? (
                          <GradeIcon id={rowGrade.id} color={rowGrade.color} />
                        ) : (
                          <span className="h-4 w-4 shrink-0 rounded-full border border-[var(--gw-border-strong)]" />
                        )}
                        <span className="flex-1 text-sm font-bold text-[var(--gw-text-primary)]">
                          {row.label}
                        </span>
                        <span className="w-20 shrink-0 text-right text-[11px] tabular-nums text-[var(--gw-text-muted)]">
                          {row.lossBb === null ? "—" : row.lossBb === 0 ? "BEST" : formatEvLoss(row.lossBb)}
                        </span>
                        <span className="w-20 shrink-0 text-right text-sm font-bold tabular-nums text-[var(--gw-text-secondary)]">
                          {row.lossBb === null ? "—" : formatEv(row.evBb)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            <button
              type="button"
              onClick={nextHand}
              className="mt-4 w-full rounded-[var(--gw-radius-control)] bg-[var(--gw-accent)] py-3 text-xs font-bold text-[var(--gw-bg)] transition active:scale-[0.98]"
            >
              다음 핸드
            </button>
          </div>
        </section>
      )}

      {!state.node && !ending && (
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
