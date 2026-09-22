"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { randomHand, seatNames, type HandInfo } from "@/lib/poker";
import {
  ACTION_LABEL,
  evLossFor,
  actionEvFor,
  exploitabilityFor,
  randomSituation,
  solutionFor,
  type ActionFrequencies,
  type ActionId,
  type Scenario,
  type Situation,
} from "@/lib/scenarios";
import {
  formatEv,
  formatEvLoss,
  gradeByEvLoss,
  gradeByFrequency,
  isCleanChoice,
  type Grade,
} from "@/lib/grading";
import GradeIcon from "./GradeIcon";
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
  grade: Grade;
  /** 이 선택이 최선 대비 잃은 bb. EV 데이터가 없는 모드는 null. */
  evLoss: number | null;
  /** 이 스팟에서 더 나은 액션. */
  best: ActionId;
  /** 액션별 EV(bb). 폴드가 0 기준. EV 데이터가 없는 모드는 null. */
  actionEv: Partial<Record<ActionId, number>> | null;
  /** 각 액션을 골랐다면 받았을 등급. 해설에서 액션마다 표시한다. */
  actionGrade: Partial<Record<ActionId, Grade>>;
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
      // 빈도가 아니라 EV 손실로 매긴다. 무차별점 근처의 선택을 틀렸다고
      // 깎지 않기 위해서다. EV 데이터가 없는 모드만 빈도로 대체한다.
      const evLoss = evLossFor(scenario.mode, round.situation, round.hand.code, action);
      const grade = evLoss === null ? gradeByFrequency(chosen) : gradeByEvLoss(evLoss);
      const clean = isCleanChoice(grade);
      const best = round.situation.actions.reduce((a, b) =>
        (solution[a] ?? 0) >= (solution[b] ?? 0) ? a : b,
      );

      // 고르지 않은 액션도 등급을 매겨둔다. "폴드였으면 최선이었다"를 보여줘야
      // 해설이 성립한다.
      const actionGrade: Partial<Record<ActionId, Grade>> = {};
      for (const a of round.situation.actions) {
        const loss = evLossFor(scenario.mode, round.situation, round.hand.code, a);
        actionGrade[a] = loss === null ? gradeByFrequency(solution[a] ?? 0) : gradeByEvLoss(loss);
      }

      setFeedback({
        action,
        solution,
        grade,
        evLoss,
        best,
        actionEv: actionEvFor(scenario.mode, round.situation, round.hand.code),
        actionGrade,
      });
      setStats((s) => ({
        attempts: s.attempts + 1,
        correct: s.correct + (clean ? 1 : 0),
        streak: clean ? s.streak + 1 : 0,
      }));

      // 스팟 전체를 남긴다. position과 hand_code만으로는 9인 8bb였는지
      // 6인 20bb였는지 알 수 없어 기록을 나중에 해석할 수 없다.
      void logAttempt({
        userId: guestId,
        mode: scenario.mode,
        tableSize: round.situation.tableSize,
        stackBb: round.situation.stackBb,
        anteBb: round.situation.anteBb,
        position: round.situation.position,
        handCode: round.hand.code,
        userAction: action,
        correctAction: best,
        selectedFrequency: chosen,
        evLossBb: evLoss ?? undefined,
      });
    },
    [feedback, round, scenario.mode, guestId],
  );

  useEffect(() => {
    historyRef.current?.scrollTo({ left: historyRef.current.scrollWidth, behavior: "smooth" });
  }, [round]);

  const { situation, hand } = round;
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
            <div className="flex items-center gap-2">
              <GradeIcon id={feedback.grade.id} color={feedback.grade.color} className="h-7 w-7" />
              <span
                className="text-2xl font-black leading-none"
                style={{ color: feedback.grade.color }}
              >
                {feedback.grade.label}
              </span>
            </div>
            {feedback.evLoss !== null && feedback.evLoss > 0 && (
              <div className="mt-1 text-xs font-bold tabular-nums text-[var(--gw-text-muted)]">
                {formatEvLoss(feedback.evLoss)}
              </div>
            )}
            <div className="mt-1 text-xs text-[var(--gw-text-muted)]">
              {situation.tableSize}인 · {situation.position} · {situation.stackBb}bb · {hand.code}
            </div>

            {/* 액션별 해설 — 고른 것뿐 아니라 각 액션이 얼마나 좋은지, 빈도와 EV를
                나란히 보여줘야 "왜 틀렸는지"가 드러난다. 고른 액션은 등급 색으로 두른다. */}
            <div className="mt-4 w-full space-y-1.5">
              {situation.actions.map((action) => {
                const rowGrade = feedback.actionGrade[action];
                const chosen = action === feedback.action;
                const ev = feedback.actionEv?.[action];
                return (
                  <div
                    key={action}
                    className="flex items-center gap-2 rounded-[var(--gw-radius-control)] border-2 bg-[var(--gw-table-header)] px-2.5 py-2"
                    style={{ borderColor: chosen && rowGrade ? rowGrade.color : "transparent" }}
                  >
                    {rowGrade && <GradeIcon id={rowGrade.id} color={rowGrade.color} />}
                    <span className="flex-1 text-sm font-bold text-[var(--gw-text-primary)]">
                      {ACTION_LABEL[action]}
                    </span>
                    <span className="w-12 shrink-0 text-right text-sm font-bold tabular-nums text-[var(--gw-text-secondary)]">
                      {feedback.solution[action] ?? 0}%
                    </span>
                    <span className="w-20 shrink-0 text-right text-[11px] tabular-nums text-[var(--gw-text-muted)]">
                      {ev === undefined ? "" : formatEv(ev)}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* 빈도 막대 — 카드 수트 색을 그대로 쓴다. 트레이너 안에서 초록/빨강이
                이미 클럽·하트 색으로 학습돼 있어 같은 색을 쓰는 편이 읽기 쉽다. */}
            <div className="mt-2 flex h-4 w-full overflow-hidden rounded-[2px] bg-[var(--gw-bg)]">
              {situation.actions.map((action) => (
                <div
                  key={action}
                  className={
                    action === "fold" ? "bg-[var(--gw-card-heart)]" : "bg-[var(--gw-card-club)]"
                  }
                  style={{ width: `${feedback.solution[action] ?? 0}%` }}
                />
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
