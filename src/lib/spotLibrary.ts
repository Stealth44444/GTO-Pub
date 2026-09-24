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

/**
 * 오프너 자리 구간별 보드. 있으면 자리에 맞는 걸 쓰고, 없으면 기본 목록으로
 * 떨어진다 — 그건 BTN 오픈-BB 콜 조건이라 다른 자리 조합에는 근사다.
 */
let buckets: Record<string, SpotEntry[]> | null = null;
let bucketPending: Promise<Record<string, SpotEntry[]>> | null = null;

/** 어느 자리가 어느 구간인가. 오픈 레인지 폭이 비슷한 자리끼리 묶는다. */
const BUCKET_OF: Record<string, string> = {
  UTG: "early",
  UTG1: "early",
  UTG2: "early",
  LJ: "middle",
  HJ: "middle",
  CO: "late",
  BTN: "late",
  SB: "sb",
};

export function bucketForOpener(seat: string): string | null {
  return BUCKET_OF[seat] ?? null;
}

function loadBuckets(): Promise<Record<string, SpotEntry[]>> {
  if (buckets) return Promise.resolve(buckets);
  bucketPending ??= fetch(`${BASE}/index-buckets.json`)
    .then((res) => (res.ok ? (res.json() as Promise<{ buckets: Record<string, SpotEntry[]> }>) : null))
    .then((raw) => {
      buckets = raw?.buckets ?? {};
      return buckets;
    })
    .catch(() => {
      // 아직 만들어지지 않았다. 기본 목록으로 간다.
      buckets = {};
      return buckets;
    });
  return bucketPending;
}

/**
 * 이 오프너 자리에 맞는 보드 목록. 구간 데이터가 없으면 null을 돌려주고,
 * 부르는 쪽이 기본 목록을 쓴다.
 */
export async function spotsForOpener(seat: string): Promise<SpotEntry[] | null> {
  const name = bucketForOpener(seat);
  if (!name) return null;
  const all = await loadBuckets();
  const list = all[name];
  return list && list.length > 0 ? list : null;
}
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

/**
 * 이름만으로 보드를 받아온다. 복습은 목록을 거치지 않고 기록에 남은 파일
 * 이름으로 바로 찾는다 — 그 판을 칠 때 쓴 목록이 지금 목록과 같다는 보장이
 * 없기 때문이다.
 */
export function loadSpotFile(file: string): Promise<SolvedSpot> {
  const cached = cache.get(file);
  if (cached) return Promise.resolve(cached);

  let pending = inFlight.get(file);
  if (!pending) {
    pending = fetchSpot(file)
      .then((spot) => {
        cache.set(file, spot);
        inFlight.delete(file);
        return spot;
      })
      .catch((err) => {
        inFlight.delete(file);
        throw err;
      });
    inFlight.set(file, pending);
  }
  return pending;
}

export function loadSpot(entry: SpotEntry): Promise<SolvedSpot> {
  return loadSpotFile(entry.file);
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
