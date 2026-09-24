"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import seatsRaw from "@/data/preflop-seats.json";
import { actionEvFor, actionLabel, type SolvedSpot } from "@/lib/tree";
import { makeDecision, type Decision } from "@/lib/decisions";
import { fromNode, fromRanges } from "@/lib/rangeGrid";
import { buildTableView } from "@/lib/tableView";
import { judge, type Showdown } from "@/lib/showdown";
import { dealCombo } from "@/lib/preflopGame";
import { dealRunout } from "@/lib/runout";
import { applyAction, startHand, type HandState } from "@/lib/hand";
import { sampleActionIndex, type Deal } from "@/lib/postflopSpot";
import { ALL_HANDS, seatNames } from "@/lib/poker";
import {
  applyHeroAction,
  labelFor,
  startGame,
  type GameState,
  type SeatAction,
  type SeatsData,
} from "@/lib/seatGame";
import {
  loadSpot,
  loadSpotIndex,
  pickSpotEntry,
  prefetchSpot,
  type SpotEntry,
} from "@/lib/spotLibrary";
import { ensureGuestUser, logHand } from "@/lib/attempts";
import { currentUserId } from "@/lib/session";
import HandResult from "./HandResult";
import PokerTable from "./PokerTable";

const SEATS_DATA = seatsRaw as unknown as SeatsData;
const TABLE_SIZE = SEATS_DATA.tableSize;
const SEATS = seatNames(TABLE_SIZE);
const tableHand = ALL_HANDS[0];

/** 한 스텝이 화면에 나타나고 다음으로 넘어가기까지. 폴드는 실제로도 빠르다. */
const STEP_MS = 620;
const FOLD_STEP_MS = 320;

/**
 * 플랍부터의 액션 순서. 프리플랍은 UTG부터지만 플랍부터는 SB부터다.
 * 이 순서에서 앞선 쪽이 OOP(먼저 치는 쪽)다.
 */
const POSTFLOP_ORDER = [
  ...SEATS.slice(TABLE_SIZE - 2), // SB, BB
  ...SEATS.slice(0, TABLE_SIZE - 2),
];
const actsFirst = (a: string, b: string) =>
  POSTFLOP_ORDER.indexOf(a) < POSTFLOP_ORDER.indexOf(b) ? a : b;

type Phase = "preflop" | "postflop" | "over";

