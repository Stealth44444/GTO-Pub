import { supabase } from "./supabase";
import type { ActionFrequency, Position } from "./poker";

const DEFAULT_GAME_TYPE = "nlhe_6max";
const DEFAULT_STREET = "preflop";
const DEFAULT_STACK_BB = 200;

type SolutionRow = {
  open_frequency: number | string;
  fold_frequency: number | string;
};

export async function fetchTrainingSolution(
  position: Position,
  handCode: string,
): Promise<ActionFrequency | null> {
  if (!supabase) return null;

  const { data, error } = await supabase
    .from("training_solutions")
    .select("open_frequency, fold_frequency")
    .eq("game_type", DEFAULT_GAME_TYPE)
    .eq("street", DEFAULT_STREET)
    .eq("position", position)
    .eq("stack_bb", DEFAULT_STACK_BB)
    .eq("hand_code", handCode)
    .eq("source", "solver")
    .maybeSingle<SolutionRow>();

  if (error) {
    console.error("Failed to load training solution", error.message);
    return null;
  }

  if (!data) return null;

  return {
    open: Number(data.open_frequency),
    fold: Number(data.fold_frequency),
  };
}
