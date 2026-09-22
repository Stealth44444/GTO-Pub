"use client";

import { useCallback, useEffect, useState } from "react";
import {
  correctAction,
  randomHand,
  randomPosition,
  POSITION_LABEL,
  OPEN_SIZE,
  type Action,
  type HandInfo,
  type Position,
} from "@/lib/poker";
import { ensureGuestUser, logAttempt } from "@/lib/attempts";
import { getGuestId } from "@/lib/guest";
import PokerTable from "./PokerTable";

type Round = {
  position: Position;
  hand: HandInfo;
};

function nextRound(): Round {
  return { position: randomPosition(), hand: randomHand() };
}

export default function Trainer() {
  // 이 컴포넌트는 next/dynamic(ssr:false)로만 로드되므로 렌더 중 window/Math.random 사용이 안전합니다.
  const [round, setRound] = useState<Round>(() => nextRound());
  const [feedback, setFeedback] = useState<{ userAction: Action; correct: Action } | null>(null);
  const [stats, setStats] = useState({ attempts: 0, correct: 0, streak: 0 });
  const [guestId] = useState<string>(() => getGuestId());

  useEffect(() => {
    void ensureGuestUser(guestId);
  }, [guestId]);

  const advance = useCallback(() => {
    setFeedback(null);
    setRound(nextRound());
  }, []);

  const answer = useCallback(
    (userAction: Action) => {
      if (!round || feedback) return;
      const correct = correctAction(round.position, round.hand.code);
      const isCorrect = userAction === correct;
      setFeedback({ userAction, correct });
      setStats((s) => ({
        attempts: s.attempts + 1,
        correct: s.correct + (isCorrect ? 1 : 0),
        streak: isCorrect ? s.streak + 1 : 0,
      }));
      void logAttempt({
        userId: guestId,
        position: round.position,
        handCode: round.hand.code,
        userAction,
        correctAction: correct,
      });
    },
    [round, feedback, guestId],
  );

  const accuracy = stats.attempts === 0 ? 0 : Math.round((stats.correct / stats.attempts) * 100);
  const isCorrect = feedback ? feedback.userAction === feedback.correct : null;

  return (
    <div
      className="flex min-h-dvh flex-1 flex-col select-none"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
      onClick={feedback ? advance : undefined}
    >
      <div className="flex items-start justify-between gap-2 px-3 pt-3">
        <div className="flex items-center gap-2 text-[11px] tabular-nums text-slate-400">
          <span className="rounded-full bg-slate-800 px-2.5 py-1 font-medium text-slate-200">
            정확도 {accuracy}%
          </span>
          <span className="rounded-full bg-slate-800 px-2.5 py-1 font-medium text-slate-200">
            연속 {stats.streak}
          </span>
        </div>
        <div className="rounded-xl border border-emerald-400/60 bg-emerald-500/10 px-3 py-1.5 text-right">
          <div className="text-xs font-bold leading-tight text-emerald-300">
            {POSITION_LABEL[round.position]}
          </div>
          <div className="text-[10px] leading-tight text-emerald-400/80">행동을 선택해 주세요</div>
        </div>
      </div>

      <div className="relative min-h-0 flex-1">
        <PokerTable heroPosition={round.position} hand={round.hand} />
      </div>

      {feedback && (
        <div
          className={`mx-4 mb-4 rounded-xl px-4 py-3 text-center font-semibold ${
            isCorrect ? "bg-emerald-500/20 text-emerald-300" : "bg-rose-500/20 text-rose-300"
          }`}
        >
          {isCorrect ? "정답!" : `오답 — 정답은 ${feedback.correct === "open" ? "오픈" : "폴드"}`}
          <div className="mt-1 text-xs font-normal text-slate-400">화면을 탭하면 다음 핸드</div>
        </div>
      )}

      {!feedback && (
        <div className="grid grid-cols-2 gap-3 px-4 pb-6">
          <button
            type="button"
            onClick={() => answer("fold")}
            className="rounded-2xl bg-slate-800 py-4 text-xl font-bold text-slate-100 transition active:scale-95"
          >
            폴드
          </button>
          <button
            type="button"
            onClick={() => answer("open")}
            className="flex flex-col items-center rounded-2xl bg-emerald-600 py-3 text-white transition active:scale-95"
          >
            <span className="text-xl font-bold leading-tight">오픈</span>
            <span className="text-xs font-normal leading-tight opacity-80">
              {OPEN_SIZE[round.position]}bb
            </span>
          </button>
        </div>
      )}
    </div>
  );
}
