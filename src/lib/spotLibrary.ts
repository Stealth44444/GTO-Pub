// 포스트플랍 스팟 묶음을 필요할 때 하나씩 받아온다.
//
// 스팟 하나가 1MB(gzip 175KB)라 전부 번들에 넣을 수 없다. 목록만 먼저 받고
// 실제로 칠 보드만 내려받는다. 다음 판에 쓸 보드는 미리 받아둬서, 판이
// 끝나고 다음 판을 시작할 때 기다리지 않게 한다.

import type { SolvedSpot } from "./tree";

export type SpotEntry = {
  file: string;
  flop: string;
  turn: string;
  river: string;
  startingPotBb: number;
  effectiveStackBb: number;
  nodeCount: number;
};

const BASE = "/postflop";

let index: SpotEntry[] | null = null;
let indexPending: Promise<SpotEntry[]> | null = null;
const cache = new Map<string, SolvedSpot>();
const inFlight = new Map<string, Promise<SolvedSpot>>();

export function spotIndexReady(): boolean {
  return index !== null;
}

export function loadSpotIndex(): Promise<SpotEntry[]> {
  if (index) return Promise.resolve(index);
  indexPending ??= fetch(`${BASE}/index.json`)
    .then((res) => {
      if (!res.ok) throw new Error(`스팟 목록을 받지 못했습니다 (${res.status})`);
      return res.json() as Promise<{ spots: SpotEntry[] }>;
    })
    .then((raw) => {
      index = raw.spots;
      return index;
    });
  return indexPending;
}

/**
 * 스팟은 gzip으로 저장돼 있다. 원본이 1MB, 압축본이 175KB라 저장소 크기가
 * 6배 차이 난다. 전송량은 어차피 서버가 압축해 같으므로 잃는 것이 없다.
 */
async function fetchSpot(file: string): Promise<SolvedSpot> {
  const res = await fetch(`${BASE}/${file}`);
  if (!res.ok) throw new Error(`보드를 받지 못했습니다 (${res.status})`);
  const stream = res.body?.pipeThrough(new DecompressionStream("gzip"));
  if (!stream) throw new Error("보드를 푸는 데 실패했습니다");
  return JSON.parse(await new Response(stream).text()) as SolvedSpot;
}

export function loadSpot(entry: SpotEntry): Promise<SolvedSpot> {
  const cached = cache.get(entry.file);
  if (cached) return Promise.resolve(cached);

  let pending = inFlight.get(entry.file);
  if (!pending) {
    pending = fetchSpot(entry.file)
      .then((spot) => {
        cache.set(entry.file, spot);
        inFlight.delete(entry.file);
        return spot;
      })
      .catch((err) => {
        inFlight.delete(entry.file);
        throw err;
      });
    inFlight.set(entry.file, pending);
  }
  return pending;
}

/** 다음 판에 쓸 보드를 미리 받아둔다. 실패해도 조용히 넘긴다 — 그때 다시 받으면 된다. */
export function prefetchSpot(entry: SpotEntry): void {
  void loadSpot(entry).catch(() => {});
}

/**
 * 다음에 칠 보드를 고른다. 바로 직전 보드는 피한다 — 같은 보드가 연달아 나오면
 * 보드가 여러 개라는 사실 자체가 전달되지 않는다.
 */
export function pickSpotEntry(
  entries: SpotEntry[],
  rnd: () => number,
  avoidFile?: string,
): SpotEntry {
  const pool = entries.length > 1 ? entries.filter((e) => e.file !== avoidFile) : entries;
  return pool[Math.floor(rnd() * pool.length)];
}
