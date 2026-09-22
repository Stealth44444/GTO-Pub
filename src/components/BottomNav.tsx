"use client";

export type TabId = "train" | "history" | "stats";

const TABS: { id: TabId; label: string; icon: React.ReactNode }[] = [
  {
    id: "train",
    label: "트레이닝",
    icon: (
      <path d="M7 8h10a4 4 0 0 1 4 4v1a3 3 0 0 1-5.4 1.8L15 14H9l-.6.8A3 3 0 0 1 3 13v-1a4 4 0 0 1 4-4Zm0 3v2m-1-1h2m9 0h.01M17 12h.01" />
    ),
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
}: {
  active: TabId;
  onChange: (tab: TabId) => void;
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
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden
                >
                  {tab.icon}
                </svg>
              </span>
              <span
                className={`text-[10px] font-bold ${
                  selected ? "text-[var(--gw-accent)]" : "text-[var(--gw-text-muted)]"
                }`}
              >
                {tab.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
}
