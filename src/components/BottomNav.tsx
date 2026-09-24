"use client";

export type TabId = "train" | "learn" | "history" | "stats";

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  {
    id: "train",
    label: "트레이닝",
    icon: (
      <path d="M7 8h10a4 4 0 0 1 4 4v1a3 3 0 0 1-5.4 1.8L15 14H9l-.6.8A3 3 0 0 1 3 13v-1a4 4 0 0 1 4-4Zm0 3v2m-1-1h2m9 0h.01M17 12h.01" />
    ),
  },
  {
    id: "learn",
    label: "학습",
    icon: <path d="M4 5.5A1.5 1.5 0 0 1 5.5 4H11v16H5.5A1.5 1.5 0 0 1 4 18.5ZM20 5.5A1.5 1.5 0 0 0 18.5 4H13v16h5.5a1.5 1.5 0 0 0 1.5-1.5Z" />,
  },
  {
    id: "history",
    label: "기록",
    icon: <path d="M4 5h16M4 12h16M4 19h10" />,
  },
  {
    id: "stats",
    label: "통계",
    icon: <path d="M5 20V10m7 10V4m7 16v-7" />,
  },
];

export default function BottomNav({
  active,
  onChange,
  onAccount,
}: {
  active: TabId;
  onChange: (tab: TabId) => void;
  /** 계정은 탭이 아니라 오른쪽 끝의 별도 버튼이다 — 연습 흐름과 층이 다르다. */
  onAccount: () => void;
}) {
  return (
    <nav
      className="z-40 shrink-0 border-t border-[var(--gw-border)] bg-[var(--gw-bg)]"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="mx-auto flex max-w-md">
        {TABS.map((tab) => {
          const selected = active === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onChange(tab.id)}
              aria-current={selected ? "page" : undefined}
              className="flex flex-1 flex-col items-center gap-1 py-2.5 transition active:scale-95"
            >
              <span
                className={`flex h-8 w-10 items-center justify-center rounded-[var(--gw-radius-control)] ${
                  selected ? "bg-[var(--gw-accent)]/15" : ""
                }`}
              >
                <svg
                  viewBox="0 0 24 24"
                  className={`h-5 w-5 ${
                    selected ? "text-[var(--gw-accent)]" : "text-[var(--gw-text-muted)]"
                  }`}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.7}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  {tab.icon}
                </svg>
              </span>
              <span
                className={`text-[10px] font-semibold tracking-[-0.01em] ${
                  selected ? "text-[var(--gw-accent)]" : "text-[var(--gw-text-muted)]"
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}

        <button
          type="button"
          onClick={onAccount}
          aria-label="계정"
          className="flex flex-1 flex-col items-center gap-1 py-2.5 transition active:scale-95"
        >
          <span className="flex h-8 w-10 items-center justify-center">
            <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full border border-[var(--gw-border-strong)] text-[var(--gw-text-muted)]">
              <svg
                viewBox="0 0 24 24"
                className="h-3.5 w-3.5"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.9}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden
              >
                <circle cx="12" cy="8" r="3.5" />
                <path d="M5 20c0-3.3 3.1-5.5 7-5.5s7 2.2 7 5.5" />
              </svg>
            </span>
          </span>
          <span className="text-[10px] font-semibold tracking-[-0.01em] text-[var(--gw-text-muted)]">
            계정
          </span>
        </button>
      </div>
    </nav>
  );
}
