"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import Menu from "./Menu";
import type { Scenario } from "@/lib/scenarios";

// 핸드 셔플이 클라이언트 랜덤에 의존하므로 SSR을 끄고 클라이언트에서만 렌더링합니다.
const Trainer = dynamic(() => import("@/components/Trainer"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-dvh flex-1 items-center justify-center bg-[var(--gw-bg)]">
      <span className="text-[var(--gw-text-muted)]">불러오는 중...</span>
    </div>
  ),
});

export default function TrainerClient() {
  const [scenario, setScenario] = useState<Scenario | null>(null);

  if (!scenario) return <Menu onStart={setScenario} />;

  // key를 주면 시나리오가 바뀔 때 트레이너 상태(통계 포함)가 새로 시작된다.
  return (
    <Trainer
      key={`${scenario.mode}-${scenario.tableSize}-${scenario.stackBb}`}
      scenario={scenario}
      onExit={() => setScenario(null)}
    />
  );
}
