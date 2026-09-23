"use client";

import { gradeByEvLoss } from "@/lib/grading";
import GradeIcon from "./GradeIcon";
import { PanelMessage, PanelScroll, spotLabel } from "./PanelShell";
import { useAttempts } from "./useAttempts";

const ACTION_TEXT: Record<string, string> = {
  shove: "올인",
  call: "콜",
  fold: "폴드",
  open: "오픈",
};

function timeLabel(iso: string): string {
  const then = new Date(iso).getTime();
  const minutes = Math.floor((Date.now() - then) / 60000);
  if (minutes < 1) return "방금";
  if (minutes < 60) return `${minutes}분 전`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}시간 전`;
  return `${Math.floor(hours / 24)}일 전`;
}

export default function HistoryPanel() {
  const state = useAttempts();

  if (state.status === "loading") {
    return <PanelMessage title="기록" body="기록을 불러오는 중입니다." />;
  }
  if (state.status === "unavailable") {
    return (
      <PanelMessage
        title="기록"
        body="기록 서버에 연결하지 못했습니다. 연습은 그대로 할 수 있지만 기록은 남지 않습니다."
      />
    );
  }
  if (state.attempts.length === 0) {
    return (
      <PanelMessage title="기록" body="아직 기록이 없습니다. 한 판 연습하면 여기에 쌓입니다." />
    );
  }

  return (
    <PanelScroll title="기록">
      <p className="mt-1 text-[11px] text-[var(--gw-text-muted)]">최근 {state.attempts.length}판</p>
      <div className="mt-3 flex flex-col gap-1.5">
        {state.attempts.map((a, i) => {
          const grade = gradeByEvLoss(a.evLossBb);
          return (
            <div
              key={`${a.createdAt}-${i}`}
              className="flex items-center gap-2 rounded-[var(--gw-radius-control)] bg-[var(--gw-table-header)] px-2.5 py-2"
            >
              <GradeIcon id={grade.id} color={grade.color} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-bold text-[var(--gw-text-primary)]">
                  {a.handCode} · {ACTION_TEXT[a.userAction] ?? a.userAction}
                </span>
                <span className="block truncate text-[11px] text-[var(--gw-text-muted)]">
                  {spotLabel(a)}
                </span>
              </span>
              <span className="shrink-0 text-right">
                <span
                  className="block text-xs font-bold tabular-nums"
                  style={{ color: grade.color }}
                >
                  {a.evLossBb > 0 ? `-${a.evLossBb.toFixed(2)}bb` : grade.label}
                </span>
                <span className="block text-[10px] text-[var(--gw-text-muted)]">
                  {timeLabel(a.createdAt)}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </PanelScroll>
  );
}
