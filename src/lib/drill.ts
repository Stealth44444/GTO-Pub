// 프리플랍 드릴. 한 상황을 골라 판단할 가치가 있는 스팟만 연달아 낸다.
//
// 한 판 전체를 치면 판마다 연출과 기다림이 있고, 받는 판단의 절반은 답이 뻔한
// 폴드다. 드릴은 상황(첫 진입 / 오픈 대응 / 올인 대응 / 3벳 대응 …)과 자리를
// 고정하고, 최선과 차선의 EV 차이가 0.05~1bb인 핸드만 준다(spotValue.ts).
// 짧은 시간에 경계선 판단을 많이 하는 것이 목적이다.
//
// 어떤 상황이 있는지는 데이터가 정한다. 20bb 풀이에는 3벳이 올인 하나뿐이고,
// 30bb 풀이에는 크기 있는 3벳·4벳 올인·플랫 뒤 스퀴즈가 있다. 푸시폴드 깊이에는
// 첫 진입과 올인 대응만 있다.
//
// import에 .ts를 붙이는 이유는 hand.ts와 같다(node 테스트와 Next 양쪽에서 로드).

import { evAt, type SeatsData, type Stage } from "./seatGame.ts";
import { isStudyWorthy, spotBand, spotGap } from "./spotValue.ts";

export type DrillKind =
  | "firstIn"
  | "vsOpen"
  | "vsJam"
  | "vsThreeBet"
  | "vsFourBet"
  | "vsFlat"
  | "vsSqueeze";

export type Drill = { seat: string; stage: Stage; hand: string };

const SEAT_ORDER = ["UTG", "UTG1", "UTG2", "LJ", "HJ", "CO", "BTN", "SB", "BB"];

const ALL_KINDS: DrillKind[] = [
  "firstIn",
  "vsOpen",
  "vsJam",
  "vsThreeBet",
  "vsFourBet",
  "vsFlat",
  "vsSqueeze",
];

export const DRILL_LABEL: Record<DrillKind, string> = {
  firstIn: "첫 진입",
  vsOpen: "오픈 대응",
  vsJam: "올인 대응",
  vsThreeBet: "3벳 대응",
  vsFourBet: "4벳 대응",
  vsFlat: "스퀴즈",
  vsSqueeze: "스퀴즈 대응",
};

/** 이 데이터로 할 수 있는 드릴. 한 자리라도 그 상황이 있으면 넣는다. */
export function drillKinds(data: SeatsData): DrillKind[] {
  return ALL_KINDS.filter((k) => drillSeats(data, k).length > 0);
}

/** 이 드릴에서 히어로가 앉을 수 있는 자리. */
export function drillSeats(data: SeatsData, kind: DrillKind): string[] {
  return SEAT_ORDER.filter((s) => situations(data, kind, s).length > 0);
}

const before = (seat: string) => SEAT_ORDER.slice(0, SEAT_ORDER.indexOf(seat));
const after = (seat: string) => SEAT_ORDER.slice(SEAT_ORDER.indexOf(seat) + 1);
const between = (a: string, b: string) =>
  SEAT_ORDER.slice(SEAT_ORDER.indexOf(a) + 1, SEAT_ORDER.indexOf(b));

