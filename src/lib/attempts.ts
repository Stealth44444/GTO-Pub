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
  // 자리 이름은 인원에 따라 달라진다 (6인은 UTG/HJ/…, 9인은 UTG1/UTG2/LJ 포함).
  position: string;
  handCode: string;
  userAction: Action;
  correctAction: Action;
  selectedFrequency?: number;
  evLossBb?: number;
}) {
  if (!supabase || !params.userId) return;
  const { error } = await supabase.from("training_attempts").insert({
    user_id: params.userId,
    position: params.position,
    hand_code: params.handCode,
    user_action: params.userAction,
    correct_action: params.correctAction,
    is_correct: params.userAction === params.correctAction,
    selected_frequency: params.selectedFrequency ?? null,
    ev_loss_bb: params.evLossBb ?? null,
  });
  if (error) console.error("Failed to log attempt", error.message);
}
