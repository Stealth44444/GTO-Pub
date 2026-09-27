"use client";

import { useMemo, useState } from "react";
import { FULL_DATA, loadDepthData } from "@/lib/depthLoader";
import { PUSHFOLD_DEPTHS } from "@/lib/depthData";
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
import {
  DRILL_LABEL,
  drillKinds,
  drillSeats,
  nextDrill,
  type Drill,
  type DrillKind,
} from "@/lib/drill";
import { isCleanChoice } from "@/lib/grading";
import { ensureGuestUser, logReview } from "@/lib/attempts";
import { currentUserId } from "@/lib/session";
import {
  acceptSituation,
  currentSkills,
  noteLoss,
  situationKey,
} from "@/lib/adaptive";
import Card from "./Card";
import DecisionRows from "./DecisionRows";
import GradeIcon from "./GradeIcon";
import RangeGrid from "./RangeGrid";
import WhyJam from "./WhyJam";

/**
 * 고를 수 있는 깊이. 푸시폴드 깊이는 첫 진입·올인 대응만, 20bb는 오픈 대응까지,
 * 30bb는 크기 있는 3벳·4벳·스퀴즈까지 있다. 드릴은 보드가 필요 없어 한 판
 * 전체가 아직 열지 않은 깊이도 풀 수 있다.
 */
const DEPTHS = [
  ...[...PUSHFOLD_DEPTHS].sort((a, b) => a - b),
  FULL_DATA.stackBb,
  30,
];

/** 자리를 고르지 않았을 때는 한 판 전체와 같은 적응형 딜로, 자주 잃는 곳을 더 자주 낸다. */
const draw = (data: SeatsData, kind: DrillKind, seat: string | null) =>
  nextDrill(data, kind, seat, Math.random, (s, stage) =>
    acceptSituation(currentSkills(), situationKey(s, stage), Math.random),
  );

type Suit = "s" | "h" | "d" | "c";

/**
 * 프리플랍 드릴. 한 상황을 골라 경계선 스팟만 연달아 푼다(lib/drill.ts).
 *
 * 한 판 전체와 달리 연출이 없다. 고르면 곧바로 등급과 액션별 손실, 레인지
 * 격자를 보여준다 — 판단 하나에 걸리는 시간을 줄여 같은 시간에 더 많은 경계선을
 * 만나게 하는 것이 목적이다.
 */
