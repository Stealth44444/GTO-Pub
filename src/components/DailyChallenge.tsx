"use client";

import { useMemo, useState } from "react";
import { FULL_DATA } from "@/lib/depthLoader";
import type { SeatAction } from "@/lib/seatGame";
import type { Decision } from "@/lib/decisions";
import { DRILL_LABEL } from "@/lib/drill";
import { isCleanChoice } from "@/lib/grading";
import {
  dailySpots,
  dailyStreak,
  dateKey,
  loadDailyLog,
  recordDaily,
  saveDailyLog,
  type DailyLog,
} from "@/lib/daily";
import DrillCard, { decide, recordDrill } from "./DrillCard";
import GradeIcon from "./GradeIcon";

const DATA = FULL_DATA;

const clean = (d: Decision) => (d.grade ? isCleanChoice(d.grade) : true);
const lossOf = (ds: Decision[]) => ds.reduce((a, d) => a + (d.lossBb ?? 0), 0);

/**
 * 오늘의 문제. 날짜마다 정해진 열 문제(lib/daily.ts)를 풀고 점수를 받는다.
 *
 * 점수는 "무난 이상 몇 개"와 "잃은 bb 합"이다. 무난 이상 개수가 같으면 덜 잃은
 * 쪽이 잘 푼 것이다. 그날의 첫 기록만 남는다 — 다시 풀기는 연습이다.
 */
export default function DailyChallenge() {
  const [today] = useState(() => dateKey());
  const spots = useMemo(() => dailySpots(DATA, today), [today]);
  const [log, setLog] = useState<DailyLog>(() => loadDailyLog());
  const [index, setIndex] = useState(0);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [finished, setFinished] = useState(false);

  const spot = spots[index];
  const decision = decisions[index] ?? null;
  const official = log[today];

  const choose = (a: SeatAction) => {
    if (decision || !spot) return;
    const d = decide(DATA, spot, a);
    recordDrill(DATA, spot, d);
    setDecisions((prev) => [...prev, d]);
  };

  const next = () => {
    if (index + 1 < spots.length) {
      setIndex(index + 1);
      return;
    }
    const result = {
      clean: decisions.filter(clean).length,
      n: decisions.length,
      lossBb: Math.round(lossOf(decisions) * 100) / 100,
    };
    const updated = recordDaily(log, today, result);
    if (updated !== log) {
      setLog(updated);
      saveDailyLog(updated);
    }
    setFinished(true);
  };

  const again = () => {
    setIndex(0);
    setDecisions([]);
    setFinished(false);
  };

  const streak = dailyStreak(log, today);

  return (
    <div className="mx-auto h-full w-full max-w-md overflow-y-auto px-4 pb-6">
      <div style={{ paddingTop: "env(safe-area-inset-top)" }} />

      <header className="mt-4 flex items-baseline justify-between">
        <div>
          <h2 className="text-[18px] font-bold text-[var(--gw-text-primary)]">
            오늘의 10문제
          </h2>
          <p className="gw-num mt-0.5 text-[12px] text-[var(--gw-text-muted)]">
            {today} · {DATA.stackBb}bb · 근소한 판단만
          </p>
        </div>
        {streak > 1 && (
          <span className="gw-num text-[13px] font-semibold text-[var(--gw-accent)]">
            {streak}일 연속
          </span>
        )}
      </header>

      {/* 진행 */}
      <div
        className="mt-4 flex gap-1.5"
        aria-label={`${spots.length}문제 중 ${index + 1}번째`}
      >
        {spots.map((_, i) => {
          const d = decisions[i];
          const color = d?.grade?.color;
          return (
            <span
              key={i}
              className="h-1.5 flex-1 rounded-full"
              style={{
                background:
                  color ??
                  (i === index && !finished
                    ? "var(--gw-text-secondary)"
                    : "var(--gw-border-strong)"),
              }}
            />
          );
        })}
      </div>

      {finished ? (
        <Summary
          decisions={decisions}
          official={official}
          streak={streak}
          onAgain={again}
          spots={spots.map((s) => ({
            seat: s.seat,
            hand: s.hand,
            kind: DRILL_LABEL[s.kind],
          }))}
        />
      ) : spot ? (
        <DrillCard
          data={DATA}
          drill={spot}
          kindLabel={`${index + 1} / ${spots.length} · ${DRILL_LABEL[spot.kind]}`}
          decision={decision}
          onChoose={choose}
          onNext={next}
          nextLabel={index + 1 < spots.length ? "다음 문제" : "결과 보기"}
        />
      ) : (
        <p className="mt-10 text-center text-sm text-[var(--gw-text-muted)]">
          오늘의 문제를 만들지 못했습니다.
        </p>
      )}
    </div>
  );
}

