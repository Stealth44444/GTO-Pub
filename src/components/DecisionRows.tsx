"use client";

import type { DecisionRow } from "@/lib/decisions";
import { formatEvLoss, gradeByEvLoss } from "@/lib/grading";
import GradeIcon from "./GradeIcon";

/**
 * 한 판단의 액션별 표.
 *
 * 판이 끝난 화면과 복습 화면이 같은 표를 쓴다. 두 벌로 두면 한쪽만 고쳐져
 * 같은 판단이 화면마다 다르게 보이고, 그러면 어느 쪽을 믿어야 할지 알 수 없다.
 *
 * 값이 없는 줄은 흐리게 둔다. 지워버리면 "그 액션이 없었다"로 읽히는데,
 * 실제로는 있었고 다만 채점할 수 없었던 것이다.
 */
export default function DecisionRows({
  rows,
  chosen,
}: {
  rows: DecisionRow[];
  /** 사용자가 고른 줄의 라벨. 테두리로 표시한다. */
  chosen: string;
}) {
  return (
    <div className="space-y-1">
      {rows.map((row) => {
        const grade = row.lossBb === null ? null : gradeByEvLoss(row.lossBb);
        const picked = row.label === chosen;
        return (
          <div
            key={row.label}
            className="flex items-center gap-2 rounded-[var(--gw-radius-control)] border bg-[var(--gw-table-header)] px-2.5 py-2"
            style={{
              borderColor: picked && grade ? grade.color : "transparent",
              opacity: grade ? 1 : 0.5,
            }}
          >
            {grade ? (
              <GradeIcon id={grade.id} color={grade.color} />
            ) : (
              <span className="h-4 w-4 shrink-0 rounded-full border border-[var(--gw-border-strong)]" />
            )}
            <span className="flex-1 text-[13px] font-semibold text-[var(--gw-text-primary)]">
              {row.label}
            </span>
            {/* 손실만 적는다. 최선은 아이콘이 이미 말하고, EV를 따로 적으면 같은
                차이를 숫자 두 개로 두 번 말하게 된다. */}
            {row.lossBb !== null && row.lossBb > 0 && (
              <span className="gw-num shrink-0 text-right text-[12px] text-[var(--gw-text-muted)]">
                {formatEvLoss(row.lossBb)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
