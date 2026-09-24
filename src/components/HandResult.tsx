"use client";

import { formatEvLoss } from "@/lib/grading";
import { scoreHand, type Decision } from "@/lib/decisions";
import { actionColor } from "@/lib/rangeGrid";
import { textureTags } from "@/lib/texture";
import DecisionRows from "./DecisionRows";
import GradeIcon from "./GradeIcon";
import RangeGrid from "./RangeGrid";
import WhyJam from "./WhyJam";

/**
 * 한 판이 끝난 뒤의 결과. 판단이 한 번이든 네 번이든, 내가 끝냈든 상대가
 * 끝냈든 늘 같은 모양이다.
 */
export default function HandResult({
  decisions,
  handCode,
  note,
  showdown,
  caveat,
  onNext,
}: {
  decisions: Decision[];
  /** 히어로가 받은 패. 근거 숫자를 계산할 때 쓴다. */
  handCode: string;
  /** 핸드가 어떻게 끝났는지 한 줄. */
  note: string;
  /** 끝까지 갔다면 누가 무엇으로 이겼는지. */
  showdown?: React.ReactNode;
  /** 채점 근거의 한계를 밝혀야 할 때. */
  caveat?: string;
  onNext: () => void;
}) {
  const score = scoreHand(decisions);

  // 다음 핸드 버튼은 늘 엄지가 닿는 자리에 있어야 한다. 판단이 네 번이고
  // 격자가 네 개면 내용이 화면을 넘기는데, 버튼이 그 끝에 붙어 있으면 다음
  // 판으로 가려고 매번 스크롤을 내려야 한다. 내용만 스크롤하고 버튼은 아래
  // 고정한다.
  return (
    <section
      className="absolute inset-x-0 bottom-0 z-30 flex max-h-full flex-col rounded-t-[var(--gw-radius-sheet)] border-t border-[var(--gw-border)] bg-[var(--gw-surface-1)] animate-[gw-result-enter_220ms_cubic-bezier(0.22,1,0.36,1)]"
      style={{ boxShadow: "var(--gw-lift-sheet)" }}
    >
      <div className="mx-auto flex w-full min-h-0 max-w-sm flex-1 flex-col overflow-y-auto px-5 pt-5">
        <div className="flex items-center justify-center gap-2">
          {score.grade ? (
            <>
              <GradeIcon id={score.grade.id} color={score.grade.color} className="h-7 w-7" />
              <span
                className="text-[26px] font-bold leading-none tracking-[-0.02em]"
                style={{ color: score.grade.color }}
              >
                {score.grade.label}
              </span>
            </>
          ) : (
            <span className="text-[20px] font-bold leading-none text-[var(--gw-text-muted)]">
              채점 불가
            </span>
          )}
        </div>
        <p className="gw-num mt-1.5 text-center text-[11px] text-[var(--gw-text-muted)]">
          판단 {decisions.length}번
          {score.gradedCount > 0 &&
            ` · ${score.totalLossBb === 0 ? "손실 없음" : formatEvLoss(score.totalLossBb)}`}
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
            {d.board.length >= 3 && <BoardTags board={d.board} />}
            <DecisionRows rows={d.rows} chosen={d.chosen} />
            {d.jam && (
              <WhyJam
                heroSeat={d.jam.heroSeat}
                jammer={d.jam.jammer}
                iOpened={d.jam.iOpened}
                handCode={handCode}
              />
            )}
            {d.mix && <RangeMixBar rows={d.mix} />}
            {d.range && (
              <div className="mt-3">
                <RangeGrid view={d.range} />
              </div>
            )}
          </div>
        ))}

        <div className="h-4 shrink-0" />
      </div>

      <div
        className="shrink-0 border-t border-[var(--gw-border)] bg-[var(--gw-surface-1)] px-5 pt-3"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      >
        <button
          type="button"
          onClick={onNext}
          className="mx-auto block w-full max-w-sm rounded-[var(--gw-radius-control)] bg-[var(--gw-accent)] py-3.5 text-[15px] font-bold text-[var(--gw-ink)] transition active:scale-[0.98]"
        >
          다음 핸드
        </button>
      </div>
    </section>
  );
}

/**
 * 이 자리에서 내 레인지 전체가 무엇을 하는가.
 *
 * 격자 위에 한 줄로 둔다. 격자는 칸마다 색이 달라 전체 비율이 눈에 안 들어오고,
 * 정작 기억에 남아야 할 것은 "이 보드는 거의 다 벳한다" 같은 한 문장이다.
 */
function RangeMixBar({ rows }: { rows: { label: string; pct: number; kind: string }[] }) {
  // 색은 거르기 전 자리로 정한다. 0%인 벳을 먼저 빼버리면 남은 벳의 색이
  // 한 칸 앞으로 밀려서, 같은 액션이 판마다 다른 색으로 보인다.
  const kinds = rows.map((r) => r.kind);
  const shown = rows
    .map((r, i) => ({ ...r, color: actionColor(r.kind, i, kinds) }))
    .filter((r) => r.pct >= 0.1);
  if (shown.length === 0) return null;
  return (
    <div className="mt-3">
      <div className="flex items-baseline justify-between">
        <span className="gw-label-ko">내 레인지 전체</span>
        <span className="gw-num text-[10px] text-[var(--gw-text-muted)]">
          {shown.map((r) => `${r.label} ${r.pct}%`).join(" · ")}
        </span>
      </div>
      <div className="mt-1.5 flex h-2 overflow-hidden rounded-full bg-[var(--gw-table-header)]">
        {shown.map((r) => (
          <span
            key={r.label}
            style={{
              width: `${r.pct}%`,
              // 바로 아래 격자와 같은 색을 쓴다. 다르면 같은 액션이 두 색으로
              // 보여서, 막대와 격자를 눈으로 잇는 일이 안 된다.
              backgroundColor: r.color,
            }}
          />
        ))}
      </div>
    </div>
  );
}

/**
 * 이 보드를 뭐라고 부르는가.
 *
 * 보드는 22100가지라 하나씩 외울 수 없다. 종류를 알면 처음 보는 보드에서도
 * 어디쯤인지 짐작할 수 있고, 바로 아래 막대가 그 종류에서 무엇을 하는지
 * 보여준다. 둘을 붙여 놓아야 이름이 지식이 된다.
 */
function BoardTags({ board }: { board: string[] }) {
  const tags = textureTags(board);
  if (tags.length === 0) return null;
  return (
    <div className="mb-2 flex flex-wrap gap-1.5">
      {tags.map((t) => (
        <span
          key={t.label}
          title={t.hint}
          className="gw-label-ko rounded-[4px] border border-[var(--gw-border)] px-1.5 py-0.5 text-[10px] text-[var(--gw-text-muted)]"
        >
          {t.label}
        </span>
      ))}
    </div>
  );
}
