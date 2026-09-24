"use client";

import type { DayProgress } from "@/lib/stats";

/**
 * 날짜별 평균 손실.
 *
 * 막대가 내려가면 늘고 있는 것이다. 정확도 대신 손실을 세로축에 두는 이유는,
 * 정확도는 90%에서 92%로 가는 동안 거의 안 움직이는데 평균 손실은 0.4bb에서
 * 0.15bb로 뚜렷하게 줄기 때문이다.
 *
 * 판단 수가 적은 날은 막대를 흐리게 둔다. 세 판 친 날의 0bb는 잘한 날이
 * 아니라 표본이 없는 날이다.
 */
const THIN = 10;

export default function ProgressTrend({ days }: { days: DayProgress[] }) {
  if (days.length < 2) return null;

  const worst = Math.max(...days.map((d) => d.avgLossBb), 0.05);
  const recent = days[days.length - 1];
  const before = days.slice(0, -1);
  const beforeAvg =
    before.length > 0
      ? before.reduce((sum, d) => sum + d.avgLossBb * d.decisions, 0) /
        Math.max(1, before.reduce((sum, d) => sum + d.decisions, 0))
      : null;
  const delta = beforeAvg === null ? null : recent.avgLossBb - beforeAvg;

  return (
    <section className="mt-6">
      <div className="flex items-baseline justify-between">
        <h2 className="gw-label-ko">날짜별 평균 손실</h2>
        {delta !== null && recent.decisions >= THIN && (
          <span
            className="gw-num text-[11px] font-semibold"
            style={{ color: delta <= 0 ? "var(--gw-accent)" : "var(--gw-danger)" }}
          >
            {delta <= 0 ? "▼" : "▲"} {Math.abs(Math.round(delta * 1000) / 1000)}bb
          </span>
        )}
      </div>
      <p className="mt-1 text-[11px] text-[var(--gw-text-muted)]">
        막대가 낮을수록 좋습니다. 판단이 {THIN}번보다 적은 날은 흐리게 둡니다.
      </p>

      <div className="mt-3 flex h-[84px] items-end gap-1">
        {days.map((d) => {
          const h = Math.max(2, Math.round((d.avgLossBb / worst) * 76));
          const thin = d.decisions < THIN;
          return (
            <div key={d.day} className="flex min-w-0 flex-1 flex-col items-center gap-1">
              <span
                className="w-full rounded-t-[3px]"
                style={{
                  height: `${h}px`,
                  backgroundColor: "var(--gw-accent)",
                  opacity: thin ? 0.28 : 0.85,
                }}
                title={`${d.day} · ${d.decisions}판단 · 평균 ${d.avgLossBb}bb · 정확도 ${d.accuracyPct}%`}
              />
              <span className="gw-num w-full truncate text-center text-[9px] text-[var(--gw-text-muted)]">
                {d.day.slice(5).replace("-", "/")}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}