function Summary({
  decisions,
  official,
  streak,
  onAgain,
  spots,
}: {
  decisions: Decision[];
  official: { clean: number; n: number; lossBb: number } | undefined;
  streak: number;
  onAgain: () => void;
  spots: { seat: string; hand: string; kind: string }[];
}) {
  const cleanCount = decisions.filter(clean).length;
  const loss = lossOf(decisions);
  const isOfficial =
    official !== undefined &&
    official.clean === cleanCount &&
    Math.abs(official.lossBb - Math.round(loss * 100) / 100) < 0.005;
  return (
    <section className="mt-6">
      <div className="rounded-[var(--gw-radius-card)] border border-[var(--gw-border)] bg-[var(--gw-surface-1)] px-4 py-5 text-center">
        <p className="gw-num text-[40px] font-bold leading-none text-[var(--gw-text-primary)]">
          {cleanCount}
          <span className="text-[20px] text-[var(--gw-text-muted)]">
            {" "}
            / {decisions.length}
          </span>
        </p>
        <p className="gw-label-ko mt-2">무난 이상</p>
        <p className="gw-num mt-3 text-[14px] text-[var(--gw-text-secondary)]">
          잃은 EV 합 {loss.toFixed(2)}bb
        </p>
        {official && !isOfficial && (
          <p className="gw-num mt-2 text-[12px] text-[var(--gw-text-muted)]">
            오늘의 기록은 첫 풀이 {official.clean} / {official.n} ·{" "}
            {official.lossBb.toFixed(2)}bb
          </p>
        )}
        {streak > 1 && (
          <p className="mt-2 text-[12px] font-semibold text-[var(--gw-accent)]">
            {streak}일 연속으로 풀었습니다
          </p>
        )}
      </div>

      <ul className="mt-4 space-y-1.5">
        {decisions.map((d, i) => (
          <li
            key={i}
            className="flex items-center gap-2.5 rounded-[var(--gw-radius-control)] bg-[var(--gw-surface-1)] px-3 py-2"
          >
            {d.grade && (
              <GradeIcon
                id={d.grade.id}
                color={d.grade.color}
                className="h-4 w-4 shrink-0"
              />
            )}
            <span className="gw-num w-10 text-[12px] font-semibold text-[var(--gw-text-primary)]">
              {spots[i]?.seat}
            </span>
            <span className="gw-num w-10 text-[12px] text-[var(--gw-text-secondary)]">
              {spots[i]?.hand}
            </span>
            <span className="flex-1 truncate text-[12px] text-[var(--gw-text-muted)]">
              {spots[i]?.kind}
            </span>
            <span className="gw-num text-[12px] text-[var(--gw-text-secondary)]">
              {d.lossBb === null
                ? "—"
                : d.lossBb === 0
                  ? "최선"
                  : `-${d.lossBb.toFixed(2)}`}
            </span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        onClick={onAgain}
        className="mt-5 w-full rounded-[var(--gw-radius-control)] border border-[var(--gw-border-strong)] py-3.5 text-[15px] font-semibold text-[var(--gw-text-primary)] transition active:scale-[0.98]"
      >
        다시 풀기 (연습)
      </button>
      <p className="mt-2 text-center text-[11px] text-[var(--gw-text-muted)]">
        내일은 새 열 문제가 나옵니다.
      </p>
    </section>
  );
}
