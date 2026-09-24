// 오픈 하나에 콜 하나가 붙었을 때의 팟과 남은 스택.
//
// SPR은 "남은 유효스택 ÷ 팟"이다. 20bb 게임에서 플랍 이후를 결정하는 건
// 사실상 이 숫자 하나다. 그런데 앤티를 세느냐 마느냐로 값이 2.5도 되고 3.2도
// 되어, 어느 쪽을 보고 있는지 모르면 전혀 다른 게임을 배우게 된다.
//
// 그래서 글에 숫자를 적어두지 않고 여기서 센다. 스택이나 오픈 사이즈를 바꾸면
// 글도 같이 바뀐다.

import type { SeatsData } from "./seatGame.ts";

export type SprCase = {
  /** 이 경우의 이름. "앤티 1bb" / "앤티 없음" */
  label: string;
  potBb: number;
  /** 두 사람 중 적은 쪽의 남은 스택. 그게 실제로 걸 수 있는 전부다. */
  effectiveStackBb: number;
  spr: number;
};

/**
 * BB가 오픈에 콜했을 때. 이 앱의 포스트플랍 스팟이 바로 이 조건이다.
 *
 * BB가 유효스택을 정한다. 블라인드 1bb와 앤티 1bb를 자기 스택에서 이미 냈고
 * 거기에 콜까지 얹으므로, 오픈한 쪽보다 항상 적게 남는다.
 */
export function sprAfterCall(data: SeatsData, anteBb = data.anteBb): SprCase {
  const open = data.openToBb;
  // SB 0.5 + BB의 블라인드와 앤티 + 양쪽이 open까지 맞춘 금액.
  const potBb = round2(0.5 + anteBb + open * 2);
  const bbLeft = round2(data.stackBb - anteBb - open);
  const openerLeft = round2(data.stackBb - open);
  const effectiveStackBb = Math.min(bbLeft, openerLeft);
  return {
    label: anteBb > 0 ? `앤티 ${anteBb}bb` : "앤티 없음",
    potBb,
    effectiveStackBb,
    spr: Math.round((effectiveStackBb / potBb) * 10) / 10,
  };
}

/** 앤티가 있을 때와 없을 때. 둘을 나란히 놓아야 앤티가 무엇을 바꾸는지 보인다. */
export function sprCases(data: SeatsData): SprCase[] {
  return [sprAfterCall(data), sprAfterCall(data, 0)];
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}
