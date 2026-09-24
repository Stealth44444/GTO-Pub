"use client";

import { useMemo } from "react";
import { GRADE_ORDER, gradeByEvLoss, gradeInfo } from "@/lib/grading";
import {
  ACTION_KO,
  leaksByAction,
  leaksByStreet,
  playedOnly,
  progressByDay,
  summarize,
  type Leak,
} from "@/lib/stats";
import GradeIcon from "./GradeIcon";
import ProgressTrend from "./ProgressTrend";
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

function LeakList({ title, items }: { title: string; items: Leak[] }) {
  const max = Math.max(...items.map((i) => i.lostBb), 0.01);
  return (
    <div className="mt-3">
      <span className="gw-label">{title}</span>
      <div className="mt-1.5 flex flex-col gap-1">
        {items.map((leak) => (
          <div
            key={leak.label}
            className="flex items-center gap-2.5 rounded-[var(--gw-radius-control)] bg-[var(--gw-table-header)] px-2.5 py-2"
          >
            <span className="w-24 shrink-0 truncate text-[12px] font-semibold text-[var(--gw-text-primary)]">
              {leak.label}
            </span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--gw-surface-3)]">
              <div
                className="h-full rounded-full bg-[var(--gw-danger)]"
                style={{ width: `${(leak.lostBb / max) * 100}%` }}
              />
            </div>
            <span className="gw-num w-10 shrink-0 text-right text-[11px] text-[var(--gw-text-muted)]">
              {leak.count}번
            </span>
            <span className="gw-num w-14 shrink-0 text-right text-[12px] font-semibold text-[var(--gw-danger)]">
              -{leak.lostBb.toFixed(2)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function StatsPanel() {
  const state = useAttempts();
  // 통계는 실제로 친 판만 센다. 복습에서 다시 푼 문제는 빼야 한다.
  const played = useMemo(
    () => (state.status === "ready" ? playedOnly(state.attempts) : []),
    [state],
  );
  const summary = useMemo(
    () => (state.status === "ready" ? summarize(played) : null),
    [state, played],
  );
  const trend = useMemo(
    () => (state.status === "ready" ? progressByDay(played) : null),
    [state, played],
  );
  const leaks = useMemo(
    () =>
      state.status === "ready"
        ? { street: leaksByStreet(played), action: leaksByAction(played) }
        : null,
    [state, played],
  );

  if (state.status === "loading") {
    return <PanelMessage title="통계" body="기록을 불러오는 중입니다." />;
  }
  if (state.status === "unavailable") {
    return (
      <PanelMessage
        title="통계"
        body="지금은 통계를 불러올 수 없습니다."
      />
    );
  }
  if (!summary || summary.attempts === 0) {
    return (
      <PanelMessage
        title="통계"
        body="아직 기록이 없습니다."
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

      {trend && <ProgressTrend days={trend} />}

      {leaks && (leaks.street.length > 0 || leaks.action.length > 0) && (
        <section className="mt-5">
          <h2 className="gw-label-ko">어디서 새고 있나</h2>
          <p className="mt-1 text-[11px] leading-relaxed text-[var(--gw-text-muted)]">
            총 손실로 줄을 세웠습니다. 평균이 큰 쪽은 아프지만 드물 수 있고, 고쳐서
            돌아오는 양은 결국 총합입니다.
          </p>
          {leaks.street.length > 0 && <LeakList title="스트릿" items={leaks.street} />}
          {leaks.action.length > 0 && <LeakList title="상황별" items={leaks.action.slice(0, 6)} />}
        </section>
      )}

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
                      {a.handCode} · {ACTION_KO[a.userAction] ?? a.userAction}
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