export default function PreflopDrill() {
  const [DATA, setData] = useState<SeatsData>(FULL_DATA);
  const [loading, setLoading] = useState<number | null>(null);
  const kinds = drillKinds(DATA);
  const [kind, setKind] = useState<DrillKind>("vsOpen");
  const [seat, setSeat] = useState<string | null>(null);
  const [drill, setDrill] = useState<Drill | null>(() =>
    draw(FULL_DATA, "vsOpen", null),
  );
  const [decision, setDecision] = useState<Decision | null>(null);
  const [stats, setStats] = useState({ n: 0, clean: 0, streak: 0, best: 0 });

  const cards = useMemo(() => {
    if (!drill) return null;
    return dealCombo(drill.hand, new Set(), Math.random);
  }, [drill]);

  const restart = (k: DrillKind, s: string | null, data = DATA) => {
    setKind(k);
    setSeat(s);
    setDecision(null);
    setDrill(draw(data, k, s));
  };

  const changeDepth = (depth: number) => {
    if (depth === DATA.stackBb || loading !== null) return;
    setLoading(depth);
    loadDepthData(depth)
      .then((data) => {
        setData(data);
        // 같은 상황이 이 깊이에도 있으면 이어 간다. 없으면 첫 진입부터.
        const k = drillKinds(data).includes(kind) ? kind : "firstIn";
        const s = seat && drillSeats(data, k).includes(seat) ? seat : null;
        restart(k, s, data);
      })
      .catch(() => {
        // 받지 못하면 지금 깊이에 머문다. 칩이 그대로라 다시 눌러 볼 수 있다.
      })
      .finally(() => setLoading(null));
  };

  const actions = drill
    ? actionsAt(drill.stage, canOpen(DATA), canThreeBet(DATA))
    : [];
  const labels = drill ? actions.map((a) => labelFor(DATA, a, drill.seat)) : [];

  const choose = (a: SeatAction) => {
    if (decision || !drill) return;
    const ev = evAt(DATA, drill.seat, drill.stage, drill.hand);
    const view = fromRanges(
      DATA.hands,
      labels,
      actions.map(recordKind),
      rangesAt(DATA, drill.seat, drill.stage, actions),
      drill.hand,
    );
    const d = makeDecision(
      "PREFLOP",
      labels,
      ev,
      actions.indexOf(a),
      actions.map(recordKind),
      [],
      view,
    );
    setDecision(d);
    if (d.lossBb !== null)
      noteLoss(situationKey(drill.seat, drill.stage), d.lossBb);
    const clean = d.grade ? isCleanChoice(d.grade) : true;
    setStats((s) => {
      const streak = clean ? s.streak + 1 : 0;
      return {
        n: s.n + 1,
        clean: s.clean + (clean ? 1 : 0),
        streak,
        best: Math.max(s.best, streak),
      };
    });
    // 드릴은 복습과 같은 기록으로 남긴다. 맞히면 복습 목록에서 그 스팟이 내려가고,
    // 실제로 친 판의 통계에는 섞이지 않는다.
    const userId = currentUserId();
    if (userId) {
      void ensureGuestUser(userId).then(() =>
        logReview({
          userId,
          tableSize: DATA.tableSize,
          stackBb: DATA.stackBb,
          anteBb: DATA.anteBb,
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
  };

  const next = () => {
    setDecision(null);
    setDrill(draw(DATA, kind, seat));
  };

  const accuracy =
    stats.n === 0 ? null : Math.round((stats.clean / stats.n) * 100);

  return (
    <div className="mx-auto h-full w-full max-w-md overflow-y-auto px-4 pb-6">
      <div style={{ paddingTop: "env(safe-area-inset-top)" }} />

      {/* 깊이 고르기 */}
      <div className="mt-4 flex gap-1.5 overflow-x-auto">
        {DEPTHS.map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => changeDepth(d)}
            className={`gw-num shrink-0 rounded-[var(--gw-radius-control)] border px-2.5 py-1 text-[12px] font-semibold transition active:scale-95 ${
              DATA.stackBb === d
                ? "border-[var(--gw-accent)] bg-[var(--gw-accent)]/12 text-[var(--gw-accent)]"
                : loading === d
                  ? "border-[var(--gw-border)] text-[var(--gw-text-muted)] opacity-60"
                  : "border-[var(--gw-border)] text-[var(--gw-text-muted)]"
            }`}
          >
            {d}bb
          </button>
        ))}
      </div>

      {/* 상황 고르기 */}
      <div className="mt-2 flex gap-1.5 overflow-x-auto">
        {kinds.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => restart(k, null)}
            className={`shrink-0 rounded-[var(--gw-radius-control)] border px-3 py-1.5 text-[13px] font-semibold transition active:scale-95 ${
              kind === k
                ? "border-[var(--gw-accent)] bg-[var(--gw-accent)]/12 text-[var(--gw-accent)]"
                : "border-[var(--gw-border)] text-[var(--gw-text-muted)]"
            }`}
          >
            {DRILL_LABEL[k]}
          </button>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {[null, ...drillSeats(DATA, kind)].map((s) => (
          <button
            key={s ?? "any"}
            type="button"
            onClick={() => restart(kind, s)}
            className={`gw-num rounded-[var(--gw-radius-control)] border px-2.5 py-1 text-[12px] font-semibold transition active:scale-95 ${
              seat === s
                ? "border-[var(--gw-accent)] text-[var(--gw-accent)]"
                : "border-[var(--gw-border)] text-[var(--gw-text-muted)]"
            }`}
          >
            {s ?? "랜덤"}
          </button>
        ))}
      </div>

      {/* 점수 */}
      <div className="mt-4 grid grid-cols-3 gap-2 rounded-[var(--gw-radius-control)] bg-[var(--gw-table-header)] px-3 py-2.5 text-center">
        <Figure label="푼 스팟" value={String(stats.n)} />
        <Figure
          label="무난 이상"
          value={accuracy === null ? "—" : `${accuracy}%`}
        />
        <Figure label="연속 · 최고" value={`${stats.streak} · ${stats.best}`} />
      </div>

      {!drill ? (
        <p className="mt-10 px-6 text-center text-sm text-[var(--gw-text-muted)]">
          이 조건으로 낼 스팟이 없습니다. 다른 상황이나 자리를 골라 주세요.
        </p>
      ) : (
        <>
          {/* 스팟 */}
          <section className="mt-5 rounded-[var(--gw-radius-card)] border border-[var(--gw-border)] bg-[var(--gw-surface-1)] px-4 py-4">
            <div className="flex items-baseline justify-between">
              <span className="gw-num text-[13px] font-semibold text-[var(--gw-accent)]">
                {drill.seat} · {DATA.stackBb}bb
              </span>
              <span className="gw-label-ko">{DRILL_LABEL[kind]}</span>
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
                  onClick={() => choose(a)}
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
                  data={DATA}
                />
              )}
              <button
                type="button"
                onClick={next}
                className="mt-4 w-full rounded-[var(--gw-radius-control)] bg-[var(--gw-accent)] py-4 text-[16px] font-bold text-[var(--gw-ink)] transition active:scale-[0.98]"
              >
                다음 스팟
              </button>
              {/* 격자는 버튼 아래에 둔다. 다음 스팟으로 가는 데 스크롤이 필요 없어야 한다. */}
              {decision.range && (
                <div className="mt-5">
                  <RangeGrid view={decision.range} />
                </div>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="gw-num text-[16px] font-bold leading-none text-[var(--gw-text-primary)]">
        {value}
      </span>
      <span className="gw-label-ko text-[9px]">{label}</span>
    </div>
  );
}
