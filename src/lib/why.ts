// 왜 그런지.
//
// EV 숫자만 보면 외우게 된다. "AJo로 UTG 올인에 콜하면 -0.4bb"를 외운 사람은
// 스택이 18bb가 되는 순간 아무것도 모른다. 그 값이 어디서 나왔는지 — 얼마를
// 내고 얼마를 노리며 이길 확률이 얼마인지 — 를 보면 조건이 바뀌어도 따라간다.
//
// 여기서 다루는 것은 올인에 대한 콜 하나뿐이다. 그 자리에서는 승률이 전부라
// 숫자 두 개로 결론까지 닿는다. 오픈이나 플랫콜은 뒤에 칠 스트릿이 남아 있어
// 승률만으로 말할 수 없고, 말할 수 없는 것을 말하면 그게 더 나쁜 학습이다.

import type { SeatsData, Stage } from "./seatGame.ts";

export type PotOdds = {
  /** 콜하려면 더 내야 하는 금액. */
  toCallBb: number;
  /** 콜하기 직전 판에 깔린 금액. 내가 이미 낸 것도 포함한다 — 이미 내 돈이 아니다. */
  potBb: number;
  /** 이만큼은 이겨야 본전. */
  needPct: number;
};

/** SB·BB·앤티처럼 액션 전에 이미 나간 돈. */
function postedOf(data: SeatsData, seat: string): number {
  if (seat === "BB") return 1 + data.anteBb;
  if (seat === "SB") return 0.5;
  return 0;
}

/**
 * 올인에 콜할 때의 팟 오즈.
 *
 * 올인한 쪽은 스택 전부를 넣었다. 그중 블라인드로 이미 나가 있던 몫은 판에
 * 두 번 세면 안 되므로 빼고 더한다.
 */
export function jamPotOdds(
  data: SeatsData,
  heroSeat: string,
  stage: Extract<Stage, { kind: "vsJam" }>,
): PotOdds {
  const blinds = 1.5 + data.anteBb;
  const jammerAdds = data.stackBb - postedOf(data, stage.jammer);
  const heroIn = stage.iOpened ? data.openToBb : postedOf(data, heroSeat);
  // 내가 오픈했다면 오픈액에서 블라인드 몫을 뺀 만큼이 추가로 들어가 있다.
  const heroAdds = stage.iOpened ? data.openToBb - postedOf(data, heroSeat) : 0;
  // 3벳 올인 뒤에 앉았다면 오프너가 낸 오픈액도 팟에 있다.
  const openerAdds = stage.opener ? data.openToBb - postedOf(data, stage.opener) : 0;

  const potBb = round2(blinds + jammerAdds + heroAdds + openerAdds);
  const toCallBb = round2(data.stackBb - heroIn);
  return {
    toCallBb,
    potBb,
    needPct: toCallBb <= 0 ? 0 : round1((toCallBb / (potBb + toCallBb)) * 100),
  };
}

/** 이 상황에서 올인한 쪽의 레인지. 없으면 null. */
export function jamRangeOf(
  data: SeatsData,
  heroSeat: string,
  stage: Extract<Stage, { kind: "vsJam" }>,
): Record<string, number> | null {
  // 내가 열었다가 3벳 올인을 맞았다면, 그 3벳 레인지는 "내 스팟" 안에 있다.
  if (stage.iOpened) return data.seats[heroSeat]?.vsOpenJam?.[stage.jammer] ?? null;
  // 남의 오픈 위에 나온 3벳 올인이면 그 레인지는 오프너의 스팟 안에 있다.
  if (stage.opener) return data.seats[stage.opener]?.vsOpenJam?.[stage.jammer] ?? null;
  return data.seats[stage.jammer]?.openJam ?? null;
}

function round1(v: number): number {
  return Math.round(v * 10) / 10;
}
function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
