// 포스트플랍 스팟 묶음을 만든다.
// 실행: node --experimental-strip-types scripts/build-postflop-spots.ts
//
// 비싼 건 솔브뿐이라 플랍 하나를 풀고 런아웃 여러 개를 뽑는다. 익스포터가
// 그렇게 동작하므로 여기서는 플랍마다 한 번만 부른다.

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { loadRanges } from "./preflop-ranges.ts";

const EXPORTER = "tools/spot-exporter/target/release/spot-exporter.exe";
const OUT_DIR = "public/postflop";
const TAG = "srp-btn-bb-20bb";
const RUNOUTS_PER_FLOP = 2;

// 타깃 게임은 20bb 스택에 BB 앤티 1bb다(pushfold 데이터와 같은 전제여야 한다).
// BTN이 2.5bb로 열고 BB가 받으면:
//   팟   = BTN 2.5 + BB 2.5 + SB 0.5 + 앤티 1 = 6.5bb
//   남은 = BTN 20-2.5 = 17.5 / BB 20-2.5-1 = 16.5 → 유효 16.5bb
// 앤티를 빼면 SPR이 2.5가 아니라 3.6이 되어 전략이 통째로 달라진다.
const POT_CHIPS = 65;
const STACK_CHIPS = 165;

/**
 * 보드 질감을 고르게 덮는 플랍 모음. 무작위로 뽑으면 비슷한 보드가 몰려서
 * 정작 배워야 할 상황(페어보드, 모노톤, 커넥티드 로우)이 빠진다.
 *
 * 축은 셋이다. 높이(A·K·Q / J·T·9 / 8 이하), 무늬(레인보우 / 투톤 / 모노톤),
 * 연결성(드라이 / 갭 / 커넥티드). 여기에 페어보드를 따로 얹는다.
 */
const FLOPS = [
  // 하이 — A·K·Q
  "As7h2c", // 드라이 레인보우. 레인지 우위가 가장 크게 나는 보드
  "Ah8h3d", // 투톤
  "Ac9c5c", // 모노톤
  "AdKdQh", // 브로드웨이 투톤
  "Ks8d3h", // 드라이 레인보우
  "KsQs7h", // 투톤 커넥티드
  "Qh9d4s", // 드라이 레인보우
  "QdJd6c", // 투톤 커넥티드
  // 미들 — J·T·9
  "Jh7d2c", // 드라이
  "JsTs5h", // 투톤 커넥티드
  "Js7s3s", // 모노톤
  "Td9d6h", // 투톤 커넥티드 (기존 스팟)
  "Th6s3d", // 드라이
  "9s8s4h", // 투톤 커넥티드
  "9h5d2c", // 드라이
  // 로우 — 8 이하
  "8d7d3c", // 투톤 커넥티드
  "8h5c2d", // 드라이
  "7s6s5h", // 투톤 스트레이트 보드
  "7h4d2s", // 드라이
  "6c5d4h", // 레인보우 스트레이트 보드
  "5h4h2c", // 투톤 로우
  // 페어보드
  "AsAd7c",
  "KhKs4d",
  "9c9h2s",
  "6s6d3h",
];

const RANKS = "23456789TJQKA";
const SUITS = "cdhs";

