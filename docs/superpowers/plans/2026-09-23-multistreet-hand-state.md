# 멀티스트릿 핸드 상태 기계 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 솔브된 트리 JSON을 읽어 플랍부터 리버까지 한 핸드를 진행시키는 순수 로직 모듈을 만든다. UI 없음.

**Architecture:** 두 모듈로 나눈다. `tree.ts`는 솔버 산출물의 형식과 조회(노드 찾기, 핸드별 전략·EV 꺼내기)를 담당하고, `hand.ts`는 그 위에서 한 판의 진행 상태(라인·스트릿·보드·팟)를 관리한다. 베팅 계산은 하지 않는다 — 솔버가 이미 계산한 팟을 노드마다 담아 오므로 앱이 베팅 규칙을 다시 구현할 이유가 없다. 런아웃이 내보내기 시점에 고정되므로 찬스 노드는 명시하지 않고, 노드의 `street`가 바뀌는 것으로 카드가 깔렸음을 안다.

**Tech Stack:** TypeScript. 테스트는 이 저장소 관례대로 `scripts/*.test.ts`를 `node --experimental-strip-types`로 실행한다 (Jest/Vitest 없음).

---

## 파일 구조

| 파일 | 책임 |
|---|---|
| `src/lib/tree.ts` | 솔브 결과의 타입, 노드 조회, 핸드별 전략·EV 접근 |
| `src/lib/hand.ts` | 한 판의 진행 상태와 액션 적용 |
| `scripts/fixtures/sample-spot.json` | 테스트용 소형 트리 (손으로 만든 값) |
| `scripts/hand.test.ts` | 위 두 모듈의 검증 |
| `package.json` | 테스트 스크립트 등록 |

`src/lib/scenarios.ts`와 `Trainer.tsx`는 이 계획에서 **건드리지 않는다.** 이 계획의 산출물은 순수 로직이고, UI 연결은 다음 계획이다.

---

### Task 1: 트리 타입과 테스트 픽스처

**Files:**
- Create: `src/lib/tree.ts`
- Create: `scripts/fixtures/sample-spot.json`

- [ ] **Step 1: 타입 정의 작성**

`src/lib/tree.ts`:

```ts
// 솔브된 포스트플랍 트리. 런아웃(턴·리버)이 내보내기 시점에 고정되므로
// 찬스 노드를 따로 두지 않는다 — 노드의 street가 바뀌면 카드가 깔린 것이다.

export type Street = "flop" | "turn" | "river";

export type TreeActionKind = "check" | "call" | "bet" | "raise" | "fold" | "allin";

export type TreeAction = {
  kind: TreeActionKind;
  /** 이 액션으로 추가로 넣는 칩(bb). 체크·폴드는 0. */
  amountBb: number;
};

export type TreeNode = {
  /** 루트부터의 액션 경로. 루트는 "". 예: "check/bet2.8" */
  line: string;
  street: Street;
  /** 0 = OOP, 1 = IP */
  player: 0 | 1;
  /** 이 노드 시점의 팟(bb). 솔버가 계산한 값이라 앱이 다시 계산하지 않는다. */
  potBb: number;
  actions: TreeAction[];
  /**
   * 길이 = actions.length × 이 플레이어의 핸드 수.
   * 인덱스는 action * handCount + hand (postflop-solver 규약).
   */
  strategy: number[];
  /** 길이 = 이 플레이어의 핸드 수. */
  ev: number[];
};

export type SolvedSpot = {
  flop: [string, string, string];
  runout: { turn: string; river: string };
  startingPotBb: number;
  effectiveStackBb: number;
  /** [OOP, IP]. strategy와 ev 배열의 핸드 순서가 이것이다. */
  handsByPlayer: [string[], string[]];
  nodes: TreeNode[];
};
```

- [ ] **Step 2: 픽스처 작성**

`scripts/fixtures/sample-spot.json` — 플랍 `Td9d6h`, 팟 5.5bb, 스택 20bb,
런아웃 턴 `2c` 리버 `7s`. 플레이어당 핸드 2개로 줄여 손으로 검산 가능하게 한다.

