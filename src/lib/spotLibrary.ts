// 포스트플랍 스팟 묶음을 필요할 때 하나씩 받아온다.
//
// 스팟 하나가 1MB(gzip 175KB)라 전부 번들에 넣을 수 없다. 목록만 먼저 받고
// 실제로 칠 보드만 내려받는다. 다음 판에 쓸 보드는 미리 받아둬서, 판이
// 끝나고 다음 판을 시작할 때 기다리지 않게 한다.

import { SEATS_DATA } from "./seatsData";
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

// 보드가 어디 있는가. 조합과 런아웃이 늘면 수백 MB라 저장소 대신 Supabase
// Storage의 공개 버킷에 둔다(scripts/upload-boards.ts). 공개 읽기 전용이라
// 주소를 코드에 둬도 된다. 로컬 public/postflop으로 돌리려면
// NEXT_PUBLIC_POSTFLOP_BASE=/postflop.
//
// 깊이마다 보드가 따로 있다. 20bb는 예전 이름(v1) 그대로이고 나머지는 꼬리표를
// 붙인다(scripts/game.ts의 withDepth와 같은 규칙). 로컬 폴더도 같다 —
// public/postflop, public/postflop-30bb.
const REMOTE = "https://aenvvzxtafuwqybwdiqw.supabase.co/storage/v1/object/public/postflop";

/** 앱의 기본 깊이. 깊이를 주지 않은 호출은 이 깊이의 보드를 쓴다. */
const DEFAULT_DEPTH = SEATS_DATA.stackBb;

function baseFor(depth: number): string {
  const suffix = depth === 20 ? "" : `-${depth}bb`;
  const local = process.env.NEXT_PUBLIC_POSTFLOP_BASE;
  return local ? `${local}${suffix}` : `${REMOTE}/v1${suffix}`;
}

const indexes = new Map<number, Promise<SpotEntry[]>>();

/**
 * 오프너 자리 구간별 보드. 있으면 자리에 맞는 걸 쓰고, 없으면 기본 목록으로
 * 떨어진다 — 그건 BTN 오픈-BB 콜 조건이라 다른 자리 조합에는 근사다.
 */
const bucketSets = new Map<number, Promise<Record<string, SpotEntry[]>>>();

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

function loadBuckets(depth: number): Promise<Record<string, SpotEntry[]>> {
  let pending = bucketSets.get(depth);
  if (!pending) {
    pending = fetch(`${baseFor(depth)}/index-buckets.json`)
      .then((res) =>
        res.ok ? (res.json() as Promise<{ buckets: Record<string, SpotEntry[]> }>) : null,
      )
      .then((raw) => raw?.buckets ?? {})
      // 아직 만들어지지 않았다. 기본 목록으로 간다.
      .catch(() => ({}));
    bucketSets.set(depth, pending);
  }
  return pending;
}

/**
 * 이 깊이의 보드가 올라가 있는가. 런은 이걸 보고 그 깊이를 칠지 정한다 —
 * 프리플랍 풀이만 있고 보드가 없으면 플랍에서 판이 멈춘다.
 */
export async function hasBoards(depth: number): Promise<boolean> {
  const all = await loadBuckets(depth);
  return Object.values(all).some((list) => list.length > 0);
}

/**
 * 콜러가 어떤 자리냐에 따른 구간 꼬리표. 블라인드 콜러는 플랍에서 오프너보다
 * 먼저 치고(OOP), 그 밖의 콜러는 오프너 뒤에서 친다(IP). 누가 먼저 치는지가
 * 다르면 트리의 두 플레이어가 뒤바뀌므로 같은 보드를 쓸 수 없다.
 */
function callerSuffix(caller: string): string {
  if (caller === "BB") return "";
  if (caller === "SB") return "-sb";
  return "-ip";
}

/**
 * 이 오프너·콜러 조합에 맞는 보드 목록과, 그게 얼마나 맞는지.
 *
 *   exact  — 오프너 구간과 콜러 종류(BB / SB / 그 밖)가 모두 맞는 구간이 있다.
 *   opener — 콜러가 SB인데 SB 구간이 없어 BB 구간을 쓴다. 둘 다 오프너보다
 *            먼저 치므로 역할은 맞고, 콜 레인지만 다르다.
 *
 * 콜러가 IP인데 그 구간이 없으면 null이다. BB 구간으로 대신하면 먼저 치는
 * 오프너에게 BB 레인지가 배정돼 판이 성립하지 않는다.
 */
