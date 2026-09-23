import pushfoldData from "@/data/pushfold.json";
import { getActionFrequency, seatNames, type Position } from "./poker";
import { callEv, findCallSpot } from "./callspots";

// 학습 카테고리는 "무엇을 배우나"이고, 인원·스택은 "어떤 조건에서"다.
// 둘은 별개 축이라, 조합이 늘어나도 카테고리는 늘지 않는다.
export type ModeId = "pushfold" | "vsshove" | "rfi" | "vsopen" | "postflop" | "icm";

export type ActionId = "shove" | "call" | "open" | "fold";

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
    id: "vsshove",
    title: "올인 대응",
    summary: "블라인드에서 올인을 받았을 때, 콜할지 접을지 고릅니다.",
    available: true,
  },
  {
    id: "rfi",
    title: "프리플랍 오프닝",
    summary: "깊은 스택에서 첫 번째로 레이즈할 핸드를 고릅니다.",
    available: false,
    unavailableReason: "레인지 데이터 검증 중입니다",
  },
  {
    id: "vsopen",
    title: "오픈 대응",
    summary: "앞에서 레이즈가 들어왔을 때 3벳·콜·폴드를 고릅니다.",
    available: false,
    unavailableReason: "레인지 데이터 계산 전입니다",
  },
  {
    id: "postflop",
    title: "플랍 이후 판단",
    summary: "보드가 깔린 뒤 벳·체크·폴드를 고릅니다.",
    available: false,
    unavailableReason: "레인지 데이터 계산 전입니다",
  },
  {
    id: "icm",
    title: "ICM 버블 판단",
    summary: "상금권 직전, 칩이 아니라 상금 기준으로 판단합니다.",
    available: false,
    unavailableReason: "레인지 데이터 계산 전입니다",
  },
];

type PushfoldSpot = {
  tableSize: number;
  stackBb: number;
  anteBb: number;
  position: string;
  shoveFrequencyPct: number;
  exploitabilityBb: number;
  shove: Record<string, number>;
  /** 올인의 EV(폴드 대비, bb). 폴드 EV가 0이라 이 값이 두 액션의 EV 차이다.
   *  핸드 이름을 키로 쓰면 169개 키가 스팟마다 되풀이되므로 hands 순서의 배열로 담는다. */
  shoveEvBb: number[];
};

// 스팟마다 shove의 키 집합이 달라서 TS는 JSON을 선택적 프로퍼티 유니온으로 추론한다.
// 런타임 모양은 아래 타입이 맞으므로 unknown을 거쳐 단언한다.
const PUSHFOLD = pushfoldData as unknown as {
  generatedAt: string;
  model: string;
  anteBb: number;
  hands: string[];
  spots: PushfoldSpot[];
};

/** shoveEvBb 같은 배열을 핸드 이름으로 읽기 위한 색인. */
const HAND_INDEX = new Map(PUSHFOLD.hands.map((h, i) => [h, i]));

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
  /** BB 앤티. 화면의 팟·스택 표시가 솔버가 푼 게임과 같아야 한다. */
  anteBb: number;
  position: string;
  /** 올인 대응에서 먼저 올인한 자리. 다른 모드는 null. */
  shoverPosition: string | null;
  actions: ActionId[];
};

export const ACTION_LABEL: Record<ActionId, string> = {
  shove: "올인",
  call: "콜",
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
      anteBb: PUSHFOLD.anteBb,
      position: pick(positions),
      shoverPosition: null,
      actions: ["fold", "shove"],
    };
  }

  if (scenario.mode === "vsshove") {
    const stackBb = scenario.stackBb ?? pick(PUSHFOLD_STACKS);
    // 콜러는 블라인드만 다룬다. 이 모델의 콜 레인지는 사실상 "내가 마지막
    // 액션자일 때"의 답이다 — 콜러 뒤에 남은 사람이 또 콜할 가능성을 무시하기
    // 때문에, 뒤에 사람이 많을수록 실제보다 넓게 나온다. BB는 뒤에 아무도 없어
    // 근사가 아니라 정확하고, SB는 BB 하나만 남아 오차가 작다. 그 밖의 자리는
    // 9인 UTG1처럼 뒤에 여섯 명이 남기도 해서 가르칠 수 있는 값이 아니다.
    // (블라인드 방어는 실제로도 가장 자주 마주치는 콜 스팟이다.)
    const names = seatNames(scenario.tableSize);
    const callerIdx = Math.random() < 0.5 ? names.length - 1 : names.length - 2;
    // 올인한 사람은 콜러보다 앞자리여야 한다.
    const shoverIdx = Math.floor(Math.random() * callerIdx);
    return {
      tableSize: scenario.tableSize,
      stackBb,
      anteBb: PUSHFOLD.anteBb,
      position: names[callerIdx],
      shoverPosition: names[shoverIdx],
      actions: ["fold", "call"],
    };
  }
  // rfi는 아직 비활성이지만 구조는 같은 모양으로 유지한다.
  // rfi는 딥스택 캐시 게임 가정이라 앤티가 없다.
  return {
    tableSize: scenario.tableSize,
    stackBb: scenario.stackBb ?? 100,
    anteBb: 0,
    position: pick(pushfoldPositions(scenario.tableSize)),
    shoverPosition: null,
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
  if (mode === "vsshove") {
    const spot = situation.shoverPosition
      ? findCallSpot(
          situation.tableSize,
          situation.stackBb,
          situation.shoverPosition,
          situation.position,
        )
      : undefined;
    const call = Math.round((spot?.call[handCode] ?? 0) * 100);
    return { call, fold: 100 - call };
  }
  if (mode === "rfi") {
    const freq = getActionFrequency(situation.position as Position, handCode);
    return { open: freq.open, fold: freq.fold };
  }
  // 준비 중인 모드. 메뉴에서 시작이 막혀 있어 여기 닿지 않지만,
  // 다른 모드의 정답을 잘못 돌려주느니 빈 값을 낸다.
  return {};
}

