// 푸시/폴드 데이터를 한 판 엔진이 먹는 모양으로 옮긴다.
//
// 런에서 블라인드가 오르면 스택이 15bb 아래로 내려간다. 그 깊이에서는 오픈 없이
// 올인과 폴드만 있다. 따로 화면을 두지 않고 같은 엔진·같은 테이블로 치려면,
// 푸시/폴드 풀이를 SeatsData로 옮기면 된다.
//
// EV 기준점이 다르다. 푸시/폴드 풀이는 "폴드 대비"(폴드 = 0)이고, 엔진은 폴드를
// "낸 블라인드만큼 손해"로 두고 절대값을 비교한다. 그래서 낸 블라인드를 뺀다.
// 두 액션의 차이, 곧 채점은 그대로다.

import type { SeatsData } from "./seatGame.ts";

export type PushfoldJson = {
  anteBb: number;
  hands: string[];
  spots: {
    tableSize: number;
    stackBb: number;
    position: string;
    shove: Record<string, number>;
    shoveEvBb: number[];
  }[];
};

export type CallsJson = {
  hands: string[];
  callSpots: {
    tableSize: number;
    stackBb: number;
    shoverPosition: string;
    callerPositions: string[];
    call: Record<string, number>;
    callEvBb: number[];
  }[];
};

/** 런이 쓰는 푸시/폴드 깊이. 20bb는 한 판 전체 데이터를 쓴다. */
export const PUSHFOLD_DEPTHS = [15, 12, 10, 8];

function posted(seat: string, seats: string[], anteBb: number): number {
  if (seat === seats[seats.length - 1]) return 1 + anteBb;
  if (seat === seats[seats.length - 2]) return 0.5;
  return 0;
}

const round3 = (v: number) => Math.round(v * 1000) / 1000;

export function buildDepthData(
  push: PushfoldJson,
  calls: CallsJson,
  stackBb: number,
  seats: string[],
): SeatsData {
  // 두 파일은 같은 솔버가 같은 순서로 썼다. 어긋나면 EV가 엉뚱한 핸드에 붙는다.
  if (calls.hands.join() !== push.hands.join()) {
    throw new Error("올인 데이터와 콜 데이터의 핸드 순서가 다릅니다");
  }
  const tableSize = seats.length;
  const out: SeatsData["seats"] = {};
  // BB도 자리를 만든다. 없으면 엔진이 그 자리를 "데이터 없음 = 폴드"로 본다.
  for (const seat of seats) {
    out[seat] = {
      vsJamCall: {},
      foldEvBb: -posted(seat, seats, push.anteBb),
      ev: { open: [], openJam: [], vsOpenCall: {}, vsOpenJam: {}, callJam: {}, vsJamCall: {} },
    };
  }

  for (const spot of push.spots) {
    if (spot.tableSize !== tableSize || spot.stackBb !== stackBb) continue;
    const me = out[spot.position];
    if (!me) continue;
    const p = posted(spot.position, seats, push.anteBb);
    me.openJam = spot.shove;
    me.ev.openJam = spot.shoveEvBb.map((v) => round3(v - p));
  }

  for (const spot of calls.callSpots) {
    if (spot.tableSize !== tableSize || spot.stackBb !== stackBb) continue;
    const jammer = out[spot.shoverPosition];
    if (!jammer) continue;
    for (const caller of spot.callerPositions) {
      const p = posted(caller, seats, push.anteBb);
      jammer.vsJamCall![caller] = spot.call;
      jammer.ev.vsJamCall[caller] = spot.callEvBb.map((v) => round3(v - p));
    }
  }

  const missing = seats.slice(0, -1).filter((s) => !out[s].openJam);
  if (missing.length > 0) {
    throw new Error(`${stackBb}bb ${tableSize}인 올인 데이터가 없는 자리: ${missing.join(", ")}`);
  }
  return { tableSize, stackBb, anteBb: push.anteBb, openToBb: 0, hands: push.hands, seats: out };
}
