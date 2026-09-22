"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  getActionFrequency,
  POSITIONS,
  randomHand,
  randomPosition,
  OPEN_SIZE,
  SEAT_STACK,
  type Action,
  type ActionFrequency,
  type HandInfo,
  type Position,
} from "@/lib/poker";
import { ensureGuestUser, logAttempt } from "@/lib/attempts";
import { getGuestId } from "@/lib/guest";
import { fetchTrainingSolution } from "@/lib/solutions";
import PokerTable from "./PokerTable";

type Round = {
  position: Position;
  hand: HandInfo;
  history: HistoryAction[];
};

type HistoryAction = {
  seat: Position;
  action: string;
};

type Feedback = {
  userAction: Action;
  solution: ActionFrequency;
};

function getPreviousActions(position: Position): HistoryAction[] {
  const positionIndex = POSITIONS.indexOf(position);
  return POSITIONS.slice(0, positionIndex).map((seat) => ({ seat, action: "폴드" }));
}

function nextRound(): Round {
  const position = randomPosition();
  return { position, hand: randomHand(), history: getPreviousActions(position) };
}

export default function Trainer() {
  // 이 컴포넌트는 next/dynamic(ssr:false)로만 로드되므로 렌더 중 window/Math.random 사용이 안전합니다.
  const [round, setRound] = useState<Round>(() => nextRound());
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [loadedSolution, setLoadedSolution] = useState<{
    key: string;
    value: ActionFrequency | null;
  }>({ key: "", value: null });
  const [stats, setStats] = useState({ attempts: 0, correct: 0, streak: 0 });
  const [guestId] = useState<string>(() => getGuestId());
  const historyViewportRef = useRef<HTMLDivElement>(null);
  const historyTrackRef = useRef<HTMLDivElement>(null);
  const [historyOffset, setHistoryOffset] = useState(0);

  useEffect(() => {
    void ensureGuestUser(guestId);
  }, [guestId]);

  useEffect(() => {
    let active = true;
    void fetchTrainingSolution(round.position, round.hand.code).then((solution) => {
      if (active) {
        setLoadedSolution({
          key: `${round.position}:${round.hand.code}`,
          value: solution,
        });
      }
    });

    return () => {
      active = false;
    };
  }, [round.position, round.hand.code]);

  const roundKey = `${round.position}:${round.hand.code}`;
  const actionFrequency =
    loadedSolution.key === roundKey && loadedSolution.value
      ? loadedSolution.value
      : getActionFrequency(round.position, round.hand.code);

  const advance = useCallback(() => {
    setFeedback(null);
    setRound(nextRound());
  }, []);

  const repeatHand = useCallback(() => {
    setFeedback(null);
    setRound((currentRound) => ({
      ...currentRound,
      history: getPreviousActions(currentRound.position),
    }));
  }, []);

  const answer = useCallback(
    (userAction: Action) => {
      if (feedback) return;
      const solution = actionFrequency;
      const correct = solution.open >= 50 ? "open" : "fold";
      const isCorrect = solution[userAction] >= 50;
      setFeedback({ userAction, solution });
      setStats((currentStats) => ({
        attempts: currentStats.attempts + 1,
        correct: currentStats.correct + (isCorrect ? 1 : 0),
        streak: isCorrect ? currentStats.streak + 1 : 0,
      }));
      setRound((currentRound) => ({
        ...currentRound,
        history: [
          ...currentRound.history,
          {
            seat: currentRound.position,
            action: userAction === "fold" ? "폴드" : `오픈 ${OPEN_SIZE[currentRound.position]}bb`,
          },
        ],
      }));
      void logAttempt({
        userId: guestId,
        position: round.position,
        handCode: round.hand.code,
        userAction,
        correctAction: correct,
        selectedFrequency: solution[userAction],
      });
    },
    [round, feedback, guestId, actionFrequency],
  );

  const selectedFrequency = feedback ? feedback.solution[feedback.userAction] : 0;
  const isCorrect = feedback ? selectedFrequency >= 50 : null;
  const accuracy = stats.attempts === 0 ? 0 : Math.round((stats.correct / stats.attempts) * 100);
  const headerActions = [
    ...round.history.map((item) => ({ ...item, current: false })),
    {
      seat: round.position,
      action: feedback ? "결과 확인" : "행동을 선택하세요",
      current: true,
    },
  ];

  useEffect(() => {
    const viewport = historyViewportRef.current;
    const track = historyTrackRef.current;
    if (!viewport || !track) return;

    const updateOffset = () => {
      setHistoryOffset(Math.max(0, track.scrollWidth - viewport.clientWidth));
    };

    updateOffset();
    const observer = new ResizeObserver(updateOffset);
    observer.observe(viewport);
    observer.observe(track);
    return () => observer.disconnect();
  }, [round.position, round.history.length, feedback?.userAction]);

  return (
    <div
      className="relative flex min-h-dvh flex-1 flex-col select-none overflow-hidden"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex h-12 flex-nowrap items-center gap-1.5 overflow-hidden bg-[var(--gw-bg)]/90 px-2 backdrop-blur-sm">
        <div ref={historyViewportRef} className="min-w-0 flex-1 overflow-hidden">
          <div
            ref={historyTrackRef}
            className="flex w-max min-w-full flex-nowrap items-center justify-end gap-1.5 whitespace-nowrap transition-transform duration-300 ease-out"
            style={{ transform: `translateX(-${historyOffset}px)` }}
          >
            {headerActions.map(({ seat, action, current }, index) => (
              <div
                key={`${seat}-${action}-${current ? "current" : index}`}
                className={`flex h-8 shrink-0 items-center gap-1 rounded-[var(--gw-radius-control)] px-2 text-[10px] animate-[gw-history-enter_180ms_cubic-bezier(0.22,1,0.36,1)] ${
                  current
                    ? "border border-[var(--gw-accent)] bg-[var(--gw-accent)]/10 text-[var(--gw-accent)]"
                    : "bg-[var(--gw-surface-2)] text-[var(--gw-text-muted)]"
                }`}
              >
                <span className="font-bold text-[var(--gw-text-secondary)]">{seat}</span>
                <span>{SEAT_STACK[seat]}bb</span>
                <span>{action}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="absolute inset-y-0 left-0 w-5 bg-[var(--gw-bg)]/55 shadow-[8px_0_14px_rgba(18,18,18,0.8)]" />
        <div className="absolute inset-y-0 right-0 w-5 bg-[var(--gw-bg)]/55 shadow-[-8px_0_14px_rgba(18,18,18,0.8)]" />
      </div>

      <div className="relative min-h-0 flex-1 pt-16">
        <div className="absolute inset-x-0 bottom-0 top-16">
          <PokerTable heroPosition={round.position} hand={round.hand} />
        </div>
      </div>

      <div
        className={`grid grid-cols-2 gap-3 px-4 pb-6 ${feedback ? "invisible pointer-events-none" : ""}`}
        aria-hidden={Boolean(feedback)}
      >
          <button
            type="button"
            onClick={() => answer("fold")}
            className="rounded-[var(--gw-radius-control)] bg-[var(--gw-danger)] py-4 text-xl font-bold text-[var(--gw-text-primary)] transition active:scale-95"
          >
            폴드
          </button>
          <button
            type="button"
            onClick={() => answer("open")}
            className="flex flex-col items-center rounded-[var(--gw-radius-control)] bg-[var(--gw-accent-strong)] py-3 text-[var(--gw-text-primary)] transition active:scale-95"
          >
            <span className="text-xl font-bold leading-tight">오픈</span>
            <span className="text-xs font-normal leading-tight opacity-80">
              {OPEN_SIZE[round.position]}bb
            </span>
          </button>
      </div>

      {feedback && (
        <section className="absolute inset-x-0 bottom-0 z-30 max-h-[78dvh] overflow-y-auto border-t border-[var(--gw-border)] bg-[var(--gw-surface-1)] px-3 pb-2 pt-4 shadow-[0_-18px_40px_rgba(0,0,0,0.42)] animate-[gw-result-enter_220ms_cubic-bezier(0.22,1,0.36,1)]">
          <div className="flex flex-col items-center">
            <div className="flex h-27 w-27 items-center justify-center rounded-full border-[7px] border-[var(--gw-accent)] bg-[var(--gw-bg)] shadow-[0_0_18px_rgba(134,239,172,0.16)]">
              <div className="text-center">
                <div className="text-[10px] font-medium tracking-wide text-[var(--gw-text-muted)]">GTO 점수</div>
                <div className="text-2xl font-extrabold leading-none text-[var(--gw-accent)]">{selectedFrequency}%</div>
              </div>
            </div>

            <div className="mt-4 flex items-center gap-2 text-xl font-extrabold text-[var(--gw-text-primary)]">
              <span className="text-[var(--gw-accent)]">✓</span>
              <span>{isCorrect ? "최선의 선택" : "복습이 필요한 선택"}</span>
            </div>

            <div className="mt-4 grid w-full max-w-xs grid-cols-3 divide-x divide-[var(--gw-border)] rounded-[var(--gw-radius-control)] border border-[var(--gw-border)] bg-[var(--gw-bg)] py-2 text-center">
              <div>
                <div className="text-[10px] text-[var(--gw-text-muted)]">풀이</div>
                <div className="text-sm font-bold tabular-nums text-[var(--gw-text-primary)]">{stats.attempts}</div>
              </div>
              <div>
                <div className="text-[10px] text-[var(--gw-text-muted)]">정확도</div>
                <div className="text-sm font-bold tabular-nums text-[var(--gw-accent)]">{accuracy}%</div>
              </div>
              <div>
                <div className="text-[10px] text-[var(--gw-text-muted)]">연속</div>
                <div className="text-sm font-bold tabular-nums text-[var(--gw-text-primary)]">{stats.streak}</div>
              </div>
            </div>

            <div className="mt-5 grid w-full max-w-xs grid-cols-2 overflow-hidden rounded-[var(--gw-radius-control)] text-center text-xs font-bold">
              {(["프리플랍", "플랍", "턴", "리버"] as const).map((street, index) => (
                <button
                  key={street}
                  type="button"
                  disabled={index !== 0}
                  className={`border border-[var(--gw-bg)] py-2 ${
                    index === 0
                      ? "bg-[var(--gw-surface-3)] text-[var(--gw-text-primary)]"
                      : "bg-[var(--gw-surface-2)] text-[var(--gw-text-muted)]"
                  }`}
                >
                  {index === 0 && <span className="mr-1 text-[var(--gw-accent)]">✓</span>}
                  {street}
                </button>
              ))}
            </div>

            <div className="mt-4 w-full border-t border-[var(--gw-border)] pt-3">
              <div className="mb-3 space-y-1.5 text-[10px] text-[var(--gw-text-secondary)]">
                {(["open", "fold"] as const).map((action) => (
                  <div key={action} className="flex items-center gap-2">
                    <span className="w-8">{action === "open" ? "오픈" : "폴드"}</span>
                    <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--gw-bg)]">
                      <div
                        className={`h-full rounded-full ${action === "open" ? "bg-[var(--gw-accent)]" : "bg-[var(--gw-danger)]"}`}
                        style={{ width: `${feedback.solution[action]}%` }}
                      />
                    </div>
                    <span className="w-8 text-right tabular-nums">{feedback.solution[action]}%</span>
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-[1fr_1.35fr] gap-2">
                <button
                  type="button"
                  onClick={repeatHand}
                  className="flex items-center justify-center gap-2 rounded-[var(--gw-radius-control)] bg-[var(--gw-surface-3)] py-3 text-xs font-bold tracking-wide text-[var(--gw-text-secondary)] transition active:scale-[0.98]"
                >
                  <span className="text-base">↻</span> 같은 핸드
                </button>
                <button
                  type="button"
                  onClick={advance}
                  className="flex items-center justify-center gap-2 rounded-[var(--gw-radius-control)] bg-[var(--gw-accent)] py-3 text-xs font-bold tracking-wide text-[var(--gw-bg)] transition active:scale-[0.98]"
                >
                  <span className="text-base">▶▶</span> 다음 핸드
                </button>
              </div>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