```json
{
  "flop": ["Td", "9d", "6h"],
  "runout": { "turn": "2c", "river": "7s" },
  "startingPotBb": 5.5,
  "effectiveStackBb": 20,
  "handsByPlayer": [["AhAs", "7c2d"], ["KdKc", "8h3s"]],
  "nodes": [
    { "line": "", "street": "flop", "player": 0, "potBb": 5.5,
      "actions": [{ "kind": "check", "amountBb": 0 }, { "kind": "bet", "amountBb": 2.8 }],
      "strategy": [0.2, 0.8, 0.8, 0.2], "ev": [6.0, 1.2] },

    { "line": "check", "street": "flop", "player": 1, "potBb": 5.5,
      "actions": [{ "kind": "check", "amountBb": 0 }, { "kind": "bet", "amountBb": 2.8 }],
      "strategy": [0.5, 0.9, 0.5, 0.1], "ev": [4.0, 1.5] },

    { "line": "check/check", "street": "turn", "player": 0, "potBb": 5.5,
      "actions": [{ "kind": "check", "amountBb": 0 }, { "kind": "bet", "amountBb": 4.1 }],
      "strategy": [0.3, 0.7, 0.7, 0.3], "ev": [6.5, 1.0] },

    { "line": "check/check/check", "street": "turn", "player": 1, "potBb": 5.5,
      "actions": [{ "kind": "check", "amountBb": 0 }, { "kind": "bet", "amountBb": 4.1 }],
      "strategy": [0.6, 0.8, 0.4, 0.2], "ev": [4.2, 1.3] },

    { "line": "check/check/check/check", "street": "river", "player": 0, "potBb": 5.5,
      "actions": [{ "kind": "check", "amountBb": 0 }, { "kind": "bet", "amountBb": 5.5 }],
      "strategy": [0.4, 0.6, 0.6, 0.4], "ev": [7.0, 0.9] },

    { "line": "check/bet2.8", "street": "flop", "player": 0, "potBb": 8.3,
      "actions": [{ "kind": "fold", "amountBb": 0 }, { "kind": "call", "amountBb": 2.8 },
                  { "kind": "raise", "amountBb": 8.4 }],
      "strategy": [0.1, 0.6, 0.6, 0.3, 0.3, 0.1], "ev": [5.5, 0.8] }
  ]
}
```

- [ ] **Step 3: 커밋**

```bash
git add src/lib/tree.ts scripts/fixtures/sample-spot.json
git commit -m "Define the solved-tree format for postflop spots"
```

---

### Task 2: 액션 키와 표시 문자열

액션을 라인 문자열로 조립하려면 안정적인 키가 필요하고, 화면에는 한국어 라벨이 필요하다.

**Files:**
- Modify: `src/lib/tree.ts`
- Create: `scripts/hand.test.ts`
- Modify: `package.json`

- [ ] **Step 1: 실패하는 테스트 작성**

`scripts/hand.test.ts`:

```ts
// 트리 조회와 핸드 진행 검증.
// 실행: node --experimental-strip-types scripts/hand.test.ts

import { readFileSync } from "node:fs";
import { actionKey, actionLabel, type SolvedSpot } from "../src/lib/tree.ts";

let passed = 0;
let failed = 0;

function expect(actual: unknown, expected: unknown, label: string) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    passed++;
  } else {
    failed++;
    console.log(`  FAIL [${label}] 기대 ${e}, 실제 ${a}`);
  }
}

const spot = JSON.parse(
  readFileSync("scripts/fixtures/sample-spot.json", "utf8"),
) as SolvedSpot;

console.log("액션 키와 라벨");
expect(actionKey({ kind: "check", amountBb: 0 }), "check", "체크 키");
expect(actionKey({ kind: "bet", amountBb: 2.8 }), "bet2.8", "벳 키");
expect(actionKey({ kind: "fold", amountBb: 0 }), "fold", "폴드 키");
expect(actionLabel({ kind: "check", amountBb: 0 }), "체크", "체크 라벨");
expect(actionLabel({ kind: "bet", amountBb: 2.8 }), "벳 2.8bb", "벳 라벨");
expect(actionLabel({ kind: "allin", amountBb: 20 }), "올인 20bb", "올인 라벨");

console.log(`\n통과 ${passed}, 실패 ${failed}`);
if (failed > 0) process.exit(1);
```

- [ ] **Step 2: 테스트를 실행해 실패를 확인**

`package.json`의 `scripts`에 추가 (`grading:test` 줄 다음):

```json
    "hand:test": "node --experimental-strip-types scripts/hand.test.ts"
```

Run: `npm run hand:test`
Expected: FAIL — `actionKey`가 `tree.ts`에 없어 import 오류

- [ ] **Step 3: 구현**

`src/lib/tree.ts` 끝에 추가:

