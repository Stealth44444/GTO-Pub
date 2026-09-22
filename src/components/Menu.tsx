"use client";

import { useState } from "react";
import {
  MODES,
  PUSHFOLD_STACKS,
  PUSHFOLD_TABLE_SIZES,
  type ModeId,
  type Scenario,
} from "@/lib/scenarios";

const CARD = "rounded-[var(--gw-radius-control)] border border-[var(--gw-border)]";

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
          : "bg-[var(--gw-surface-2)] text-[var(--gw-text-secondary)]"
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
    <div
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col gap-5 px-4 pb-8"
      style={{ paddingTop: "calc(env(safe-area-inset-top) + 1.5rem)" }}
    >
      <header>
        <h1 className="text-2xl font-black text-[var(--gw-text-primary)]">홀덤 트레이너</h1>
        <p className="mt-1 text-sm text-[var(--gw-text-muted)]">
          한 판씩 상황을 보고 액션을 고르면, 정답 빈도를 바로 알려줍니다.
        </p>
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="text-xs font-bold tracking-wide text-[var(--gw-text-muted)]">무엇을 연습할까요</h2>
        {MODES.map((info) => {
          const selected = mode === info.id;
          return (
            <button
              key={info.id}
              type="button"
              disabled={!info.available}
              onClick={() => setMode(info.id)}
              className={`${CARD} px-4 py-3 text-left transition active:scale-[0.99] ${
                selected && info.available
                  ? "border-[var(--gw-accent)] bg-[var(--gw-accent)]/10"
                  : "bg-[var(--gw-surface-1)]"
              } ${info.available ? "" : "opacity-45"}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span
                  className={`text-base font-bold ${
                    selected && info.available
                      ? "text-[var(--gw-accent)]"
                      : "text-[var(--gw-text-primary)]"
                  }`}
                >
                  {info.title}
                </span>
                {!info.available && (
                  <span className="shrink-0 rounded-full bg-[var(--gw-surface-3)] px-2 py-0.5 text-[10px] font-bold text-[var(--gw-text-muted)]">
                    준비 중
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-[var(--gw-text-muted)]">
                {info.available ? info.summary : info.unavailableReason}
              </p>
            </button>
          );
        })}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-xs font-bold tracking-wide text-[var(--gw-text-muted)]">테이블 인원</h2>
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
          블라인드가 오를수록 스택은 얕아집니다. &ldquo;전체&rdquo;를 고르면 실제 토너먼트처럼 여러
          깊이가 섞여 나옵니다.
        </p>
      </section>

      <button
        type="button"
        onClick={() => onStart({ mode, tableSize, stackBb })}
        className="mt-auto rounded-[var(--gw-radius-control)] bg-[var(--gw-accent-strong)] py-4 text-lg font-bold text-[var(--gw-text-primary)] transition active:scale-[0.98]"
      >
        시작하기
      </button>
    </div>
  );
}
