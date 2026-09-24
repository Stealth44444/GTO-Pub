"use client";

import { useState } from "react";
import seatsRaw from "@/data/preflop-seats.json";
import { LESSONS, findLesson, type LessonBlock } from "@/lib/lessons";
import { openWidths } from "@/lib/rangeWidth";
import type { SeatsData } from "@/lib/seatGame";

const DATA = seatsRaw as unknown as SeatsData;

function Block({ block }: { block: LessonBlock }) {
  if (block.kind === "text") {
    return (
      <p className="text-[14px] leading-[1.75] text-[var(--gw-text-secondary)]">{block.body}</p>
    );
  }
  if (block.kind === "note") {
    return (
      <p className="border-l-2 border-[var(--gw-accent-strong)] pl-3.5 text-[13px] leading-[1.7] text-[var(--gw-text-muted)]">
        {block.body}
      </p>
    );
  }
  if (block.kind === "seatOpens") return <SeatOpens caption={block.caption} />;
  return (
    <div className="rounded-[var(--gw-radius-card)] border border-[var(--gw-border)] bg-[var(--gw-surface-1)]">
      <div className="gw-label-ko border-b border-[var(--gw-border)] px-3.5 py-2.5">
        {block.caption}
      </div>
      <dl className="divide-y divide-[var(--gw-border)]">
        {block.rows.map((row) => (
          <div key={row.label} className="flex items-baseline gap-3 px-3.5 py-2.5">
            <dt className="flex-1 text-[13px] text-[var(--gw-text-secondary)]">{row.label}</dt>
            <dd className="gw-num shrink-0 text-[13px] font-semibold text-[var(--gw-text-primary)]">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export default function LearnPanel() {
  const [openId, setOpenId] = useState<string | null>(null);
  const lesson = openId ? findLesson(openId) : undefined;

  if (lesson) {
    return (
      <div className="mx-auto h-full w-full max-w-md overflow-y-auto px-5 pb-28 pt-5">
        <button
          type="button"
          onClick={() => setOpenId(null)}
          className="gw-label-ko mb-4 flex items-center gap-1.5 text-[var(--gw-text-muted)] transition active:scale-95"
        >
          <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 6l-6 6 6 6" />
          </svg>
          목록
        </button>
        <h1 className="text-[22px] font-bold leading-[1.3] tracking-[-0.02em] text-[var(--gw-text-primary)]">
          {lesson.title}
        </h1>
        <div className="mt-2 flex items-center gap-2">
          <span className="gw-num text-[11px] text-[var(--gw-text-muted)]">{lesson.minutes}분</span>
          {lesson.tags.map((tag) => (
            <span
              key={tag}
              className="gw-label-ko rounded-[4px] border border-[var(--gw-border)] px-1.5 py-0.5 text-[10px]"
            >
              {tag}
            </span>
          ))}
        </div>
        <div className="mt-6 flex flex-col gap-5">
          {lesson.blocks.map((block, i) => (
            <Block key={i} block={block} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto h-full w-full max-w-md overflow-y-auto px-5 pb-28 pt-6">
      <span className="gw-label-ko">왜 그런지 읽어보기</span>
      <p className="mt-1.5 text-[13px] leading-[1.6] text-[var(--gw-text-muted)]">
        트레이너는 무엇이 맞는지 알려줍니다. 여기서는 왜 그런지를 다룹니다.
      </p>
      <div className="mt-5 flex flex-col gap-2">
        {LESSONS.map((l) => {
          const ready = l.status === "ready";
          return (
            <button
              key={l.id}
              type="button"
              disabled={!ready}
              onClick={() => setOpenId(l.id)}
              className={`rounded-[var(--gw-radius-card)] border border-[var(--gw-border)] bg-[var(--gw-surface-1)] px-4 py-3.5 text-left transition active:scale-[0.995] ${
                ready ? "" : "opacity-55"
              }`}
              style={{ boxShadow: "var(--gw-lift-1)" }}
            >
              <div className="flex items-start gap-3">
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-semibold tracking-[-0.01em] text-[var(--gw-text-primary)]">
                    {l.title}
                  </span>
                  <span className="mt-1 block text-[12px] leading-[1.5] text-[var(--gw-text-muted)]">
                    {ready ? l.summary : "작성 중입니다"}
                  </span>
                </span>
                {ready && (
                  <span className="gw-num shrink-0 pt-0.5 text-[11px] text-[var(--gw-text-muted)]">
                    {l.minutes}분
                  </span>
                )}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/**
 * 자리별로 얼마나 여는가. 지금 앱이 쓰는 레인지에서 바로 센다.
 *
 * 막대는 오픈과 올인을 이어 붙인다. 둘을 따로 보면 SB가 왜 넓은지가 안 보인다
 * — SB는 오픈보다 올인으로 들어가는 몫이 다른 자리보다 훨씬 크다.
 */
function SeatOpens({ caption }: { caption: string }) {
  const rows = openWidths(DATA);
  const max = Math.max(...rows.map((r) => r.openPct + r.jamPct), 1);

  return (
    <div className="rounded-[var(--gw-radius-card)] border border-[var(--gw-border)] bg-[var(--gw-surface-1)]">
      <div className="gw-label-ko border-b border-[var(--gw-border)] px-3.5 py-2.5">
        {caption}
      </div>
      <div className="flex flex-col gap-2 px-3.5 py-3">
        {rows.map((r) => (
          <div key={r.seat} className="flex items-center gap-2.5">
            <span className="gw-num w-[34px] shrink-0 text-[11px] font-semibold text-[var(--gw-text-secondary)]">
              {r.seat}
            </span>
            <span className="flex h-2.5 flex-1 overflow-hidden rounded-full bg-[var(--gw-table-header)]">
              <span
                style={{
                  width: `${(r.openPct / max) * 100}%`,
                  backgroundColor: "var(--gw-accent)",
                }}
              />
              <span
                style={{
                  width: `${(r.jamPct / max) * 100}%`,
                  backgroundColor: "var(--gw-accent-strong)",
                }}
              />
            </span>
            <span className="gw-num w-[46px] shrink-0 text-right text-[11px] font-semibold text-[var(--gw-text-primary)]">
              {Math.round((r.openPct + r.jamPct) * 10) / 10}%
            </span>
          </div>
        ))}
      </div>
      <p className="border-t border-[var(--gw-border)] px-3.5 py-2.5 text-[11px] text-[var(--gw-text-muted)]">
        연한 쪽이 오픈, 진한 쪽이 올인입니다. {DATA.stackBb}bb · BB 앤티 {DATA.anteBb}bb 기준.
      </p>
    </div>
  );
}