```ts
const KIND_LABEL: Record<TreeActionKind, string> = {
  check: "체크",
  call: "콜",
  bet: "벳",
  raise: "레이즈",
  fold: "폴드",
  allin: "올인",
};

/** 라인 문자열 조립용 키. 금액이 있는 액션만 금액을 붙인다. */
export function actionKey(a: TreeAction): string {
  return a.amountBb > 0 ? `${a.kind}${a.amountBb}` : a.kind;
}

/** 화면 표시용. 금액이 있는 액션만 금액을 붙인다. */
export function actionLabel(a: TreeAction): string {
  const base = KIND_LABEL[a.kind];
  return a.amountBb > 0 ? `${base} ${a.amountBb}bb` : base;
}
```

- [ ] **Step 4: 테스트를 실행해 통과를 확인**

Run: `npm run hand:test`
Expected: `통과 6, 실패 0`

- [ ] **Step 5: 커밋**

```bash
git add src/lib/tree.ts scripts/hand.test.ts package.json
git commit -m "Add action keys and display labels for tree actions"
```

---

### Task 3: 노드 조회와 보드

**Files:**
- Modify: `src/lib/tree.ts`
- Modify: `scripts/hand.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`scripts/hand.test.ts`의 import를 다음으로 교체:

```ts
import {
  actionKey,
  actionLabel,
  boardAt,
  findNode,
  type SolvedSpot,
} from "../src/lib/tree.ts";
```

`console.log("\n통과 ...")` 줄 **앞에** 추가:

```ts
console.log("노드 조회");
expect(findNode(spot, "")?.street, "flop", "루트는 플랍");
expect(findNode(spot, "check")?.player, 1, "체크 후엔 IP 차례");
expect(findNode(spot, "check/check")?.street, "turn", "양쪽 체크면 턴");
expect(findNode(spot, "check/bet2.8")?.actions.length, 3, "벳에 직면하면 액션 3개");
expect(findNode(spot, "없는라인"), undefined, "없는 라인은 undefined");

console.log("보드");
expect(boardAt(spot, "flop"), ["Td", "9d", "6h"], "플랍은 3장");
expect(boardAt(spot, "turn"), ["Td", "9d", "6h", "2c"], "턴은 4장");
expect(boardAt(spot, "river"), ["Td", "9d", "6h", "2c", "7s"], "리버는 5장");
```

- [ ] **Step 2: 테스트를 실행해 실패를 확인**

Run: `npm run hand:test`
Expected: FAIL — `findNode`, `boardAt`가 없어 import 오류

- [ ] **Step 3: 구현**

`src/lib/tree.ts` 끝에 추가:

```ts
export function findNode(spot: SolvedSpot, line: string): TreeNode | undefined {
  return spot.nodes.find((n) => n.line === line);
}

/** 해당 스트릿 시점의 보드. 런아웃이 고정이라 스트릿만으로 정해진다. */
export function boardAt(spot: SolvedSpot, street: Street): string[] {
  const board = [...spot.flop];
  if (street === "turn" || street === "river") board.push(spot.runout.turn);
  if (street === "river") board.push(spot.runout.river);
  return board;
}
```

- [ ] **Step 4: 테스트를 실행해 통과를 확인**

Run: `npm run hand:test`
Expected: `통과 14, 실패 0`

- [ ] **Step 5: 커밋**

```bash
git add src/lib/tree.ts scripts/hand.test.ts
git commit -m "Look up tree nodes by line and derive the board per street"
```

---

### Task 4: 핸드별 전략과 EV 꺼내기

`strategy`는 `action * handCount + hand`로 색인된다. **이 규약을 틀리면 엉뚱한 핸드의
값이 조용히 나온다** — 이번 프로젝트에서 `shoveEvBb`를 배열로 바꿨을 때 실제로 겪은
사고다. 그래서 인덱싱을 직접 시험한다.

**Files:**
- Modify: `src/lib/tree.ts`
- Modify: `scripts/hand.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

import에 `handIndex`, `strategyFor`, `evFor` 추가. `console.log("\n통과 ...")` 앞에 추가:

```ts
console.log("핸드별 전략·EV 색인");
const root = findNode(spot, "")!;
// strategy = [체크(AhAs), 체크(7c2d), 벳(AhAs), 벳(7c2d)]
expect(handIndex(spot, 0, "AhAs"), 0, "OOP 첫 핸드 색인");
expect(handIndex(spot, 0, "7c2d"), 1, "OOP 둘째 핸드 색인");
expect(handIndex(spot, 1, "8h3s"), 1, "IP 둘째 핸드 색인");
expect(handIndex(spot, 0, "QsQd"), -1, "레인지 밖 핸드는 -1");
expect(strategyFor(root, 0), [0.2, 0.8], "AhAs는 체크 0.2 / 벳 0.8");
expect(strategyFor(root, 1), [0.8, 0.2], "7c2d는 체크 0.8 / 벳 0.2");
expect(evFor(root, 0), 6.0, "AhAs의 EV");
expect(evFor(root, 1), 1.2, "7c2d의 EV");

const faced = findNode(spot, "check/bet2.8")!;
// 액션 3개 × 핸드 2개 = [폴드(h0),폴드(h1), 콜(h0),콜(h1), 레이즈(h0),레이즈(h1)]
expect(strategyFor(faced, 0), [0.1, 0.6, 0.3], "AhAs는 폴드0.1/콜0.6/레이즈0.3");
expect(strategyFor(faced, 1), [0.6, 0.3, 0.1], "7c2d는 폴드0.6/콜0.3/레이즈0.1");
```

