"use client";

import { useMemo } from "react";
import { GRADE_ORDER, gradeByEvLoss, gradeInfo } from "@/lib/grading";
import { summarize } from "@/lib/stats";
import GradeIcon from "./GradeIcon";
import { PanelMessage, PanelScroll, spotLabel } from "./PanelShell";
import { useAttempts } from "./useAttempts";

function Counter({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-[11px] font-bold tracking-wide text-[var(--gw-text-muted)]">
        {label}
      </span>
      <span
        className="text-2xl font-black tabular-nums leading-none"
        style={{ color: tone ?? "var(--gw-text-primary)" }}
      >
        {value}
      </span>
    </div>
  );
}

export default function StatsPanel() {
  const state = useAttempts();
  const summary = useMemo(
    () => (state.status === "ready" ? summarize(state.attempts) : null),
    [state],
  );

  if (state.status === "loading") {
    return <PanelMessage title="통계" body="기록을 불러오는 중입니다." />;
  }
  if (state.status === "unavailable") {
    return (
      <PanelMessage
        title="통계"
        body="기록 서버에 연결하지 못했습니다. 연습은 그대로 할 수 있지만 통계는 쌓이지 않습니다."
      />
    );
  }
  if (!summary || summary.attempts === 0) {
    return (
      <PanelMessage
        title="통계"
        body="아직 기록이 없습니다. 한 판 연습하고 나면 어떤 스팟에서 얼마나 잃고 있는지 보여드립니다."
      />
    );
  }

  const max = Math.max(...GRADE_ORDER.map((id) => summary.byGrade[id]), 1);

  return (
    <PanelScroll title="통계">
      <section className="mt-4 grid grid-cols-3 gap-3 rounded-[var(--gw-radius-control)] bg-[var(--gw-table-header)] px-3 py-3">
        <Counter label="시도" value={String(summary.attempts)} />
        <Counter
          label="실수"
          value={String(summary.mistakes)}
          tone={summary.mistakes > 0 ? "var(--gw-danger)" : undefined}
        />
        {/* 잃은 EV는 정확도보다 직접적이다. "몇 퍼센트 틀렸나"가 아니라
            "그래서 얼마를 잃었나"를 말해준다. */}
        <Counter
          label="잃은 EV"
          value={`${summary.lostBb.toFixed(1)}bb`}
          tone={summary.lostBb > 0 ? "var(--gw-danger)" : undefined}
        />
      </section>

      <section className="mt-3 rounded-[var(--gw-radius-control)] bg-[var(--gw-table-header)] px-3 py-3">
        <span className="text-[11px] font-bold tracking-wide text-[var(--gw-text-muted)]">
          정확도
        </span>
        <div className="mt-0.5 text-3xl font-black tabular-nums leading-none text-[var(--gw-text-primary)]">
          {summary.accuracyPct}%
        </div>
        <p className="mt-1.5 text-[11px] leading-relaxed text-[var(--gw-text-muted)]">
          잃은 EV가 0.05bb 이하인 선택의 비율입니다. 빈도가 섞이는 스팟에서는 어느 쪽을 골라도
          손해가 거의 없어, 그런 선택은 맞은 것으로 셉니다.
        </p>
      </section>

      <section className="mt-3 flex flex-col gap-1.5">
        {GRADE_ORDER.map((id) => {
          const grade = gradeInfo(id);
          const count = summary.byGrade[id];
          return (
            <div key={id} className="flex items-center gap-2">
              <GradeIcon id={id} color={grade.color} />
              <span className="w-14 shrink-0 text-xs font-bold text-[var(--gw-text-secondary)]">
                {grade.label}
              </span>
              <div className="h-4 flex-1 overflow-hidden rounded-[2px] bg-[var(--gw-table-header)]">
                <div
                  className="h-full rounded-[2px]"
                  style={{ width: `${(count / max) * 100}%`, backgroundColor: grade.color }}
                />
              </div>
              <span className="w-8 shrink-0 text-right text-xs font-bold tabular-nums text-[var(--gw-text-secondary)]">
                {count}
              </span>
            </div>
          );
        })}
      </section>

      {summary.worst.length > 0 && (
        <section className="mt-5">
          <h2 className="text-xs font-bold tracking-wide text-[var(--gw-text-muted)]">
            가장 손해가 컸던 선택
          </h2>
          <div className="mt-2 flex flex-col gap-1.5">
            {summary.worst.map((a, i) => {
              const grade = gradeByEvLoss(a.evLossBb);
              return (
                <div
                  key={`${a.createdAt}-${i}`}
                  className="flex items-center gap-2 rounded-[var(--gw-radius-control)] bg-[var(--gw-table-header)] px-2.5 py-2"
                >
                  <GradeIcon id={grade.id} color={grade.color} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-bold text-[var(--gw-text-primary)]">
                      {a.handCode} · {a.userAction === "fold" ? "폴드" : "올인"}
                    </span>
                    <span className="block truncate text-[11px] text-[var(--gw-text-muted)]">
                      {spotLabel(a)}
                    </span>
                  </span>
                  <span
                    className="shrink-0 text-xs font-bold tabular-nums"
                    style={{ color: grade.color }}
                  >
                    -{a.evLossBb.toFixed(2)}bb
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </PanelScroll>
  );
}
