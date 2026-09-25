// 솔버와 파이프라인이 함께 쓰는 게임 조건.
//
// 스택 깊이만 바뀐다(STACK 환경변수, 기본 20). 앤티 1bb, 오픈 2.5bb는 고정이다.
// 깊이마다 데이터가 따로 있어야 하므로 20bb가 아닐 때는 파일·폴더 이름에
// 깊이를 붙인다. 20bb 파일 이름은 예전 그대로라 기존 데이터가 깨지지 않는다.
//
// 전에는 스크립트마다 20과 칩 65·165를 따로 적어 두었다. 한 곳만 고치면
// 나머지와 어긋난 조건으로 풀리고, 그런 데이터는 틀렸다는 표시 없이 채점에 쓰인다.

export const STACK_BB = Number(process.env.STACK ?? 20);
export const ANTE_BB = 1;
export const OPEN_TO_BB = 2.5;

/** 20bb면 빈 문자열, 아니면 "-30bb" 같은 꼬리표. */
export const DEPTH_SUFFIX = STACK_BB === 20 ? "" : `-${STACK_BB}bb`;

/**
 * 경로에 깊이를 붙인다.
 *   "src/data/preflop-seats.json" → "src/data/preflop-seats-30bb.json"
 *   "public/postflop"            → "public/postflop-30bb"
 */
export function withDepth(path: string): string {
  if (!DEPTH_SUFFIX) return path;
  const dot = path.lastIndexOf(".");
  const slash = path.lastIndexOf("/");
  return dot > slash ? `${path.slice(0, dot)}${DEPTH_SUFFIX}${path.slice(dot)}` : `${path}${DEPTH_SUFFIX}`;
}

/**
 * 싱글레이즈 팟의 플랍 시점 팟과 유효 스택(칩, 1칩 = 0.1bb).
 *
 *   팟 = 오픈 + 콜 + 판에 안 낀 블라인드(죽은 돈) + 앤티
 *   유효 스택 = 스택 − 오픈액 − (BB면 앤티까지 낸 몫)
 *
 * 블라인드가 오프너나 콜러면 그 블라인드는 이미 2.5bb 안에 들어 있으므로 죽은
 * 돈이 아니다. SB 오픈·BB 콜 팟은 6.0bb다(BTN 오픈·BB 콜은 죽은 SB가 있어 6.5bb).
 */
export function flopChips(opener: string, caller: string): { pot: number; stack: number } {
  const inHand = new Set([opener, caller]);
  const dead = (inHand.has("SB") ? 0 : 0.5) + (inHand.has("BB") ? 0 : 1);
  const pot = 2 * OPEN_TO_BB + dead + ANTE_BB;
  const stack = STACK_BB - OPEN_TO_BB - (caller === "BB" ? ANTE_BB : 0);
  return { pot: Math.round(pot * 10), stack: Math.round(stack * 10) };
}
