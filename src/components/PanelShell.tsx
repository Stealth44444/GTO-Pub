export function PanelMessage({ title, body }: { title: string; body: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-2 px-8 text-center">
      <p className="text-base font-bold text-[var(--gw-text-secondary)]">{title}</p>
      <p className="text-xs leading-relaxed text-[var(--gw-text-muted)]">{body}</p>
    </div>
  );
}

export function PanelScroll({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      className="mx-auto h-full w-full max-w-md overflow-y-auto px-4 pb-6"
      style={{ paddingTop: "calc(env(safe-area-inset-top) + 1.25rem)" }}
    >
      <h1 className="text-xl font-black text-[var(--gw-text-primary)]">{title}</h1>
      {children}
    </div>
  );
}

/** 스팟을 한 줄로. 옛 기록은 인원·스택이 없어 자리와 핸드만 남는다. */
export function spotLabel(a: {
  tableSize: number | null;
  stackBb: number | null;
  position: string;
}): string {
  const parts: string[] = [];
  if (a.tableSize !== null) parts.push(`${a.tableSize}인`);
  parts.push(a.position);
  if (a.stackBb !== null) parts.push(`${a.stackBb}bb`);
  return parts.join(" · ");
}
