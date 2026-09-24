"use client";

import { formatEvLoss } from "@/lib/grading";
import type { RunSummary } from "@/lib/session-run";
import GradeIcon from "./GradeIcon";

/**
 * 몇 판마다 한 번 멈추는 자리.
 *
 * 숫자를 늘어놓지 않는다. 방금 친 것에서 기억하고 갈 것은 하나면 충분하고,
 * 그건 가장 비쌌던 판단이다. 나머지는 통계 탭에 있다.
 */
export default function RunRecap({
  summary,
  onContinue,
}: {
  summary: RunSummary;
  onContinue: () => void;
}) {
  return (
    <section
      className="absolute inset-x-0 bottom-0 z-40 flex max-h-full flex-col rounded-t-[var(--gw-radius-sheet)] border-t border-[var(--gw-border)] bg-[var(--gw-surface-1)] animate-[gw-result-enter_220ms_cubic-bezier(0.22,1,0.36,1)]"
      style={{ boxShadow: "var(--gw-lift-sheet)" }}
    >
      <div className="mx-auto flex w-full min-h-0 max-w-sm flex-1 flex-col overflow-y-auto px-5 pt-5">
        <span className="gw-label-ko text-center">{summary.hands}판 쳤습니다</span>

        <div className="mt-2.5 flex items-center justify-center gap-2">
          <GradeIcon id={summary.grade.id} color={summary.grade.color} className="h-7 w-7" />
          <span
            className="text-[26px] font-bold leading-none tracking-[-0.02em]"
            style={{ color: summary.grade.color }}
          >
            {summary.grade.label}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-3 gap-3 rounded-[var(--gw-radius-control)] bg-[var(--gw-table-header)] px-3 py-3">
          <Figure label="판단" value={String(summary.decisions)} />
          <Figure
            label="판단당 평균"
            value={summary.avgLossBb === 0 ? "0" : formatEvLoss(summary.avgLossBb)}
          />
          <Figure label="무난 이상" value={`${summary.cleanPct}%`} />
        </div>

        {summary.graded < summary.decisions && (
          <p className="mt-2 text-center text-[11px] text-[var(--gw-text-muted)]">
            {summary.decisions - summary.graded}번은 솔버 레인지 밖이라 채점하지 못했습니다.
          </p>
        )}

        {summary.worst && summary.worst.lossBb !== null && summary.worst.lossBb > 0.05 ? (
          <div className="mt-4 rounded-[var(--gw-radius-card)] border border-[var(--gw-border)] px-3.5 py-3">
            <span className="gw-label-ko">가장 비쌌던 판단</span>
            <div className="mt-1.5 flex items-baseline gap-2">
              <span className="gw-num text-[16px] font-bold text-[var(--gw-text-primary)]">
                {summary.worst.handCode}
              </span>
              <span className="gw-num text-[12px] font-semibold text-[var(--gw-accent)]">
                {summary.worst.seat}
              </span>
              <span className="text-[12px] text-[var(--gw-text-secondary)]">
                {summary.worst.street} · {summary.worst.chosen}
              </span>
              <span className="gw-num ml-auto text-[12px] font-semibold text-[var(--gw-danger)]">
                {formatEvLoss(summary.worst.lossBb)}
              </span>
            </div>
            <p className="mt-2 text-[11px] leading-relaxed text-[var(--gw-text-muted)]">
              기록 탭의 복습에서 이 자리를 다시 물어봅니다.
            </p>
          </div>
        ) : (
          <p className="mt-4 text-center text-[12px] text-[var(--gw-text-secondary)]">
            크게 잃은 판단이 없었습니다.
          </p>
        )}

        <div className="h-4 shrink-0" />
      </div>

      <div
        className="shrink-0 border-t border-[var(--gw-border)] bg-[var(--gw-surface-1)] px-5 pt-3"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      >
        <button
          type="button"
          onClick={onContinue}
          className="mx-auto block w-full max-w-sm rounded-[var(--gw-radius-control)] bg-[var(--gw-accent)] py-3.5 text-[15px] font-bold text-[var(--gw-ink)] transition active:scale-[0.98]"
        >
          계속하기
        </button>
      </div>
    </section>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="gw-num text-[17px] font-bold leading-none text-[var(--gw-text-primary)]">
        {value}
      </span>
      <span className="gw-label-ko text-[9px]">{label}</span>
    </div>
  );
}
