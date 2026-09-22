"use client";

import { useState } from "react";
import {
  MODES,
  PUSHFOLD_STACKS,
  PUSHFOLD_TABLE_SIZES,
  type ModeId,
  type Scenario,
} from "@/lib/scenarios";

const MODE_ICON: Record<ModeId, { tint: string; path: React.ReactNode }> = {
  pushfold: {
    tint: "bg-[var(--gw-accent-strong)]",
    path: <path d="M12 3v18M5 10l7-7 7 7" />,
  },
  rfi: {
    tint: "bg-[var(--gw-surface-3)]",
    path: <path d="M4 7h16M4 12h11M4 17h7" />,
  },
};

function Chip({
  selected,
  onClick,
  children,
}: {
  selected: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-[var(--gw-radius-control)] px-3 py-2 text-sm font-bold transition active:scale-95 ${
        selected
          ? "bg-[var(--gw-accent)] text-[var(--gw-bg)]"
          : "bg-[var(--gw-table-header)] text-[var(--gw-text-secondary)]"
      }`}
    >
      {children}
    </button>
  );
}

export default function Menu({ onStart }: { onStart: (scenario: Scenario) => void }) {
  const [mode, setMode] = useState<ModeId>("pushfold");
  const [tableSize, setTableSize] = useState(9);
  const [stackBb, setStackBb] = useState<number | null>(null);

  return (
    <div className="mx-auto flex h-full w-full max-w-md flex-col overflow-y-auto">
      <div
        className="flex flex-col gap-6 px-4 pb-6"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 1.75rem)" }}
      >
        <header>
          <h1 className="text-[26px] font-black leading-tight text-[var(--gw-text-primary)]">
            실전처럼 연습하는
            <br />
            홀덤 트레이너
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-[var(--gw-text-muted)]">
            한 판씩 상황을 보고 액션을 고르면 정답 빈도를 바로 알려줍니다.
          </p>
        </header>

        <section className="flex flex-col gap-2">
          {MODES.map((info) => {
            const selected = mode === info.id && info.available;
            const icon = MODE_ICON[info.id];
            return (
              <button
                key={info.id}
                type="button"
                disabled={!info.available}
                onClick={() => setMode(info.id)}
                className={`flex items-center gap-3 rounded-[var(--gw-radius-control)] bg-[var(--gw-table-header)] px-3 py-3 text-left transition active:scale-[0.99] ${
                  selected ? "ring-2 ring-[var(--gw-accent)]" : ""
                } ${info.available ? "" : "opacity-40"}`}
              >
                <span
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--gw-radius-control)] ${icon.tint}`}
                >
                  <svg
                    viewBox="0 0 24 24"
                    className="h-5 w-5 text-[var(--gw-text-primary)]"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    {icon.path}
                  </svg>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-base font-bold text-[var(--gw-text-primary)]">
                      {info.title}
                    </span>
                    {!info.available && (
                      <span className="shrink-0 rounded-full bg-[var(--gw-surface-3)] px-2 py-0.5 text-[10px] font-bold text-[var(--gw-text-muted)]">
                        준비 중
                      </span>
                    )}
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-[var(--gw-text-muted)]">
                    {info.available ? info.summary : info.unavailableReason}
                  </span>
                </span>
              </button>
            );
          })}
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-bold tracking-wide text-[var(--gw-text-muted)]">
            테이블 인원
          </h2>
          <div className="flex gap-2">
            {PUSHFOLD_TABLE_SIZES.map((size) => (
              <Chip key={size} selected={tableSize === size} onClick={() => setTableSize(size)}>
                {size}인
              </Chip>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-2">
          <h2 className="text-xs font-bold tracking-wide text-[var(--gw-text-muted)]">스택 깊이</h2>
          <div className="flex flex-wrap gap-2">
            <Chip selected={stackBb === null} onClick={() => setStackBb(null)}>
              전체
            </Chip>
            {PUSHFOLD_STACKS.map((bb) => (
              <Chip key={bb} selected={stackBb === bb} onClick={() => setStackBb(bb)}>
                {bb}bb
              </Chip>
            ))}
          </div>
          <p className="text-[11px] leading-relaxed text-[var(--gw-text-muted)]">
            블라인드가 오를수록 스택은 얕아집니다. &ldquo;전체&rdquo;를 고르면 실제 토너먼트처럼
            여러 깊이가 섞여 나옵니다.
          </p>
        </section>

        <button
          type="button"
          onClick={() => onStart({ mode, tableSize, stackBb })}
          className="rounded-[var(--gw-radius-control)] bg-[var(--gw-accent-strong)] py-4 text-lg font-bold text-[var(--gw-text-primary)] transition active:scale-[0.98]"
        >
          시작하기
        </button>
      </div>
    </div>
  );
}
