import pushfoldData from "@/data/pushfold.json";
import { getActionFrequency, type Position } from "./poker";

// 학습 카테고리는 "무엇을 배우나"이고, 인원·스택은 "어떤 조건에서"다.
// 둘은 별개 축이라, 조합이 늘어나도 카테고리는 늘지 않는다.
export type ModeId = "pushfold" | "rfi";

export type ActionId = "shove" | "open" | "fold";

export type ModeInfo = {
  id: ModeId;
  title: string;
  summary: string;
  /** 준비되지 않은 모드는 메뉴에서 선택할 수 없다. */
  available: boolean;
  unavailableReason?: string;
};

export const MODES: ModeInfo[] = [
  {
    id: "pushfold",
    title: "숏스택 올인 판단",
    summary: "블라인드가 올라 스택이 얕아졌을 때, 올인할지 접을지 고릅니다.",
    available: true,
  },
  {
    id: "rfi",
    title: "프리플랍 오프닝",
    summary: "깊은 스택에서 첫 번째로 레이즈할 핸드를 고릅니다.",
    available: false,
    unavailableReason: "레인지 데이터 검증 중입니다",
  },
];

type PushfoldSpot = {
  tableSize: number;
  stackBb: number;
  position: string;
  shoveFrequencyPct: number;
  exploitabilityBb: number;
  shove: Record<string, number>;
};

const PUSHFOLD = pushfoldData as {
  generatedAt: string;
  model: string;
  spots: PushfoldSpot[];
};

export const PUSHFOLD_TABLE_SIZES = [...new Set(PUSHFOLD.spots.map((s) => s.tableSize))].sort(
  (a, b) => a - b,
);

export const PUSHFOLD_STACKS = [...new Set(PUSHFOLD.spots.map((s) => s.stackBb))].sort(
  (a, b) => a - b,
);

export function pushfoldPositions(tableSize: number): string[] {
  return PUSHFOLD.spots.filter((s) => s.tableSize === tableSize).map((s) => s.position);
}

function findSpot(tableSize: number, stackBb: number, position: string): PushfoldSpot | undefined {
  return PUSHFOLD.spots.find(
    (s) => s.tableSize === tableSize && s.stackBb === stackBb && s.position === position,
  );
}

/** 한 판의 조건. 트레이너는 이 설정만 보고 동작한다. */
export type Scenario = {
  mode: ModeId;
  tableSize: number;
  /** 고정 스택. null이면 매 핸드 무작위로 고른다. */
  stackBb: number | null;
};

export const DEFAULT_SCENARIO: Scenario = {
  mode: "pushfold",
  tableSize: 9,
  stackBb: null,
};

/** 한 핸드에서 히어로가 놓인 구체적 상황. */
export type Situation = {
  tableSize: number;
  stackBb: number;
  position: string;
  actions: ActionId[];
};

export const ACTION_LABEL: Record<ActionId, string> = {
  shove: "올인",
  open: "오픈",
  fold: "폴드",
};

function pick<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

export function randomSituation(scenario: Scenario): Situation {
  if (scenario.mode === "pushfold") {
    const stackBb = scenario.stackBb ?? pick(PUSHFOLD_STACKS);
    const positions = pushfoldPositions(scenario.tableSize);
    return {
      tableSize: scenario.tableSize,
      stackBb,
      position: pick(positions),
      actions: ["fold", "shove"],
    };
  }
  // rfi는 아직 비활성이지만 구조는 같은 모양으로 유지한다.
  return {
    tableSize: scenario.tableSize,
    stackBb: scenario.stackBb ?? 100,
    position: pick(pushfoldPositions(scenario.tableSize)),
    actions: ["fold", "open"],
  };
}

/** 각 액션의 정답 빈도(%). 합은 100이다. */
export type ActionFrequencies = Partial<Record<ActionId, number>>;

export function solutionFor(
  mode: ModeId,
  situation: Situation,
  handCode: string,
): ActionFrequencies {
  if (mode === "pushfold") {
    const spot = findSpot(situation.tableSize, situation.stackBb, situation.position);
    const shove = Math.round((spot?.shove[handCode] ?? 0) * 100);
    return { shove, fold: 100 - shove };
  }
  const freq = getActionFrequency(situation.position as Position, handCode);
  return { open: freq.open, fold: freq.fold };
}

/** 이 스팟의 계산 오차(bb). 데이터 신뢰도를 사용자에게 보여주기 위한 값이다. */
export function exploitabilityFor(situation: Situation): number | null {
  const spot = findSpot(situation.tableSize, situation.stackBb, situation.position);
  return spot?.exploitabilityBb ?? null;
}

export const PUSHFOLD_META = {
  generatedAt: PUSHFOLD.generatedAt,
  model: PUSHFOLD.model,
};