/** 히어로가 이 자리에 앉아 만날 수 있는 이 종류의 상황들. */
function situations(data: SeatsData, kind: DrillKind, seat: string): Stage[] {
  const S = data.seats;
  if (kind === "firstIn") return S[seat]?.open || S[seat]?.openJam ? [{ kind: "firstIn" }] : [];
  if (kind === "vsOpen") {
    return before(seat)
      .filter((o) => S[o]?.open)
      .map((o) => ({ kind: "vsOpen", opener: o }));
  }
  if (kind === "vsJam") {
    return before(seat)
      .filter((j) => S[j]?.openJam && S[j]?.vsJamCall?.[seat])
      .map((j) => ({ kind: "vsJam", jammer: j, iOpened: false }));
  }
  if (kind === "vsThreeBet") {
    return after(seat)
      .filter((k) => S[seat]?.vsThreeBetCall?.[k])
      .map((k) => ({ kind: "vsThreeBet", threeBettor: k }));
  }
  if (kind === "vsFourBet") {
    return before(seat)
      .filter((o) => S[o]?.vsFourBetCall?.[seat])
      .map((o) => ({ kind: "vsFourBet", opener: o }));
  }
  if (kind === "vsFlat") {
    const out: Stage[] = [];
    for (const o of before(seat)) {
      for (const c of between(o, seat)) {
        if (S[o]?.vsFlatJam?.[c]?.[seat]) out.push({ kind: "vsFlat", opener: o, caller: c });
      }
    }
    return out;
  }
  // 스퀴즈 대응: 내가 열었거나(뒤에서 플랫과 스퀴즈), 내가 플랫했다(앞의 오픈, 뒤의 스퀴즈).
  const out: Stage[] = [];
  for (const c of after(seat)) {
    for (const q of after(c)) {
      if (S[seat]?.vsSqueezeOpenerCall?.[c]?.[q]) {
        out.push({ kind: "vsSqueeze", opener: seat, caller: c, squeezer: q, iOpened: true });
      }
    }
  }
  for (const o of before(seat)) {
    for (const q of after(seat)) {
      if (S[o]?.vsSqueezeCallerCall?.[seat]?.[q]) {
        out.push({ kind: "vsSqueeze", opener: o, caller: seat, squeezer: q, iOpened: false });
      }
    }
  }
  return out;
}

/**
 * 이 상황에 이 핸드로 올 수 있는가. 앞에서 내가 한 선택(오픈·3벳·플랫)이 있는
 * 상황은 그 레인지에 드는 핸드만 준다 — 72o로 4벳을 맞는 스팟은 공부가 아니다.
 */
function reachable(data: SeatsData, seat: string, stage: Stage, hand: string): boolean {
  const S = data.seats;
  if (stage.kind === "vsThreeBet") return (S[seat]?.open?.[hand] ?? 0) > 0;
  if (stage.kind === "vsFourBet") {
    return (S[stage.opener]?.vsOpenThreeBet?.[seat]?.[hand] ?? 0) > 0;
  }
  if (stage.kind === "vsSqueeze") {
    return stage.iOpened
      ? (S[seat]?.open?.[hand] ?? 0) > 0
      : (S[stage.opener]?.vsOpenCall?.[seat]?.[hand] ?? 0) > 0;
  }
  return true;
}

const combos = (h: string) => (h.length === 2 ? 6 : h.endsWith("s") ? 4 : 12);

/**
 * 다음 드릴 스팟. 자리를 정하지 않으면 매번 고른다. 판단할 가치가 있는 핸드가
 * 하나도 없는 상황은 건너뛴다. 끝내 못 찾으면 null.
 *
 * accept를 주면 상황을 그 확률로 받아들인다(적응형 딜, adaptive.ts). 자주 잃는
 * 자리·상황이 더 자주 나온다. 스무 번 거절되면 더는 묻지 않는다 — 가려내다
 * 스팟을 못 내는 일은 없어야 한다.
 *
 * hard면 최선과 차선의 차이가 0.25bb 이하인 근소한 스팟만 낸다. 어느 쪽인지
 * 감으로는 안 갈리고 레인지를 정확히 알아야 맞히는 곳이다.
 */
export function nextDrill(
  data: SeatsData,
  kind: DrillKind,
  seat: string | null,
  rnd: () => number,
  accept?: (seat: string, stage: Stage) => boolean,
  hard = false,
): Drill | null {
  const seats = seat ? [seat] : drillSeats(data, kind);
  if (seats.length === 0) return null;
  for (let tries = 0; tries < 60; tries++) {
    const s = seats[Math.floor(rnd() * seats.length)];
    const stages = situations(data, kind, s);
    if (stages.length === 0) continue;
    const stage = stages[Math.floor(rnd() * stages.length)];
    if (accept && tries < 20 && !accept(s, stage)) continue;
    const pool = data.hands.filter((h) => {
      if (!reachable(data, s, stage, h)) return false;
      const ev = evAt(data, s, stage, h);
      if (!isStudyWorthy(ev)) return false;
      return !hard || spotBand(spotGap(ev) ?? 0) === "close";
    });
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
