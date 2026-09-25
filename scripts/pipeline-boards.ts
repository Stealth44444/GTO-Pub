// 오프너 구간별로 트레이너가 실제로 치는 보드를 만든다.
//
// 실행: node --experimental-strip-types scripts/pipeline-boards.ts
//
// 지금은 어떤 자리 조합이 플랍에 가든 BTN 오픈-BB 콜 조건으로 풀린 보드 하나를
// 쓴다. CO 대 BTN 팟을 BB 디펜스 레인지로 채점하는 셈이라, 화면에 그렇게
// 적어 두긴 했지만 결국 틀린 값이다.
//
// 구간은 pipeline-buckets.ts와 같다. 오픈 레인지 폭이 비슷한 자리끼리 묶으면
// 플랍에서의 전략도 비슷하다.
//
// 여기서는 --ev-only를 쓰지 않는다. 실제로 치는 보드는 트리 전체가 필요하고,
// 레인지를 벗어난 판단도 채점해야 하므로 --floor도 건다.
//
// 한 구간이 오래 걸려서, 중간에 끊기면 처음부터 다시 할 수 없다. 플랍 하나가
// 끝날 때마다 그 결과를 곁에 적어 두고, 다시 돌릴 때 압축본이 그대로 남아
// 있으면 그 플랍은 건너뛴다.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { flopChips, withDepth } from "./game.ts";

const EXPORTER = process.env.EXPORTER ?? "tools/spot-exporter/target/release/spot-exporter.exe";
const SEATS_FILE = withDepth("src/data/preflop-seats.json");
const OUT_ROOT = withDepth("public/postflop");
const STATUS = withDepth("scripts/data/boards-status.json");
const FLOOR = process.env.FLOOR ?? "0.005";
const RUNOUTS_PER_FLOP = Number(process.env.RUNOUTS ?? 2);

/**
 * 구간 = 오프너 구간 × 콜러 종류. 콜러가 누구냐에 따라 플랍에서 누가 먼저
 * 치는지가 바뀐다 — BB·SB 콜러는 오프너보다 먼저(OOP), 그 밖의 콜러는
 * 오프너 뒤(IP)다. BB 콜러로 푼 보드 하나로 IP 콜러 팟을 치면 먼저 치는
 * 오프너에게 BB 디펜스 레인지가 배정돼, 오프너 핸드 대부분이 레인지 밖이 된다.
 *
 * 각 구간은 대표 조합 하나로 푼다. 레인지 폭이 비슷한 자리끼리는 전략도 비슷하다.
 */
const BUCKETS = [
  { name: "early", opener: "UTG1", caller: "BB" },
  { name: "middle", opener: "HJ", caller: "BB" },
  { name: "late", opener: "BTN", caller: "BB" },
  { name: "sb", opener: "SB", caller: "BB" },
  // IP 콜러 구간이 먼저다. SB 콜러는 없어도 BB 구간으로 역할은 맞게 칠 수 있다.
  { name: "early-ip", opener: "UTG1", caller: "CO" },
  { name: "middle-ip", opener: "HJ", caller: "BTN" },
  { name: "late-ip", opener: "CO", caller: "BTN" },
  { name: "early-sb", opener: "UTG1", caller: "SB" },
  { name: "middle-sb", opener: "HJ", caller: "SB" },
  { name: "late-sb", opener: "BTN", caller: "SB" },
].filter((b) => !process.env.ONLY || process.env.ONLY.split(",").includes(b.name));

/** 플랍에서 콜러가 먼저 치는가. 블라인드만 오프너보다 앞선다. */
function callerIsOop(caller: string): boolean {
  return caller === "BB" || caller === "SB";
}

/**
 * 보드는 질감을 고르게 덮도록 손으로 골랐다. 무작위로 뽑으면 비슷한 보드가
 * 몰려서 정작 배워야 할 상황(페어보드, 모노톤, 커넥티드 로우)이 빠진다.
 */
const FLOPS = [
  "As7h2c", "Ah8h3d", "Ac9c5c", "AdKdQh", "Ks8d3h", "KsQs7h", "Qh9d4s", "QdJd6c",
  "Jh7d2c", "JsTs5h", "Js7s3s", "Td9d6h", "Th6s3d", "9s8s4h", "9h5d2c",
  "8d7d3c", "8h5c2d", "7s6s5h", "7h4d2s", "6c5d4h", "5h4h2c",
  "AsAd7c", "KhKs4d", "9c9h2s", "6s6d3h",
];

const RANKS = "23456789TJQKA";
const SUITS = "cdhs";

