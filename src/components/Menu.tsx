"use client";

import { useState } from "react";
import {
  MODES,
  PUSHFOLD_STACKS,
  PUSHFOLD_TABLE_SIZES,
  type ModeId,
  type Scenario,
} from "@/lib/scenarios";

// 카테고리마다 색을 달리해 목록에서 한눈에 구분되게 한다.
// 올인 판단은 브랜드 액센트, 올인 대응은 같은 계열의 딥틸을 써서 둘이 한 묶음으로
// 보이게 한다. 나머지는 서로 겹치지 않는 색조를 쓴다.
const MODE_ICON: Record<ModeId, { tint: string; path: React.ReactNode }> = {
  // 올인 = 포커 칩
  pushfold: {
    tint: "bg-[var(--gw-accent-strong)]",
    path: (
      <>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="3.5" />
        <path d="M12 3v3.5M12 17.5V21M3 12h3.5M17.5 12H21" />
      </>
    ),
  },
  // 올인 대응 = 남의 올인이 나에게 들어온다
  vsshove: {
    tint: "bg-[#0B666A]",
    path: (
      <>
        <circle cx="16" cy="12" r="5.5" />
        <path d="M2.5 12h6.5M6 8.5 2.5 12 6 15.5" />
      </>
    ),
  },
  // 오프닝 = 레인지 표(13×13 매트릭스)를 고르는 일
  rfi: {
    tint: "bg-[#3b82f6]",
    path: (
      <>
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <path d="M3 9h18M3 15h18M9 3v18M15 3v18" />
      </>
    ),
  },
  // 대응 = 들어온 액션에 되받아친다
  vsopen: {
    tint: "bg-[#ef4444]",
    path: (
      <>
        <path d="M3 8h14M13 4l4 4-4 4" />
        <path d="M21 16H7M11 20l-4-4 4-4" />
      </>
    ),
  },
  // 플랍 = 보드에 깔린 카드 3장
  postflop: {
    tint: "bg-[#f59e0b]",
    path: (
      <>
        <rect x="2.5" y="7" width="5.5" height="11" rx="1.2" />
        <rect x="9.25" y="5.5" width="5.5" height="11" rx="1.2" />
        <rect x="16" y="7" width="5.5" height="11" rx="1.2" />
      </>
    ),
  },
  // ICM = 칩이 아니라 상금
  icm: {
    tint: "bg-[#a855f7]",
    path: (
      <>
        <path d="M8 3.5h8V9a4 4 0 0 1-8 0z" />
        <path d="M8 5H5.5v1.2A3 3 0 0 0 8 9.2M16 5h2.5v1.2A3 3 0 0 1 16 9.2" />
        <path d="M12 13v4M8.5 20.5h7" />
      </>
    ),
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
  const [openMode, setOpenMode] = useState<ModeId | null>(null);
  const [tableSize, setTableSize] = useState(9);
  const [stackBb, setStackBb] = useState<number | null>(null);

  // 카테고리를 고르면 그 조건이 드롭다운되고, 같은 카드를 다시 누르면 접힌다.
  // 접어도 mode는 유지되므로 곧바로 시작하기를 눌러도 된다.
  const selectMode = (id: ModeId) => {
    setMode(id);
    setOpenMode((current) => (current === id ? null : id));
  };

  return (
    <div className="mx-auto flex h-full w-full max-w-md flex-col overflow-y-auto">
      {/* 히어로 — 일러스트 위에 제목을 얹고, 아래쪽은 배경색으로 녹여 목록과 이어 붙인다.
          일러스트는 배경이 투명이라 --gw-bg(순검정) 위에 그대로 합성된다. */}
      <section className="shrink-0" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="relative aspect-[5/4] w-full overflow-hidden">
          <picture>
            <source srcSet="/hero-player.webp" type="image/webp" />
            <img
              src="/hero-player.png"
              alt=""
              aria-hidden
              className="pointer-events-none absolute inset-0 h-full w-full select-none object-cover object-[50%_38%]"
            />
          </picture>
          <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[var(--gw-bg)]/45 to-[var(--gw-bg)]" />
          <h1 className="absolute inset-x-4 bottom-3 text-[28px] font-black leading-[1.15] tracking-tight text-[var(--gw-text-primary)]">
            Train Like a Solver
            <br />
            with GTO Pub
          </h1>
        </div>
      </section>

      <div className="flex flex-col gap-6 px-4 pb-6 pt-6">
        <section className="flex flex-col gap-3">
          {MODES.map((info) => {
            const selected = mode === info.id && info.available;
            const expanded = openMode === info.id && info.available;
            const icon = MODE_ICON[info.id];
            // 선택 여부는 테두리가 아니라 카드가 펼쳐지는 것으로, 준비 상태는
            // 흐림이 아니라 우상단 배지로만 드러낸다.
            return (
              <div
                key={info.id}
                className="relative overflow-hidden rounded-[var(--gw-radius-control)] bg-[var(--gw-table-header)]"
              >
                {/* 헤더만 선택 대상. 카드 안에 설정 칩(버튼)이 들어가므로
                    카드 자체를 button으로 두면 버튼이 중첩된다. */}
                <button
                  type="button"
                  disabled={!info.available}
                  onClick={() => selectMode(info.id)}
                  aria-pressed={selected}
                  aria-expanded={info.available ? expanded : undefined}
                  className="flex w-full items-center gap-3 px-3 py-3 text-left transition active:scale-[0.99]"
                >
                  <span
                    className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-[var(--gw-radius-control)] ${icon.tint}`}
                  >
                    <svg
                      viewBox="0 0 24 24"
                      className="h-7 w-7 text-[var(--gw-bg)]"
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
                    <span
                      className={`block text-sm font-bold text-[var(--gw-text-primary)] ${
                        info.available ? "" : "pr-16"
                      }`}
                    >
                      {info.title}
                    </span>
                    <span className="mt-0.5 block text-[11px] leading-relaxed text-[var(--gw-text-muted)]">
                      {info.available ? info.summary : info.unavailableReason}
                    </span>
                  </span>
                  {info.available && (
                    <svg
                      viewBox="0 0 24 24"
                      className={`h-4 w-4 shrink-0 text-[var(--gw-text-muted)] transition-transform duration-300 motion-reduce:transition-none ${
                        expanded ? "rotate-180" : ""
                      }`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden
                    >
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  )}
                </button>

                {/* 조건 설정은 그 조건을 쓰는 카테고리 안에 둔다.
                    인원·스택 축은 푸시/폴드 풀이에서 나온 값이라 올인·올인 대응이 함께 쓴다.
                    다른 카테고리가 열리면 각자의 축을 같은 자리에 붙인다.

                    grid-rows 0fr↔1fr은 높이를 모르는 내용도 펼침/접힘을 전환할 수 있게 해준다.
                    조건부 마운트로는 전환 시작 상태가 없어 애니메이션이 걸리지 않는다. */}
                {(info.id === "pushfold" || info.id === "vsshove") && (
                  <div
                    aria-hidden={!expanded}
                    className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${
                      expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                    }`}
                  >
                    <div className="overflow-hidden">
                      <div className="flex flex-col gap-3 border-t border-[var(--gw-border)] px-3 pb-3 pt-3">
                        <div className="flex flex-col gap-1.5">
                          <h3 className="text-[11px] font-bold tracking-wide text-[var(--gw-text-muted)]">
                            테이블 인원
                          </h3>
                          <div className="flex flex-wrap gap-2">
                            {PUSHFOLD_TABLE_SIZES.map((size) => (
                              <Chip
                                key={size}
                                selected={tableSize === size}
                                onClick={() => setTableSize(size)}
                              >
                                {size}인
                              </Chip>
                            ))}
                          </div>
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <h3 className="text-[11px] font-bold tracking-wide text-[var(--gw-text-muted)]">
                            스택 깊이
                          </h3>
                          <div className="flex flex-wrap gap-2">
                            <Chip selected={stackBb === null} onClick={() => setStackBb(null)}>
                              랜덤
                            </Chip>
                            {PUSHFOLD_STACKS.map((bb) => (
                              <Chip
                                key={bb}
                                selected={stackBb === bb}
                                onClick={() => setStackBb(bb)}
                              >
                                {bb}bb
                              </Chip>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* 배지는 준비 중일 때만. 이용 가능한 건 기본 상태이므로
                    굳이 라벨을 붙일 이유가 없다. */}
                {!info.available && (
                  <span className="absolute right-3 top-3 rounded-full bg-[var(--gw-surface-3)] px-2 py-0.5 text-[10px] font-bold text-[var(--gw-text-muted)]">
                    준비 중
                  </span>
                )}
              </div>
            );
          })}
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