/**
 * 각 액션의 EV(bb). 푸시/폴드는 폴드를 0으로 두고 올인의 EV를 그 상대값으로 준다
 * (해설 패널이 "폴드 0 EV / 올인 -0.38 EV"처럼 나란히 보여주기 위한 값).
 * 아직 계산된 데이터가 없는 모드는 null.
 */
/** 올인 대응 스팟에서 콜의 EV(bb). 데이터가 아직 안 불러와졌으면 null. */
function callSpotEv(situation: Situation, handCode: string): number | null {
  if (!situation.shoverPosition) return null;
  const spot = findCallSpot(
    situation.tableSize,
    situation.stackBb,
    situation.shoverPosition,
    situation.position,
  );
  return spot ? callEv(spot, handCode) : null;
}

function shoveEv(situation: Situation, handCode: string): number | null {
  const spot = findSpot(situation.tableSize, situation.stackBb, situation.position);
  const i = HAND_INDEX.get(handCode);
  if (!spot || i === undefined) return null;
  const ev = spot.shoveEvBb?.[i];
  return ev === undefined ? null : ev;
}

export function actionEvFor(
  mode: ModeId,
  situation: Situation,
  handCode: string,
): Partial<Record<ActionId, number>> | null {
  if (mode === "vsshove") {
    const ev = callSpotEv(situation, handCode);
    return ev === null ? null : { fold: 0, call: ev };
  }
  if (mode !== "pushfold") return null;
  const ev = shoveEv(situation, handCode);
  if (ev === null) return null;
  return { fold: 0, shove: ev };
}

/**
 * 고른 액션이 최선 대비 잃는 EV(bb). 최선을 골랐으면 0.
 * 빈도와 달리 "얼마나" 틀렸는지를 재는 값이라, 기록과 채점의 기준이 된다.
 * 아직 계산된 데이터가 없는 모드는 null.
 */
export function evLossFor(
  mode: ModeId,
  situation: Situation,
  handCode: string,
  action: ActionId,
): number | null {
  if (mode === "vsshove") {
    const ev = callSpotEv(situation, handCode);
    if (ev === null) return null;
    if (action === "call") return ev >= 0 ? 0 : Number((-ev).toFixed(4));
    if (action === "fold") return ev <= 0 ? 0 : Number(ev.toFixed(4));
    return null;
  }
  if (mode !== "pushfold") return null;
  const ev = shoveEv(situation, handCode);
  if (ev === null) return null;
  if (action === "shove") return ev >= 0 ? 0 : Number((-ev).toFixed(4));
  if (action === "fold") return ev <= 0 ? 0 : Number(ev.toFixed(4));
  return null;
}

/** 이 스팟의 계산 오차(bb). 데이터 신뢰도를 사용자에게 보여주기 위한 값이다. */
export function exploitabilityFor(situation: Situation): number | null {
  // 올인 대응 스팟은 자기 오차를 따로 담지 않는다. 히어로 자리로 올인 스팟을
  // 찾으면 전혀 다른 스팟의 숫자를 보여주게 되므로 그냥 비운다.
  if (situation.shoverPosition) return null;
  const spot = findSpot(situation.tableSize, situation.stackBb, situation.position);
  return spot?.exploitabilityBb ?? null;
}

export const PUSHFOLD_META = {
  generatedAt: PUSHFOLD.generatedAt,
  model: PUSHFOLD.model,
  anteBb: PUSHFOLD.anteBb,
};
