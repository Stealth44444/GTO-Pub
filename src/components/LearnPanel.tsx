"use client";

import { useState } from "react";
import { LESSONS, findLesson, type LessonBlock } from "@/lib/lessons";

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
