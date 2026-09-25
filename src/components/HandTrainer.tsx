"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SEATS_DATA } from "@/lib/seatsData";
import { actionEvFor, actionLabel, type SolvedSpot } from "@/lib/tree";
import { makeDecision, scoreHand, type Decision } from "@/lib/decisions";
import { fromNode, fromRanges } from "@/lib/rangeGrid";
import { RECAP_EVERY, summarizeRun, toRunDecisions, type RunDecision } from "@/lib/session-run";
import RunRecap from "./RunRecap";
import { rangeMix, reachWeights } from "@/lib/rangeMix";
import { buildTableView } from "@/lib/tableView";
import { judge, type Showdown } from "@/lib/showdown";
import { dealCombo } from "@/lib/preflopGame";
import { loadEquity } from "@/lib/equity";
import {
  acceptSituation,
  currentSkills,
  noteLoss,
  situationKey,
  type SkillMap,
} from "@/lib/adaptive";
import { dealRunout } from "@/lib/runout";
import { applyAction, startHand, type HandState } from "@/lib/hand";
import { sampleActionIndex, type Deal } from "@/lib/postflopSpot";
import { ALL_HANDS, seatNames } from "@/lib/poker";
import {
  applyHeroAction,
  labelFor,
  setEquityTable,
  startGame,
  type GameState,
  type SeatAction,
} from "@/lib/seatGame";
import {
  loadSpot,
  loadSpotIndex,
  pickSpotEntry,
  prefetchSpot,
  spotsForPair,
  type SpotEntry,
} from "@/lib/spotLibrary";
import { ensureGuestUser, logHand } from "@/lib/attempts";
import { currentUserId } from "@/lib/session";
import GradeIcon from "./GradeIcon";
import HandResult from "./HandResult";
import PokerTable from "./PokerTable";
import { dealDurationMs } from "./BoardCard";

const TABLE_SIZE = SEATS_DATA.tableSize;

/**
 * 액션 버튼 한 줄의 높이 + 아래 여백.
 *
 * 버튼이 py-4(32px)에 15px 글자 한 줄(약 22px)이라 54px, 여기에 pb-4(16px).
 * 버튼이 사라져도 이만큼은 비워 둬야 위의 테이블이 안 움직인다.
 */
const ACTION_BAR_MIN_H = "70px";

/**
 * 포스트플랍으로 넘어가고 플랍이 나오기까지의 사이.
 *
 * 칩은 넘어가기 전에 이미 팟으로 쓸려 들어갔다(PREFLOP_SWEEP_MS). 여기서는
 * 액션 표시가 지워진 테이블을 한 박자 보여줄 뿐이다 — 지워지는 것과 카드가
 * 놓이는 것이 같은 프레임이면 플랍이 어디선가 튀어나온 것처럼 보인다.
 *
 * 보드를 받아오는 시간과 무관하게 일정해야 한다 — 받아오는 시간은 판마다
 * 다르고, 그러면 리듬이 판마다 달라진다.
 */
const FLOP_BEAT_MS = 280;

/**
 * 마지막 프리플랍 액션이 뜨고부터 칩을 쓸어 담기 시작하기까지.
 *
 * 액션이 튀어나오는 동작이 420ms라, 680ms로 잡았을 때는 다 뜬 "CALL"이
 * 260ms만 머물고 사라져 취소된 것처럼 보였다. 다 뜬 뒤로 500ms는 남긴다.
 */
const PREFLOP_SETTLE_MS = 920;

/**
 * 프리플랍 칩이 팟으로 날아가는 시간. gw-chip-to-pot과 같아야 한다.
 *
 * 포스트플랍으로 넘어가면 프리플랍 칩과 액션 표시가 한꺼번에 지워진다. 그 전에
 * 칩을 팟으로 보내 두지 않으면 콜한 칩이 날아가지 않고 증발한다.
 */
const PREFLOP_SWEEP_MS = 460;

/**
 * 상대 카드가 까이고 결과 창이 올라오기까지.
 *
 * 결과 창이 화면 아래를 덮어서 상대 카드가 가려진다. 카드는 테이블에만
 * 그리므로, 여기서 못 보면 그 판은 영영 못 본다.
 *
 * 쇼다운은 더 오래 잡는다. 접고 끝난 판은 상대 카드 두 장만 읽으면 되지만,
 * 쇼다운은 양쪽 패와 보드 다섯 장을 맞춰 봐야 누가 왜 이겼는지가 보인다.
 */
const REVEAL_FOLD_MS = 1400;
const REVEAL_SHOWDOWN_MS = 2600;

/** 각 스트릿에서 이미 깔려 있던 카드 수. 새 카드는 여기서부터 놓인다. */
const DEAL_FROM: Record<string, number> = { flop: 0, turn: 3, river: 4 };

