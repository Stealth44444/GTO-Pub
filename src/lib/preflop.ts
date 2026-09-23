// 프리플랍 액션 시퀀스. 화면이 "누가 언제 얼마를 넣었는지"를 재생할 수 있어야
// 팟이 순간이동하지 않는다.
//
// 한 스텝은 그 자리가 액션을 마친 뒤의 *누적* 투입액을 들고 있다. 증분이 아니라
// 누적인 이유는 두 가지다. 자리 앞에 놓이는 칩이 곧 누적액이고, 팟은 모든 자리의
// 누적액을 더한 값이라 중간 계산 없이 바로 나온다.

import { seatNames, postedBlind } from "./poker.ts";

export type PreflopActionKind = "fold" | "check" | "call" | "raise" | "allin";

export type PreflopStep = {
  seat: string;
  kind: PreflopActionKind;
  /** 이 액션을 마친 뒤 그 자리가 낸 누적 금액(bb). 블라인드를 포함한다. */
  committedBb: number;
};

const KIND_LABEL: Record<PreflopActionKind, string> = {
  fold: "FOLD",
  check: "CHECK",
  call: "CALL",
  raise: "RAISE",
  allin: "ALL-IN",
};

export function stepLabel(step: PreflopStep): string {
  return KIND_LABEL[step.kind];
}

/**
 * 스텝을 count개까지 재생했을 때 각 자리의 누적 투입액.
 * 아직 액션하지 않은 자리는 이미 낸 블라인드가 그대로 남는다.
 */
export function committedBySeat(
  tableSize: number,
  anteBb: number,
  steps: PreflopStep[],
  count: number,
): Record<string, number> {
  const committed: Record<string, number> = {};
  for (const seat of seatNames(tableSize)) {
    committed[seat] = postedBlind(tableSize, seat, anteBb);
  }
  for (const step of steps.slice(0, count)) {
    committed[step.seat] = step.committedBb;
  }
  return committed;
}

/**
 * 그 시점의 팟. 폴드한 자리가 이미 넣은 블라인드도 팟에 남으므로 전부 더한다.
 */
export function potFromScript(
  tableSize: number,
  anteBb: number,
  steps: PreflopStep[],
  count: number,
): number {
  const committed = committedBySeat(tableSize, anteBb, steps, count);
  const total = Object.values(committed).reduce((sum, value) => sum + value, 0);
  // 0.5bb 단위가 부동소수로 흐트러지면 팟 표시가 5.500000000000001이 된다.
  return Math.round(total * 100) / 100;
}

/**
 * 푸시/폴드 스팟. 히어로가 첫 판단을 하는 자리이므로 앞자리는 전부 폴드하고,
 * 올인한 자리가 있으면 그 자리만 스택을 통째로 넣는다.
 *
 * 히어로 자신과 그 뒷자리는 넣지 않는다. 아직 액션 전이다.
 */
export function pushFoldScript(
  tableSize: number,
  heroSeat: string,
  shoverSeat: string | null,
  stackBb: number,
  anteBb: number,
): PreflopStep[] {
  const names = seatNames(tableSize);
  const heroIdx = names.indexOf(heroSeat);
  const steps: PreflopStep[] = [];
  for (let i = 0; i < heroIdx; i++) {
    const seat = names[i];
    steps.push(
      seat === shoverSeat
        ? { seat, kind: "allin", committedBb: stackBb }
        : { seat, kind: "fold", committedBb: postedBlind(tableSize, seat, anteBb) },
    );
  }
  return steps;
}

/**
 * 그 자리가 낸 앤티. BB 앤티 구조라 BB만 낸다.
 *
 * 앤티는 죽은 돈이어서 베팅을 맞추는 데 쓰이지 않는다. BB가 2.5bb 오픈에
 * 콜하면 총 투입은 2.5가 아니라 2.5 + 앤티다. 이걸 빼먹으면 팟이 앤티만큼
 * 작게 나온다.
 */
function anteOf(tableSize: number, seat: string, anteBb: number): number {
  return seat === seatNames(tableSize)[tableSize - 1] ? anteBb : 0;
}

/**
 * 싱글레이즈 팟. 오프너가 레이즈하고 한 명이 받는다. 그 사이 자리는 폴드한다.
 * 포스트플랍 스팟(예: srp-btn-bb)이 전제하는 프리플랍이 바로 이 모양이다.
 *
 * 콜러까지 재생하므로, 이 스크립트가 끝나면 플랍으로 넘어간다.
 */
export function singleRaisedPotScript(
  tableSize: number,
  openerSeat: string,
  callerSeat: string,
  openToBb: number,
  anteBb: number,
): PreflopStep[] {
  const names = seatNames(tableSize);
  const openerIdx = names.indexOf(openerSeat);
  const callerIdx = names.indexOf(callerSeat);
  const steps: PreflopStep[] = [];

  names.forEach((seat, i) => {
    const toBb = openToBb + anteOf(tableSize, seat, anteBb);
    if (i === openerIdx) {
      steps.push({ seat, kind: "raise", committedBb: toBb });
    } else if (i === callerIdx) {
      steps.push({ seat, kind: "call", committedBb: toBb });
    } else {
      steps.push({ seat, kind: "fold", committedBb: postedBlind(tableSize, seat, anteBb) });
    }
  });

  // 콜러 뒤에 남은 자리는 액션할 기회가 없다. 콜러에서 끊는다.
  const lastIdx = steps.findIndex((s) => s.seat === callerSeat);
  return steps.slice(0, lastIdx + 1);
}
