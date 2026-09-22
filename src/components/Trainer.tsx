"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { randomHand, seatNames, type HandInfo } from "@/lib/poker";
import {
  ACTION_LABEL,
  exploitabilityFor,
  randomSituation,
  solutionFor,
  type ActionFrequencies,
  type ActionId,
  type Scenario,
  type Situation,
} from "@/lib/scenarios";
import { ensureGuestUser, logAttempt } from "@/lib/attempts";
import { getGuestId } from "@/lib/guest";
import PokerTable from "./PokerTable";

type Round = {
  situation: Situation;
  hand: HandInfo;
};

type Feedback = {
  action: ActionId;
  solution: ActionFrequencies;
};

function nextRound(scenario: Scenario): Round {
  return { situation: randomSituation(scenario), hand: randomHand() };
}

// 히어로 앞 자리는 전부 폴드했다는 전제이므로, 그 기록을 상단 바에 보여준다.
function foldedBefore(situation: Situation): string[] {
  const names = seatNames(situation.tableSize);
  return names.slice(0, names.indexOf(situation.position));
}

export default function Trainer({ scenario }: { scenario: Scenario }) {
  const [round, setRound] = useState<Round>(() => nextRound(scenario));
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [stats, setStats] = useState({ attempts: 0, correct: 0, streak: 0 });
  const [guestId] = useState<string>(() => getGuestId());
  const historyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void ensureGuestUser(guestId);
  }, [guestId]);

  const advance = useCallback(() => {
    setFeedback(null);
    setRound(nextRound(scenario));
  }, [scenario]);

  const repeat = useCallback(() => setFeedback(null), []);

  const answer = useCallback(
    (action: ActionId) => {
      if (feedback) return;
      const solution = solutionFor(scenario.mode, round.situation, round.hand.code);
      const chosen = solution[action] ?? 0;
      const isCorrect = chosen >= 50;

      setFeedback({ action, solution });
      setStats((s) => ({
        attempts: s.attempts + 1,
        correct: s.correct + (isCorrect ? 1 : 0),
        streak: isCorrect ? s.streak + 1 : 0,
      }));

      const best = round.situation.actions.reduce((a, b) =>
        (solution[a] ?? 0) >= (solution[b] ?? 0) ? a : b,
      );
      void logAttempt({
        userId: guestId,
        position: round.situation.position,
        handCode: round.hand.code,
        userAction: action === "fold" ? "fold" : "open",
        correctAction: best === "fold" ? "fold" : "open",
        selectedFrequency: chosen,
      });
    },
    [feedback, round, scenario.mode, guestId],
  );

  useEffect(() => {
    historyRef.current?.scrollTo({ left: historyRef.current.scrollWidth, behavior: "smooth" });
  }, [round]);

  const { situation, hand } = round;
  const chosenFreq = feedback ? (feedback.solution[feedback.action] ?? 0) : 0;
  const isCorrect = feedback ? chosenFreq >= 50 : null;
  const accuracy = stats.attempts === 0 ? 0 : Math.round((stats.correct / stats.attempts) * 100);
  const exploitability = exploitabilityFor(situation);

  return (
    <div
      className="relative flex h-full min-h-0 flex-col select-none overflow-hidden"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <div className="absolute inset-x-0 top-0 z-20 flex h-12 items-center gap-2 bg-[var(--gw-bg)]/90 px-3 backdrop-blur-sm">
        <div
          ref={historyRef}
          className="flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto whitespace-nowrap [scrollbar-width:none]"
        >
          {foldedBefore(situation).map((seat) => (
            <span
              key={seat}
              className="shrink-0 rounded-[var(--gw-radius-control)] bg-[var(--gw-surface-2)] px-2 py-1 text-[10px] text-[var(--gw-text-muted)]"
            >
              {seat} 폴드
            </span>
          ))}
          <span className="shrink-0 rounded-[var(--gw-radius-control)] border border-[var(--gw-accent)] bg-[var(--gw-accent)]/10 px-2 py-1 text-[10px] font-bold text-[var(--gw-accent)]">
            {situation.position} {situation.stackBb}bb
          </span>
        </div>
        <div className="flex shrink-0 gap-1.5 text-[10px] tabular-nums text-[var(--gw-text-muted)]">
          <span className="rounded-full bg-[var(--gw-surface-2)] px-2 py-1">{accuracy}%</span>
          <span className="rounded-full bg-[var(--gw-surface-2)] px-2 py-1">
            연속 {stats.streak}
          </span>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <div className="absolute inset-x-0 bottom-0 top-12">
          <PokerTable
            tableSize={situation.tableSize}
            heroPosition={situation.position}
            stackBb={situation.stackBb}
            anteBb={situation.anteBb}
            hand={hand}
          />
        </div>
      </div>

      <div
        className={`grid gap-3 px-4 pb-4 ${feedback ? "invisible" : ""}`}
        style={{ gridTemplateColumns: `repeat(${situation.actions.length}, minmax(0, 1fr))` }}
        aria-hidden={Boolean(feedback)}
      >
        {situation.actions.map((action) => (
          <button
            key={action}
            type="button"
            onClick={() => answer(action)}
            className={`rounded-[var(--gw-radius-control)] py-4 text-xl font-bold text-[var(--gw-text-primary)] transition active:scale-95 ${
              action === "fold" ? "bg-[var(--gw-danger)]" : "bg-[var(--gw-accent-strong)]"
            }`}
          >
            {ACTION_LABEL[action]}
            {action === "shove" && (
              <span className="ml-1 text-xs font-normal opacity-80">{situation.stackBb}bb</span>
            )}
          </button>
        ))}
      </div>

      {feedback && (
        <section className="absolute inset-x-0 bottom-0 z-30 max-h-full overflow-y-auto border-t border-[var(--gw-border)] bg-[var(--gw-surface-1)] px-4 pb-3 pt-5 shadow-[0_-18px_40px_rgba(0,0,0,0.42)] animate-[gw-result-enter_220ms_cubic-bezier(0.22,1,0.36,1)]">
          <div className="mx-auto flex max-w-sm flex-col items-center">
            <div
              className={`flex h-24 w-24 items-center justify-center rounded-full border-[6px] bg-[var(--gw-bg)] ${
                isCorrect ? "border-[var(--gw-accent)]" : "border-[var(--gw-danger)]"
              }`}
            >
              <div className="text-center">
                <div className="text-[10px] font-medium text-[var(--gw-text-muted)]">정답 빈도</div>
                <div
                  className={`text-2xl font-black leading-none ${
                    isCorrect ? "text-[var(--gw-accent)]" : "text-[var(--gw-danger)]"
                  }`}
                >
                  {chosenFreq}%
                </div>
              </div>
            </div>

            <div className="mt-3 text-lg font-black text-[var(--gw-text-primary)]">
              {isCorrect ? "좋은 선택입니다" : "다시 볼 선택입니다"}
            </div>
            <div className="mt-0.5 text-xs text-[var(--gw-text-muted)]">
              {situation.tableSize}인 · {situation.position} · {situation.stackBb}bb · {hand.code}
            </div>

            <div className="mt-4 w-full space-y-1.5 text-[11px] text-[var(--gw-text-secondary)]">
              {situation.actions.map((action) => (
                <div key={action} className="flex items-center gap-2">
                  <span className="w-8 shrink-0">{ACTION_LABEL[action]}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-[var(--gw-bg)]">
                    <div
                      className={`h-full rounded-full ${
                        action === "fold" ? "bg-[var(--gw-danger)]" : "bg-[var(--gw-accent)]"
                      }`}
                      style={{ width: `${feedback.solution[action] ?? 0}%` }}
                    />
                  </div>
                  <span className="w-9 shrink-0 text-right tabular-nums">
                    {feedback.solution[action] ?? 0}%
                  </span>
                </div>
              ))}
            </div>

            {exploitability !== null && (
              <p className="mt-3 text-[10px] leading-relaxed text-[var(--gw-text-muted)]">
                이 스팟의 계산 오차는 {exploitability}bb입니다. 직접 계산한 값이라 재현할 수
                있습니다.
              </p>
            )}

            <div className="mt-4 grid w-full grid-cols-[1fr_1.4fr] gap-2">
              <button
                type="button"
                onClick={repeat}
                className="rounded-[var(--gw-radius-control)] bg-[var(--gw-surface-3)] py-3 text-xs font-bold text-[var(--gw-text-secondary)] transition active:scale-[0.98]"
              >
                ↻ 다시 보기
              </button>
              <button
                type="button"
                onClick={advance}
                className="rounded-[var(--gw-radius-control)] bg-[var(--gw-accent)] py-3 text-xs font-bold text-[var(--gw-bg)] transition active:scale-[0.98]"
              >
                ▶▶ 다음 핸드
              </button>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
