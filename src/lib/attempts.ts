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
