// 프리플랍 드릴. 한 상황을 골라 판단할 가치가 있는 스팟만 연달아 낸다.
//
// 한 판 전체를 치면 판마다 연출과 기다림이 있고, 받는 판단의 절반은 답이 뻔한
// 폴드다. 드릴은 상황(첫 진입 / 오픈 대응 / 올인 대응 / 3벳 대응)과 자리를
// 고정하고, 최선과 차선의 EV 차이가 0.05~1bb인 핸드만 준다(spotValue.ts).
// 짧은 시간에 경계선 판단을 많이 하는 것이 목적이다.
//
// import에 .ts를 붙이는 이유는 hand.ts와 같다(node 테스트와 Next 양쪽에서 로드).

import { evAt, type SeatsData, type Stage } from "./seatGame.ts";
import { isStudyWorthy } from "./spotValue.ts";

export type DrillKind = "firstIn" | "vsOpen" | "vsJam" | "vsThreeBet";

export type Drill = { seat: string; stage: Stage; hand: string };

const SEAT_ORDER = ["UTG", "UTG1", "UTG2", "LJ", "HJ", "CO", "BTN", "SB", "BB"];

export const DRILL_LABEL: Record<DrillKind, string> = {
  firstIn: "첫 진입",
  vsOpen: "오픈 대응",
  vsJam: "올인 대응",
  vsThreeBet: "3벳 대응",
};

/** 이 데이터로 할 수 있는 드릴. 3벳 대응은 크기 있는 3벳이 있는 데이터에만 있다. */
export function drillKinds(data: SeatsData): DrillKind[] {
  const kinds: DrillKind[] = ["firstIn", "vsOpen", "vsJam"];
  if (data.threeBetToBb) kinds.push("vsThreeBet");
  return kinds;
}

/** 이 드릴에서 히어로가 앉을 수 있는 자리. */
export function drillSeats(data: SeatsData, kind: DrillKind): string[] {
  const seats = SEAT_ORDER.filter((s) => s in data.seats || s === "BB");
  if (kind === "firstIn" || kind === "vsThreeBet") return seats.filter((s) => s !== "BB");
  return seats.slice(1);
}

/** 히어로 자리 앞에서 이 상황을 만들 수 있는 상대 자리들. */
function situations(data: SeatsData, kind: DrillKind, seat: string): Stage[] {
  const before = SEAT_ORDER.slice(0, SEAT_ORDER.indexOf(seat));
  const after = SEAT_ORDER.slice(SEAT_ORDER.indexOf(seat) + 1);
  if (kind === "firstIn") return data.seats[seat]?.open || data.seats[seat]?.openJam ? [{ kind: "firstIn" }] : [];
  if (kind === "vsOpen") {
    return before.filter((o) => data.seats[o]?.open).map((o) => ({ kind: "vsOpen", opener: o }));
  }
  if (kind === "vsJam") {
    return before
      .filter((j) => data.seats[j]?.openJam && data.seats[j]?.vsJamCall?.[seat])
      .map((j) => ({ kind: "vsJam", jammer: j, iOpened: false }));
  }
  return after
    .filter((k) => data.seats[seat]?.vsThreeBetCall?.[k])
    .map((k) => ({ kind: "vsThreeBet", threeBettor: k }));
}

const combos = (h: string) => (h.length === 2 ? 6 : h.endsWith("s") ? 4 : 12);

/**
 * 다음 드릴 스팟. 자리를 정하지 않으면 매번 고른다. 판단할 가치가 있는 핸드가
 * 하나도 없는 상황은 건너뛴다. 끝내 못 찾으면 null.
 *
 * 3벳 대응은 히어로가 열었다는 상황이라, 오픈 레인지에 드는 핸드만 준다.
 */
export function nextDrill(
  data: SeatsData,
  kind: DrillKind,
  seat: string | null,
  rnd: () => number,
): Drill | null {
  const seats = seat ? [seat] : drillSeats(data, kind);
  for (let tries = 0; tries < 40; tries++) {
    const s = seats[Math.floor(rnd() * seats.length)];
    const stages = situations(data, kind, s);
    if (stages.length === 0) continue;
    const stage = stages[Math.floor(rnd() * stages.length)];
    const open = data.seats[s]?.open;
    const pool = data.hands.filter(
      (h) =>
        isStudyWorthy(evAt(data, s, stage, h)) &&
        (stage.kind !== "vsThreeBet" || (open?.[h] ?? 0) > 0),
    );
    if (pool.length === 0) continue;
    const total = pool.reduce((a, h) => a + combos(h), 0);
    let r = rnd() * total;
    let hand = pool[pool.length - 1];
    for (const h of pool) {
      r -= combos(h);
      if (r <= 0) {
        hand = h;
        break;
      }
    }
    return { seat: s, stage, hand };
  }
  return null;
}
