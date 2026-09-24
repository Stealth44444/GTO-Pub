// 13×13 레인지 격자.
//
// EV 숫자만 보면 그 스팟의 답을 외우게 된다. 레인지 전체를 보면 원리가 남는다 —
// 내 핸드만 벳인 게 아니라 이 구역이 통째로 벳이고, 내 핸드가 그 경계 어디쯤에
// 있는지가 보여야 다음 스팟에서도 써먹는다.
//
// 격자 관례: 대각선은 포켓페어, 오른쪽 위는 수티드, 왼쪽 아래는 오프수트.

import { strategyFor, type TreeNode } from "./tree.ts";

export const GRID_RANKS = "AKQJT98765432".split("");

/** "AhKs" → "AKo" */
export function comboToClass(combo: string): string {
  const order = "23456789TJQKA";
  const [r1, s1, r2, s2] = [combo[0], combo[1], combo[2], combo[3]];
  if (r1 === r2) return r1 + r2;
  const hi = order.indexOf(r1) > order.indexOf(r2) ? r1 : r2;
  const lo = hi === r1 ? r2 : r1;
  return hi + lo + (s1 === s2 ? "s" : "o");
}

/** 격자 칸 (row, col) 이 나타내는 핸드 코드. */
export function cellCode(row: number, col: number): string {
  const a = GRID_RANKS[row];
  const b = GRID_RANKS[col];
  if (row === col) return a + a;
  return row < col ? a + b + "s" : b + a + "o";
}

/**
 * 격자에 그릴 것. 화면 컴포넌트가 솔버 구조를 몰라도 되게 여기서 평평하게 만든다.
 * 프리플랍과 포스트플랍은 데이터 모양이 다른데, 이 형태로 맞추면 격자는 하나면 된다.
 */
export type RangeView = {
  /** 핸드 코드 → 액션별 빈도(합 1). 레인지 밖 핸드는 키가 없다. */
  freqByCode: Record<string, number[]>;
  actionLabels: string[];
  actionKinds: string[];
  /** 히어로가 든 핸드의 코드. */
  heroCode: string | null;
};

export type Cell = {
  code: string;
  freq: number[] | null;
  isHero: boolean;
};

export function buildGrid(view: RangeView): Cell[][] {
  return GRID_RANKS.map((_, row) =>
    GRID_RANKS.map((__, col) => {
      const code = cellCode(row, col);
      return {
        code,
        freq: view.freqByCode[code] ?? null,
        isHero: code === view.heroCode,
      };
    }),
  );
}

/**
 * 포스트플랍 노드의 전략을 코드별로 접는다.
 *
 * 한 코드에는 여러 조합이 들어간다(AKo는 12개). 조합마다 전략이 다를 수 있어
 * 남아 있는 조합의 평균을 쓴다 — 보드와 겹쳐 빠진 조합은 애초에 목록에 없다.
 */
export function fromNode(
  node: TreeNode,
  combos: string[],
  labels: string[],
  heroCombo: string | null,
): RangeView {
  const sum = new Map<string, number[]>();
  const count = new Map<string, number>();
  for (let i = 0; i < combos.length; i++) {
    const code = comboToClass(combos[i]);
    const freq = strategyFor(node, i);
    const acc = sum.get(code);
    if (acc) {
      for (let a = 0; a < freq.length; a++) acc[a] += freq[a];
      count.set(code, (count.get(code) ?? 0) + 1);
    } else {
      sum.set(code, [...freq]);
      count.set(code, 1);
    }
  }
  const freqByCode: Record<string, number[]> = {};
  for (const [code, acc] of sum) {
    const n = count.get(code) ?? 1;
    freqByCode[code] = acc.map((v) => v / n);
  }
  return {
    freqByCode,
    actionLabels: labels,
    actionKinds: node.actions.map((a) => a.kind),
    heroCode: heroCombo ? comboToClass(heroCombo) : null,
  };
}

/**
 * 프리플랍은 이미 코드별 빈도라 접을 것이 없다. 액션마다 레인지가 따로 오므로,
 * 합이 1이 되도록 나머지를 첫 액션(폴드)에 몰아준다.
 */
export function fromRanges(
  hands: string[],
  labels: string[],
  kinds: string[],
  ranges: (Record<string, number> | null)[],
  heroCode: string | null,
): RangeView {
  const freqByCode: Record<string, number[]> = {};
  for (const code of hands) {
    const freq = ranges.map((r) => (r ? (r[code] ?? 0) : 0));
    const taken = freq.reduce((a, b) => a + b, 0);
    // 첫 액션이 폴드다. 나머지 빈도의 여집합이 폴드 빈도가 된다.
    freq[0] = Math.max(0, 1 - taken);
    freqByCode[code] = freq;
  }
  return { freqByCode, actionLabels: labels, actionKinds: kinds, heroCode };
}

/**
 * 액션별 색. 폴드는 회색, 체크는 어두운 중립, 콜은 밝은 강조, 벳·레이즈·올인은
 * 진한 강조에서 위험색으로 간다. 공격 액션이 여럿이면 뒤로 갈수록(큰 사이즈)
 * 붉어지게 해서 격자만 봐도 공격의 세기가 읽히게 한다.
 */
export function actionColor(kind: string, index: number, kinds: string[]): string {
  if (kind === "fold") return "#333a42";
  if (kind === "check") return "#4a5560";
  if (kind === "call") return "var(--gw-accent)";
  const aggressive = kinds.filter((k) => k !== "fold" && k !== "check" && k !== "call");
  const at = aggressive.indexOf(kind) < 0 ? 0 : aggressive.lastIndexOf(kind);
  const t = aggressive.length > 1 ? at / (aggressive.length - 1) : 0;
  void index;
  return t < 0.5 ? "var(--gw-accent-strong)" : "var(--gw-danger)";
}
