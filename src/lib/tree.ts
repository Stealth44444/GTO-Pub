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
