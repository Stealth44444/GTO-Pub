// 한 판의 진행 상태. 베팅 계산은 하지 않는다 — 팟은 솔버가 노드마다 담아온 값을 쓴다.
//
// import에 .ts 확장자를 붙이는 이유: 이 모듈은 Next 번들러와
// `node --experimental-strip-types`(scripts/hand.test.ts) 양쪽에서 로드된다.
// node는 확장자를 생략할 수 없고, tsconfig의 allowImportingTsExtensions가 켜져 있다.

import {
  actionKey,
  boardAt,
  findNode,
  type SolvedSpot,
  type Street,
  type TreeAction,
  type TreeNode,
} from "./tree.ts";

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