export async function spotsForPair(
  opener: string,
  caller: string,
  depth = DEFAULT_DEPTH,
): Promise<{ list: SpotEntry[]; fit: "exact" | "opener" } | null> {
  const base = bucketForOpener(opener);
  if (!base) return null;
  const all = await loadBuckets(depth);
  const exact = all[`${base}${callerSuffix(caller)}`];
  if (exact && exact.length > 0) return { list: exact, fit: "exact" };
  if (caller === "SB" && all[base]?.length) return { list: all[base], fit: "opener" };
  return null;
}

const cache = new Map<string, SolvedSpot>();
const inFlight = new Map<string, Promise<SolvedSpot>>();

/**
 * 기본 목록(BTN 오픈-BB 콜). 구간에 맞는 보드가 없을 때 떨어지는 자리다.
 *
 * 20bb 말고는 기본 목록을 따로 만들지 않았다. 그때는 같은 조건의 구간(late,
 * BTN 오픈-BB 콜)을 기본 목록으로 쓴다.
 */
export function loadSpotIndex(depth = DEFAULT_DEPTH): Promise<SpotEntry[]> {
  let pending = indexes.get(depth);
  if (!pending) {
    pending = fetch(`${baseFor(depth)}/index.json`)
      .then(async (res) => {
        if (res.ok) return ((await res.json()) as { spots: SpotEntry[] }).spots;
        const late = (await loadBuckets(depth)).late;
        if (late?.length) return late;
        throw new Error(`스팟 목록을 받지 못했습니다 (${res.status})`);
      })
      .catch((err: unknown) => {
        // 실패한 약속을 붙잡고 있으면 다시 시도해도 계속 실패한다.
        indexes.delete(depth);
        throw err;
      });
    indexes.set(depth, pending);
  }
  return pending;
}

/**
 * 스팟은 gzip으로 저장돼 있다. 원본이 1MB, 압축본이 175KB라 저장소 크기가
 * 6배 차이 난다. 전송량은 어차피 서버가 압축해 같으므로 잃는 것이 없다.
 */
async function fetchSpot(file: string, depth: number): Promise<SolvedSpot> {
  const res = await fetch(`${baseFor(depth)}/${file}`);
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
export function loadSpotFile(file: string, depth = DEFAULT_DEPTH): Promise<SolvedSpot> {
  // 깊이가 다르면 같은 이름이라도 다른 보드다(폴더가 다르다).
  const key = `${depth}:${file}`;
  const cached = cache.get(key);
  if (cached) return Promise.resolve(cached);

  let pending = inFlight.get(key);
  if (!pending) {
    pending = fetchSpot(file, depth)
      .then((spot) => {
        cache.set(key, spot);
        inFlight.delete(key);
        return spot;
      })
      .catch((err) => {
        inFlight.delete(key);
        throw err;
      });
    inFlight.set(key, pending);
  }
  return pending;
}

export function loadSpot(entry: SpotEntry, depth = DEFAULT_DEPTH): Promise<SolvedSpot> {
  return loadSpotFile(entry.file, depth);
}

/** 다음 판에 쓸 보드를 미리 받아둔다. 실패해도 조용히 넘긴다 — 그때 다시 받으면 된다. */
export function prefetchSpot(entry: SpotEntry, depth = DEFAULT_DEPTH): void {
  void loadSpot(entry, depth).catch(() => {});
}

/**
 * 다음에 칠 보드를 고른다. 바로 직전 보드는 피한다 — 같은 보드가 연달아 나오면
 * 보드가 여러 개라는 사실 자체가 전달되지 않는다.
 */
export function pickSpotEntry(
  entries: SpotEntry[],
  rnd: () => number,
  avoidFile?: string,
  /** 이미 누군가 쥔 카드. 플랍·턴·리버 어디에도 나오면 안 된다. */
  avoidCards?: Set<string>,
): SpotEntry {
  const clear = avoidCards
    ? entries.filter(
        (e) => ![...(e.flop.match(/../g) ?? []), e.turn, e.river].some((c) => avoidCards.has(c)),
      )
    : entries;
  const base = clear.length > 0 ? clear : entries;
  const pool = base.length > 1 ? base.filter((e) => e.file !== avoidFile) : base;
  return pool[Math.floor(rnd() * pool.length)];
}
