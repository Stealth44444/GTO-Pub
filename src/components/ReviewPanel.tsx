"use client";

import { useMemo, useState } from "react";
import seatsRaw from "@/data/preflop-seats.json";
import { actionsAt, evAt, labelFor, type SeatAction, type SeatsData } from "@/lib/seatGame";
import { fromRanges } from "@/lib/rangeGrid";
import { ensureGuestUser, logReview } from "@/lib/attempts";
import { makeDecision } from "@/lib/decisions";
import { currentUserId } from "@/lib/session";
import { formatEvLoss } from "@/lib/grading";
import { describeStage, pickAllReviewSpots } from "@/lib/review";
import { ACTION_KO } from "@/lib/stats";
import DecisionRows from "./DecisionRows";
import GradeIcon from "./GradeIcon";
import PostflopReview from "./PostflopReview";
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
    () => (state.status === "ready" ? pickAllReviewSpots(state.attempts, DATA) : []),
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
        body="지금은 복습을 불러올 수 없습니다."
      />
    );
  }
  if (spots.length === 0) {
    return (
      <PanelMessage
        title="복습"
        body="다시 볼 판단이 아직 없습니다."
      />
    );
  }

  const spot = spots[Math.min(index, spots.length - 1)];

  const next = () => {
    setPicked(null);
    setIndex((i) => (i + 1) % spots.length);
  };

  if (spot.kind === "postflop") {
    return (
      <PanelScroll title="복습">
        <Intro count={spots.length} />
        <section className="mt-4 rounded-[var(--gw-radius-card)] border border-[var(--gw-border)] bg-[var(--gw-surface-1)] px-4 py-4">
          <Counter index={index} total={spots.length} misses={spot.misses} />
          {/* 스팟이 바뀌면 안에 든 상태도 새로 시작해야 한다. */}
          <PostflopReview key={spot.key} spot={spot} onNext={next} />
        </section>
      </PanelScroll>
    );
  }

  const actions = actionsAt(spot.stage);
  const labels = actions.map((a) => labelFor(DATA, a));
  const ev = evAt(DATA, spot.seat, spot.stage, spot.handCode);
  // 기록에는 종류가 들어가야 한다. 라벨("올인 20bb")을 그대로 넣으면 집계도
  // 안 되고 DB의 액션 제약에도 걸린다.
  const kinds = actions.map((a) => (a === "open" ? "open" : a === "jam" ? "allin" : a));
  const decision =
    picked !== null
      ? makeDecision("PREFLOP", labels, ev, actions.indexOf(picked), kinds)
      : null;

  // 답한 내용을 남겨야 고친 스팟이 목록에서 내려간다. 남기지 않으면 이미
  // 고친 자리를 영원히 다시 풀게 된다.
  const answer = (a: SeatAction) => {
    setPicked(a);
    const d = makeDecision("PREFLOP", labels, ev, actions.indexOf(a), kinds);
    const userId = currentUserId();
    if (!userId) return;
    void ensureGuestUser(userId).then(() =>
      logReview({
        userId,
        tableSize: DATA.tableSize,
        stackBb: DATA.stackBb,
        anteBb: DATA.anteBb,
        position: spot.seat,
        handCode: spot.handCode,
        street: "preflop",
        userAction: d.chosenKind,
        correctAction: d.bestKind,
        evLossBb: d.lossBb,
        nodeLine: spot.stage.kind === "firstIn"
          ? "firstIn"
          : spot.stage.kind === "vsOpen"
            ? `vsOpen:${spot.stage.opener}`
            : `vsJam:${spot.stage.jammer}${spot.stage.opener ? `:${spot.stage.opener}` : ""}`,
      }),
    );
  };

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
    // 3벳 올인 뒷자리는 솔버가 푼 레인지가 없다. 격자 없이 EV만 보여준다.
    if (spot.stage.opener) return null;
    return DATA.seats[spot.stage.jammer]?.vsJamCall?.[spot.seat] ?? null;
  });
  const gridView = fromRanges(
    DATA.hands,
    labels,
    actions.map((a) => (a === "open" ? "raise" : a === "jam" ? "allin" : a)),
    ranges,
    spot.handCode,
  );

  return (
    <PanelScroll title="복습">
      <Intro count={spots.length} />

      <section className="mt-4 rounded-[var(--gw-radius-card)] border border-[var(--gw-border)] bg-[var(--gw-surface-1)] px-4 py-4">
        <Counter index={index} total={spots.length} misses={spot.misses} />

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
                onClick={() => answer(a)}
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

                <div className="mt-3">
                  <DecisionRows rows={decision.rows} chosen={decision.chosen} />
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

function Intro({ count }: { count: number }) {
  return (
    <p className="mt-1 text-[11px] text-[var(--gw-text-muted)]">
      손해가 컸던 순서로 {count}개. 반복해서 틀린 스팟이 위로 옵니다.
    </p>
  );
}

function Counter({
  index,
  total,
  misses,
}: {
  index: number;
  total: number;
  misses: number;
}) {
  return (
    <div className="flex items-center justify-between">
      <span className="gw-label">
        {index + 1} / {total}
      </span>
      {misses > 1 && <span className="gw-label text-[var(--gw-danger)]">{misses}번 틀림</span>}
    </div>
  );
}
