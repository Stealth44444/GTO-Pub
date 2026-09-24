"use client";

import { formatEvLoss } from "@/lib/grading";
import { scoreHand, type Decision } from "@/lib/decisions";
import DecisionRows from "./DecisionRows";
import GradeIcon from "./GradeIcon";
import RangeGrid from "./RangeGrid";

/**
 * 한 판이 끝난 뒤의 결과. 판단이 한 번이든 네 번이든, 내가 끝냈든 상대가
 * 끝냈든 늘 같은 모양이다.
 */
export default function HandResult({
  decisions,
  note,
  showdown,
  caveat,
  onNext,
}: {
  decisions: Decision[];
  /** 핸드가 어떻게 끝났는지 한 줄. */
  note: string;
  /** 끝까지 갔다면 누가 무엇으로 이겼는지. */
  showdown?: React.ReactNode;
  /** 채점 근거의 한계를 밝혀야 할 때. */
  caveat?: string;
  onNext: () => void;
}) {
  const score = scoreHand(decisions);

  return (
    <section
      className="absolute inset-x-0 bottom-0 z-30 max-h-full overflow-y-auto rounded-t-[var(--gw-radius-sheet)] border-t border-[var(--gw-border)] bg-[var(--gw-surface-1)] px-5 pb-4 pt-5 animate-[gw-result-enter_220ms_cubic-bezier(0.22,1,0.36,1)]"
      style={{ boxShadow: "var(--gw-lift-sheet)" }}
    >
      <div className="mx-auto flex max-w-sm flex-col">
        <div className="flex items-center justify-center gap-2">
          <GradeIcon id={score.grade.id} color={score.grade.color} className="h-7 w-7" />
          <span
            className="text-[26px] font-bold leading-none tracking-[-0.02em]"
            style={{ color: score.grade.color }}
          >
            {score.grade.label}
          </span>
        </div>
        <p className="gw-num mt-1.5 text-center text-[11px] text-[var(--gw-text-muted)]">
          판단 {decisions.length}번 ·{" "}
          {score.totalLossBb === 0 ? "손실 없음" : formatEvLoss(score.totalLossBb)}
          {score.ungradedCount > 0 && ` · ${score.ungradedCount}번 채점 불가`}
        </p>
        <p className="mt-1 text-center text-[11px] text-[var(--gw-text-muted)]">{note}</p>

        {score.ungradedCount > 0 && (
          <p className="mt-2 text-center text-[11px] leading-relaxed text-[var(--gw-text-muted)]">
            앞선 판단으로 이 핸드가 GTO 레인지를 벗어나서, 그 뒤 상황은 비교할 정답이
            없습니다.
          </p>
        )}

        {caveat && (
          <p className="mt-2 rounded-[var(--gw-radius-control)] border border-[var(--gw-border)] px-3 py-2 text-center text-[11px] leading-relaxed text-[var(--gw-text-muted)]">
            {caveat}
          </p>
        )}

        {showdown}

        {decisions.map((d, di) => (
          <div key={`${d.street}-${di}`} className="mt-4">
            <div className="mb-1.5 flex items-center gap-2">
              {d.grade ? (
                <GradeIcon id={d.grade.id} color={d.grade.color} />
              ) : (
                <span className="h-4 w-4 shrink-0 rounded-full border border-[var(--gw-border-strong)]" />
              )}
              <span className="gw-label">{d.street}</span>
              <span className="text-[12px] font-semibold text-[var(--gw-text-secondary)]">
                {d.chosen}
              </span>
              <span className="gw-num ml-auto text-[11px] font-semibold text-[var(--gw-text-muted)]">
                {d.lossBb === null ? "채점 불가" : d.lossBb === 0 ? "BEST" : formatEvLoss(d.lossBb)}
              </span>
            </div>
            <DecisionRows rows={d.rows} chosen={d.chosen} />
            {d.range && (
              <div className="mt-3">
                <RangeGrid view={d.range} />
              </div>
            )}
          </div>
        ))}

        <button
          type="button"
          onClick={onNext}
          className="mt-5 w-full rounded-[var(--gw-radius-control)] bg-[var(--gw-accent)] py-3.5 text-[15px] font-bold text-[var(--gw-ink)] transition active:scale-[0.98]"
          style={{ marginBottom: "env(safe-area-inset-bottom)" }}
        >
          다음 핸드
        </button>
      </div>
    </section>
  );
}
