// 레인지가 전체 패의 몇 %인가.
//
// 핸드 코드 개수로 세면 안 된다. 169개를 똑같이 한 개로 세면 AA(6조합)와
// AKo(12조합)가 같은 무게가 되어, 오프수트가 많은 레인지가 실제보다 좁아
// 보인다. 조합 수로 세야 "전체 패 중 몇 %"라는 말이 맞는 말이 된다.

import type { SeatsData } from "./seatGame.ts";

/** 전체 조합 수. 52장에서 두 장을 고르는 경우. */
const ALL_COMBOS = 1326;

export function combosOf(code: string): number {
  if (code.length === 2) return 6;
  return code[2] === "s" ? 4 : 12;
}

/** 이 레인지가 전체 패에서 차지하는 비율(%). */
export function widthPct(hands: string[], freq?: Record<string, number>): number {
  if (!freq) return 0;
  let n = 0;
  for (const code of hands) {
    const f = freq[code] ?? 0;
    if (f > 0) n += combosOf(code) * f;
  }
  return Math.round((n / ALL_COMBOS) * 1000) / 10;
}

export type SeatWidth = { seat: string; openPct: number; jamPct: number };

/**
 * 앞에서 모두 접었을 때 각 자리가 들어가는 폭.
 *
 * BB는 뺀다. 앞이 다 접으면 BB는 칠 일이 없어 "먼저 들어가는 폭"이라는 말이
 * 성립하지 않는다.
 */
export function openWidths(data: SeatsData): SeatWidth[] {
  return Object.entries(data.seats)
    .filter(([seat]) => seat !== "BB")
    .map(([seat, v]) => ({
      seat,
      openPct: widthPct(data.hands, v.open),
      jamPct: widthPct(data.hands, v.openJam),
    }))
    .filter((r) => r.openPct + r.jamPct > 0);
}
