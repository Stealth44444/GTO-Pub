"use client";

import { useEffect, useState } from "react";
import seatsRaw from "@/data/preflop-seats.json";
import { equityVsRange, loadEquity } from "@/lib/equity";
import type { SeatsData } from "@/lib/seatGame";
import { jamPotOdds, jamRangeOf } from "@/lib/why";

const DATA = seatsRaw as unknown as SeatsData;

/**
 * 올인에 대한 콜의 근거 숫자.
 *
 * 얼마를 내고, 얼마를 노리고, 실제로 얼마나 이기는가. 이 셋이면 그 자리의
 * 결론이 나온다 — 뒤에 칠 스트릿이 없기 때문이다. EV 숫자만 외우는 사람은
 * 스택이 조금만 달라져도 길을 잃지만, 이 셋을 보는 사람은 따라간다.
 *
 * 승률은 조합 가중치까지 반영하지만 카드 제거는 빼고 센다. 채점에 쓰는 EV는
 * 솔버가 따로 정확히 계산한 값이고, 여기 숫자는 그 값이 어디서 왔는지를
 * 보여주기 위한 것이다. 둘이 아주 조금 어긋날 수 있다.
 */
export default function WhyJam({
  heroSeat,
  jammer,
  iOpened,
  handCode,
}: {
  heroSeat: string;
  jammer: string;
  iOpened: boolean;
  handCode: string;
}) {
  const [equityPct, setEquityPct] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    const range = jamRangeOf(DATA, heroSeat, { kind: "vsJam", jammer, iOpened });
    if (!range) return;
    void loadEquity().then((table) => {
      if (!alive || !table) return;
      setEquityPct(equityVsRange(table, handCode, range));
    });
    return () => {
      alive = false;
    };
  }, [heroSeat, jammer, iOpened, handCode]);

  const odds = jamPotOdds(DATA, heroSeat, { kind: "vsJam", jammer, iOpened });
  // 승률이 아직 안 왔으면 팟 오즈만 보여준다. 그것만으로도 반은 설명된다.
  const enough = equityPct === null ? null : equityPct >= odds.needPct;

  return (
    <div className="mt-2.5 rounded-[var(--gw-radius-control)] border border-[var(--gw-border)] px-3 py-2.5">
      <span className="gw-label-ko">왜 그런가</span>
      <div className="mt-1.5 space-y-1">
        <Row label="더 내야 하는 금액" value={`${odds.toCallBb}bb`} />
        <Row label="판에 깔린 금액" value={`${odds.potBb}bb`} />
        <Row label="본전에 필요한 승률" value={`${odds.needPct}%`} />
        <Row
          label={`${jammer} 올인 레인지 상대 승률`}
          value={equityPct === null ? "…" : `${equityPct}%`}
          color={enough === null ? undefined : enough ? "var(--gw-accent)" : "var(--gw-danger)"}
        />
      </div>
      {enough !== null && (
        <p className="mt-2 text-[11px] leading-relaxed text-[var(--gw-text-muted)]">
          {enough
            ? `필요한 ${odds.needPct}%보다 ${round1(equityPct! - odds.needPct)}%포인트 높습니다. 콜이 남는 자리입니다.`
            : `필요한 ${odds.needPct}%에 ${round1(odds.needPct - equityPct!)}%포인트 모자랍니다. 접는 자리입니다.`}
        </p>
      )}
    </div>
  );
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}

function Row({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="flex-1 text-[12px] text-[var(--gw-text-secondary)]">{label}</span>
      <span
        className="gw-num text-[13px] font-semibold"
        style={{ color: color ?? "var(--gw-text-primary)" }}
      >
        {value}
      </span>
    </div>
  );
}
