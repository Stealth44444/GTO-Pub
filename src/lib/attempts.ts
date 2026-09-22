import { supabase } from "./supabase";
import type { Action, Position } from "./poker";

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
  position: Position;
  handCode: string;
  userAction: Action;
  correctAction: Action;
}) {
  if (!supabase || !params.userId) return;
  const { error } = await supabase.from("training_attempts").insert({
    user_id: params.userId,
    position: params.position,
    hand_code: params.handCode,
    user_action: params.userAction,
    correct_action: params.correctAction,
    is_correct: params.userAction === params.correctAction,
  });
  if (error) console.error("Failed to log attempt", error.message);
}
