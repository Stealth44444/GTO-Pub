// 신경망 학습용 플랍 솔브를 만든다.
//
// 실행: EXPORTER=… FLOPS=300 node --experimental-strip-types scripts/nn/gen-flops.ts
//
// 실험의 질문은 하나다 — 솔버가 푼 플랍으로 학습하면 처음 보는 플랍의 정답을
// 채점에 쓸 만큼 맞힐 수 있는가. 그래서 조건은 하나로 고정한다(BTN 오픈, BB 콜,
// 20bb). 학습 대상은 플랍의 첫 두 판단이다: BB의 첫 액션(루트)과 BB가 체크한
// 뒤 BTN의 액션.
//
// 트리 전체는 1MB가 넘는데 필요한 건 두 노드뿐이라, 뽑고 원본은 지운다.
// 끊겨도 다시 돌리면 이미 뽑은 플랍은 건너뛴다.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { flopChips, withDepth } from "../game.ts";

const EXPORTER = process.env.EXPORTER ?? "tools/spot-exporter/target/release/spot-exporter";
const OUT = withDepth("scripts/data/nn/flops");
const TMP = "scripts/data/nn/tmp";
const COUNT = Number(process.env.FLOPS ?? 300);
const SEED = Number(process.env.SEED ?? 20260925);
const LINES = ["", "check"];
const CHIPS = flopChips("BTN", "BB");

type Seats = {
  hands: string[];
  seats: Record<string, { open?: Record<string, number>; vsOpenCall?: Record<string, Record<string, number>> }>;
};
const seats = JSON.parse(readFileSync("src/data/preflop-seats.json", "utf8")) as Seats;

// pipeline-boards.ts와 같은 레인지 문자열. 아주 드문 핸드도 트리에 남긴다.
function rangeString(freq: Record<string, number>): string {
  return seats.hands
    .filter((c) => (freq[c] ?? 0) > 0)
    .map((c) => `${c}:${Math.round(Math.max(freq[c], 0.05) * 1000) / 1000}`)
    .join(",");
}
const ip = rangeString(seats.seats.BTN.open!);
const oop = rangeString(seats.seats.BTN.vsOpenCall!.BB);

function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

const RANKS = "23456789TJQKA";
const SUITS = "cdhs";
const deck: string[] = [];
for (const r of RANKS) for (const s of SUITS) deck.push(`${r}${s}`);

/** 씨앗 고정 무작위 플랍. 같은 씨앗이면 늘 같은 목록이라 학습/검증 분할이 재현된다. */
function sampleFlops(n: number): string[] {
  const rnd = lcg(SEED);
  const seen = new Set<string>();
  const out: string[] = [];
  while (out.length < n) {
    const pick = new Set<number>();
    while (pick.size < 3) pick.add(Math.floor(rnd() * 52));
    const cards = [...pick].map((i) => deck[i]).sort(
      (a, b) => RANKS.indexOf(b[0]) - RANKS.indexOf(a[0]) || a[1].localeCompare(b[1]),
    );
    const key = cards.join("");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

/** 플랍과 겹치지 않는 아무 런아웃. 뽑는 건 플랍 노드뿐이라 무엇이든 된다. */
function anyRunout(flop: string): string {
  const used = new Set(flop.match(/../g));
  const free = deck.filter((c) => !used.has(c));
  return `${free[0]}${free[1]}`;
}

mkdirSync(OUT, { recursive: true });
mkdirSync(TMP, { recursive: true });
const flops = sampleFlops(COUNT);
const started = Date.now();
let solved = 0;

for (const [i, flop] of flops.entries()) {
  const target = `${OUT}/${flop}.json`;
  if (existsSync(target)) continue;
  const at = Date.now();
  const stdout = execFileSync(
    EXPORTER,
    [
      "--flop", flop,
      "--runouts", anyRunout(flop),
      "--outdir", TMP,
      "--tag", "nn",
      "--pot", String(CHIPS.pot),
      "--stack", String(CHIPS.stack),
      "--oop-range", oop,
      "--ip-range", ip,
    ],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 1 << 26 },
  );
  const line = stdout.split("\n").find((l) => l.startsWith("SPOT\t"));
  if (!line) throw new Error(`${flop}: 익스포터 출력이 없습니다`);
  const file = line.split("\t")[1];
  const spot = JSON.parse(readFileSync(`${TMP}/${file}`, "utf8")) as {
    handsByPlayer: [string[], string[]];
    handWeightsByPlayer: [number[], number[]];
    startingPotBb: number;
    nodes: { line: string; player: 0 | 1; actions: { kind: string; amountBb: number }[]; strategy: number[]; actionEv: number[] }[];
  };
  const nodes = Object.fromEntries(
    LINES.map((l) => {
      const n = spot.nodes.find((x) => x.line === l);
      if (!n) throw new Error(`${flop}: 노드 "${l}"가 없습니다`);
      return [
        l,
        {
          player: n.player,
          actions: n.actions,
          strategy: n.strategy,
          actionEv: n.actionEv,
        },
      ];
    }),
  );
  writeFileSync(
    target,
    JSON.stringify({
      flop,
      potBb: spot.startingPotBb,
      handsByPlayer: spot.handsByPlayer,
      weightsByPlayer: spot.handWeightsByPlayer,
      nodes,
    }),
  );
  for (const f of readdirSync(TMP)) rmSync(`${TMP}/${f}`);
  solved += 1;
  const mins = (Date.now() - started) / 60000;
  console.log(
    `[${i + 1}/${flops.length}] ${flop} ${((Date.now() - at) / 1000).toFixed(0)}초 · 누적 ${mins.toFixed(1)}분`,
  );
}
console.log(`완료 — 새로 푼 플랍 ${solved}개`);
