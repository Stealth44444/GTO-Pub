// 깊이별 데이터를 받아 둔다. 브라우저 전용 — 노드 테스트는 depthData.ts를 직접 쓴다.
//
// 콜 데이터(84KB gz)는 번들에 넣지 않는다. 런이 15bb 아래로 내려갈 때 처음 받는다.

import pushfold from "@/data/pushfold.json";
import { SEATS_DATA } from "./seatsData";
import { seatNames } from "./poker";
import { buildDepthData, type CallsJson, type PushfoldJson } from "./depthData";
import type { SeatsData } from "./seatGame";

/** 한 판 전체 데이터. 이 깊이 이상은 이걸 쓴다. */
export const FULL_DATA: SeatsData = SEATS_DATA;

const cache = new Map<number, SeatsData>();
let calls: Promise<CallsJson> | null = null;

export function loadDepthData(depthBb: number): Promise<SeatsData> {
  if (depthBb >= FULL_DATA.stackBb) return Promise.resolve(FULL_DATA);
  const hit = cache.get(depthBb);
  if (hit) return Promise.resolve(hit);
  calls ??= import("@/data/pushfold-calls.json").then(
    (m) => (m.default ?? m) as unknown as CallsJson,
  );
  return calls
    .then((c) => {
      const data = buildDepthData(
        pushfold as unknown as PushfoldJson,
        c,
        depthBb,
        seatNames(FULL_DATA.tableSize),
      );
      cache.set(depthBb, data);
      return data;
    })
    .catch((err: unknown) => {
      // 실패한 약속을 붙잡고 있으면 다시 시도해도 계속 실패한다.
      calls = null;
      throw err;
    });
}
