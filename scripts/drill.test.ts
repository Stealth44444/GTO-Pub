// 프리플랍 드릴이 내는 스팟 검증.
// 실행: node --experimental-strip-types scripts/drill.test.ts

import { readFileSync } from "node:fs";
import { drillKinds, drillSeats, nextDrill, type DrillKind } from "../src/lib/drill.ts";
import { evAt, type SeatsData } from "../src/lib/seatGame.ts";
import { isStudyWorthy } from "../src/lib/spotValue.ts";

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

console.log(`통과 ${pass}, 실패 ${fail}`);
process.exit(fail > 0 ? 1 : 0);