type Round = {
  id: number;
  heroSeat: string;
  /** 자리별 핸드 코드. 히어로 것 말고는 화면에 안 보인다. */
  hands: Record<string, string>;
  /** 실제로 쥔 두 장. 판 시작 때 정해 끝까지 들고 간다. */
  heroCombo: [string, string];
  game: GameState;
  /** 프리플랍 올인이 콜됐을 때 깔아 준 보드. */
  allinBoard: string[] | null;
  allinCards: { hero: [string, string]; villain: [string, string] } | null;
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

function freshRound(): Round {
  const heroSeat = SEATS[Math.floor(Math.random() * SEATS.length)];
  const hands = Object.fromEntries(SEATS.map((s) => [s, dealHandCode(Math.random)]));
  // 히어로가 실제로 쥔 두 장. 이걸 안 정하면 테이블이 더미 핸드를 그린다.
  const heroCombo = dealCombo(hands[heroSeat], new Set(), Math.random) ?? ["Ah", "Ad"];
  return {
    id: Date.now() + Math.floor(Math.random() * 1000),
    heroSeat,
    hands,
    heroCombo,
    game: startGame(SEATS_DATA, SEATS, heroSeat, hands, Math.random),
    allinBoard: null,
    allinCards: null,
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
  const [sweptKey, setSweptKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const timers = useRef<number[]>([]);
  const loggedRef = useRef<number | null>(null);

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
    loggedRef.current = null;
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
    if (!round || revealed >= round.game.steps.length) return;
    const step = round.game.steps[revealed];
    const wait = step.kind === "fold" ? FOLD_STEP_MS : STEP_MS;
    const t = window.setTimeout(() => setRevealed((n) => n + 1), wait);
    timers.current.push(t);
    return () => window.clearTimeout(t);
  }, [round, revealed]);

  const allRevealed = round ? revealed >= round.game.steps.length : false;
  const outcome = round?.game.outcome ?? null;

  // 플랍에 가면 상대는 하나로 정해진다. 그 전에는 아직 모른다.
  const villainSeat =
    outcome?.kind === "flop"
      ? outcome.opener === round?.heroSeat
        ? outcome.caller
        : outcome.opener
      : outcome?.kind === "allin"
        ? outcome.a === round?.heroSeat
          ? outcome.b
          : outcome.a
        : null;

  const heroSeat = round?.heroSeat ?? SEATS[0];

  // 좌석 액션·칩·팟은 한 곳에서 뽑는다. 따로 계산하면 서로 어긋난다.
  const view =
    phase === "postflop" && round?.post && round.spot && round.deal && villainSeat
      ? buildTableView(
          round.post,
          round.spot.startingPotBb,
          heroSeat,
          villainSeat,
          round.deal.heroPlayer,
        )
      : null;
  const roundKey = view && round ? `${round.id}-${view.frontBb}-${round.post?.street}` : null;
  const swept = Boolean(view?.closed) && sweptKey === roundKey;
  const chipsShown = Boolean(view) && !swept && (view?.frontBb ?? 0) > 0;

  // 프리플랍이 끝나고 모든 액션을 다 보여줬으면 다음으로 넘긴다.
  useEffect(() => {
    if (!round || !allRevealed || !outcome || phase !== "preflop") return;

    if (outcome.kind !== "flop") {
      // 히어로가 한 번도 고르지 못한 판은 보여줄 것이 없다. 바로 다시 돌린다.
      if (decisions.length === 0) {
        const t = window.setTimeout(newRound, 700);
        timers.current.push(t);
        return () => window.clearTimeout(t);
      }

      // 올인이 콜됐으면 보드를 끝까지 깔아 승패를 보여준다.
      let board: string[] | null = null;
      let cards: Round["allinCards"] = null;
      if (outcome.kind === "allin" && villainSeat) {
        const villain = dealCombo(round.hands[villainSeat], new Set(round.heroCombo), Math.random);
        if (villain) {
          cards = { hero: round.heroCombo, villain };
          board = dealRunout([...round.heroCombo, ...villain], Math.random);
        }
      }

      const note =
        outcome.kind === "allin"
          ? "올인 대결로 끝났습니다"
          : outcome.winner === round.heroSeat
            ? "다들 접어서 내가 가져갑니다"
            : `${outcome.winner}가 가져갑니다`;
      const t = window.setTimeout(() => {
        if (board && cards) {
          setRound((cur) => (cur ? { ...cur, allinBoard: board, allinCards: cards } : cur));
        }
        setEnding(note);
        setPhase("over");
      }, 500);
      timers.current.push(t);
      return () => window.clearTimeout(t);
    }

    if (!entries || !villainSeat) return;
    let alive = true;
    const entry = pickSpotEntry(entries, Math.random, round.entry?.file);
    loadSpot(entry)
      .then((spot) => {
        if (!alive) return;
        const board = new Set(spot.flop);
        // 플랍부터는 SB 쪽에 가까운 자리가 먼저 친다. 그쪽이 OOP다.
        const oopSeat = actsFirst(round.heroSeat, villainSeat);
        const heroPlayer: 0 | 1 = oopSeat === round.heroSeat ? 0 : 1;

        // 처음 받은 두 장을 그대로 들고 간다. 보드와 겹칠 때만 다시 뽑는다.
        const kept = round.heroCombo.every((c) => !board.has(c)) ? round.heroCombo : null;
        const heroCombo = kept ?? dealCombo(round.hands[round.heroSeat], board, Math.random);
        const blocked = new Set([...board, ...(heroCombo ?? [])]);
        const villainCombo = dealCombo(round.hands[villainSeat], blocked, Math.random);
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
          // 솔버가 이 자리에서 이 핸드를 들고 플랍에 오지 않는다.
          setEnding("솔버의 레인지 밖이라 플랍부터는 비교할 정답이 없습니다");
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
      .catch(() => {
        setEnding("보드를 불러오지 못했습니다");
        setPhase("over");
      });
    return () => {
      alive = false;
    };
  }, [round, allRevealed, outcome, phase, entries, villainSeat, decisions.length, newRound]);

  // 포스트플랍에서 상대 차례면 솔브된 전략대로 친다.
  const postHeroTurn = round?.post?.node?.player === round?.deal?.heroPlayer;
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
   * 리버까지 갔으면 누가 이겼는지. 상태가 아니라 파생값이다.
   * 결과는 참고일 뿐 채점 근거가 아니다 — 좋은 판단이 지는 일은 늘 있다.
   */
  const showdown: Showdown | null = useMemo(() => {
    if (!ending || !round) return null;
    if (round.allinBoard && round.allinCards) {
      return judge(round.allinBoard, round.allinCards.hero, round.allinCards.villain);
    }
    if (!round.post || !round.deal) return null;
    const { hands, heroPlayer } = round.deal;
    const hero = hands[heroPlayer];
    const villain = hands[1 - heroPlayer];
    return judge(
      round.post.board,
      [hero.slice(0, 2), hero.slice(2, 4)],
      [villain.slice(0, 2), villain.slice(2, 4)],
    );
  }, [ending, round]);

  // 판이 끝나면 그 판의 판단을 한 번에 남긴다.
  useEffect(() => {
    if ((!ending && phase !== "over") || !round || decisions.length === 0) return;
    if (loggedRef.current === round.id) return;
    loggedRef.current = round.id;
    const userId = currentUserId();
    if (!userId) return;
    void ensureGuestUser(userId).then(() =>
      logHand({
        userId,
        mode: "hand",
        tableSize: TABLE_SIZE,
        stackBb: SEATS_DATA.stackBb,
        anteBb: SEATS_DATA.anteBb,
        position: round.heroSeat,
        handCode: round.hands[round.heroSeat],
        decisions: decisions.map((d) => ({
          street: d.street,
          userAction: d.chosenKind,
          correctAction: d.bestKind,
          evLossBb: d.lossBb,
          board: d.board,
        })),
      }),
    );
  }, [ending, phase, round, decisions]);

  const choosePreflop = (action: SeatAction) => {
    if (!round?.game.turn || ending || !allRevealed) return;
    const turn = round.game.turn;
    const labels = turn.actions.map((a) => labelFor(SEATS_DATA, a));
    const i = turn.actions.indexOf(action);

    // 이 상황의 레인지 전체. 액션 순서와 레인지 순서가 같아야 색이 맞는다.
    const me = SEATS_DATA.seats[round.heroSeat];
    const stage = turn.stage;
    const ranges = turn.actions.map((a) => {
      if (stage.kind === "firstIn") {
        return a === "open" ? (me?.open ?? null) : a === "jam" ? (me?.openJam ?? null) : null;
      }
      if (stage.kind === "vsOpen") {
        const opener = SEATS_DATA.seats[stage.opener];
        if (a === "call") return opener?.vsOpenCall?.[round.heroSeat] ?? null;
        if (a === "jam") return opener?.vsOpenJam?.[round.heroSeat] ?? null;
        return null;
      }
      if (a !== "call") return null;
      return stage.iOpened
        ? (me?.callJam?.[stage.jammer] ?? null)
        : (SEATS_DATA.seats[stage.jammer]?.vsJamCall?.[round.heroSeat] ?? null);
    });
    const view = fromRanges(
      SEATS_DATA.hands,
      labels,
      turn.actions.map((a) => (a === "open" ? "raise" : a === "jam" ? "allin" : a)),
      ranges,
      round.hands[round.heroSeat],
    );

    setDecisions((prev) => [
      ...prev,
      makeDecision(
        "PREFLOP",
        labels,
        turn.evBb,
        i,
        turn.actions.map((a) => (a === "open" ? "open" : a === "jam" ? "allin" : a)),
        [],
        view,
      ),
    ]);
    setRound((cur) =>
      cur ? { ...cur, game: applyHeroAction(SEATS_DATA, cur.game, action, Math.random) } : cur,
    );
  };

  const choosePostflop = (index: number) => {
    if (!round?.post?.node || !round.spot || !round.deal || !postHeroTurn || ending) return;
    const node = round.post.node;
    const ev = actionEvFor(node, round.deal.handIdx[round.deal.heroPlayer]);
    const labels = node.actions.map(actionLabel);
    setDecisions((prev) => [
      ...prev,
      makeDecision(
        round.post!.street.toUpperCase(),
        labels,
        ev,
        index,
        node.actions.map((a) => a.kind),
        round.post!.board,
        fromNode(
          node,
          round.spot!.handsByPlayer[round.deal!.heroPlayer],
          labels,
          round.deal!.hands[round.deal!.heroPlayer],
        ),
      ),
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
        <p className="animate-[gw-thinking_1200ms_ease-in-out_infinite] gw-label">준비 중</p>
      </div>
    );
  }

  const preTurnReady = Boolean(round.game.turn && allRevealed && !ending);
  const street =
    phase === "postflop" && round.post ? round.post.street.toUpperCase() : "PREFLOP";
  // 플랍 전에는 상대가 정해지지 않았으므로, 살아 있을 수 있는 자리를 접지 않는다.
  const foldedSeats =
    villainSeat && phase === "postflop"
      ? SEATS.filter((x) => x !== heroSeat && x !== villainSeat)
      : [];

  const postActionSeat = round.post?.node
    ? round.post.node.player === round.deal?.heroPlayer
      ? heroSeat
      : (villainSeat ?? heroSeat)
    : null;

  const heroCards: [string, string] =
    phase === "postflop" && round.deal
      ? [
          round.deal.hands[round.deal.heroPlayer].slice(0, 2),
          round.deal.hands[round.deal.heroPlayer].slice(2, 4),
        ]
      : round.heroCombo;

  return (
    <div
      className="relative flex h-full min-h-0 flex-col select-none overflow-hidden"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <header className="absolute inset-x-0 top-0 z-20 flex h-12 items-center justify-between bg-[var(--gw-bg)]/90 px-4 backdrop-blur-sm">
        <div className="gw-num text-[11px] font-semibold text-[var(--gw-text-secondary)]">
          {street} · {heroSeat} · {round.hands[heroSeat]}
        </div>
        <div className="gw-num text-[11px] text-[var(--gw-text-muted)]">
          {SEATS_DATA.stackBb}bb · 앤티 {SEATS_DATA.anteBb}
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        <div className="absolute inset-x-0 bottom-0 top-12">
          <PokerTable
            tableSize={TABLE_SIZE}
            heroPosition={heroSeat}
            stackBb={SEATS_DATA.stackBb}
            anteBb={SEATS_DATA.anteBb}
            shoverPosition={null}
            awaitingAction={preTurnReady || (phase === "postflop" && postHeroTurn && !ending)}
            hand={tableHand}
            heroCards={heroCards}
            board={round.allinBoard ?? (phase === "postflop" ? round.post?.board : undefined)}
            potBbOverride={
              view
                ? Number((view.totalPotBb - (chipsShown ? view.frontBb : 0)).toFixed(2))
                : undefined
            }
            dealKey={String(round.id)}
            actionSeat={phase === "postflop" ? postActionSeat : undefined}
            foldedSeats={foldedSeats}
            preflopScript={round.game.steps}
            revealedSteps={phase === "postflop" ? undefined : revealed}
            seatActions={view?.actions}
            seatChips={view ? (chipsShown ? view.chips : {}) : undefined}
            collectingChips={Boolean(view?.closed) && !swept}
          />
        </div>
      </div>

      {!ending && round.game.turn && phase === "preflop" && (
        <div
          className="grid gap-2.5 px-4 pb-4"
          style={{
            gridTemplateColumns: `repeat(${round.game.turn.actions.length}, minmax(0, 1fr))`,
          }}
        >
          {round.game.turn.actions.map((action) => (
            <button
              key={action}
              type="button"
              disabled={!preTurnReady}
              onClick={() => choosePreflop(action)}
              className={`rounded-[var(--gw-radius-control)] py-4 text-[15px] font-bold tracking-[-0.01em] transition active:scale-95 disabled:cursor-wait disabled:opacity-40 ${
                action === "fold"
                  ? "bg-[var(--gw-danger)] text-[var(--gw-text-primary)]"
                  : action === "call"
                    ? "bg-[var(--gw-accent)] text-[var(--gw-ink)]"
                    : "bg-[var(--gw-accent-strong)] text-[var(--gw-text-primary)]"
              }`}
            >
              {labelFor(SEATS_DATA, action)}
            </button>
          ))}
        </div>
      )}

      {!ending && phase === "postflop" && round.post?.node && (
        <div
          className="grid gap-2.5 px-4 pb-4"
          style={{ gridTemplateColumns: `repeat(${round.post.node.actions.length}, minmax(0, 1fr))` }}
        >
          {round.post.node.actions.map((action, index) => (
            <button
              key={`${action.kind}-${action.amountBb}`}
              type="button"
              disabled={!postHeroTurn}
              onClick={() => choosePostflop(index)}
              className={`rounded-[var(--gw-radius-control)] py-4 text-[15px] font-bold tracking-[-0.01em] transition active:scale-95 disabled:cursor-wait disabled:opacity-40 ${
                action.kind === "fold"
                  ? "bg-[var(--gw-danger)] text-[var(--gw-text-primary)]"
                  : action.kind === "call"
                    ? "bg-[var(--gw-accent)] text-[var(--gw-ink)]"
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
          note={ending ?? "핸드 종료"}
          showdown={
            showdown && villainSeat ? (
              <div className="mt-3 rounded-[var(--gw-radius-card)] border border-[var(--gw-border)] bg-[var(--gw-table-header)] px-3.5 py-3">
                <div className="flex items-center justify-between">
                  <span className="gw-label">
                    {showdown.winner === "hero" ? "WIN" : showdown.winner === "tie" ? "SPLIT" : "LOSE"}
                  </span>
                  <span className="gw-label">쇼다운</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-[13px]">
                  <span className="text-[var(--gw-text-secondary)]">
                    나 · {heroSeat} · {round.hands[heroSeat]}
                  </span>
                  <span className="font-semibold text-[var(--gw-text-primary)]">
                    {showdown.heroHandName}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-[13px]">
                  <span className="text-[var(--gw-text-muted)]">
                    상대 · {villainSeat} · {round.hands[villainSeat]}
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
