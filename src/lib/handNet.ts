// 한 판에서 히어로가 실제로 얻거나 잃은 칩(bb). 토너먼트 런의 스택이 이걸로 움직인다.
//
// 채점(EV 손실)과는 다른 값이다. 채점은 판단의 질이고, 이건 카드가 떨어진 결과다.
// 런은 둘을 나란히 보여준다 — 잘 치고 지는 판이 있다는 것을 숫자로 보이기 위해서다.
//
// 이긴 쪽이 팟 전체를 가져가고, 각자 낸 만큼 잃는다. 콜되지 않은 벳도 이 식으로
// 맞는다: 팟에 들어 있다가 이긴 사람이 가져가므로 결국 자기 돈이 돌아온다.
//
// import에 .ts를 붙이는 이유는 hand.ts와 같다(node 테스트와 Next 양쪽에서 로드).

import type { HandStep } from "./hand.ts";

export type Winner = "hero" | "villain" | "tie";

function settle(potBb: number, heroInBb: number, winner: Winner): number {
  const back = winner === "hero" ? potBb : winner === "tie" ? potBb / 2 : 0;
  return Math.round((back - heroInBb) * 100) / 100;
}

/**
 * 스택이 칠 깊이보다 적을 때, 모든 자리의 투입을 그 스택에서 자른다.
 *
 * 5bb로 8bb 올인 대결을 하면 상대의 8 중 5만 걸리고 나머지는 돌아간다. 접은
 * 블라인드도 5를 넘을 수는 없다 — 히어로가 받을 수 있는 몫은 자리마다 자기
 * 스택만큼이다. 그래서 자리마다 자르면 이기는 쪽과 지는 쪽이 대칭이 된다.
 */
export function capCommitted(
  committed: Record<string, number>,
  capBb: number | undefined,
): Record<string, number> {
  if (capBb === undefined) return committed;
  return Object.fromEntries(
    Object.entries(committed).map(([seat, v]) => [seat, Math.min(v, capBb)]),
  );
}

/**
 * 프리플랍에서 끝난 판. committed는 자리별 최종 투입액(블라인드·앤티 포함)이다.
 * 팟은 모두의 투입액 합이다 — 접은 자리의 블라인드도 팟에 남는다.
 */
export function preflopNet(
  committed: Record<string, number>,
  heroSeat: string,
  winner: Winner,
): number {
  const pot = Object.values(committed).reduce((a, b) => a + b, 0);
  return settle(pot, committed[heroSeat] ?? 0, winner);
}

/**
 * 플랍 이후까지 간 판.
 *
 * startingPotBb는 플랍 시점의 팟(프리플랍 투입액 합), heroPreflopBb는 그 안에서
 * 히어로가 낸 몫이다. 포스트플랍 투입은 액션 기록에서 센다 — 콜은 amountBb가
 * 0으로 기록되므로 그 스트릿에서 상대가 낸 만큼으로 맞춘다(tableView.ts와 같은 규칙).
 */
export function postflopNet(
  startingPotBb: number,
  heroPreflopBb: number,
  history: HandStep[],
  heroPlayer: 0 | 1,
  winner: Winner,
): number {
  const total: [number, number] = [0, 0];
  let street: string | null = null;
  let cur: [number, number] = [0, 0];
  const flush = () => {
    total[0] += cur[0];
    total[1] += cur[1];
    cur = [0, 0];
  };
  for (const step of history) {
    if (step.street !== street) {
      flush();
      street = step.street;
    }
    if (step.action.kind === "call") cur[step.player] = cur[1 - step.player];
    else cur[step.player] += step.action.amountBb;
  }
  flush();
  const pot = startingPotBb + total[0] + total[1];
  return settle(pot, heroPreflopBb + total[heroPlayer], winner);
}
