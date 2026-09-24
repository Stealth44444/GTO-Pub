// 포스트플랍 핸드 상태를 테이블이 그릴 수 있는 모양으로 옮긴다.
//
// 좌석에 뜨는 액션 문구, 자리 앞의 칩, 가운데 팟은 전부 같은 히스토리에서
// 나와야 한다. 따로 계산하면 서로 어긋난다 — 실제로 팟이 음수로 내려간 적이
// 있다.

import { actionShortLabel, type Street } from "./tree.ts";
import type { HandState } from "./hand.ts";

export type SeatAction = { label: string; kind: string };

export type TableView = {
  /** 좌석별 마지막 액션. 지금 보여줄 베팅 라운드의 것만. */
  actions: Record<string, SeatAction>;
  /** 좌석별로 이번 라운드에 낸 금액. 자리 앞에 칩으로 놓인다. */
  chips: Record<string, number>;
  /** 자리 앞에 나와 있는 칩의 합. 팟에서 빼야 두 번 세지 않는다. */
  frontBb: number;
  /** 지금까지 팟에 들어간 전체 금액(자리 앞 칩 포함). */
  totalPotBb: number;
  /** 베팅이 맞아 칩을 쓸어 담을 시점인가. */
  closed: boolean;
};

/**
 * @param heroSeat / villainSeat  좌석 이름 (BB, BTN …)
 * @param heroPlayer 0 = OOP, 1 = IP
 */
export function buildTableView(
  state: HandState,
  startingPotBb: number,
  heroSeat: string,
  villainSeat: string,
  heroPlayer: 0 | 1,
): TableView {
  const perStreet = new Map<Street, [number, number]>();
  for (const step of state.history) {
    const cur = perStreet.get(step.street) ?? ([0, 0] as [number, number]);
    // 액션의 amountBb는 "이 액션으로 더 넣는 칩"이고 콜은 0이므로,
    // 콜은 상대가 낸 만큼으로 맞춰 준다.
    if (step.action.kind === "call") cur[step.player] = cur[1 - step.player];
    else cur[step.player] += step.action.amountBb;
    perStreet.set(step.street, cur);
  }

  let committed = 0;
  for (const pair of perStreet.values()) committed += pair[0] + pair[1];

  const actions: Record<string, SeatAction> = {};
  const chips: Record<string, number> = {};
  if (state.history.length === 0) {
    return {
      actions,
      chips,
      frontBb: 0,
      totalPotBb: Number(startingPotBb.toFixed(2)),
      closed: false,
    };
  }

  // 기준은 "지금 스트릿"이 아니라 "마지막 액션의 스트릿"이다. 콜이나 두 번째
  // 체크는 그 스트릿을 닫으면서 다음으로 넘기는데, 지금 스트릿으로 거르면 바로
  // 그 액션이 뜨자마자 사라진다.
  const shown = state.history[state.history.length - 1].street;
  for (const step of state.history) {
    if (step.street !== shown) continue;
    const seat = step.player === heroPlayer ? heroSeat : villainSeat;
    actions[seat] = { label: actionShortLabel(step.action), kind: step.action.kind };
  }

  const front = perStreet.get(shown) ?? [0, 0];
  chips[heroSeat] = Number(front[heroPlayer].toFixed(2));
  chips[villainSeat] = Number(front[1 - heroPlayer].toFixed(2));

  return {
    actions,
    chips,
    frontBb: Number((front[0] + front[1]).toFixed(2)),
    // 노드의 potBb를 쓰면 안 된다. 핸드를 끝내는 콜은 다음 노드가 없어서 그
    // 콜이 반영되지 않은 값에 멈추고, 거기서 칩을 빼면 팟이 음수가 된다.
    totalPotBb: Number((startingPotBb + committed).toFixed(2)),
    closed: state.node === null || shown !== state.street,
  };
}
