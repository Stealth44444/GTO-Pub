// 오프너 자리 구간별로 플랍 EV를 계산하고, 그 값으로 자리별 프리플랍을 다시 푼다.
//
// 실행: node --experimental-strip-types scripts/pipeline-buckets.ts
//
// 왜 필요한가. 지금은 아홉 자리 전부가 같은 플랍 EV를 쓴다 — BTN이 열고 BB가
// 받은 조건에서 나온 값 하나다. 그래서 UTG 오픈이 "BTN 상대 디펜스 레인지에
// 콜당한다"는 전제로 값매겨지고, 이른 자리 오픈이 과대평가돼 UTG가 28%를 연다.
// 실제로는 훨씬 타이트해야 한다.
//
// 구간을 넷으로 묶는다. 자리마다 따로 풀면 8×2 = 16번을 풀어야 하는데, 레인지
// 폭이 비슷한 자리끼리는 플랍에서의 값도 비슷하다. 묶으면 넷이면 된다.
//
// 루트 EV는 런아웃과 무관하므로(같은 플랍이면 어떤 런아웃을 지정하든 같은 값이
// 나온다) --ev-only로 뽑는다. 트리를 안 내보내니 파일이 21KB, 시간도 1/3이다.
//
// 사람이 지켜보지 않아도 끝까지 가도록 만들었다. 진행 상황은
// scripts/data/pipeline-status.json 에 남는다.
//
// 중간에 끊겨도 다시 돌리면 이어서 한다. 한 구간이 20분 넘게 걸려서, 처음부터
// 다시 하면 재개가 사실상 불가능하다. 이미 나온 플랍 파일은 건너뛴다 — 끊길 때
// 쓰다 만 파일은 JSON이 깨져 있으므로, 읽어보고 깨졌으면 지우고 다시 계산한다.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { flopChips, withDepth } from "./game.ts";
import { sampleFlops } from "./flop-sample.ts";

const EXPORTER = process.env.EXPORTER ?? "tools/spot-exporter/target/release/spot-exporter.exe";
// 이 깊이의 프리플랍 풀이가 아직 없으면 20bb 풀이의 레인지에서 출발한다. 파이프라인이
// 플랍 EV를 구한 뒤 프리플랍을 다시 풀어 이 깊이의 파일을 새로 만든다.
const SEATS_FILE = existsSync(withDepth("src/data/preflop-seats.json"))
  ? withDepth("src/data/preflop-seats.json")
  : "src/data/preflop-seats.json";
const STATUS = withDepth("scripts/data/pipeline-status.json");
const TARGET_PCT = process.env.TARGET_PCT ?? "0.5";
const FLOP_COUNT = Number(process.env.FLOPS ?? 60);

// 포스트플랍 스팟과 같은 게임 조건.


/**
 * 오프너 구간. 각 구간의 대표 자리를 하나 골라 그 자리의 오픈 레인지와,
 * 그 오픈에 대한 BB의 콜 레인지를 쓴다.
 */
const BUCKETS: { name: string; opener: string; caller: string }[] = [
  { name: "early", opener: "UTG1", caller: "BB" },
  { name: "middle", opener: "HJ", caller: "BB" },
  { name: "late", opener: "BTN", caller: "BB" },
  { name: "sb", opener: "SB", caller: "BB" },
].filter((b) => !process.env.ONLY || process.env.ONLY.split(",").includes(b.name));

/**
 * 플랍에서 오프너가 먼저 치는가. SB가 열고 BB가 받은 팟만 그렇다. 예전에는 모든
 * 구간을 "콜러가 OOP"로 풀어 SB 오프너가 IP의 몫을 가져갔다(SB 오픈 과대평가).
 * 표는 늘 [콜러, 오프너] 순서로 적는다 — 솔버가 그렇게 읽는다.
 */
const openerActsFirst = (b: { opener: string; caller: string }) =>
  b.opener === "SB" && b.caller === "BB";

type Seats = {
  hands: string[];
  seats: Record<
    string,
    {
      open?: Record<string, number>;
      vsOpenCall?: Record<string, Record<string, number>>;
    }
  >;
};

/** 솔버가 읽는 "AA:1.0,KK:0.6,…". 0% 핸드는 빼고, 남긴 것에는 바닥을 깐다. */
const FLOOR = 0.05;
function rangeString(freq: Record<string, number>, hands: string[]): string {
  return hands
    .filter((c) => (freq[c] ?? 0) > 0)
    .map((c) => `${c}:${Math.round(Math.max(freq[c], FLOOR) * 1000) / 1000}`)
    .join(",");
}

