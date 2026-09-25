"use client";

import { useState } from "react";
import {
  MODES,
  PUSHFOLD_STACKS,
  PUSHFOLD_TABLE_SIZES,
  type ModeId,
  type Scenario,
} from "@/lib/scenarios";
import { seatNames } from "@/lib/poker";

/** 한 판 전체 모드에서 고를 수 있는 자리. */
const HAND_SEATS = seatNames(9);

/*
 * 카테고리 아이콘은 단색 선화로만 둔다.
 *
 * 채도 높은 플랫 컬러 스쿼클 타일은 iOS 설정 화면을 흉내 낸 흔한 기본값이고,
 * 색이 의미를 나르지 않으면서 브랜드 팔레트만 망가뜨린다. 여기서 색은 신호
 * 전용이다 — 지금 고른 것, 지금 차례, 이만큼 손해.
 */
/** 메인 게임을 위에 둔다. 나머지는 MODES 순서 그대로. */
const MODE_ORDER = (id: ModeId) => (id === "hand" ? 0 : id === "run" ? 1 : 2);

const MODE_ICON: Record<ModeId, React.ReactNode> = {
  pushfold: (
    <>
      <circle cx="12" cy="12" r="8.25" />
      <circle cx="12" cy="12" r="3.25" />
      <path d="M12 3.75v2.5M12 17.75v2.5M3.75 12h2.5M17.75 12h2.5" />
    </>
  ),
  vsshove: (
    <>
      <circle cx="16.5" cy="12" r="4.25" />
      <path d="M10.5 12H3.25M6.5 8.25 3.25 12l3.25 3.75" />
    </>
  ),
  rfi: (
    <>
      <path d="M12 20V6" />
      <path d="m6.5 11.5 5.5-5.5 5.5 5.5" />
    </>
  ),
  vsopen: (
    <>
      <path d="M3.5 9h13M13 5.5 16.5 9 13 12.5" />
      <path d="M20.5 15h-13M11 11.5 7.5 15l3.5 3.5" />
    </>
  ),
  hand: (
    <>
      <path d="M3 19.5h18" />
      <path d="M4.5 16V12M9.5 16V8.5M14.5 16v-6M19.5 16V5" />
    </>
  ),
  // 트로피 — 한 판이 아니라 한 경기를 끝까지 간다.
  run: (
    <>
      <path d="M7.5 4.5h9v4.5a4.5 4.5 0 0 1-9 0z" />
      <path d="M7.5 6H4.5a3 3 0 0 0 3 3.75M16.5 6h3a3 3 0 0 1-3 3.75" />
      <path d="M12 13.5V17M8.5 20h7M10 17h4" />
    </>
  ),
  icm: (
    <>
      <path d="M12 3.5 14.6 9l6 .9-4.3 4.2 1 6-5.3-2.8-5.3 2.8 1-6L3.4 9.9 9.4 9z" />
    </>
  ),
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
      className={`gw-num rounded-[var(--gw-radius-control)] border px-3 py-1.5 text-[13px] font-semibold transition active:scale-95 ${
        selected
          ? "border-[var(--gw-accent)] bg-[var(--gw-accent)]/12 text-[var(--gw-accent)]"
          : "border-[var(--gw-border)] bg-transparent text-[var(--gw-text-muted)]"
      }`}
    >
      {children}
    </button>
  );
}