- [ ] **Step 2: 테스트를 실행해 실패를 확인**

Run: `npm run hand:test`
Expected: FAIL — `handIndex` 등이 없어 import 오류

- [ ] **Step 3: 구현**

`src/lib/tree.ts` 끝에 추가:

```ts
/** 핸드 이름의 색인. 레인지 밖이면 -1. */
export function handIndex(spot: SolvedSpot, player: 0 | 1, hand: string): number {
  return spot.handsByPlayer[player].indexOf(hand);
}

/**
 * 한 핸드의 액션별 빈도. strategy는 action * handCount + hand로 색인되므로
 * 핸드 이름으로 바로 접근하면 안 된다.
 */
export function strategyFor(node: TreeNode, handIdx: number): number[] {
  const handCount = node.ev.length;
  return node.actions.map((_, a) => node.strategy[a * handCount + handIdx]);
}

export function evFor(node: TreeNode, handIdx: number): number {
  return node.ev[handIdx];
}
```

- [ ] **Step 4: 테스트를 실행해 통과를 확인**

Run: `npm run hand:test`
Expected: `통과 24, 실패 0`

- [ ] **Step 5: 커밋**

```bash
git add src/lib/tree.ts scripts/hand.test.ts
git commit -m "Read per-hand strategy and EV out of a tree node"
```

---

### Task 5: 핸드 시작과 액션 적용

**Files:**
- Create: `src/lib/hand.ts`
- Modify: `scripts/hand.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`scripts/hand.test.ts` import에 추가:

```ts
import { applyAction, isOver, startHand } from "../src/lib/hand.ts";
```

`console.log("\n통과 ...")` 앞에 추가:

```ts
console.log("핸드 진행");
let st = startHand(spot);
expect(st.line, "", "시작 라인은 빈 문자열");
expect(st.street, "flop", "시작은 플랍");
expect(st.board, ["Td", "9d", "6h"], "시작 보드는 3장");
expect(st.potBb, 5.5, "시작 팟");
expect(st.node?.player, 0, "OOP가 먼저 액션");
expect(isOver(st), false, "시작은 진행 중");

st = applyAction(spot, st, 0); // OOP 체크
expect(st.line, "check", "체크 후 라인");
expect(st.street, "flop", "아직 플랍");
expect(st.node?.player, 1, "이제 IP 차례");

st = applyAction(spot, st, 0); // IP 체크 → 턴
expect(st.line, "check/check", "양쪽 체크 후 라인");
expect(st.street, "turn", "턴으로 넘어감");
expect(st.board, ["Td", "9d", "6h", "2c"], "턴 카드가 깔림");
expect(st.history.length, 2, "히스토리 2개");

console.log("종료 판정");
let f = startHand(spot);
f = applyAction(spot, f, 0); // OOP 체크
f = applyAction(spot, f, 1); // IP 벳 2.8
expect(f.line, "check/bet2.8", "벳 후 라인");
expect(f.potBb, 8.3, "벳이 팟에 반영됨");
f = applyAction(spot, f, 0); // OOP 폴드
expect(isOver(f), true, "폴드하면 종료");
expect(f.node, null, "종료 노드는 null");
```

- [ ] **Step 2: 테스트를 실행해 실패를 확인**

Run: `npm run hand:test`
Expected: FAIL — `src/lib/hand.ts`가 없어 import 오류

- [ ] **Step 3: 구현**

`src/lib/hand.ts`:

```ts
// 한 판의 진행 상태. 베팅 계산은 하지 않는다 — 팟은 솔버가 노드마다 담아온 값을 쓴다.

import {
  actionKey,
  boardAt,
  findNode,
  type SolvedSpot,
  type Street,
  type TreeAction,
  type TreeNode,
} from "./tree";

export type HandStep = {
  player: 0 | 1;
  action: TreeAction;
  street: Street;
};

export type HandState = {
  line: string;
  /** 현재 액션할 노드. null이면 핸드가 끝난 것이다. */
  node: TreeNode | null;
  street: Street;
  board: string[];
  potBb: number;
  history: HandStep[];
};