/** 같은 플랍이면 늘 같은 런아웃이 나오도록 플랍 문자열로 씨앗을 만든다. */
function seedFrom(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function lcg(seed: number): () => number {
  let s = seed;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

/** 플랍에 쓰인 카드를 뺀 나머지 덱. */
function remainingDeck(flop: string): string[] {
  const used = new Set(flop.match(/../g) ?? []);
  const deck: string[] = [];
  for (const r of RANKS) {
    for (const s of SUITS) {
      const card = `${r}${s}`;
      if (!used.has(card)) deck.push(card);
    }
  }
  return deck;
}

/**
 * 런아웃은 실제로도 무작위다. 손으로 고르면 "배우기 좋은 런아웃"만 남아
 * 오히려 편향되므로, 씨앗만 고정하고 뽑는다.
 */
function pickRunouts(flop: string, count: number): string[] {
  const rnd = lcg(seedFrom(flop));
  const deck = remainingDeck(flop);
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

type SpotShape = {
  startingPotBb: number;
  rootEvByPlayer: [number[], number[]];
  handWeightsByPlayer: [number[], number[]];
};

function weightedMean(values: number[], weights: number[]): number {
  let sum = 0;
  let total = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i] * weights[i];
    total += weights[i];
  }
  return total > 0 ? sum / total : 0;
}

/**
 * 플랍 루트에서 양쪽의 평균 EV를 더하면 그 시점의 팟이 되어야 한다. 한쪽이
 * 가져가는 것이 곧 다른 쪽이 못 가져가는 것이기 때문이다.
 *
 * 다만 정확한 등식은 아니다. 두 레인지는 같은 카드를 쥘 수 없어 서로 상관돼
 * 있는데, 각자 따로 가중평균하면 그 카드 제거 효과가 빠져 팟의 몇 % 만큼
 * 어긋난다. 그래서 느슨하게 잡는다.
 *
 * 이 검사가 잡으려는 건 자릿수 사고다. EV를 칩 단위로 내보낸 적이 있었고,
 * 그때 이 합이 정확히 10배로 벌어졌다. EV가 틀리면 채점이 통째로 틀린다.
 */
function assertZeroSum(spot: SpotShape, file: string): void {
  const oop = weightedMean(spot.rootEvByPlayer[0], spot.handWeightsByPlayer[0]);
  const ip = weightedMean(spot.rootEvByPlayer[1], spot.handWeightsByPlayer[1]);
  const gap = Math.abs(oop + ip - spot.startingPotBb);
  if (gap > Math.max(0.3, spot.startingPotBb * 0.05)) {
    throw new Error(
      `${file}: 루트 EV 합 ${(oop + ip).toFixed(3)}bb 가 팟 ${spot.startingPotBb}bb 와 ` +
        `${gap.toFixed(3)}bb 어긋납니다. EV 단위(칩 vs bb)를 확인하세요.`,
    );
  }
}

type IndexEntry = {
  file: string;
  flop: string;
  turn: string;
  river: string;
  startingPotBb: number;
  effectiveStackBb: number;
  nodeCount: number;
};

// 프리플랍 솔브 결과가 있으면 그 레인지로 푼다. 없으면 익스포터의 기본값(넓은
// 가정 레인지)으로 간다 — 첫 바퀴는 그렇게 시작할 수밖에 없다.
const HAND_ORDER = JSON.parse(
  readFileSync("scripts/data/equity.json", "utf8"),
).hands as string[];
const ranges = loadRanges(HAND_ORDER);
console.log(ranges ? "레인지: 프리플랍 솔브 결과 사용" : "레인지: 익스포터 기본값 사용");

mkdirSync(OUT_DIR, { recursive: true });

const entries: IndexEntry[] = [];
const startedAt = Date.now();
let totalBytes = 0;

FLOPS.forEach((flop, i) => {
  const runouts = pickRunouts(flop, RUNOUTS_PER_FLOP);
  const label = `[${i + 1}/${FLOPS.length}] ${flop} · ${runouts.join(" ")}`;
  process.stdout.write(`${label} ... `);
  const at = Date.now();

  const stdout = execFileSync(
    EXPORTER,
    [
      "--flop", flop,
      "--runouts", runouts.join(","),
      "--outdir", OUT_DIR,
      "--tag", TAG,
      "--pot", String(POT_CHIPS),
      "--stack", String(STACK_CHIPS),
      ...(ranges ? ["--oop-range", ranges.oop, "--ip-range", ranges.ip] : []),
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  );

  for (const line of stdout.split("\n")) {
    if (!line.startsWith("SPOT\t")) continue;
    const [, file, f, turn, river, pot, stack, nodes] = line.trim().split("\t");
    // 원본 1MB를 그대로 두면 저장소가 50MB가 된다. 전송량은 어차피 압축돼
    // 같으므로, 압축본만 남기고 원본은 지운다. 앱이 받아서 푼다.
    const raw = readFileSync(`${OUT_DIR}/${file}`);
    assertZeroSum(JSON.parse(raw.toString("utf8")) as SpotShape, file);
    const gz = gzipSync(raw, { level: 9 });
    writeFileSync(`${OUT_DIR}/${file}.gz`, gz);
    rmSync(`${OUT_DIR}/${file}`);
    totalBytes += gz.length;
    entries.push({
      file: `${file}.gz`,
      flop: f,
      turn,
      river,
      startingPotBb: Number(pot),
      effectiveStackBb: Number(stack),
      nodeCount: Number(nodes),
    });
  }
  console.log(`${((Date.now() - at) / 1000).toFixed(0)}초`);
});

writeFileSync(`${OUT_DIR}/index.json`, JSON.stringify({ spots: entries }, null, 2));
console.log(
  `\n스팟 ${entries.length}개 · ${(totalBytes / (1024 * 1024)).toFixed(1)}MB · ` +
    `${((Date.now() - startedAt) / 60000).toFixed(1)}분 · ${OUT_DIR}/index.json 기록`,
);