/** 이미 계산된 플랍인가. 쓰다 만 파일은 지워서 다시 계산하게 한다. */
function done(file: string): boolean {
  if (!existsSync(file)) return false;
  try {
    JSON.parse(readFileSync(file, "utf8"));
    return true;
  } catch {
    rmSync(file, { force: true });
    return false;
  }
}

function setStatus(step: string, detail?: string) {
  const at = new Date().toISOString();
  mkdirSync("scripts/data", { recursive: true });
  writeFileSync(STATUS, JSON.stringify({ step, detail, at }, null, 1));
  console.log(`[${at.slice(11, 19)}] ${step}${detail ? ` — ${detail}` : ""}`);
}

// ── 실행 ────────────────────────────────────────────────────────────────

if (!existsSync(SEATS_FILE)) {
  setStatus("실패", `${SEATS_FILE} 가 없습니다. 먼저 preflop:seats 를 돌리세요.`);
  process.exit(1);
}
const seatsData = JSON.parse(readFileSync(SEATS_FILE, "utf8")) as Seats;
const sample = sampleFlops(FLOP_COUNT);
setStatus("시작", `구간 ${BUCKETS.length}개 × 플랍 ${sample.length}개`);

for (const bucket of BUCKETS) {
  const opener = seatsData.seats[bucket.opener];
  const openRange = opener?.open;
  const callRange = opener?.vsOpenCall?.[bucket.caller];
  if (!openRange || !callRange) {
    setStatus("건너뜀", `${bucket.name}: ${bucket.opener} 레인지가 없습니다`);
    continue;
  }

  const dir = withDepth(`scripts/data/flopev-${bucket.name}`);
  const { pot, stack } = flopChips(bucket.opener, bucket.caller);
  mkdirSync(dir, { recursive: true });
  writeFileSync(`${dir}/index.json`, JSON.stringify({ flops: sample }, null, 1));

  const openStr = rangeString(openRange, seatsData.hands);
  const callStr = rangeString(callRange, seatsData.hands);
  const swap = openerActsFirst(bucket);
  const [oop, ip] = swap ? [openStr, callStr] : [callStr, openStr];

  const started = Date.now();
  let reused = 0;
  sample.forEach((s, i) => {
    const out = `${dir}/ev-${s.flop}.json`;
    if (done(out)) {
      reused += 1;
      return;
    }
    execFileSync(
      EXPORTER,
      [
        "--flop", s.flop,
        "--ev-only",
        "--target-pct", TARGET_PCT,
        "--outdir", dir,
        "--tag", "ev",
        "--pot", String(pot),
        "--stack", String(stack),
        "--oop-range", oop,
        "--ip-range", ip,
      ],
      { stdio: "ignore" },
    );
    if ((i + 1) % 10 === 0) {
      setStatus(
        `${bucket.name} 계산 중`,
        `${i + 1}/${sample.length} · ${((Date.now() - started) / 60000).toFixed(1)}분`,
      );
    }
  });

  // 이 구간의 플랍 EV를 접는다.
  execFileSync(
    "node",
    ["--experimental-strip-types", "scripts/build-preflop-values.ts"],
    { stdio: "inherit", env: { ...process.env, FLOPEV_DIR: dir, FLOPEV_OUT: withDepth(`src/data/flopev-${bucket.name}.json`) } },
  );
  if (swap) {
    // 솔버의 플레이어 0은 먼저 치는 쪽(오프너)이다. 표는 [콜러, 오프너]로 바꿔 적는다.
    const path = withDepth(`src/data/flopev-${bucket.name}.json`);
    const t = JSON.parse(readFileSync(path, "utf8")) as { flopEvBb: [unknown, unknown]; openerActsFirst?: boolean };
    t.flopEvBb = [t.flopEvBb[1], t.flopEvBb[0]];
    t.openerActsFirst = true;
    writeFileSync(path, JSON.stringify(t));
  }
  setStatus(
    `${bucket.name} 완료`,
    `${((Date.now() - started) / 60000).toFixed(1)}분${reused ? ` · ${reused}개 재사용` : ""}`,
  );
}

// 30bb는 새 솔버(solve-preflop-3bet.ts, pipeline-threebet.ts)가 푼다. 여기서 옛
// 솔버를 돌리면 그 결과를 덮어쓰므로, 표만 새로 만들 때는 SKIP_SOLVE=1로 끈다.
if (process.env.SKIP_SOLVE === "1") {
  setStatus("완료", "구간별 플랍 EV만(SKIP_SOLVE)");
  process.exit(0);
}
setStatus("자리별 프리플랍 재솔브");
execFileSync("node", ["--experimental-strip-types", "scripts/solve-preflop-seats.ts"], {
  stdio: "inherit",
});

setStatus("완료", "구간별 플랍 EV + 자리별 프리플랍 레인지");
