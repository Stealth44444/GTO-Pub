// 이 자리에서 레인지 전체는 무엇을 하는가.
//
// 격자는 "내 패로 뭘 할까"를 보여준다. 그런데 배워야 할 것은 그 위에 있다 —
// 이 보드에서 오프너가 전체의 68%를 벳한다는 사실을 알면, 내 패 하나의 답이
// 아니라 왜 그런 답이 나오는지가 보인다.
//
// 그냥 평균을 내면 안 된다. 노드까지 오는 동안 접은 핸드가 여전히 분모에
// 남기 때문이다. 플랍에서 체크한 뒤의 턴 노드에서 "벳 40%"라고 하면, 실제로는
// 플랍에서 벳하고 갈라져 나간 강한 패까지 세고 있는 것이다.

import { actionKey, findNode, strategyFor, type SolvedSpot, type TreeNode } from "./tree.ts";

export type MixRow = {
  label: string;
  pct: number;
  /** 격자와 같은 색을 칠하려면 종류가 필요하다. 라벨은 금액이 붙어 못 쓴다. */
  kind: string;
};

/**
 * 이 라인까지 왔을 때 이 플레이어의 핸드별 도달 확률.
 *
 * 시작 비중에 자기가 지나온 액션의 빈도를 곱해 나간다. 상대의 액션은 곱하지
 * 않는다 — 상대가 무엇을 했든 내 패의 분포는 내 선택으로만 좁혀진다.
 */
export function reachWeights(spot: SolvedSpot, line: string, player: 0 | 1): number[] {
  const weights = [...spot.handWeightsByPlayer[player]];
  if (line === "") return weights;

  const keys = line.split("/");
  let prefix = "";
  for (const key of keys) {
    const node = findNode(spot, prefix);
    prefix = prefix === "" ? key : `${prefix}/${key}`;
    if (!node) break;
    if (node.player !== player) continue;
    const a = node.actions.findIndex((act) => actionKey(act) === key);
    if (a < 0) break;
    for (let h = 0; h < weights.length; h++) {
      weights[h] *= node.strategy[a * node.handCount + h];
    }
  }
  return weights;
}

/**
 * 도달 확률로 무게를 준 액션별 빈도(%).
 *
 * 합으로 나눠 100%가 되게 맞춘다. 익스포터가 빈도를 소수 둘째 자리로 반올림해
 * 한 핸드의 합이 0.99가 되곤 하는데, 그대로 두면 화면에 "체크 61.2 / 벳 37.8"
 * 같은 값이 떠서 나머지 1%가 어디 갔는지 묻게 된다.
 *
 * 합이 0이면 이 라인에 오는 핸드가 없다는 뜻이다. null을 돌려주고 줄을 감춘다.
 */
export function rangeMix(
  node: TreeNode,
  weights: number[],
  labels: string[],
): MixRow[] | null {
  const totals = node.actions.map(() => 0);

  for (let h = 0; h < node.handCount; h++) {
    const w = weights[h] ?? 0;
    if (w <= 0) continue;
    const freq = strategyFor(node, h);
    for (let a = 0; a < totals.length; a++) totals[a] += w * freq[a];
  }

  const grand = totals.reduce((sum, v) => sum + v, 0);
  if (grand <= 0) return null;

  return totals.map((v, a) => ({
    label: labels[a],
    kind: node.actions[a].kind,
    pct: Math.round((v / grand) * 1000) / 10,
  }));
}
