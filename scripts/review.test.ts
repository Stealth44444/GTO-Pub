// 복습 스팟 고르기.
//
// 실행: node --experimental-strip-types scripts/review.test.ts
//
// 여기서 확인하는 것은 "되살릴 수 있는 기록만 고르는가"다. 되살릴 수 없는 것을
// 목록에 넣으면 사용자는 열었다가 빈 화면을 보게 된다.

import seatsRaw from "../src/data/preflop-seats.json" with { type: "json" };
import type { SeatsData } from "../src/lib/seatGame.ts";
import type { Attempt } from "../src/lib/stats.ts";
import {
  pickAllReviewSpots,
  pickPostflopSpots,
  pickReviewSpots,
  parseStage,
} from "../src/lib/review.ts";

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

function attempt(over: Partial<Attempt>): Attempt {
  return {
    mode: "hand",
    tableSize: 9,
    stackBb: 20,
    position: "BTN",
    shoverPosition: null,
    handCode: "A7s",
    userAction: "bet",
    correctAction: "check",
    evLossBb: 0.8,
    createdAt: "2026-09-25T00:00:00Z",
    street: "flop",
    nodeLine: "",
    board: "As 7h 2c",
    heroCards: "Ah7h",
    spotFile: "late/late-As7h2c-3dTs.json.gz",
    heroPlayer: 1,
    ...over,
  };
}

// ── 포스트플랍 ─────────────────────────────────────────────────────────

{
  const spots = pickPostflopSpots([attempt({})]);
  check("되살릴 수 있는 기록은 고른다", spots.length === 1);
  check("보드를 카드 배열로 푼다", spots[0]?.board.join(",") === "As,7h,2c");
  check("플랍 첫 노드의 빈 라인을 살린다", spots[0]?.line === "");
  check("무늬까지 남긴다", spots[0]?.heroCards === "Ah7h");
}

{
  // 세 값 중 하나만 없어도 노드를 세울 수 없다.
  check("보드 파일이 없으면 뺀다", pickPostflopSpots([attempt({ spotFile: null })]).length === 0);
  check("히어로 카드가 없으면 뺀다", pickPostflopSpots([attempt({ heroCards: null })]).length === 0);
  check("어느 쪽인지 없으면 뺀다", pickPostflopSpots([attempt({ heroPlayer: null })]).length === 0);
  check("라인이 없으면 뺀다", pickPostflopSpots([attempt({ nodeLine: null })]).length === 0);
}

{
  check("프리플랍 행은 포스트플랍 목록에 안 들어간다",
    pickPostflopSpots([attempt({ street: "preflop" })]).length === 0);
  check("손해가 작으면 복습거리가 아니다",
    pickPostflopSpots([attempt({ evLossBb: 0.02 })]).length === 0);
}

{
  // 같은 스팟을 두 번 틀리면 한 줄로 묶이고, 큰 손실 쪽이 남는다.
  const spots = pickPostflopSpots([
    attempt({ evLossBb: 0.3, userAction: "bet" }),
    attempt({ evLossBb: 1.2, userAction: "allin" }),
  ]);
  check("같은 스팟은 한 줄로 묶는다", spots.length === 1);
  check("틀린 횟수를 센다", spots[0]?.misses === 2);
  check("가장 큰 손실을 남긴다", spots[0]?.lastLossBb === 1.2);
  check("그때 고른 것을 남긴다", spots[0]?.lastAction === "allin");
}

{
  // 라인이 다르면 다른 스팟이다.
  const spots = pickPostflopSpots([attempt({}), attempt({ nodeLine: "check/bet3.3" })]);
  check("라인이 다르면 따로 센다", spots.length === 2);
}

// ── 프리플랍과 섞기 ────────────────────────────────────────────────────

{
  const pre = attempt({
    street: "preflop",
    position: "CO",
    handCode: "QJs",
    nodeLine: "firstIn",
    userAction: "fold",
    evLossBb: 2.5,
    board: null,
    spotFile: null,
    heroPlayer: null,
  });
  const spots = pickAllReviewSpots([pre, attempt({})], DATA);
  check("둘이 한 목록에 들어온다", spots.length === 2);
  check("손해가 큰 쪽이 앞에 온다", spots[0]?.kind === "preflop");
  check("종류를 구분할 수 있다", spots[1]?.kind === "postflop");
}

{
  // 프리플랍 쪽은 기존대로 동작해야 한다.
  const pre = attempt({
    street: "preflop",
    position: "BTN",
    handCode: "A7s",
    nodeLine: "firstIn",
    userAction: "fold",
    evLossBb: 1.0,
    board: null,
  });
  const spots = pickReviewSpots([pre], DATA);
  check("프리플랍 고르기는 그대로다", spots.length === 1 && spots[0].kind === "preflop");
  check("상황 이름을 푼다", parseStage("vsOpen:UTG", "BB")?.kind === "vsOpen");
}

console.log(`통과 ${pass}, 실패 ${fail}`);
process.exit(fail > 0 ? 1 : 0);