export default function Menu({ onStart }: { onStart: (scenario: Scenario) => void }) {
  const [mode, setMode] = useState<ModeId>("hand");
  const [openMode, setOpenMode] = useState<ModeId | null>(null);
  const [tableSize, setTableSize] = useState(9);
  const [stackBb, setStackBb] = useState<number | null>(null);
  const [seat, setSeat] = useState<string | null>(null);

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
          <div className="absolute inset-0 bg-gradient-to-b from-[var(--gw-bg)]/30 via-[var(--gw-bg)]/55 to-[var(--gw-bg)]" />
          <h1 className="absolute inset-x-5 bottom-4 text-[30px] font-bold leading-none tracking-[-0.03em] text-[var(--gw-text-primary)]">
            GTO Pub
          </h1>
        </div>
      </section>

      <div className="flex flex-col gap-5 px-5 pb-28 pt-6">
        <section className="flex flex-col gap-2">
          {/* 준비 중인 모드는 보여주지 않는다. 누를 수 없는 카드는 목록만 길게 만든다.
              메인 게임인 한 판 전체를 맨 위에 둔다. */}
          {[...MODES]
            .filter((m) => m.available)
            .sort((a, b) => MODE_ORDER(a.id) - MODE_ORDER(b.id))
            .map((info) => {
            const selected = mode === info.id && info.available;
            const expanded = openMode === info.id && info.available;
            const icon = MODE_ICON[info.id];
            // 선택 여부는 테두리가 아니라 카드가 펼쳐지는 것으로, 준비 상태는
            // 흐림이 아니라 우상단 배지로만 드러낸다.
            return (
              <div
                key={info.id}
                className={`relative overflow-hidden rounded-[var(--gw-radius-card)] border transition-colors ${
                  selected
                    ? "border-[var(--gw-accent-strong)]/55 bg-[var(--gw-surface-2)]"
                    : "border-[var(--gw-border)] bg-[var(--gw-surface-1)]"
                } ${info.available ? "" : "opacity-60"}`}
                style={{ boxShadow: "var(--gw-lift-1)" }}
              >
                {/* 헤더만 선택 대상. 카드 안에 설정 칩(버튼)이 들어가므로
                    카드 자체를 button으로 두면 버튼이 중첩된다. */}
                <button
                  type="button"
                  disabled={!info.available}
                  onClick={() => selectMode(info.id)}
                  aria-pressed={selected}
                  aria-expanded={info.available ? expanded : undefined}
                  className="flex w-full items-center gap-3.5 px-4 py-3.5 text-left transition active:scale-[0.995]"
                >
                  <svg
                    viewBox="0 0 24 24"
                    className={`h-[22px] w-[22px] shrink-0 transition-colors ${
                      selected ? "text-[var(--gw-accent)]" : "text-[var(--gw-text-muted)]"
                    }`}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.6}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden
                  >
                    {icon}
                  </svg>
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block text-[15px] font-semibold tracking-[-0.01em] text-[var(--gw-text-primary)] ${
                        info.available ? "" : "pr-16"
                      }`}
                    >
                      {info.title}
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
                {info.id === "hand" && (
                  <div
                    aria-hidden={!expanded}
                    className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${
                      expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                    }`}
                  >
                    <div className="overflow-hidden">
                      <div className="flex flex-col gap-2 border-t border-[var(--gw-border)] px-4 pb-4 pt-3.5">
                        <h3 className="gw-label-ko">앉을 자리</h3>
                        <div className="flex flex-wrap gap-2">
                          <Chip selected={seat === null} onClick={() => setSeat(null)}>
                            랜덤
                          </Chip>
                          {HAND_SEATS.map((s) => (
                            <Chip key={s} selected={seat === s} onClick={() => setSeat(s)}>
                              {s}
                            </Chip>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {(info.id === "pushfold" || info.id === "vsshove") && (
                  <div
                    aria-hidden={!expanded}
                    className={`grid transition-[grid-template-rows] duration-300 ease-out motion-reduce:transition-none ${
                      expanded ? "grid-rows-[1fr]" : "grid-rows-[0fr]"
                    }`}
                  >
                    <div className="overflow-hidden">
                      <div className="flex flex-col gap-3.5 border-t border-[var(--gw-border)] px-4 pb-4 pt-3.5">
                        <div className="flex flex-col gap-1.5">
                          <h3 className="gw-label-ko">테이블 인원</h3>
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
                          <h3 className="gw-label-ko">스택 깊이</h3>
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
                  <span className="gw-label-ko absolute right-4 top-4 rounded-[4px] border border-[var(--gw-border)] px-1.5 py-0.5 text-[10px]">
                    준비 중
                  </span>
                )}
              </div>
            );
          })}
        </section>

        <button
          type="button"
          onClick={() => onStart({ mode, tableSize, stackBb, seat })}
          className="flex items-center justify-center gap-2.5 rounded-[var(--gw-radius-control)] bg-[var(--gw-accent)] py-4 text-[16px] font-bold tracking-[-0.01em] text-[var(--gw-ink)] transition active:scale-[0.98]"
        >
          시작하기
        </button>
      </div>
    </div>
  );
}
