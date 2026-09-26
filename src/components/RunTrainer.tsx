"use client";

import { useEffect, useState } from "react";
import { gradeByEvLoss } from "@/lib/grading";
import { loadDepthData } from "@/lib/depthLoader";
import type { SeatsData } from "@/lib/seatGame";
import {
  applyHand,
  exactStackBb,
  levelOf,
  playDepth,
  RUN_DEPTHS,
  RUN_HANDS,
  stackBb,
  stakeCap,
  startRun,
  type RunState,
} from "@/lib/run";
import GradeIcon from "./GradeIcon";
import HandTrainer from "./HandTrainer";

/**
 * 토너먼트 런. 판이 이어지고 칩이 오가며 블라인드가 오른다(lib/run.ts).
 * 판 자체는 HandTrainer가 치고, 여기서는 런의 상태와 끝난 뒤의 요약만 맡는다.
 */
export default function RunTrainer({ onExit }: { onExit: () => void }) {
  const [state, setState] = useState<RunState>(startRun);
  const [runId, setRunId] = useState(0);
  const [loaded, setLoaded] = useState<{ depth: number; data: SeatsData } | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  // 스택이 줄면 얕은 깊이의 풀이로 넘어간다. 20bb 풀이로 10bb 판을 치면 정답이
  // 다른 게임의 것이 된다.
  const depth = playDepth(exactStackBb(state), RUN_DEPTHS);
  const data = loaded?.depth === depth ? loaded.data : null;

  useEffect(() => {
    if (data) return;
    let alive = true;
    loadDepthData(depth)
      .then((d) => {
        if (alive) setLoaded({ depth, data: d });
      })
      .catch(() => {
        if (alive) setLoadError(true);
      });
    return () => {
      alive = false;
    };
  }, [depth, data, attempt]);

  if (state.over) {
    return (
      <RunSummary
        state={state}
        onAgain={() => {
          setState(startRun());
          setRunId((n) => n + 1);
        }}
        onExit={onExit}
      />
    );
  }

  if (loadError) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
        <p className="text-sm text-[var(--gw-text-muted)]">데이터를 불러오지 못했습니다</p>
        <button
          type="button"
          onClick={() => {
            setLoadError(false);
            setAttempt((n) => n + 1);
          }}
          className="rounded-[var(--gw-radius-control)] border border-[var(--gw-border)] px-4 py-2.5 text-[13px] font-semibold text-[var(--gw-text-secondary)]"
        >
          다시 시도
        </button>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="gw-label animate-[gw-thinking_1200ms_ease-in-out_infinite]">준비 중</p>
      </div>
    );
  }

  return (
    <HandTrainer
      // 깊이가 바뀌면 새로 띄운다. 판 도중에 다른 게임의 풀이가 끼어들면 안 된다.
      key={`${runId}-${depth}`}
      run={{
        onHandDone: (o) => setState((s) => applyHand(s, o)),
        header: `L${levelOf(state) + 1} · ${state.hands + 1}/${RUN_HANDS} · ${stackBb(state)}bb`,
        data,
        capBb: stakeCap(state, depth),
      }}
    />
  );
}

function RunSummary({
  state,
  onAgain,
  onExit,
}: {
  state: RunState;
  onAgain: () => void;
  onExit: () => void;
}) {
  const avg = state.graded > 0 ? state.lossBb / state.graded : null;
  // 런 전체의 판단 품질. 한 판의 등급과 같은 기준을 판단당 평균 손실에 댄다.
  const grade = avg === null ? null : gradeByEvLoss(avg);
  return (
    <div
      className="mx-auto flex h-full w-full max-w-sm flex-col justify-center px-6"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <p className="gw-label">{state.over === "done" ? "FINISHED" : "BUSTED"}</p>
      <h1 className="mt-2 text-[34px] font-bold leading-none tracking-[-0.03em] text-[var(--gw-text-primary)]">
        {state.over === "done" ? "완주" : `${state.hands}판째 버스트`}
      </h1>

      <dl className="mt-8 grid grid-cols-2 gap-x-4 gap-y-5">
        <Stat label="최종 스택" value={`${stackBb(state)}bb`} />
        <Stat label="최고 스택" value={`${Math.round(state.peak * 10) / 10}bb`} />
        <Stat label="판단" value={`${state.graded}번`} />
        <Stat
          label="판단당 손실"
          value={avg === null ? "—" : `${avg.toFixed(2)}bb`}
          icon={grade ? <GradeIcon id={grade.id} color={grade.color} /> : null}
        />
      </dl>

      <div className="mt-10 grid grid-cols-[1fr_1.4fr] gap-2">
        <button
          type="button"
          onClick={onExit}
          className="rounded-[var(--gw-radius-control)] border border-[var(--gw-border)] py-3.5 text-[14px] font-semibold text-[var(--gw-text-secondary)] transition active:scale-[0.98]"
        >
          메뉴
        </button>
        <button
          type="button"
          onClick={onAgain}
          className="rounded-[var(--gw-radius-control)] bg-[var(--gw-accent)] py-3.5 text-[15px] font-bold text-[var(--gw-ink)] transition active:scale-[0.98]"
        >
          다시 시작
        </button>
      </div>
    </div>
  );
}

function Stat({ label, value, icon }: { label: string; value: string; icon?: React.ReactNode }) {
  return (
    <div>
      <dt className="gw-label-ko">{label}</dt>
      <dd className="gw-num mt-1 flex items-center gap-1.5 text-[20px] font-semibold text-[var(--gw-text-primary)]">
        {icon}
        {value}
      </dd>
    </div>
  );
}
