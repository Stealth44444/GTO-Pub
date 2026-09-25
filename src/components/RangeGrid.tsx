"use client";

import { actionColor, buildGrid, type RangeView } from "@/lib/rangeGrid";

/**
 * 이 자리의 레인지 전체와, 그 안에서 내 핸드의 위치.
 *
 * 칸 하나가 가로 막대들로 채워지고 폭이 그 액션의 빈도다. 숫자를 읽지 않아도
 * 어느 구역이 벳이고 경계가 어디인지 한눈에 들어온다.
 */
export default function RangeGrid({ view }: { view: RangeView }) {
  const grid = buildGrid(view);
  const { actionLabels, actionKinds } = view;

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
        {actionLabels.map((label, i) => (
          <span key={label} className="flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-[2px]"
              style={{ background: actionColor(actionKinds[i], i, actionKinds) }}
            />
            <span className="text-[11px] text-[var(--gw-text-muted)]">{label}</span>
          </span>
        ))}
      </div>

      <div
        className="grid overflow-hidden rounded-[6px] border border-[var(--gw-border)]"
        style={{ gridTemplateColumns: "repeat(13, minmax(0, 1fr))" }}
      >
        {grid.map((row, r) =>
          row.map((cell, c) => (
            <div
              key={`${r}-${c}`}
              className="relative aspect-square"
              style={{ background: "var(--gw-bg)", zIndex: cell.isHero ? 1 : undefined }}
            >
              {cell.freq && (
                <div className="absolute inset-0 flex">
                  {cell.freq.map((f, i) =>
                    f > 0.004 ? (
                      <div
                        key={i}
                        style={{
                          width: `${f * 100}%`,
                          background: actionColor(actionKinds[i], i, actionKinds),
                        }}
                      />
                    ) : null,
                  )}
                </div>
              )}
              {/* 7px 글자는 어떤 칸 색 위에 올지 알 수 없다 — 한 칸이 여러
                  색으로 쪼개지기도 한다. 얇은 검은 외곽선을 둘러 밝은 색
                  위에서도 읽히게 한다. */}
              <span
                className={`gw-num absolute inset-0 flex items-center justify-center text-[7px] leading-none ${
                  cell.freq ? "text-white/90" : "text-[var(--gw-text-muted)]/30"
                }`}
                style={
                  cell.freq
                    ? { textShadow: "0 0 2px rgba(0,0,0,0.9), 0 0 1px rgba(0,0,0,0.9)" }
                    : undefined
                }
              >
                {cell.code.length === 2 ? cell.code : cell.code.slice(0, 2)}
              </span>
              {/* 내 핸드 표시. 강조색 테두리를 쓰면 콜(같은 강조색) 칸 위에서
                  사라진다. 어떤 전략 색 위에서도 보이도록 흰 테두리에 검은
                  바깥선을 겹친다. */}
              {cell.isHero && (
                <span
                  className="pointer-events-none absolute inset-0 rounded-[1px]"
                  style={{ boxShadow: "inset 0 0 0 2px #fff, inset 0 0 0 3.5px rgba(0,0,0,0.75)" }}
                />
              )}
            </div>
          )),
        )}
      </div>
    </div>
  );
}
