"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import BottomNav, { type TabId } from "./BottomNav";
import HistoryPanel from "./HistoryPanel";
import Menu from "./Menu";
import StatsPanel from "./StatsPanel";
import HandTrainer from "./HandTrainer";
import type { Scenario } from "@/lib/scenarios";

// 핸드 셔플이 클라이언트 랜덤에 의존하므로 SSR을 끄고 클라이언트에서만 렌더링합니다.
const Trainer = dynamic(() => import("@/components/Trainer"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center">
      <span className="text-[var(--gw-text-muted)]">불러오는 중...</span>
    </div>
  ),
});

export default function TrainerClient() {
  const [tab, setTab] = useState<TabId>("train");
  const [scenario, setScenario] = useState<Scenario | null>(null);

  const changeTab = (next: TabId) => {
    // 트레이닝 탭을 다시 누르면 설정 화면으로 돌아간다 (나가기 버튼 대신).
    if (next === "train") setScenario(null);
    setTab(next);
  };

  return (
    <div className="flex h-dvh min-h-0 flex-col overflow-hidden bg-[var(--gw-bg)]">
      <main className="relative min-h-0 flex-1 h-full">
        {tab === "train" &&
          (scenario ? (
            scenario.mode === "hand" ? (
              <HandTrainer key="hand" />
            ) : (
              <Trainer
                key={`${scenario.mode}-${scenario.tableSize}-${scenario.stackBb}`}
                scenario={scenario}
              />
            )
          ) : (
            <Menu onStart={setScenario} />
          ))}
        {tab === "history" && <HistoryPanel />}
        {tab === "stats" && <StatsPanel />}
      </main>
      <BottomNav active={tab} onChange={changeTab} />
    </div>
  );
}
