// 근거 숫자.
//
// 실행: node --experimental-strip-types scripts/why.test.ts
//
// 팟 오즈를 틀리면 화면이 채점과 다른 말을 한다. 사용자는 둘 중 하나를 믿어야
// 하는데 어느 쪽인지 알 방법이 없다. 그래서 손으로 셀 수 있는 경우를 못 박는다.

import { readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import seatsRaw from "../src/data/preflop-seats.json" with { type: "json" };
import type { SeatsData } from "../src/lib/seatGame.ts";
import { combosOf, equityVsRange, type EquityTable } from "../src/lib/equity.ts";
import { jamPotOdds, jamRangeOf } from "../src/lib/why.ts";

const DATA = seatsRaw as unknown as SeatsData;

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) pass += 1;
  else {
    fail += 1;
    console.error(`  실패: ${name}`);
  }
}
function near(a: number, b: number, tol = 0.011): boolean {
  return Math.abs(a - b) <= tol;
}

const S = DATA.stackBb;
const A = DATA.anteBb;
const O = DATA.openToBb;

// ── 앞에서 올인, 내가 받는다 ────────────────────────────────────────────

{
  // UTG가 스택 전부를 밀고 내가 CO에서 받는다. 나는 아직 아무것도 안 냈다.
  const odds = jamPotOdds(DATA, "CO", { kind: "vsJam", jammer: "UTG", iOpened: false });
  check("낸 게 없으면 스택 전부를 내야 한다", near(odds.toCallBb, S));
  check("팟은 블라인드 + 앤티 + 올인액", near(odds.potBb, 1.5 + A + S));
  check(
    "필요 승률이 팟 오즈와 맞는다",
    near(odds.needPct, (S / (1.5 + A + S + S)) * 100, 0.2),
  );
}

{
  // 내가 BB면 이미 1bb와 앤티를 냈다. 그만큼 덜 낸다.
  const odds = jamPotOdds(DATA, "BB", { kind: "vsJam", jammer: "BTN", iOpened: false });
  check("BB는 낸 만큼 덜 낸다", near(odds.toCallBb, S - (1 + A)));
  check("BB 쪽 팟은 그대로다", near(odds.potBb, 1.5 + A + S));
  check("덜 내니 필요 승률도 낮다", odds.needPct < 50);
}

{
  // SB가 올인하면 SB의 0.5는 이미 판에 있다. 두 번 세면 안 된다.
  const odds = jamPotOdds(DATA, "BB", { kind: "vsJam", jammer: "SB", iOpened: false });
  check("올인한 쪽의 블라인드를 두 번 세지 않는다", near(odds.potBb, 1.5 + A + (S - 0.5)));
}

// ── 내가 열었다가 3벳 올인을 맞는다 ─────────────────────────────────────

{
  const odds = jamPotOdds(DATA, "BTN", { kind: "vsJam", jammer: "BB", iOpened: true });
  check("오픈액을 뺀 만큼만 더 낸다", near(odds.toCallBb, S - O));
  check("내 오픈액도 팟에 있다", near(odds.potBb, 1.5 + A + (S - (1 + A)) + O));
}

{
  // 스택만큼 이미 냈으면 더 낼 것이 없다. 그런 일은 없어야 하지만, 0으로
  // 나누는 자리를 남겨두면 언젠가 NaN이 화면에 뜬다.
  const tiny = { ...DATA, stackBb: DATA.openToBb } as SeatsData;
  const odds = jamPotOdds(tiny, "BTN", { kind: "vsJam", jammer: "BB", iOpened: true });
  check("더 낼 게 없으면 필요 승률은 0", odds.needPct === 0);
}

// ── 올인한 쪽의 레인지 ──────────────────────────────────────────────────

{
  const open = jamRangeOf(DATA, "BB", { kind: "vsJam", jammer: "BTN", iOpened: false });
  check("앞의 올인은 그 자리의 오픈 올인 레인지다", open !== null && Object.keys(open).length > 0);
  // 어떤 패가 밀리는지는 스택에 따라 뒤집힌다 — 20bb BTN은 AA를 밀지 않고
  // 연다. 값을 박아두면 데이터를 다시 만들 때마다 여기가 깨진다. 모양만 본다.
  check(
    "빈도는 0과 1 사이다",
    open !== null && Object.values(open).every((v) => v >= 0 && v <= 1),
  );
  check("밀 만한 패가 실제로 있다", open !== null && Object.values(open).some((v) => v > 0.5));

  const threeBet = jamRangeOf(DATA, "BTN", { kind: "vsJam", jammer: "BB", iOpened: true });
  check("3벳 올인은 내 스팟 안에 있다", threeBet !== null && Object.keys(threeBet).length > 0);
  check("둘은 다른 레인지다", JSON.stringify(open) !== JSON.stringify(threeBet));
}

// ── 승률 접기 ───────────────────────────────────────────────────────────

const raw = JSON.parse(
  gunzipSync(readFileSync("public/equity.json.gz")).toString("utf8"),
) as { hands: string[]; equity: number[] };
const T: EquityTable = {
  hands: raw.hands,
  equity: raw.equity,
  index: new Map(raw.hands.map((h, i) => [h, i])),
};

{
  check("페어는 6조합", combosOf("AA") === 6);
  check("수딧은 4조합", combosOf("AKs") === 4);
  check("오프수트는 12조합", combosOf("AKo") === 12);
}

{
  check("같은 패끼리는 반반", near(equityVsRange(T, "AA", { AA: 1 }) ?? 0, 50, 0.6));
  const vsWorst = equityVsRange(T, "AA", { "72o": 1 }) ?? 0;
  check("AA는 72o를 크게 이긴다", vsWorst > 85);
  const weak = equityVsRange(T, "72o", { AA: 1 }) ?? 0;
  check("뒤집으면 100에서 뺀 값에 가깝다", near(weak, 100 - vsWorst, 0.6));
}

{
  // 조합 수를 안 쓰면 AA(6)와 AKo(12)가 같은 무게가 된다. 무게가 붙었는지는
  // 조합이 다른 두 패를 섞어 한쪽으로 기우는지로 확인한다.
  const mixed = equityVsRange(T, "KK", { AA: 1, "72o": 1 }) ?? 0;
  const vsAA = equityVsRange(T, "KK", { AA: 1 }) ?? 0;
  const vs72 = equityVsRange(T, "KK", { "72o": 1 }) ?? 0;
  const flat = (vsAA + vs72) / 2;
  const weighted = (vsAA * 6 + vs72 * 12) / 18;
  check("조합 수만큼 무게가 붙는다", near(mixed, weighted, 0.4) && !near(mixed, flat, 0.4));
}

{
  check("모르는 패는 null", equityVsRange(T, "ZZ", { AA: 1 }) === null);
  check("빈 레인지는 null", equityVsRange(T, "AA", {}) === null);
  check("빈도 0뿐이면 null", equityVsRange(T, "AA", { KK: 0 }) === null);
}

{
  // 진짜 레인지로 접어도 말이 되는 값이어야 한다.
  const range = jamRangeOf(DATA, "BB", { kind: "vsJam", jammer: "BTN", iOpened: false });
  const eq = range ? equityVsRange(T, "A5s", range) : null;
  check("실제 올인 레인지를 상대로도 값이 나온다", eq !== null && eq > 20 && eq < 80);
}

console.log(`통과 ${pass}, 실패 ${fail}`);
process.exit(fail > 0 ? 1 : 0);
