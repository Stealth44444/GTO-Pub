// 레인지 전체의 액션 비율.
//
// 실행: node --experimental-strip-types scripts/rangeMix.test.ts
//
// 도달 확률을 잘못 세면 화면에 그럴듯한 숫자가 뜬다. "이 보드에서 68% 벳"이
// 틀린 68%여도 아무도 모른다. 그래서 손으로 검산할 수 있는 트리를 만들어
// 규칙을 못 박고, 진짜 보드로 한 번 더 확인한다.

import { existsSync, readFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { rangeMix, reachWeights } from "../src/lib/rangeMix.ts";
import { actionLabel, findNode, type SolvedSpot, type TreeNode } from "../src/lib/tree.ts";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) pass += 1;
  else {
    fail += 1;
    console.error(`  실패: ${name}`);
  }
}
function near(a: number, b: number, tol = 0.05): boolean {
  return Math.abs(a - b) <= tol;
}

// ── 손으로 셀 수 있는 트리 ──────────────────────────────────────────────
//
// 핸드 두 개. OOP가 플랍에서 체크/벳을 고르고, 체크하면 IP가 친다.
//   핸드0: 체크 0.25 / 벳 0.75
//   핸드1: 체크 1.0  / 벳 0
// 시작 비중은 둘 다 1.

function node(
  line: string,
  player: 0 | 1,
  kinds: ("check" | "bet")[],
  strategy: number[],
): TreeNode {
  return {
    line,
    street: "flop",
    player,
    potBb: 6.5,
    actions: kinds.map((kind) => ({ kind, amountBb: kind === "bet" ? 3 : 0 })),
    handCount: 2,
    strategy,
    actionEv: strategy.map(() => 0),
  };
}

const toy: SolvedSpot = {
  flop: ["As", "7h", "2c"],
  runout: { turn: "3d", river: "Ts" },
  startingPotBb: 6.5,
  effectiveStackBb: 16.5,
  handsByPlayer: [
    ["AhAd", "KhKd"],
    ["QhQd", "JhJd"],
  ],
  handWeightsByPlayer: [
    [1, 1],
    [1, 1],
  ],
  nodes: [
    // strategy 색인은 action * handCount + hand.
    node("", 0, ["check", "bet"], [0.25, 1.0, 0.75, 0.0]),
    node("check", 1, ["check", "bet"], [0.5, 0.5, 0.5, 0.5]),
    node("check/bet3", 0, ["check", "bet"], [1, 1, 0, 0]),
  ],
};

{
  const root = reachWeights(toy, "", 0);
  check("루트에서는 시작 비중 그대로", root[0] === 1 && root[1] === 1);

  const mix = rangeMix(toy.nodes[0], root, ["체크", "벳"]);
  // (0.25 + 1.0) / 2 = 62.5%, (0.75 + 0) / 2 = 37.5%
  check("루트 비율은 두 핸드의 평균", mix !== null && near(mix[0].pct, 62.5));
  check("벳 비율도 맞는다", mix !== null && near(mix[1].pct, 37.5));
  check("합이 100", mix !== null && near(mix[0].pct + mix[1].pct, 100));
}

{
  // 체크하고 온 뒤의 OOP 분포. 핸드0은 0.25만, 핸드1은 1.0 그대로 남는다.
  const w = reachWeights(toy, "check/bet3", 0);
  check("내 액션만큼 좁아진다", near(w[0], 0.25, 1e-9) && near(w[1], 1.0, 1e-9));
}

{
  // IP의 분포는 OOP가 체크했다고 좁아지지 않는다.
  const w = reachWeights(toy, "check", 1);
  check("상대 액션은 내 분포를 안 건드린다", w[0] === 1 && w[1] === 1);
}

{
  // 무게를 안 주면 틀린다. 도달 확률을 쓰면 핸드1 쪽으로 기운다.
  const weighted = rangeMix(toy.nodes[2], reachWeights(toy, "check/bet3", 0), ["폴드", "콜"]);
  const flat = rangeMix(toy.nodes[2], [1, 1], ["폴드", "콜"]);
  check("두 방식이 같은 결과일 수 있는 노드다", weighted !== null && flat !== null);
  // 이 노드는 두 핸드가 같은 전략이라 비율은 같다. 무게 자체가 다른 것만 본다.
  check("그래도 무게는 달랐다", reachWeights(toy, "check/bet3", 0)[0] !== 1);
}

{
  const none = rangeMix(toy.nodes[0], [0, 0], ["체크", "벳"]);
  check("올 수 있는 핸드가 없으면 null", none === null);
  const unknown = reachWeights(toy, "없는액션", 0);
  check("모르는 라인이면 좁히지 않고 멈춘다", unknown[0] === 1 && unknown[1] === 1);
}

// ── 진짜 보드 ───────────────────────────────────────────────────────────

const INDEX = "public/postflop/index.json";
if (existsSync(INDEX)) {
  const idx = JSON.parse(readFileSync(INDEX, "utf8")) as { spots: { file: string }[] };
  const spot = JSON.parse(
    gunzipSync(readFileSync(`public/postflop/${idx.spots[0].file}`)).toString("utf8"),
  ) as SolvedSpot;

  const root = findNode(spot, "")!;
  const mix = rangeMix(root, reachWeights(spot, "", root.player), root.actions.map(actionLabel));
  check("진짜 보드에서도 비율이 나온다", mix !== null);
  check("합이 100", mix !== null && near(mix.reduce((s, r) => s + r.pct, 0), 100, 0.3));
  check("모든 비율이 0에서 100 사이", mix !== null && mix.every((r) => r.pct >= 0 && r.pct <= 100));

  // 깊은 노드에서도 무게 합이 0보다 커야 한다 — 0이면 화면에서 줄이 사라진다.
  const deep = spot.nodes.find((n) => n.line.split("/").length === 3);
  if (deep) {
    const w = reachWeights(spot, deep.line, deep.player);
    const sum = w.reduce((s, v) => s + v, 0);
    check("깊은 노드에도 오는 핸드가 있다", sum > 0);
    const dm = rangeMix(deep, w, deep.actions.map(actionLabel));
    check("깊은 노드 비율 합도 100", dm !== null && near(dm.reduce((s, r) => s + r.pct, 0), 100, 0.3));
  } else {
    check("깊은 노드가 없어 건너뛴다", true);
  }
} else {
  check("보드 데이터가 없어 건너뛴다", true);
}

console.log(`통과 ${pass}, 실패 ${fail}`);
process.exit(fail > 0 ? 1 : 0);
