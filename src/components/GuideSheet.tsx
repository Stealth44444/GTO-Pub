"use client";

import { useState } from "react";
import { GRADE_ORDER, gradeBandText, gradeInfo } from "@/lib/grading";
import { GUIDE_CARDS, markGuideSeen } from "@/lib/onboarding";
import GradeIcon from "./GradeIcon";

/**
 * 처음 들어온 사람에게 화면 읽는 법을 알려준다.
 *
 * 건너뛰기를 눈에 띄게 둔다. 안내를 강제로 읽히면 읽는 게 아니라 넘기는 법을
 * 익히고, 그러면 나중에 정말 필요한 안내도 같이 넘긴다.
 */
export default function GuideSheet({ onClose }: { onClose: () => void }) {
  const [page, setPage] = useState(0);
  const card = GUIDE_CARDS[page];
  const last = page === GUIDE_CARDS.length - 1;

  const finish = () => {
    markGuideSeen();
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 px-4 pb-4"
      role="dialog"
      aria-modal="true"
      aria-label="처음 오셨나요"
    >
      <div className="w-full max-w-[420px] rounded-[var(--gw-radius-card)] border border-[var(--gw-border)] bg-[var(--gw-surface-1)] px-5 pb-5 pt-4">
        <div className="flex items-center justify-between">
          <div className="flex gap-1.5" aria-hidden>
            {GUIDE_CARDS.map((c, i) => (
              <span
                key={c.title}
                className="h-1 w-6 rounded-full transition-colors"
                style={{
                  backgroundColor:
                    i <= page ? "var(--gw-accent)" : "var(--gw-border-strong)",
                }}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={finish}
            className="gw-label text-[var(--gw-text-muted)] transition active:scale-95"
          >
            건너뛰기
          </button>
        </div>

        <h2 className="mt-4 text-[19px] font-bold leading-snug text-[var(--gw-text-primary)]">
          {card.title}
        </h2>

        <div className="mt-2.5 space-y-2.5">
          {card.body.map((p) => (
            <p key={p.slice(0, 16)} className="text-[13px] leading-relaxed text-[var(--gw-text-secondary)]">
              {p}
            </p>
          ))}
        </div>

        {card.showGrades && (
          <div className="mt-3.5 space-y-1">
            {GRADE_ORDER.map((id) => {
              const g = gradeInfo(id);
              return (
                <div
                  key={id}
                  className="flex items-center gap-2 rounded-[var(--gw-radius-control)] bg-[var(--gw-table-header)] px-2.5 py-1.5"
                >
                  <GradeIcon id={g.id} color={g.color} />
                  <span
                    className="flex-1 text-[13px] font-semibold"
                    style={{ color: g.color }}
                  >
                    {g.label}
                  </span>
                  <span className="gw-num text-[11px] text-[var(--gw-text-muted)]">
                    {gradeBandText(id)}
                  </span>
                </div>
              );
            })}
          </div>
        )}

        <button
          type="button"
          onClick={() => (last ? finish() : setPage((p) => p + 1))}
          className="mt-5 w-full rounded-[var(--gw-radius-control)] bg-[var(--gw-accent)] py-3.5 text-[15px] font-bold text-[var(--gw-ink)] transition active:scale-[0.98]"
          style={{ marginBottom: "env(safe-area-inset-bottom)" }}
        >
          {last ? "시작하기" : "다음"}
        </button>
      </div>
    </div>
  );
}
