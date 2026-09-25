"use client";

import { useEffect, useState } from "react";
import { SEATS_DATA } from "@/lib/seatsData";
import { equityVsRange, loadEquity } from "@/lib/equity";
import { jamPotOdds, jamRangeOf } from "@/lib/why";

const DATA = SEATS_DATA;

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
  opener,
  handCode,
}: {
  heroSeat: string;
  jammer: string;
  iOpened: boolean;
  /** 3벳 올인 뒤에 앉아 있었다면 그 오픈을 연 자리. */
  opener?: string;
  handCode: string;
}) {
  const stage = { kind: "vsJam" as const, jammer, iOpened, ...(opener ? { opener } : {}) };
  const [equityPct, setEquityPct] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    const range = jamRangeOf(DATA, heroSeat, stage);
    if (!range) return;
    void loadEquity().then((table) => {
      if (!alive || !table) return;
      setEquityPct(equityVsRange(table, handCode, range));
    });
    return () => {
      alive = false;
    };
    // stage는 아래 세 값에서만 나온다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [heroSeat, jammer, iOpened, opener, handCode]);

  const odds = jamPotOdds(DATA, heroSeat, stage);
  // 승률이 아직 안 왔으면 팟 오즈만 보여준다. 그것만으로도 반은 설명된다.
  const enough = equityPct === null ? null : equityPct >= odds.needPct;

  return (
    <div className="mt-2.5 rounded-[var(--gw-radius-control)] border border-[var(--gw-border)] px-3 py-2.5">
      <div className="space-y-1">
        <Row label="더 내야 하는 금액" value={`${odds.toCallBb}bb`} />
        <Row label="판에 깔린 금액" value={`${odds.potBb}bb`} />
        <Row label="본전에 필요한 승률" value={`${odds.needPct}%`} />
        <Row
          label={`${jammer} 올인 레인지 상대 승률`}
          value={equityPct === null ? "…" : `${equityPct}%`}
          color={enough === null ? undefined : enough ? "var(--gw-accent)" : "var(--gw-danger)"}
        />
      </div>
    </div>
  );
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