/**
 * 마지막 카드가 앞면으로 놓이고 차례가 열리기까지. 카드가 멈추는 것과 차례
 * 표시가 켜지는 것이 같은 프레임이면 카드를 볼 틈 없이 눈이 좌석으로 끌려간다.
 */
const BOARD_SETTLE_MS = 160;
const SEATS = seatNames(TABLE_SIZE);
const tableHand = ALL_HANDS[0];

/** 한 스텝이 화면에 나타나고 다음으로 넘어가기까지. 폴드는 실제로도 빠르다. */
const STEP_MS = 620;
const FOLD_STEP_MS = 320;
/**
 * 내가 접은 뒤 남은 자리들의 액션. 내 판은 끝났으니 기다리게 할 이유가 없다.
 * 아예 건너뛰면 누가 팟을 가져갔는지가 사라지므로 빨리 감기만 한다.
 */
const AFTER_FOLD_STEP_MS = 90;
const AFTER_FOLD_ACTION_MS = 260;

/**
 * 잘 친 판(모든 판단이 무난 이상)은 결과 창 없이 이만큼 보여주고 넘어간다.
 * 매 판 결과 창을 닫게 하면 흐름이 판마다 끊긴다. 실수한 판만 멈춘다.
 */
const AUTO_NEXT_MS = 1600;

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
  /**
   * 이 보드가 실제 상황과 얼마나 맞는가.
   *   exact   — 오프너 구간도, 콜러가 BB인 것도 맞다.
   *   opener  — 구간은 맞지만 콜러가 BB가 아니다. 콜 레인지가 다르다.
   *   none    — 구간 데이터가 없어 기본 보드(BTN·BB)로 떨어졌다.
   */
  boardFit: "exact" | "opener" | "none";
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

/**
 * 내가 낄 자리가 있는 판인가.
 *
 * 앞자리 둘이서 팟을 만들면 내 차례가 오기 전에 플랍이 정해진다 — 열한 판에
 * 한 번쯤이다. 실제 테이블에서는 구경하는 판이지만, 트레이너에서는 고를 것이
 * 없는 판이라 화면에 올렸다가 곧바로 다시 돌리게 된다. 그 깜빡임을 없앤다.
 */
/**
 * 뻔한 폴드를 몇 판에 한 번만 남기는가.
 *
 * 실제 확률대로 딜하면 판의 60%가 "쓰레기 패를 접고 남들 접는 걸 구경하는"
 * 판이다(2만 판 시뮬레이션). 실제 테이블은 그렇지만 연습에서는 한 판의 시간을
 * 버리는 것이다. 다 빼지는 않는다 — 접을 패를 접는 것도 실력이고, 전부 빼면
 * 딜되는 패가 다 좋아 보여 감각이 흐려진다. 15%만 남기면 뻔한 폴드 판이
 * 21%로, 고민되는 판단(최선과 차선이 0.25bb 안)이 21%에서 43%로 바뀐다.
 */
const KEEP_OBVIOUS_FOLD = 0.15;

/** 최선이 폴드이고 차선보다 0.5bb 넘게 낫다. 고민할 거리가 없는 판단이다. */
function obviousFold(turn: NonNullable<GameState["turn"]>): boolean {
  const known = turn.evBb.filter((v): v is number => v !== null);
  if (known.length === 0) return false;
  const best = Math.max(...known);
  const second = known.filter((v) => v !== best).sort((x, y) => y - x)[0] ?? best;
  return turn.actions[turn.evBb.indexOf(best)] === "fold" && best - second > 0.5;
}

function worthPlaying(game: GameState, heroSeat: string, skills: SkillMap): boolean {
  if (game.turn) {
    if (obviousFold(game.turn) && Math.random() >= KEEP_OBVIOUS_FOLD) return false;
    // 자주 잃는 상황일수록 더 자주 받는다(lib/adaptive.ts).
    return acceptSituation(skills, situationKey(heroSeat, game.turn.stage), Math.random);
  }
  const o = game.outcome;
  if (!o) return false;
  if (o.kind === "flop") return o.opener === heroSeat || o.caller === heroSeat;
  // 다들 접어서 내가 BB로 가져가는 판은 짧아도 보여줄 만하다.
  //
  // 나머지는 앞자리끼리 끝낸 판이다 — 올인에 누가 콜했다(콜러는 한 명까지라
  // 그 뒤는 모두 접는다). 거기에 나도 들어가서, 고른 적 없는 폴드가 화면에 뜬다.
  return o.kind === "folded" && o.winner === heroSeat;
}

