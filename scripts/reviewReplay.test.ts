// 기록 한 줄로 그 자리를 진짜 다시 세울 수 있는가.
//
// 실행: node --experimental-strip-types scripts/reviewReplay.test.ts
//
// 복습은 "보드 파일 이름 + 라인 + 두 장 + 어느 쪽"만 가지고 노드를 찾는다.
// 이 왕복이 어긋나면 화면에는 아무 오류도 안 나고, 엉뚱한 자리의 값으로
// 채점만 조용히 틀린다. 그래서 실제 보드 파일로 확인한다.

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { actionEvFor, findNode, handIndex, type SolvedSpot } from "../src/lib/tree.ts";
import { pickPostflopSpots } from "../src/lib/review.ts";
import type { Attempt } from "../src/lib/stats.ts";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) pass += 1;
  else {
    fail += 1;
    console.error(`  실패: ${name}`);
  }
}

const ROOT = "public/postflop";
const INDEX = `${ROOT}/index.json`;

if (!existsSync(INDEX)) {
  console.log("보드 데이터가 없어 건너뜁니다 (npm run spots:build 후에 의미가 있습니다)");
  console.log("통과 0, 실패 0");
  process.exit(0);
}

const index = JSON.parse(readFileSync(INDEX, "utf8")) as {
  spots: { file: string; flop: string }[];
};
check("보드 목록이 비어 있지 않다", index.spots.length > 0);

const entry = index.spots[0];
const spot = JSON.parse(
  gunzipSync(readFileSync(`${ROOT}/${entry.file}`)).toString("utf8"),
) as SolvedSpot;

// ── 라인으로 노드를 되찾는다 ────────────────────────────────────────────

{
  // 라인은 노드가 스스로 들고 있는 값이다. 그걸로 다시 찾으면 같은 노드여야 한다.
  const sample = [0, 1, 2, Math.floor(spot.nodes.length / 2), spot.nodes.length - 1]
    .filter((i, k, arr) => i < spot.nodes.length && arr.indexOf(i) === k)
    .map((i) => spot.nodes[i]);
  check("뽑을 노드가 있다", sample.length > 0);
  check(
    "라인으로 되찾은 노드가 원래 노드다",
    sample.every((n) => findNode(spot, n.line) === n),
  );
  check("빈 라인은 플랍 첫 노드다", findNode(spot, "")?.street === "flop");
}

// ── 두 장으로 EV를 읽는다 ───────────────────────────────────────────────

const node = spot.nodes.find((n) => n.actions.length >= 2) ?? spot.nodes[0];
const combo = spot.handsByPlayer[node.player][0];

{
  const idx = handIndex(spot, node.player, combo);
  check("레인지에 있는 두 장은 색인을 찾는다", idx === 0);
  const ev = actionEvFor(node, idx);
  check("액션 수만큼 EV가 나온다", ev.length === node.actions.length);
  check("EV가 전부 수다", ev.every((v) => Number.isFinite(v)));
}

{
  // 상대 쪽 레인지에만 있는 두 장을 내 쪽에서 찾으면 안 된다. 찾아지면
  // 엉뚱한 핸드의 EV로 채점하게 된다.
  const other = (1 - node.player) as 0 | 1;
  const mine = new Set(spot.handsByPlayer[node.player]);
  const onlyTheirs = spot.handsByPlayer[other].find((h) => !mine.has(h));
  if (onlyTheirs) {
    check("내 레인지에 없는 두 장은 못 찾는다", handIndex(spot, node.player, onlyTheirs) < 0);
  } else {
    // 두 레인지가 같은 핸드를 전부 공유하면 이 검사는 의미가 없다.
    check("두 레인지가 겹쳐 이 검사는 건너뛴다", true);
  }
}

// ── 기록 한 줄에서 화면까지 ─────────────────────────────────────────────

{
  const board = entry.flop.match(/../g) ?? [];
  const attempt: Attempt = {
    mode: "hand",
    tableSize: 9,
    stackBb: 20,
    position: "BTN",
    shoverPosition: null,
    handCode: "XX",
    userAction: "bet",
    correctAction: "check",
    evLossBb: 0.7,
    createdAt: "2026-09-25T00:00:00Z",
    street: node.street,
    nodeLine: node.line,
    board: board.join(" "),
    heroCards: combo,
    spotFile: entry.file,
    heroPlayer: node.player,
  };

  const picked = pickPostflopSpots([attempt]);
  check("기록이 복습 목록에 오른다", picked.length === 1);

  const got = picked[0];
  const again = findNode(spot, got.line);
  check("목록의 라인으로 같은 노드를 찾는다", again === node);
  check(
    "목록의 두 장으로 같은 색인을 찾는다",
    again !== undefined && handIndex(spot, got.heroPlayer, got.heroCards) === 0,
  );
  check("보드가 카드 배열로 돌아온다", got.board.join("") === board.join(""));
}

// ── 구간별 보드도 같은 규칙을 따른다 ────────────────────────────────────

{
  const bucketIndex = `${ROOT}/index-buckets.json`;
  if (existsSync(bucketIndex)) {
    const raw = JSON.parse(readFileSync(bucketIndex, "utf8")) as {
      buckets: Record<string, { file: string }[]>;
    };
    const names = Object.keys(raw.buckets);
    check("구간 목록이 비어 있지 않다", names.length > 0);
    check(
      "구간의 파일이 전부 실제로 있다",
      names.every((n) => raw.buckets[n].every((e) => existsSync(`${ROOT}/${e.file}`))),
    );
  } else {
    // 아직 만들어지지 않았다. 기본 목록만으로도 앱은 돈다.
    const made = readdirSync(ROOT).filter((f) => f.endsWith(".gz")).length;
    check("기본 보드라도 있다", made > 0);
  }
}

console.log(`통과 ${pass}, 실패 ${fail}`);
process.exit(fail > 0 ? 1 : 0);
