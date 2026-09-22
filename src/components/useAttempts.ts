"use client";

import { useEffect, useState } from "react";
import { fetchAttempts, type Attempt } from "@/lib/stats";
import { getGuestId } from "@/lib/guest";

export type AttemptsState =
  | { status: "loading" }
  /** Supabase 미설정 또는 조회 실패. 기록이 없는 것과는 구분해서 보여준다. */
  | { status: "unavailable" }
  | { status: "ready"; attempts: Attempt[] };

export function useAttempts(): AttemptsState {
  const [state, setState] = useState<AttemptsState>({ status: "loading" });

  useEffect(() => {
    let alive = true;
    void fetchAttempts(getGuestId()).then((rows) => {
      if (!alive) return;
      setState(rows === null ? { status: "unavailable" } : { status: "ready", attempts: rows });
    });
    return () => {
      alive = false;
    };
  }, []);

  return state;
}
