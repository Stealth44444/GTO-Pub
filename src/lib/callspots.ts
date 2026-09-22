// 올인 대응(콜/폴드) 데이터. 올인 트레이너만 쓰는 사람이 이 84KB를 같이 받을
// 이유가 없으므로, 해당 카테고리를 시작할 때 비로소 불러온다.

export type CallSpot = {
  tableSize: number;
  stackBb: number;
  anteBb: number;
  shoverPosition: string;
  /** 이 레인지를 공유하는 자리들. 블라인드를 내지 않은 자리들은 결과가 같다. */
  callerPositions: string[];
  callFrequencyPct: number;
  call: Record<string, number>;
  /** 콜의 EV(폴드 대비, bb). hands 순서의 배열. */
  callEvBb: number[];
};

type CallData = {
  hands: string[];
  index: Map<string, number>;
  spots: CallSpot[];
};

let data: CallData | null = null;
let pending: Promise<void> | null = null;

export function callDataReady(): boolean {
  return data !== null;
}

export function loadCallData(): Promise<void> {
  if (data) return Promise.resolve();
  pending ??= import("@/data/pushfold-calls.json").then((mod) => {
    const raw = (mod.default ?? mod) as unknown as { hands: string[]; callSpots: CallSpot[] };
    data = {
      hands: raw.hands,
      index: new Map(raw.hands.map((h, i) => [h, i])),
      spots: raw.callSpots,
    };
  });
  return pending;
}

export function findCallSpot(
  tableSize: number,
  stackBb: number,
  shoverPosition: string,
  callerPosition: string,
): CallSpot | undefined {
  return data?.spots.find(
    (s) =>
      s.tableSize === tableSize &&
      s.stackBb === stackBb &&
      s.shoverPosition === shoverPosition &&
      s.callerPositions.includes(callerPosition),
  );
}

/** 콜의 EV(bb). 폴드가 0이므로 이 값이 두 액션의 EV 차이다. */
export function callEv(spot: CallSpot, handCode: string): number | null {
  const i = data?.index.get(handCode);
  if (i === undefined) return null;
  const ev = spot.callEvBb[i];
  return ev === undefined ? null : ev;
}
