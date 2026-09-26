// 앱이 치는 게임의 프리플랍 풀이. 스택 깊이를 바꾸려면 여기 import 한 줄과
// 그 깊이의 보드(Storage의 v1-<깊이>bb)가 함께 있어야 한다.
//
// 컴포넌트마다 JSON을 따로 불러오면 깊이를 바꿀 때 한 곳을 빠뜨리고, 그러면
// 20bb 레인지로 30bb 판을 채점하는 화면이 남는다. 그래서 한 곳에서만 읽는다.

import seatsRaw from "@/data/preflop-seats.json";
import type { SeatsData } from "./seatGame";

export const SEATS_DATA = seatsRaw as unknown as SeatsData;

/** Storage 안의 보드 폴더. 20bb는 예전 이름(v1) 그대로다(scripts/game.ts와 같은 규칙). */
export const BOARD_PREFIX = SEATS_DATA.stackBb === 20 ? "v1" : `v1-${SEATS_DATA.stackBb}bb`;