function freshRound(fixedSeat: string | null | undefined, skills: SkillMap): Round {
  // 자리를 정하지 않았으면 다시 돌릴 때마다 자리도 새로 고른다. 그래야 적응형
  // 딜이 자리 사이에서도 약한 쪽을 더 자주 고를 수 있다.
  const pickSeat = () =>
    fixedSeat && SEATS.includes(fixedSeat)
      ? fixedSeat
      : SEATS[Math.floor(Math.random() * SEATS.length)];

  // 고를 것이 있는 판이 나올 때까지 다시 돌린다. 뻔한 폴드와 적응형 무게로
  // 걸러 한 번에 나올 확률이 1/4쯤이라 예순 번이면 사실상 늘 나온다. 그래도 안
  // 나오면 마지막 판을 그냥 쓴다 — 무한히 돌리느니 한 판 어색한 편이 낫다.
  let heroSeat = pickSeat();
  let hands = Object.fromEntries(SEATS.map((s) => [s, dealHandCode(Math.random)]));
  let game = startGame(SEATS_DATA, SEATS, heroSeat, hands, Math.random);
  for (let tries = 0; tries < 60 && !worthPlaying(game, heroSeat, skills); tries++) {
    heroSeat = pickSeat();
    hands = Object.fromEntries(SEATS.map((s) => [s, dealHandCode(Math.random)]));
    game = startGame(SEATS_DATA, SEATS, heroSeat, hands, Math.random);
  }

  // 히어로가 실제로 쥔 두 장. 이걸 안 정하면 테이블이 더미 핸드를 그린다.
  const heroCombo = dealCombo(hands[heroSeat], new Set(), Math.random) ?? ["Ah", "Ad"];
  return {
    id: Date.now() + Math.floor(Math.random() * 1000),
    heroSeat,
    hands,
    heroCombo,
    game,
    allinBoard: null,
    allinCards: null,
    entry: null,
    boardFit: "none",
    spot: null,
    post: null,
    deal: null,
  };
}

