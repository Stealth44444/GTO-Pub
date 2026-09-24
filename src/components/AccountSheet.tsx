"use client";

import { useSyncExternalStore } from "react";
import { AUTH_PROVIDERS, getIdentity, type Identity } from "@/lib/session";

// 게스트 id는 localStorage에서 오므로 서버에는 없다. 이펙트로 뒤늦게 채우면
// 렌더가 한 번 더 도는 데다 린트가 막으므로, 서버/클라이언트 스냅샷을 나눠
// 읽는다. 값은 세션 동안 변하지 않아 구독은 빈 함수로 둔다.
const noop = () => () => {};
let cached: Identity | null = null;
const clientIdentity = (): Identity => (cached ??= getIdentity());
const serverIdentity = (): Identity | null => null;

/**
 * 계정 화면.
 *
 * 로그인 수단은 쓸 수 있게 된 것만 보여준다. 누를 수 없는 버튼과 "준비 중"
 * 같은 내부 사정은 사용자에게 할 이야기가 아니다.
 */
export default function AccountSheet({
  onClose,
  onOpenGuide,
}: {
  onClose: () => void;
  /** 처음 안내를 다시 연다. 한 번 넘긴 사람이 되돌아올 길이 있어야 한다. */
  onOpenGuide: () => void;
}) {
  const identity = useSyncExternalStore(noop, clientIdentity, serverIdentity);

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60" onClick={onClose}>
      <section
        onClick={(e) => e.stopPropagation()}
        className="mx-auto w-full max-w-md rounded-t-[var(--gw-radius-sheet)] border-t border-[var(--gw-border)] bg-[var(--gw-surface-1)] px-5 pb-8 pt-5 animate-[gw-result-enter_220ms_cubic-bezier(0.22,1,0.36,1)]"
        style={{ boxShadow: "var(--gw-lift-sheet)", paddingBottom: "calc(2rem + env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto mb-5 h-1 w-9 rounded-full bg-[var(--gw-border-strong)]" />

        <div className="flex items-center gap-3 rounded-[var(--gw-radius-card)] border border-[var(--gw-border)] bg-[var(--gw-surface-2)] px-4 py-3.5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--gw-border-strong)] text-[var(--gw-text-muted)]">
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="12" cy="8" r="3.5" />
              <path d="M5 20c0-3.3 3.1-5.5 7-5.5s7 2.2 7 5.5" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[14px] font-semibold text-[var(--gw-text-primary)]">
              {identity?.kind === "user" ? (identity.nickname ?? "회원") : "게스트로 이용 중"}
            </p>
            {identity?.kind !== "user" && (
              <p className="mt-0.5 text-[12px] text-[var(--gw-text-muted)]">
                기록은 이 기기에 저장됩니다
              </p>
            )}
          </div>
        </div>

        {AUTH_PROVIDERS.some((p) => p.available) && (
          <div className="mt-4 flex flex-col gap-2">
            {AUTH_PROVIDERS.filter((p) => p.available).map((p) => (
              <button
                key={p.id}
                type="button"
                className="rounded-[var(--gw-radius-control)] border border-[var(--gw-border)] px-4 py-3.5 text-left text-[14px] font-semibold text-[var(--gw-text-primary)] transition active:scale-[0.98]"
              >
                {p.label}
              </button>
            ))}
          </div>
        )}

        <button
          type="button"
          onClick={onOpenGuide}
          className="mt-4 flex w-full items-center justify-between rounded-[var(--gw-radius-control)] border border-[var(--gw-border)] px-4 py-3.5 text-left transition active:scale-[0.98]"
        >
          <span className="text-[14px] font-semibold text-[var(--gw-text-primary)]">
            사용법 다시 보기
          </span>
        </button>

        <button
          type="button"
          onClick={onClose}
          className="mt-6 w-full rounded-[var(--gw-radius-control)] border border-[var(--gw-border)] py-3.5 text-[14px] font-semibold text-[var(--gw-text-secondary)] transition active:scale-[0.98]"
        >
          닫기
        </button>
      </section>
    </div>
  );
}