export function startHand(spot: SolvedSpot): HandState {
  const node = findNode(spot, "") ?? null;
  return {
    line: "",
    node,
    street: "flop",
    board: boardAt(spot, "flop"),
    potBb: node?.potBb ?? spot.startingPotBb,
    history: [],
  };
}

export function isOver(state: HandState): boolean {
  return state.node === null;
}

/**
 * 현재 노드에서 index번째 액션을 고른다.
 * 다음 라인에 노드가 없으면 핸드가 끝난 것이다 (폴드 또는 쇼다운).
 */
export function applyAction(
  spot: SolvedSpot,
  state: HandState,
  index: number,
): HandState {
  if (!state.node) return state;

  const action = state.node.actions[index];
  if (!action) return state;

  const line = state.line === "" ? actionKey(action) : `${state.line}/${actionKey(action)}`;
  const next = findNode(spot, line) ?? null;
  const street = next?.street ?? state.street;

  return {
    line,
    node: next,
    street,
    board: boardAt(spot, street),
    potBb: next?.potBb ?? state.potBb + action.amountBb,
    history: [...state.history, { player: state.node.player, action, street: state.street }],
  };
}
```

- [ ] **Step 4: 테스트를 실행해 통과를 확인**

Run: `npm run hand:test`
Expected: `통과 41, 실패 0`

- [ ] **Step 5: 커밋**

```bash
git add src/lib/hand.ts scripts/hand.test.ts
git commit -m "Advance a hand through streets from the solved tree"
```

---

### Task 6: 액션별 EV 손실 — 채점 연결

기존 `grading.ts`를 그대로 쓴다. 단위가 bb라 경계값도 그대로다.

**Files:**
- Modify: `src/lib/hand.ts`
- Modify: `scripts/hand.test.ts`

- [ ] **Step 1: 실패하는 테스트 작성**

`scripts/hand.test.ts` import에 `evLossByAction` 추가하고, `console.log("\n통과 ...")` 앞에 추가:

```ts
console.log("액션별 EV 손실");
// 최선 대비 손실이므로 최선 액션은 0이어야 한다.
const losses = evLossByAction([0.0, 5.5, 4.0]);
expect(losses, [5.5, 0, 1.5], "최선이 0, 나머지는 그 차이");

const allBest = evLossByAction([2.0, 2.0, 2.0]);
expect(allBest, [0, 0, 0], "전부 같으면 손실 없음");
```

- [ ] **Step 2: 테스트를 실행해 실패를 확인**

Run: `npm run hand:test`
Expected: FAIL — `evLossByAction`가 없어 import 오류

- [ ] **Step 3: 구현**

`src/lib/hand.ts` 끝에 추가:

```ts
/**
 * 각 액션을 골랐을 때 최선 대비 잃는 bb. 최선 액션은 0이다.
 * actionEvBb는 액션별 EV로, 액션 개수와 길이가 같아야 한다.
 * 단위가 bb이므로 grading.ts의 경계를 그대로 쓸 수 있다.
 */
export function evLossByAction(actionEvBb: number[]): number[] {
  const best = Math.max(...actionEvBb);
  return actionEvBb.map((ev) => Number((best - ev).toFixed(4)));
}
```

- [ ] **Step 4: 테스트를 실행해 통과를 확인**

Run: `npm run hand:test`
Expected: `통과 43, 실패 0`

- [ ] **Step 5: 전체 검증과 커밋**

```bash
npx tsc --noEmit
npm run lint
npm run hand:test
npm run grading:test
git add src/lib/hand.ts scripts/hand.test.ts
git commit -m "Compute per-action EV loss so postflop reuses the bb grading bands"
```

Expected: tsc 오류 없음, lint 경고 없음, 두 테스트 모두 통과

---

## 이 계획이 다루지 않는 것

- **UI.** `Trainer.tsx`와 `scenarios.ts`는 건드리지 않는다. 다음 계획이다.
- **실제 솔버 데이터 생성.** 픽스처는 손으로 만든 값이다. 내보내기 스크립트는
  솔버 쪽 작업이고 설계 문서 1절에 형식이 적혀 있다.
- **프리플랍.** 설계 문서 2절 참조. 되먹임 구현 전까지 프리플랍 채점 근거가 없다.
- **액션별 EV의 출처.** `evLossByAction`은 액션별 EV를 인자로 받는다. 트리에서
  그 값을 어떻게 뽑을지는 실제 내보내기 형식이 확정된 뒤에 정한다 — 지금 추측해서
  넣으면 나중에 다시 뜯어야 한다.
