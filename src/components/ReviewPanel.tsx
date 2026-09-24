"use client";

import { useMemo, useState } from "react";
import seatsRaw from "@/data/preflop-seats.json";
import { actionsAt, evAt, labelFor, type SeatAction, type SeatsData } from "@/lib/seatGame";
import { fromRanges } from "@/lib/rangeGrid";
import { makeDecision } from "@/lib/decisions";
import { formatEv, formatEvLoss, gradeByEvLoss } from "@/lib/grading";
import { describeStage, pickReviewSpots } from "@/lib/review";
import { ACTION_KO } from "@/lib/stats";
import GradeIcon from "./GradeIcon";
import RangeGrid from "./RangeGrid";
import { PanelMessage, PanelScroll } from "./PanelShell";
import { useAttempts } from "./useAttempts";

const DATA = seatsRaw as unknown as SeatsData;

/**
 * 틀렸던 스팟을 다시 물어본다.
 *
 * 채점은 트레이너와 같은 EV를 쓴다. 다른 기준으로 매기면 여기서 맞춘 것이
 * 실제 판에서 맞는다는 보장이 없다.
 */
export default function ReviewPanel() {
  const state = useAttempts();
  const spots = useMemo(
    () => (state.status === "ready" ? pickReviewSpots(state.attempts, DATA) : []),
    [state],
  );
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<SeatAction | null>(null);

  if (state.status === "loading") {
    return <PanelMessage title="복습" body="기록을 불러오는 중입니다." />;
  }
  if (state.status === "unavailable") {
    return (
      <PanelMessage
        title="복습"
        body="기록 서버에 연결하지 못했습니다. 복습할 스팟을 찾으려면 기록이 필요합니다."
      />
    );
  }
  if (spots.length === 0) {
    return (
      <PanelMessage
        title="복습"
        body="다시 볼 스팟이 아직 없습니다. 프리플랍에서 손해가 컸던 판단이 쌓이면 여기 모입니다."
      />
    );
  }

  const spot = spots[Math.min(index, spots.length - 1)];
  const actions = actionsAt(spot.stage);
  const labels = actions.map((a) => labelFor(DATA, a));
  const ev = evAt(DATA, spot.seat, spot.stage, spot.handCode);
  const decision =
    picked !== null
      ? makeDecision("PREFLOP", labels, ev, actions.indexOf(picked))
      : null;

  const me = DATA.seats[spot.seat];
  const ranges = actions.map((a) => {
    if (spot.stage.kind === "firstIn") {
      return a === "open" ? (me?.open ?? null) : a === "jam" ? (me?.openJam ?? null) : null;
    }
    if (spot.stage.kind === "vsOpen") {
      const opener = DATA.seats[spot.stage.opener];
      if (a === "call") return opener?.vsOpenCall?.[spot.seat] ?? null;
      if (a === "jam") return opener?.vsOpenJam?.[spot.seat] ?? null;
      return null;
    }
    if (a !== "call") return null;
    return DATA.seats[spot.stage.jammer]?.vsJamCall?.[spot.seat] ?? null;
  });
  const gridView = fromRanges(
    DATA.hands,
    labels,
    actions.map((a) => (a === "open" ? "raise" : a === "jam" ? "allin" : a)),
    ranges,
    spot.handCode,
  );

  const next = () => {
    setPicked(null);
    setIndex((i) => (i + 1) % spots.length);
  };

  return (
    <PanelScroll title="복습">
      <p className="mt-1 text-[11px] text-[var(--gw-text-muted)]">
        손해가 컸던 순서로 {spots.length}개. 반복해서 틀린 스팟이 위로 옵니다.
      </p>

      <section className="mt-4 rounded-[var(--gw-radius-card)] border border-[var(--gw-border)] bg-[var(--gw-surface-1)] px-4 py-4">
        <div className="flex items-center justify-between">
          <span className="gw-label">
            {index + 1} / {spots.length}
          </span>
          {spot.misses > 1 && (
            <span className="gw-label text-[var(--gw-danger)]">{spot.misses}번 틀림</span>
          )}
        </div>

        <div className="mt-3 flex items-baseline gap-3">
          <span className="gw-num text-[30px] font-bold leading-none text-[var(--gw-text-primary)]">
            {spot.handCode}
          </span>
          <span className="gw-num text-[15px] font-semibold text-[var(--gw-accent)]">
            {spot.seat}
          </span>
        </div>
        <p className="mt-1.5 text-[13px] text-[var(--gw-text-secondary)]">
          {describeStage(spot.stage)} · {DATA.stackBb}bb
        </p>

        {picked === null ? (
          <div
            className="mt-4 grid gap-2"
            style={{ gridTemplateColumns: `repeat(${actions.length}, minmax(0, 1fr))` }}
          >
            {actions.map((a, i) => (
              <button
                key={a}
                type="button"
                onClick={() => setPicked(a)}
                className={`rounded-[var(--gw-radius-control)] py-3.5 text-[14px] font-bold transition active:scale-95 ${
                  a === "fold"
                    ? "bg-[var(--gw-danger)] text-[var(--gw-text-primary)]"
                    : a === "call"
                      ? "bg-[var(--gw-accent)] text-[var(--gw-ink)]"
                      : "bg-[var(--gw-accent-strong)] text-[var(--gw-text-primary)]"
                }`}
              >
                {labels[i]}
              </button>
            ))}
          </div>
        ) : (
          <>
            {decision && (
              <div className="mt-4">
                <div className="flex items-center gap-2">
                  {decision.grade ? (
                    <>
                      <GradeIcon
                        id={decision.grade.id}
                        color={decision.grade.color}
                        className="h-6 w-6"
                      />
                      <span
                        className="text-[20px] font-bold leading-none"
                        style={{ color: decision.grade.color }}
                      >
                        {decision.grade.label}
                      </span>
                    </>
                  ) : (
                    <span className="text-[13px] text-[var(--gw-text-muted)]">채점 불가</span>
                  )}
                  <span className="gw-num ml-auto text-[11px] text-[var(--gw-text-muted)]">
                    지난번 {ACTION_KO[spot.lastAction] ?? spot.lastAction} ·{" "}
                    {formatEvLoss(spot.lastLossBb)}
                  </span>
                </div>

                <div className="mt-3 space-y-1">
                  {decision.rows.map((row) => {
                    const g = row.lossBb === null ? null : gradeByEvLoss(row.lossBb);
                    const chosen = row.label === decision.chosen;
                    return (
                      <div
                        key={row.label}
                        className="flex items-center gap-2 rounded-[var(--gw-radius-control)] border bg-[var(--gw-table-header)] px-2.5 py-2"
                        style={{
                          borderColor: chosen && g ? g.color : "transparent",
                          opacity: g ? 1 : 0.5,
                        }}
                      >
                        {g ? (
                          <GradeIcon id={g.id} color={g.color} />
                        ) : (
                          <span className="h-4 w-4 shrink-0 rounded-full border border-[var(--gw-border-strong)]" />
                        )}
                        <span className="flex-1 text-[13px] font-semibold text-[var(--gw-text-primary)]">
                          {row.label}
                        </span>
                        <span className="gw-num w-[64px] shrink-0 text-right text-[11px] text-[var(--gw-text-muted)]">
                          {row.lossBb === null
                            ? "—"
                            : row.lossBb === 0
                              ? "BEST"
                              : formatEvLoss(row.lossBb)}
                        </span>
                        <span className="gw-num w-[64px] shrink-0 text-right text-[13px] font-semibold text-[var(--gw-text-secondary)]">
                          {row.evBb === null ? "—" : formatEv(row.evBb)}
                        </span>
                      </div>
                    );
                  })}
                </div>

                <div className="mt-4">
                  <RangeGrid view={gridView} />
                </div>
              </div>
            )}

            <button
              type="button"
              onClick={next}
              className="mt-4 w-full rounded-[var(--gw-radius-control)] bg-[var(--gw-accent)] py-3.5 text-[14px] font-bold text-[var(--gw-ink)] transition active:scale-[0.98]"
            >
              다음 스팟
            </button>
          </>
        )}
      </section>
    </PanelScroll>
  );
}
