// 프리플랍 드릴이 내는 스팟 검증.
// 실행: node --experimental-strip-types scripts/drill.test.ts

import { readFileSync } from "node:fs";
import { drillKinds, drillSeats, nextDrill, type DrillKind } from "../src/lib/drill.ts";
import { evAt, type SeatsData } from "../src/lib/seatGame.ts";
import { isStudyWorthy, spotGap } from "../src/lib/spotValue.ts";
import { buildDepthData, type CallsJson, type PushfoldJson } from "../src/lib/depthData.ts";
import { seatNames } from "../src/lib/poker.ts";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) pass += 1;
  else {
    fail += 1;
    console.error(`  실패: ${name}`);
  }
}
function lcg(seed: number): () => number {
  let x = seed >>> 0;
  return () => {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    return x / 4294967296;
  };
}

const data = JSON.parse(readFileSync("src/data/preflop-seats.json", "utf8")) as SeatsData;

check("20bb에는 3벳 드릴이 없다", !drillKinds(data).includes("vsThreeBet"));
check("첫 진입·오픈 대응·올인 대응은 있다", ["firstIn", "vsOpen", "vsJam"].every((k) => drillKinds(data).includes(k as DrillKind)));
check("첫 진입 자리에 BB는 없다", !drillSeats(data, "firstIn").includes("BB"));
check("오픈 대응 자리에 UTG는 없다", !drillSeats(data, "vsOpen").includes("UTG"));

for (const kind of drillKinds(data)) {
  const rnd = lcg(7);
  let worthy = 0;
  let valid = 0;
  const n = 400;
  for (let i = 0; i < n; i++) {
    const d = nextDrill(data, kind, null, rnd);
    if (!d) continue;
    if (d.stage.kind === kind) valid += 1;
    if (isStudyWorthy(evAt(data, d.seat, d.stage, d.hand))) worthy += 1;
  }
  check(`${kind}: 상황 종류가 맞다`, valid === n);
  check(`${kind}: 판단할 가치가 있는 핸드만 낸다`, worthy === n);
}

{
  const rnd = lcg(3);
  for (let i = 0; i < 100; i++) {
    const d = nextDrill(data, "vsOpen", "BB", rnd);
    if (!d || d.seat !== "BB" || d.stage.kind !== "vsOpen") {
      check("자리를 고르면 그 자리만", false);
      break;
    }
  }
  check("자리를 고르면 그 자리만", true);
}
{
  const a = nextDrill(data, "firstIn", null, lcg(42));
  const b = nextDrill(data, "firstIn", null, lcg(42));
  check("같은 씨앗이면 같은 스팟", JSON.stringify(a) === JSON.stringify(b));
}
{
  // 올인 대응의 올인한 자리는 올인 레인지가 있는 자리다.
  const rnd = lcg(9);
  let ok = true;
  for (let i = 0; i < 200; i++) {
    const d = nextDrill(data, "vsJam", null, rnd);
    if (!d || d.stage.kind !== "vsJam") continue;
    if (!data.seats[d.stage.jammer]?.openJam) ok = false;
  }
  check("올인한 자리는 올인 레인지가 있다", ok);
}

{
  // 받아들임 함수가 BB만 받으면 (거절 한도 안에서는) BB만 나온다.
  const rnd = lcg(11);
  let bb = 0;
  for (let i = 0; i < 200; i++) {
    const d = nextDrill(data, "vsOpen", null, rnd, (s) => s === "BB");
    if (d?.seat === "BB") bb += 1;
  }
  check("받아들임 함수가 자리를 가른다", bb > 190);
  // 아무것도 안 받아도 스팟은 나온다.
  check("다 거절해도 스팟은 낸다", nextDrill(data, "vsOpen", null, lcg(5), () => false) !== null);
}

{
  // 어려운 것만: 차이가 0.25bb 이하.
  const rnd = lcg(13);
  let close = 0;
  for (let i = 0; i < 200; i++) {
    const d = nextDrill(data, "vsOpen", null, rnd, undefined, true);
    const gap = d ? spotGap(evAt(data, d.seat, d.stage, d.hand)) : null;
    if (gap !== null && gap >= 0.05 && gap <= 0.25) close += 1;
  }
  check("어려운 것만 고르면 근소한 스팟만", close === 200);
}

// ── 30bb: 크기 있는 3벳·4벳·스퀴즈 ──────────────────────────────────────
const deep = JSON.parse(readFileSync("src/data/preflop-seats-30bb.json", "utf8")) as SeatsData;
{
  const kinds = drillKinds(deep);
  for (const k of ["vsThreeBet", "vsFourBet", "vsFlat", "vsSqueeze"] as DrillKind[]) {
    check(`30bb에는 ${k} 드릴이 있다`, kinds.includes(k));
  }
  for (const kind of kinds) {
    const rnd = lcg(21);
    let ok = 0;
    let reached = 0;
    const n = 200;
    for (let i = 0; i < n; i++) {
      const d = nextDrill(deep, kind, null, rnd);
      if (!d) continue;
      if (d.stage.kind === kind && isStudyWorthy(evAt(deep, d.seat, d.stage, d.hand))) ok += 1;
      // 앞의 내 선택이 있는 상황은 그 레인지 안의 핸드여야 한다.
      const st = d.stage;
      const S = deep.seats;
      const inRange =
        st.kind === "vsThreeBet"
          ? (S[d.seat].open?.[d.hand] ?? 0) > 0
          : st.kind === "vsFourBet"
            ? (S[st.opener].vsOpenThreeBet?.[d.seat]?.[d.hand] ?? 0) > 0
            : st.kind === "vsSqueeze"
              ? st.iOpened
                ? (S[d.seat].open?.[d.hand] ?? 0) > 0
                : (S[st.opener].vsOpenCall?.[d.seat]?.[d.hand] ?? 0) > 0
              : true;
      if (inRange) reached += 1;
    }
    check(`30bb ${kind}: 판단할 가치가 있는 스팟만`, ok === n);
    check(`30bb ${kind}: 내 앞선 선택의 레인지 안`, reached === n);
  }
  // 스퀴즈 대응은 오프너로도, 플랫한 자리로도 나온다.
  const rnd = lcg(4);
  const sides = new Set<boolean>();
  for (let i = 0; i < 200; i++) {
    const d = nextDrill(deep, "vsSqueeze", null, rnd);
    if (d?.stage.kind === "vsSqueeze") sides.add(d.stage.iOpened);
  }
  check("스퀴즈 대응은 오프너와 플랫 양쪽", sides.size === 2);
}

// ── 푸시폴드 깊이: 첫 진입과 올인 대응만 ─────────────────────────────────
{
  const push = JSON.parse(readFileSync("src/data/pushfold.json", "utf8")) as PushfoldJson;
  const calls = JSON.parse(readFileSync("src/data/pushfold-calls.json", "utf8")) as CallsJson;
  const d10 = buildDepthData(push, calls, 10, seatNames(9));
  const kinds = drillKinds(d10);
  check("10bb는 첫 진입과 올인 대응만", kinds.join() === "firstIn,vsJam");
  const rnd = lcg(8);
  let ok = 0;
  for (let i = 0; i < 100; i++) {
    const d = nextDrill(d10, "firstIn", null, rnd);
    if (d && isStudyWorthy(evAt(d10, d.seat, d.stage, d.hand))) ok += 1;
  }
  check("10bb 첫 진입 스팟이 나온다", ok === 100);
}

console.log(`통과 ${pass}, 실패 ${fail}`);
process.exit(fail > 0 ? 1 : 0);
