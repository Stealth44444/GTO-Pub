"use client";

import { useMemo } from "react";
import {
  actionsAt,
  canOpen,
  canThreeBet,
  evAt,
  labelFor,
  rangesAt,
  recordKind,
  stageLine,
  type SeatAction,
  type SeatsData,
} from "@/lib/seatGame";
import { makeDecision, type Decision } from "@/lib/decisions";
import { fromRanges } from "@/lib/rangeGrid";
import { dealCombo } from "@/lib/preflopGame";
import { describeStage } from "@/lib/review";
import type { Drill } from "@/lib/drill";
import { ensureGuestUser, logReview } from "@/lib/attempts";
import { currentUserId } from "@/lib/session";
import { noteLoss, situationKey } from "@/lib/adaptive";
import Card from "./Card";
import DecisionRows from "./DecisionRows";
import GradeIcon from "./GradeIcon";
import RangeGrid from "./RangeGrid";
import WhyJam from "./WhyJam";

type Suit = "s" | "h" | "d" | "c";

/** 이 스팟에서 고를 수 있는 액션과 화면 이름. */
function actionsOf(
  data: SeatsData,
  drill: Drill,
): { actions: SeatAction[]; labels: string[] } {
  const actions = actionsAt(drill.stage, canOpen(data), canThreeBet(data));
  return { actions, labels: actions.map((a) => labelFor(data, a, drill.seat)) };
}

/** 고른 액션을 채점한다. 등급·액션별 손실·레인지 격자까지. */
export function decide(
  data: SeatsData,
  drill: Drill,
  action: SeatAction,
): Decision {
  const { actions, labels } = actionsOf(data, drill);
  const view = fromRanges(
    data.hands,
    labels,
    actions.map(recordKind),
    rangesAt(data, drill.seat, drill.stage, actions),
    drill.hand,
  );
  return makeDecision(
    "PREFLOP",
    labels,
    evAt(data, drill.seat, drill.stage, drill.hand),
    actions.indexOf(action),
    actions.map(recordKind),
    [],
    view,
  );
}

/**
 * 판단 하나를 남긴다. 적응형 딜의 약점 기록과, 복습 기록(맞히면 복습 목록에서
 * 그 스팟이 내려간다). 실제로 친 판의 통계에는 섞이지 않는다.
 */
export function recordDrill(data: SeatsData, drill: Drill, d: Decision): void {
  if (d.lossBb !== null)
    noteLoss(situationKey(drill.seat, drill.stage), d.lossBb);
  const userId = currentUserId();
  if (!userId) return;
  void ensureGuestUser(userId).then(() =>
    logReview({
      userId,
      tableSize: data.tableSize,
      stackBb: data.stackBb,
      anteBb: data.anteBb,
      position: drill.seat,
      handCode: drill.hand,
      street: "preflop",
      userAction: d.chosenKind,
      correctAction: d.bestKind,
      evLossBb: d.lossBb,
      nodeLine: stageLine(drill.stage),
    }),
  );
}

/**
 * 프리플랍 스팟 하나: 상황과 두 장, 액션 버튼, 고른 뒤의 등급·손실·근거·레인지.
 * 드릴과 오늘의 문제가 같이 쓴다. 판단은 부모가 들고 있는다(decision).
 */
export default function DrillCard({
  data,
  drill,
  kindLabel,
  decision,
  onChoose,
  onNext,
  nextLabel = "다음 스팟",
}: {
  data: SeatsData;
  drill: Drill;
  kindLabel: string;
  decision: Decision | null;
  onChoose: (action: SeatAction) => void;
  onNext: () => void;
  nextLabel?: string;
}) {
  const cards = useMemo(
    () => dealCombo(drill.hand, new Set(), Math.random),
    [drill],
  );
  const { actions, labels } = actionsOf(data, drill);

  return (
    <>
      {/* 스팟 */}
      <section className="mt-5 rounded-[var(--gw-radius-card)] border border-[var(--gw-border)] bg-[var(--gw-surface-1)] px-4 py-4">
        <div className="flex items-baseline justify-between">
          <span className="gw-num text-[13px] font-semibold text-[var(--gw-accent)]">
            {drill.seat} · {data.stackBb}bb
          </span>
          <span className="gw-label-ko">{kindLabel}</span>
        </div>
        <p className="mt-1.5 text-[14px] text-[var(--gw-text-secondary)]">
          {describeStage(drill.stage)}
        </p>
        <div className="mt-4 flex items-center justify-center gap-2">
          {cards?.map((c) => (
            <Card
              key={c}
              rank={c[0]}
              suit={c[1] as Suit}
              className="h-[84px] w-[60px]"
            />
          ))}
        </div>
        <p className="gw-num mt-2 text-center text-[12px] text-[var(--gw-text-muted)]">
          {drill.hand}
        </p>
      </section>

      {/* 선택 */}
      {!decision && (
        <div
          className="mt-4 grid gap-2.5"
          style={{
            gridTemplateColumns: `repeat(${actions.length}, minmax(0, 1fr))`,
          }}
        >
          {actions.map((a, i) => (
            <button
              key={a}
              type="button"
              onClick={() => onChoose(a)}
              className={`rounded-[var(--gw-radius-control)] py-4 text-[15px] font-bold transition active:scale-95 ${
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
      )}

      {/* 결과 */}
      {decision && (
        <section className="mt-4">
          {decision.grade && (
            <div className="mb-3 flex items-center gap-2">
              <GradeIcon
                id={decision.grade.id}
                color={decision.grade.color}
                className="h-6 w-6"
              />
              <span
                className="text-[20px] font-bold"
                style={{ color: decision.grade.color }}
              >
                {decision.grade.label}
              </span>
            </div>
          )}
          <DecisionRows rows={decision.rows} chosen={decision.chosen} />
          {drill.stage.kind === "vsJam" && (
            <WhyJam
              heroSeat={drill.seat}
              jammer={drill.stage.jammer}
              iOpened={drill.stage.iOpened}
              handCode={drill.hand}
              data={data}
            />
          )}
          <button
            type="button"
            onClick={onNext}
            className="mt-4 w-full rounded-[var(--gw-radius-control)] bg-[var(--gw-accent)] py-4 text-[16px] font-bold text-[var(--gw-ink)] transition active:scale-[0.98]"
          >
            {nextLabel}
          </button>
          {/* 격자는 버튼 아래에 둔다. 다음으로 가는 데 스크롤이 필요 없어야 한다. */}
          {decision.range && (
            <div className="mt-5">
              <RangeGrid view={decision.range} />
            </div>
          )}
        </section>
      )}
    </>
  );
}