function seedFrom(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** 런아웃은 실제로도 무작위다. 씨앗만 고정한다. */
function pickRunouts(flop: string, count: number): string[] {
  const used = new Set(flop.match(/../g) ?? []);
  const deck: string[] = [];
  for (const r of RANKS) for (const s of SUITS) if (!used.has(`${r}${s}`)) deck.push(`${r}${s}`);
  const rnd = lcg(seedFrom(flop));
  const seen = new Set<string>();
  const out: string[] = [];
  while (out.length < count) {
    const turn = deck[Math.floor(rnd() * deck.length)];
    const river = deck[Math.floor(rnd() * deck.length)];
    if (turn === river) continue;
    const key = `${turn}${river}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

type Seats = {
  hands: string[];
  seats: Record<
    string,
    { open?: Record<string, number>; vsOpenCall?: Record<string, Record<string, number>> }
  >;
};

const RANGE_FLOOR = 0.05;
function rangeString(freq: Record<string, number>, hands: string[]): string {
  return hands
    .filter((c) => (freq[c] ?? 0) > 0)
    .map((c) => `${c}:${Math.round(Math.max(freq[c], RANGE_FLOOR) * 1000) / 1000}`)
    .join(",");
}

/**
 * 이 플랍을 이미 뽑아 뒀는가. 곁기록과 압축본이 모두 있어야 인정한다 —
 * 끊긴 지점의 파일은 반쪽일 수 있다.
 */
function doneFlop(dir: string, flop: string): Entry[] | null {
  const side = `${dir}/.done/${flop}.json`;
  if (!existsSync(side)) return null;
  try {
    const saved = JSON.parse(readFileSync(side, "utf8")) as Entry[];
    if (saved.length === 0) return null;
    if (!saved.every((e) => existsSync(`${OUT_ROOT}/${e.file}`))) return null;
    return saved;
  } catch {
    return null;
  }
}

function markFlop(dir: string, flop: string, saved: Entry[]) {
  mkdirSync(`${dir}/.done`, { recursive: true });
  writeFileSync(`${dir}/.done/${flop}.json`, JSON.stringify(saved));
}

function setStatus(step: string, detail?: string) {
  const at = new Date().toISOString();
  mkdirSync("scripts/data", { recursive: true });
  writeFileSync(STATUS, JSON.stringify({ step, detail, at }, null, 1));
  console.log(`[${at.slice(11, 19)}] ${step}${detail ? ` — ${detail}` : ""}`);
}

if (!existsSync(SEATS_FILE)) {
  setStatus("실패", `${SEATS_FILE} 가 없습니다`);
  process.exit(1);
}
const seatsData = JSON.parse(readFileSync(SEATS_FILE, "utf8")) as Seats;

type Entry = {
  file: string;
  flop: string;
  turn: string;
  river: string;
  startingPotBb: number;
  effectiveStackBb: number;
  nodeCount: number;
};

// 이번에 돌리지 않는 구간은 기존 목록을 그대로 둔다. ONLY로 일부만 돌려도
// 나머지 구간이 목록에서 빠지지 않는다.
const index: Record<string, Entry[]> = existsSync(`${OUT_ROOT}/index-buckets.json`)
  ? (JSON.parse(readFileSync(`${OUT_ROOT}/index-buckets.json`, "utf8")) as {
      buckets: Record<string, Entry[]>;
    }).buckets
  : {};
setStatus("시작", `구간 ${BUCKETS.length}개 × 플랍 ${FLOPS.length}개 × 런아웃 ${RUNOUTS_PER_FLOP}`);

for (const bucket of BUCKETS) {
  const opener = seatsData.seats[bucket.opener];
  const openRange = opener?.open;
  const callRange = opener?.vsOpenCall?.[bucket.caller];
  if (!openRange || !callRange) {
    setStatus("건너뜀", `${bucket.name}: ${bucket.opener} 레인지 없음`);
    continue;
  }
  const openStr = rangeString(openRange, seatsData.hands);
  const callStr = rangeString(callRange, seatsData.hands);
  const [oop, ip] = callerIsOop(bucket.caller) ? [callStr, openStr] : [openStr, callStr];
  const { pot, stack } = flopChips(bucket.opener, bucket.caller);
  const dir = `${OUT_ROOT}/${bucket.name}`;
  mkdirSync(dir, { recursive: true });

  const entries: Entry[] = [];
  const started = Date.now();
  let reused = 0;
  FLOPS.forEach((flop, i) => {
    const already = doneFlop(dir, flop);
    if (already) {
      entries.push(...already);
      reused += 1;
      return;
    }
    const runouts = pickRunouts(flop, RUNOUTS_PER_FLOP);
    const stdout = execFileSync(
      EXPORTER,
      [
        "--flop", flop,
        "--runouts", runouts.join(","),
        "--outdir", dir,
        "--tag", bucket.name,
        "--pot", String(pot),
        "--stack", String(stack),
        "--floor", FLOOR,
        "--oop-range", oop,
        "--ip-range", ip,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 1 << 26 },
    );
    const fresh: Entry[] = [];
    for (const line of stdout.split("\n")) {
      if (!line.startsWith("SPOT\t")) continue;
      const [, file, f, turn, river, pot, stack, nodes] = line.trim().split("\t");
      // 원본은 1MB가 넘는다. 압축본만 남기고 앱이 받아서 푼다.
      const raw = readFileSync(`${dir}/${file}`);
      writeFileSync(`${dir}/${file}.gz`, gzipSync(raw, { level: 9 }));
      rmSync(`${dir}/${file}`);
      fresh.push({
        file: `${bucket.name}/${file}.gz`,
        flop: f,
        turn,
        river,
        startingPotBb: Number(pot),
        effectiveStackBb: Number(stack),
        nodeCount: Number(nodes),
      });
    }
    entries.push(...fresh);
    markFlop(dir, flop, fresh);
    if ((i + 1) % 5 === 0) {
      setStatus(
        `${bucket.name} 보드`,
        `${i + 1}/${FLOPS.length} · ${((Date.now() - started) / 60000).toFixed(1)}분`,
      );
    }
  });
  index[bucket.name] = entries;
  writeFileSync(`${OUT_ROOT}/index-buckets.json`, JSON.stringify({ buckets: index }, null, 1));
  setStatus(
    `${bucket.name} 완료`,
    `${entries.length}개 · ${((Date.now() - started) / 60000).toFixed(1)}분${reused ? ` · 플랍 ${reused}개 재사용` : ""}`,
  );
}

setStatus("완료", `구간별 보드 ${Object.values(index).reduce((a, b) => a + b.length, 0)}개`);
