"use client";

import dynamic from "next/dynamic";

// 핸드 셔플이 클라이언트 랜덤에 의존하므로 SSR을 끄고 클라이언트에서만 렌더링합니다.
const Trainer = dynamic(() => import("@/components/Trainer"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-dvh flex-1 items-center justify-center bg-slate-950">
      <span className="text-slate-400">불러오는 중...</span>
    </div>
  ),
});

export default function TrainerClient() {
  return <Trainer />;
}
