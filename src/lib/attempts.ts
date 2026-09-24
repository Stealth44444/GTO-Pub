import { supabase } from "./supabase";
import type { Action } from "./poker";

let guestUserEnsured = false;

export async function ensureGuestUser(userId: string) {
  if (!supabase || guestUserEnsured || !userId) return;
  guestUserEnsured = true;
  const { error } = await supabase
    .from("users")
    .upsert({ id: userId, auth_provider: "guest" }, { onConflict: "id", ignoreDuplicates: true });
  if (error) console.error("Failed to ensure guest user", error.message);
}

export async function logAttempt(params: {
  userId: string;
  // 어떤 학습 카테고리였는지. 같은 자리·핸드라도 모드가 다르면 정답이 다르다.
  mode: string;
  // 스팟을 특정하는 값들. 이게 없으면 기록을 나중에 해석할 수 없다.
  tableSize: number;
  stackBb: number;
  anteBb: number;
  // 자리 이름은 인원에 따라 달라진다 (6인은 UTG/HJ/…, 9인은 UTG1/UTG2/LJ 포함).
  position: string;
  /** 올인 대응에서 먼저 올인한 자리. 상대 레인지가 여기서 갈린다. */
  shoverPosition?: string | null;
  handCode: string;
  userAction: Action;
  correctAction: Action;
  selectedFrequency?: number;
  evLossBb?: number;
}) {
  if (!supabase || !params.userId) return;
  const { error } = await supabase.from("training_attempts").insert({
    user_id: params.userId,
    mode: params.mode,
    table_size: params.tableSize,
    stack_bb: params.stackBb,
    ante_bb: params.anteBb,
    position: params.position,
    shover_position: params.shoverPosition ?? null,
    hand_code: params.handCode,
    user_action: params.userAction,
    correct_action: params.correctAction,
    is_correct: params.userAction === params.correctAction,
    selected_frequency: params.selectedFrequency ?? null,
    ev_loss_bb: params.evLossBb ?? null,
  });
  if (error) console.error("Failed to log attempt", error.message);
}

/**
 * 한 판에서 내린 판단들을 한꺼번에 남긴다.
 *
 * 판단마다 한 행이고, hand_id로 묶는다. 한 번에 넣는 이유는 반쯤 기록된 판이
 * 남지 않게 하기 위해서다 — 나중에 누수를 뽑을 때 "이 판에서 무슨 일이
 * 있었나"를 온전히 볼 수 있어야 한다.
 *
 * 채점하지 못한 판단도 남긴다. 정답이 없다는 사실 자체가 기록이고, 레인지를
 * 얼마나 자주 벗어나는지도 볼 만한 값이다.
 */
export async function logHand(params: {
  userId: string;
  mode: string;
  tableSize: number;
  stackBb: number;
  anteBb: number;
  /** 히어로 자리. 한 판 안에서는 바뀌지 않는다. */
  position: string;
  handCode: string;
  /** 히어로가 실제로 들고 있던 두 장. "AhAd" */
  heroCards?: string;
  /** 플랍 이후를 다시 만들 때 필요한 것들. 프리플랍에서 끝난 판에는 없다. */
  spotFile?: string;
  heroPlayer?: 0 | 1;
  decisions: {
    /** PREFLOP / FLOP / TURN / RIVER */
    street: string;
    userAction: string;
    correctAction: string | null;
    evLossBb: number | null;
    /** 그 시점의 보드. 프리플랍은 비어 있다. */
    board?: string[];
    /** 어떤 상황이었는지. 복습 스팟을 다시 만들 때 쓴다. */
    nodeLine?: string;
  }[];
}) {
  if (!supabase || !params.userId || params.decisions.length === 0) return;
  const handId = crypto.randomUUID();
  const rows = params.decisions.map((d) => ({
    user_id: params.userId,
    hand_id: handId,
    mode: params.mode,
    table_size: params.tableSize,
    stack_bb: params.stackBb,
    ante_bb: params.anteBb,
    position: params.position,
    hand_code: params.handCode,
    hero_cards: params.heroCards ?? null,
    // 스팟은 플랍부터의 것이다. 프리플랍 행에 붙이면 복습이 엉뚱한 노드를 찾는다.
    spot_file: d.street === "PREFLOP" ? null : (params.spotFile ?? null),
    hero_player: d.street === "PREFLOP" ? null : (params.heroPlayer ?? null),
    street: d.street.toLowerCase(),
    board: d.board?.length ? d.board.join(" ") : null,
    user_action: d.userAction,
    correct_action: d.correctAction,
    // 채점하지 못했으면 정오답도 없다.
    is_correct: d.correctAction === null ? null : d.userAction === d.correctAction,
    ev_loss_bb: d.evLossBb,
    node_line: d.nodeLine ?? null,
  }));
  const { error } = await supabase.from("training_attempts").insert(rows);
  if (error) console.error("Failed to log hand", error.message);
}

/**
 * 복습에서 다시 푼 한 문제.
 *
 * 모드를 "review"로 남긴다. 통계는 실제로 친 판만 세야 하기 때문이다 —
 * 복습에서 같은 스팟을 열 번 맞히면 정확도가 올라가지만 실력은 그대로다.
 * 대신 복습 기록이 있어야 고친 스팟을 목록에서 내릴 수 있다.
 */
export async function logReview(params: {
  userId: string;
  tableSize: number;
  stackBb: number;
  anteBb: number;
  position: string;
  handCode: string;
  street: string;
  userAction: string;
  correctAction: string | null;
  evLossBb: number | null;
  nodeLine: string | null;
  board?: string[];
  heroCards?: string | null;
  spotFile?: string | null;
  heroPlayer?: 0 | 1 | null;
}) {
  if (!supabase || !params.userId) return;
  const { error } = await supabase.from("training_attempts").insert({
    user_id: params.userId,
    mode: "review",
    table_size: params.tableSize,
    stack_bb: params.stackBb,
    ante_bb: params.anteBb,
    position: params.position,
    hand_code: params.handCode,
    hero_cards: params.heroCards ?? null,
    spot_file: params.spotFile ?? null,
    hero_player: params.heroPlayer ?? null,
    street: params.street.toLowerCase(),
    board: params.board?.length ? params.board.join(" ") : null,
    user_action: params.userAction,
    correct_action: params.correctAction,
    is_correct: params.correctAction === null ? null : params.userAction === params.correctAction,
    ev_loss_bb: params.evLossBb,
    node_line: params.nodeLine,
  });
  if (error) console.error("Failed to log review", error.message);
}
