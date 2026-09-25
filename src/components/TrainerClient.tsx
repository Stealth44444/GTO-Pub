"use client";

import dynamic from "next/dynamic";
import { useState, useSyncExternalStore } from "react";
import BottomNav, { type TabId } from "./BottomNav";
import AccountSheet from "./AccountSheet";
import HistoryPanel from "./HistoryPanel";
import LearnPanel from "./LearnPanel";
import GuideSheet from "./GuideSheet";
import Menu from "./Menu";
import StatsPanel from "./StatsPanel";
import HandTrainer from "./HandTrainer";
import RunTrainer from "./RunTrainer";
import { hasSeenGuide } from "@/lib/onboarding";
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

// 안내를 봤는지는 localStorage에 있어 서버에서는 알 수 없다. 이펙트로 뒤늦게
// 채우면 안내가 깜빡이며 나타나므로, 서버 스냅샷은 "봤다"로 둔다 — 첫 렌더에
// 안 보이는 편이 잘못 보이는 편보다 낫다.
const noop = () => () => {};
const seenOnServer = () => true;

export default function TrainerClient() {
  const [tab, setTab] = useState<TabId>("train");
  const [scenario, setScenario] = useState<Scenario | null>(null);
  const [accountOpen, setAccountOpen] = useState(false);
  const seen = useSyncExternalStore(noop, hasSeenGuide, seenOnServer);
  /** null = 아직 정하지 않음. 처음 방문이면 저절로 열린다. */
  const [guideOpen, setGuideOpen] = useState<boolean | null>(null);
  const showGuide = guideOpen ?? !seen;

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
              <HandTrainer key={`hand-${scenario.seat ?? "any"}`} seat={scenario.seat} />
            ) : scenario.mode === "run" ? (
              <RunTrainer onExit={() => setScenario(null)} />
            ) : (
              <Trainer
                key={`${scenario.mode}-${scenario.tableSize}-${scenario.stackBb}`}
                scenario={scenario}
              />
            )
          ) : (
            <Menu onStart={setScenario} />
          ))}
        {tab === "learn" && <LearnPanel />}
        {tab === "history" && <HistoryPanel />}
        {tab === "stats" && <StatsPanel />}
      </main>
      <BottomNav active={tab} onChange={changeTab} onAccount={() => setAccountOpen(true)} />
      {accountOpen && (
        <AccountSheet
          onClose={() => setAccountOpen(false)}
          onOpenGuide={() => {
            setAccountOpen(false);
            setGuideOpen(true);
          }}
        />
      )}
      {showGuide && <GuideSheet onClose={() => setGuideOpen(false)} />}
    </div>
  );
}