export default function HandTrainer({ seat }: { seat?: string | null }) {
  const [entries, setEntries] = useState<SpotEntry[] | null>(null);
  const [round, setRound] = useState<Round | null>(() => freshRound(seat, currentSkills()));
  const [phase, setPhase] = useState<Phase>("preflop");
  const [revealed, setRevealed] = useState(0);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [ending, setEnding] = useState<string | null>(null);
  /**
   * 카드를 까고 끝났는가.
   *
   * 상대 카드는 접고 끝났어도 늘 보여준다 — 무엇을 들고 접는지가 배울 거리다.
   * 하지만 승패는 다르다. 접은 사람은 넛츠를 들고 있었어도 진 것이므로,
   * "누가 더 셌나"는 카드를 깐 판에서만 말한다.
   */
  const [shown, setShown] = useState(false);
  const [sweptKey, setSweptKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** 이번에 앉아서 친 몫. 몇 판마다 멈춰서 보여준다. */
  const [run, setRun] = useState<{ hands: number; decisions: RunDecision[] }>({
    hands: 0,
    decisions: [],
  });
  const [recapOpen, setRecapOpen] = useState(false);
  /** 플랍을 깔아도 되는가. 팟이 정리되고 한 박자 쉰 뒤에 참이 된다. */
  const [flopReady, setFlopReady] = useState(false);
  /** 프리플랍이 닫혀 칩을 팟으로 쓸어 담는 중인가. */
  const [preflopSweep, setPreflopSweep] = useState(false);
  /** 결과 창을 올려도 되는가. 상대 카드를 보여준 뒤에 참이 된다. */
  const [resultReady, setResultReady] = useState(false);
  /** 이 스트릿의 보드가 다 깔렸는가. 깔린 스트릿의 키를 담는다. */
  const [settledKey, setSettledKey] = useState<string | null>(null);
  const timers = useRef<number[]>([]);
  const loggedRef = useRef<number | null>(null);

  const clearTimers = useCallback(() => {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current = [];
  }, []);

  const newRound = useCallback(() => {
    clearTimers();
    setRecapOpen(false);
    setFlopReady(false);
    setPreflopSweep(false);
    setResultReady(false);
    setDecisions([]);
    setEnding(null);
    setShown(false);
    setPhase("preflop");
    setRevealed(0);
    loggedRef.current = null;
    setRound(freshRound(seat, currentSkills()));
  }, [clearTimers, seat]);

  /**
   * 이 판을 접고 다음으로. 세션 집계는 여기서 한다 — 이펙트 안에서 상태를
   * 바꾸면 렌더가 한 번 더 돌고, 린트도 막는다.
   */
  const finishHand = useCallback(() => {
    if (!round) {
      newRound();
      return;
    }
    const rows = toRunDecisions(decisions, round.heroSeat, round.hands[round.heroSeat]);
    const hands = run.hands + 1;
    setRun({ hands, decisions: [...run.decisions, ...rows] });
    // 몇 판마다 멈춘다. 멈춘 자리에서 다음 핸드로 가는 버튼은 회고 안에 있다.
    if (hands % RECAP_EVERY === 0) {
      setRecapOpen(true);
      return;
    }
    newRound();
  }, [round, decisions, run, newRound]);

  useEffect(() => {
    // 3벳 올인 뒷자리의 EV는 승률표로 낸다. 받기 전에 딜된 판은 그 자리가 접는다.
    void loadEquity().then(setEquityTable);
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
    const heroOut = round.game.steps
      .slice(0, revealed)
      .some((s) => s.seat === round.heroSeat && s.kind === "fold");
    const wait = heroOut
      ? step.kind === "fold"
        ? AFTER_FOLD_STEP_MS
        : AFTER_FOLD_ACTION_MS
      : step.kind === "fold"
        ? FOLD_STEP_MS
        : STEP_MS;
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

  /**
   * 이 판의 플랍에 내가 들어가는가.
   *
   * 앞자리 둘이서 팟을 만들면 내 차례가 오기 전에 플랍이 결정된다 — 아홉 자리
   * 중 열한 판에 한 번쯤 그렇다. 실제 테이블에서는 그냥 구경하는 판이지만,
   * 그대로 두면 내가 고른 적 없는 판의 플랍에 나를 앉히게 된다.
   */
  const heroInFlop =
    outcome?.kind === "flop"
      ? outcome.opener === heroSeat || outcome.caller === heroSeat
      : false;

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

  // 스트릿이 닫혔으면 딜러가 칩을 팟으로 모은 뒤에 다음 카드를 깐다. 그 전까지는
  // 이전 스트릿의 보드를 그대로 둔다 — 칩이 날아가는 동안 카드가 놓이면 두 동작이
  // 겹쳐 라운드가 칩 수거와 동시에 시작된 것처럼 보인다.
  const postStreet = round?.post?.street ?? "flop";
  const lastStreet = round?.post?.history.at(-1)?.street;
  const holdingBoard = Boolean(lastStreet && lastStreet !== postStreet) && !swept;
  const dealFrom = DEAL_FROM[postStreet];
  const postBoard =
    phase === "postflop" && flopReady && round?.post
      ? holdingBoard
        ? round.post.board.slice(0, dealFrom)
        : round.post.board
      : undefined;
  const boardKey =
    postBoard && !holdingBoard && round ? `${round.id}-${postStreet}` : null;
  /** 보드가 다 깔렸다. 그 전에는 누구도 이 스트릿의 액션을 하지 않는다. */
  const boardSettled = boardKey !== null && settledKey === boardKey;
  const postBoardLength = postBoard?.length ?? 0;

  useEffect(() => {
    if (!boardKey || settledKey === boardKey) return;
    const wait = dealDurationMs(dealFrom, postBoardLength - dealFrom) + BOARD_SETTLE_MS;
    const t = window.setTimeout(() => setSettledKey(boardKey), wait);
    timers.current.push(t);
    return () => window.clearTimeout(t);
  }, [boardKey, settledKey, dealFrom, postBoardLength]);

  // 프리플랍이 끝나고 모든 액션을 다 보여줬으면 다음으로 넘긴다.
  useEffect(() => {
    if (!round || !allRevealed || !outcome || phase !== "preflop") return;

    if (outcome.kind !== "flop" || !heroInFlop) {
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
          ? "올인 쇼다운"
          : outcome.kind === "flop"
            ? // 내가 낀 판이 아니다. 바로 위에서 다시 돌리므로 보일 일은 없다.
              `${outcome.opener}와 ${outcome.caller}의 판입니다`
            : outcome.winner === round.heroSeat
              ? "모두 폴드, 팟 획득"
              : `${outcome.winner} 팟 획득`;
      const t = window.setTimeout(() => {
        if (board && cards) {
          setShown(true);
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
    const openerSeat = outcome.opener;

    // 마지막 액션을 읽을 시간을 준다.
    //
    // 포스트플랍으로 넘어가는 순간 프리플랍 액션 표시가 한꺼번에 지워진다.
    // 보드 파일이 미리 받아져 있으면 그 전환이 마지막 액션이 뜬 바로 다음
    // 프레임에 일어나서, "BB 콜"이 떴다 사라지며 취소된 것처럼 보인다.
    //
    // 파일을 받는 일은 지금 바로 시작하되, 넘어가는 것만 늦춘다. 그래야
    // 받아오는 시간이 길든 짧든 리듬이 같다.
    //
    // 읽을 시간 → 칩을 팟으로 → 넘어감. 칩을 먼저 보내야 넘어가며 액션 표시가
    // 지워질 때 칩까지 같이 사라지지 않는다.
    const pending: number[] = [];
    const settled = new Promise<void>((resolve) => {
      pending.push(
        window.setTimeout(() => setPreflopSweep(true), PREFLOP_SETTLE_MS),
        window.setTimeout(resolve, PREFLOP_SETTLE_MS + PREFLOP_SWEEP_MS),
      );
      timers.current.push(...pending);
    });
    // 오프너·콜러 조합에 맞는 보드가 있으면 그걸 쓴다. 없으면 기본 목록(BTN 오픈,
    // BB 콜)으로 떨어지는데, 그건 콜러가 오프너보다 먼저 치는 조건이다. 콜러가
    // IP면 역할이 뒤바뀌어 쓸 수 없으므로 판을 접는다.
    const callerIp = outcome.caller !== "BB" && outcome.caller !== "SB";
    void spotsForPair(openerSeat, outcome.caller)
      .then((found) => {
        if (!found && callerIp) throw new Error("no-ip-boards");
        const pool = found?.list ?? entries;
        const entry = pickSpotEntry(pool, Math.random, round.entry?.file);
        const fit: "exact" | "opener" | "none" = found?.fit ?? "none";
        return loadSpot(entry).then(async (spot) => {
          await settled;
          return { spot, entry, pool, fit };
        });
      })
      .then(({ spot, entry, pool, fit }) => {
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
          setEnding("이 판은 여기까지입니다");
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
        // 상대 핸드가 레인지 밖이면 상대를 움직일 방법이 없다. 이건 드물고,
        // 이때만 판을 접는다.
        if (handIdx[1 - heroPlayer] < 0) {
          setEnding("이 판은 여기까지입니다");
          setPhase("over");
          return;
        }
        // 내 핸드가 레인지 밖인 것은 접을 이유가 아니다. 앞에서 레인지 밖
        // 판단을 한 결과이고 — 96o로 콜한 판이 그렇다 — 그 결과를 끝까지
        // 쳐보는 것이 학습이다. 채점만 못 한다.
        setRound((cur) =>
          cur
            ? {
                ...cur,
                entry,
                boardFit: fit,
                spot,
                post: startHand(spot),
                deal: { heroPlayer, hands, handIdx },
              }
            : cur,
        );
        setPhase("postflop");
        prefetchSpot(pickSpotEntry(pool, Math.random, entry.file));
      })
      .catch((err: unknown) => {
        setEnding(
          err instanceof Error && err.message === "no-ip-boards"
            ? `${outcome.opener} 오픈에 ${outcome.caller}가 콜한 보드는 아직 준비 중입니다`
            : "보드를 불러오지 못했습니다",
        );
        setPhase("over");
      });
    return () => {
      alive = false;
      // 다시 돌면 박자를 처음부터 센다. 이전 타이머가 남으면 칩이 먼저 날아간다.
      pending.forEach((t) => window.clearTimeout(t));
    };
  }, [
    round,
    allRevealed,
    outcome,
    phase,
    entries,
    villainSeat,
    decisions.length,
    heroInFlop,
    newRound,
  ]);

  // 포스트플랍에서 상대 차례면 솔브된 전략대로 친다.
  const postHeroTurn = round?.post?.node?.player === round?.deal?.heroPlayer;
  /** 레인지 밖 핸드로 플랍에 왔는가. 치기는 하되 채점은 못 한다. */
  const heroOutOfRange = Boolean(
    round?.deal && round.deal.handIdx[round.deal.heroPlayer] < 0,
  );
  useEffect(() => {
    if (
      phase !== "postflop" ||
      !round?.post?.node ||
      !round.spot ||
      postHeroTurn ||
      ending ||
      !boardSettled
    )
      return;
    const t = window.setTimeout(() => {
      setRound((cur) => {
        if (!cur?.post?.node || !cur.spot || !cur.deal) return cur;
        const node = cur.post.node;
        const idx = sampleActionIndex(node, cur.deal.handIdx[node.player], Math.random);
        const next = applyAction(cur.spot, cur.post, idx);
        if (next.node === null) {
          const folded = node.actions[idx].kind === "fold";
          setShown(!folded);
          setEnding(
            folded
              ? "상대 폴드"
              : `상대 ${actionLabel(node.actions[idx])} · 쇼다운`,
          );
        }
        return { ...cur, post: next };
      });
    }, 700);
    timers.current.push(t);
    return () => window.clearTimeout(t);
  }, [phase, round, postHeroTurn, ending, boardSettled]);

  // 팟이 정리되고 한 박자 뒤에 보드를 연다.
  useEffect(() => {
    if (phase !== "postflop" || flopReady) return;
    const t = window.setTimeout(() => setFlopReady(true), FLOP_BEAT_MS);
    timers.current.push(t);
    return () => window.clearTimeout(t);
  }, [phase, flopReady]);

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
    if (!ending || !round || !shown) return null;
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
  }, [ending, round, shown]);

  /**
   * 판이 끝나면 상대가 무엇을 들고 있었는지.
   *
   * 접고 끝났어도 보여준다 — 상대가 무엇을 들고 접는지는 승패만큼이나
   * 배울 거리다. 승패 판정과 달리 이건 언제나 말할 수 있는 사실이다.
   */
  const villainReveal: [string, string] | null = useMemo(() => {
    if (!ending || !round || !villainSeat) return null;
    if (round.allinCards) return round.allinCards.villain;
    if (!round.deal) return null;
    const combo = round.deal.hands[1 - round.deal.heroPlayer];
    return [combo.slice(0, 2), combo.slice(2, 4)];
  }, [ending, round, villainSeat]);

  // 상대 카드를 까고 한 박자 뒤에 결과 창을 올린다. 깔 카드가 없으면
  // (프리플랍에서 다들 접은 판) 기다릴 이유가 없다.
  const allinBoardLength = round?.allinBoard?.length ?? 0;
  // 올인 런아웃은 다섯 장을 차례로 깐다. 다 깔린 뒤부터 읽을 시간을 센다.
  const revealMs = !villainReveal
    ? 0
    : shown
      ? (allinBoardLength ? dealDurationMs(0, allinBoardLength) : 0) + REVEAL_SHOWDOWN_MS
      : REVEAL_FOLD_MS;
  const handScore = scoreHand(decisions);
  /** 모든 판단이 무난 이상이다. 이런 판은 결과 창 없이 넘어간다. */
  const handClean = decisions.every((d) => !d.grade || d.grade.rank <= 1);
  useEffect(() => {
    if ((!ending && phase !== "over") || resultReady || handClean) return;
    const t = window.setTimeout(() => setResultReady(true), revealMs);
    timers.current.push(t);
    return () => window.clearTimeout(t);
  }, [ending, phase, resultReady, revealMs, handClean]);

  // 잘 친 판은 결과 창을 띄우지 않고 넘어간다. 아래 바를 누르면 결과 창이
  // 열리고(resultReady), 그러면 이 타이머는 취소된다.
  const autoNext = Boolean(ending || phase === "over") && handClean && !resultReady;
  useEffect(() => {
    if (!autoNext) return;
    const t = window.setTimeout(finishHand, revealMs + AUTO_NEXT_MS);
    timers.current.push(t);
    return () => window.clearTimeout(t);
  }, [autoNext, revealMs, finishHand]);

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
        heroCards: round.deal?.hands[round.deal.heroPlayer],
        spotFile: round.entry?.file,
        heroPlayer: round.deal?.heroPlayer,
        decisions: decisions.map((d) => ({
          street: d.street,
          userAction: d.chosenKind,
          correctAction: d.bestKind,
          evLossBb: d.lossBb,
          board: d.board,
          nodeLine: d.nodeLine,
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
      // 3벳 올인 뒷자리는 솔버가 푼 레인지가 없다. 격자 없이 EV만 보여준다.
      if (stage.opener) return null;
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

    const decision = makeDecision(
      "PREFLOP",
      labels,
      turn.evBb,
      i,
      turn.actions.map((a) => (a === "open" ? "open" : a === "jam" ? "allin" : a)),
      [],
      view,
      stage.kind === "firstIn"
        ? "firstIn"
        : stage.kind === "vsOpen"
          ? `vsOpen:${stage.opener}`
          : `vsJam:${stage.jammer}${stage.opener ? `:${stage.opener}` : ""}`,
    );
    if (decision.lossBb !== null) noteLoss(situationKey(round.heroSeat, stage), decision.lossBb);
    setDecisions((prev) => [
      ...prev,
      // 올인을 마주한 자리에서만 팟 오즈와 승률로 근거를 댈 수 있다.
      stage.kind === "vsJam"
        ? {
            ...decision,
            jam: {
              heroSeat: round.heroSeat,
              jammer: stage.jammer,
              iOpened: stage.iOpened,
              ...(stage.opener ? { opener: stage.opener } : {}),
            },
          }
        : decision,
    ]);
    setRound((cur) =>
      cur ? { ...cur, game: applyHeroAction(SEATS_DATA, cur.game, action, Math.random) } : cur,
    );
  };

  const choosePostflop = (index: number) => {
    if (!round?.post?.node || !round.spot || !round.deal || !postHeroTurn || ending || !boardSettled)
      return;
    const node = round.post.node;
    const heroIdx = round.deal.handIdx[round.deal.heroPlayer];
    // 레인지 밖이면 비교할 값이 없다. 0으로 채우면 아무거나 최선이 된다.
    const ev: (number | null)[] =
      heroIdx < 0 ? node.actions.map(() => null) : actionEvFor(node, heroIdx);
    const labels = node.actions.map(actionLabel);
    // 이 라인까지 온 내 레인지가 여기서 무엇을 하는가.
    const mix = rangeMix(node, reachWeights(round.spot, node.line, node.player), labels);
    const decision = makeDecision(
      round.post.street.toUpperCase(),
      labels,
      ev,
      index,
      node.actions.map((a) => a.kind),
      round.post.board,
      fromNode(
        node,
        round.spot.handsByPlayer[round.deal.heroPlayer],
        labels,
        // 레인지 밖 핸드는 격자에 칸이 없다. 표시할 자리를 찾지 못한다.
        heroIdx < 0 ? null : round.deal.hands[round.deal.heroPlayer],
      ),
      node.line,
    );
    setDecisions((prev) => [...prev, mix ? { ...decision, mix } : decision]);
    const next = applyAction(round.spot, round.post, index);
    if (next.node === null) {
      const folded = node.actions[index].kind === "fold";
      setShown(!folded);
      setEnding(
        folded ? "폴드" : `${labels[index]} · 쇼다운`,
      );
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
  const lastDecision = decisions.at(-1) ?? null;
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
          {street} · {heroSeat}
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
            awaitingAction={
              preTurnReady || (phase === "postflop" && postHeroTurn && boardSettled && !ending)
            }
            hand={tableHand}
            heroCards={heroCards}
            board={round.allinBoard ?? postBoard}
            // 스트릿이 곧 "몇 장이 이미 있었나"다. 올인 런아웃은 다섯 장을
            // 한꺼번에 까므로 처음부터 차례로 놓는다.
            boardDealFrom={
              round.allinBoard ? 0 : DEAL_FROM[round.post?.street ?? "flop"]
            }
            potBbOverride={
              view
                ? Number((view.totalPotBb - (chipsShown ? view.frontBb : 0)).toFixed(2))
                : undefined
            }
            sprBb={
              // 플랍이 깔린 뒤에만 뜻이 있다. 솔버가 이 스팟을 푼 조건 그대로다.
              phase === "postflop" && round.spot
                ? Math.round((round.spot.effectiveStackBb / round.spot.startingPotBb) * 10) / 10
                : undefined
            }
            revealedCards={
              villainReveal && villainSeat ? { [villainSeat]: villainReveal } : undefined
            }
            dealKey={String(round.id)}
            // 보드가 다 깔리기 전에는 아무 자리도 차례가 아니다.
            actionSeat={
              phase === "postflop" ? (boardSettled ? postActionSeat : null) : undefined
            }
            foldedSeats={foldedSeats}
            preflopScript={round.game.steps}
            revealedSteps={phase === "postflop" ? undefined : revealed}
            seatActions={view?.actions}
            seatChips={view ? (chipsShown ? view.chips : {}) : undefined}
            collectingChips={
              phase === "postflop" ? Boolean(view?.closed) && !swept : preflopSweep
            }
          />
        </div>
      </div>

      {/*
        액션 영역은 버튼이 없어도 자리를 지킨다. 조건부로 통째로 빼면 위의
        테이블이 그만큼 늘어났다 줄었다 하고, 카드와 칩이 판마다 다른 자리에
        있게 된다. 고르는 순간 화면이 움직이면 고른 것이 맞는지도 헷갈린다.
      */}
      <div className="px-4 pb-4" style={{ minHeight: ACTION_BAR_MIN_H }}>
        {/*
          카드를 까고 결과 창이 올라오기까지 몇 초가 빈다. 아무것도 없으면
          멈춘 것처럼 보이므로, 무슨 일이 있었는지 여기 적는다. 다 본 사람은
          눌러서 바로 넘어간다 — 기다리게 하는 것과 붙잡아 두는 것은 다르다.
        */}
        {(ending || phase === "over") && !resultReady && (
          <button
            type="button"
            onClick={() => setResultReady(true)}
            className="relative flex w-full items-center gap-2.5 overflow-hidden rounded-[var(--gw-radius-control)] border border-[var(--gw-border)] px-4 py-3.5 text-left transition active:scale-[0.98]"
          >
            {handScore.grade && (
              <GradeIcon id={handScore.grade.id} color={handScore.grade.color} />
            )}
            <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--gw-text-secondary)]">
              {ending ?? "핸드 종료"}
            </span>
            {handScore.gradedCount > 0 && handScore.totalLossBb > 0 && (
              <span className="gw-num shrink-0 text-[11px] text-[var(--gw-text-muted)]">
                -{handScore.totalLossBb}bb
              </span>
            )}
            {autoNext && (
              // 곧 다음 판으로 넘어간다는 표시. 누르면 멈추고 결과를 연다.
              <span
                key={round.id}
                aria-hidden
                className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-[var(--gw-border-strong)] motion-reduce:hidden"
                style={{ animation: `gw-autonext ${AUTO_NEXT_MS}ms linear ${revealMs}ms both` }}
              />
            )}
          </button>
        )}
        {!ending && round.game.turn && phase === "preflop" && (
          <div
            className="grid gap-2.5"
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

        {/*
          방금 고른 판단의 등급. 판이 끝날 때까지 기다리지 않고 바로 보여준다 —
          다음 판단을 하기 전에 앞의 판단이 맞았는지 알아야 고칠 수 있다.
          버튼 자리를 그대로 쓰므로 테이블이 움직이지 않는다.
        */}
        {!ending &&
          lastDecision &&
          !(phase === "preflop" && round.game.turn) &&
          !(phase === "postflop" && postHeroTurn && round.post?.node) && (
            <div
              key={decisions.length}
              className="flex h-[54px] items-center justify-center gap-2 animate-[gw-history-enter_220ms_cubic-bezier(0.22,1,0.36,1)_both] motion-reduce:animate-none"
            >
              {lastDecision.grade && (
                <GradeIcon id={lastDecision.grade.id} color={lastDecision.grade.color} />
              )}
              <span className="text-[13px] font-semibold text-[var(--gw-text-secondary)]">
                {lastDecision.chosen}
              </span>
              {lastDecision.lossBb !== null && lastDecision.lossBb > 0 && (
                <span className="gw-num text-[11px] text-[var(--gw-text-muted)]">
                  -{lastDecision.lossBb}bb
                </span>
              )}
            </div>
          )}

        {!ending && phase === "postflop" && postHeroTurn && round.post?.node && (
          <div
            className="grid gap-2.5"
            style={{
              gridTemplateColumns: `repeat(${round.post.node.actions.length}, minmax(0, 1fr))`,
            }}
          >
            {round.post.node.actions.map((action, index) => (
              <button
                key={`${action.kind}-${action.amountBb}`}
                type="button"
                disabled={!postHeroTurn || !boardSettled}
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
      </div>

      {(ending || phase === "over") && resultReady && (
        <HandResult
          decisions={decisions}
          handCode={round.hands[round.heroSeat]}
          note={ending ?? "핸드 종료"}
          caveat={
            phase === "postflop" && heroOutOfRange
              ? "이 패로는 여기까지 오지 않는 게 정답이라, 플랍부터는 비교할 정답이 없습니다."
              : undefined
          }
          showdown={
            villainSeat && villainReveal ? (
              <div className="mt-3 rounded-[var(--gw-radius-card)] border border-[var(--gw-border)] bg-[var(--gw-table-header)] px-3.5 py-3">
                <div className="flex items-center justify-between">
                  {/* 카드를 깐 판에서만 승패를 말한다. 접은 사람은 넛츠를
                      들고 있었어도 진 것이라, 패를 비교하는 건 뜻이 없다. */}
                  <span className="gw-label">
                    {showdown
                      ? showdown.winner === "hero"
                        ? "WIN"
                        : showdown.winner === "tie"
                          ? "SPLIT"
                          : "LOSE"
                      : "상대 핸드"}
                  </span>
                  <span className="gw-label">{showdown ? "쇼다운" : "접고 끝남"}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-[13px]">
                  <span className="text-[var(--gw-text-secondary)]">
                    나 · {heroSeat} · {round.hands[heroSeat]}
                  </span>
                  {showdown && (
                    <span className="font-semibold text-[var(--gw-text-primary)]">
                      {showdown.heroHandName}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex items-center justify-between text-[13px]">
                  <span className="text-[var(--gw-text-muted)]">
                    상대 · {villainSeat} · {round.hands[villainSeat]}
                  </span>
                  {showdown && (
                    <span className="font-semibold text-[var(--gw-text-secondary)]">
                      {showdown.villainHandName}
                    </span>
                  )}
                </div>
              </div>
            ) : undefined
          }
          onNext={finishHand}
        />
      )}

      {recapOpen && (
        <RunRecap summary={summarizeRun(run.hands, run.decisions)} onContinue={newRound} />
      )}
    </div>
  );
}
