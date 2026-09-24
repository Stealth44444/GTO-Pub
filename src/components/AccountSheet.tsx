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
 * 로그인은 아직 붙지 않았다. 그렇다고 눌리는 것처럼 보이는 버튼을 놓으면
 * 눌러본 사람이 고장으로 받아들인다. 무엇이 준비됐고 무엇이 안 됐는지,
 * 지금 기록이 어디에 남는지를 그대로 쓴다.
 */
export default function AccountSheet({ onClose }: { onClose: () => void }) {
  const identity = useSyncExternalStore(noop, clientIdentity, serverIdentity);

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60" onClick={onClose}>
      <section
        onClick={(e) => e.stopPropagation()}
        className="mx-auto w-full max-w-md rounded-t-[var(--gw-radius-sheet)] border-t border-[var(--gw-border)] bg-[var(--gw-surface-1)] px-5 pb-8 pt-5 animate-[gw-result-enter_220ms_cubic-bezier(0.22,1,0.36,1)]"
        style={{ boxShadow: "var(--gw-lift-sheet)", paddingBottom: "calc(2rem + env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto mb-5 h-1 w-9 rounded-full bg-[var(--gw-border-strong)]" />

        <span className="gw-label-ko">지금 상태</span>
        <div className="mt-2 flex items-center gap-3 rounded-[var(--gw-radius-card)] border border-[var(--gw-border)] bg-[var(--gw-surface-2)] px-4 py-3.5">
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
            <p className="gw-num mt-0.5 truncate text-[11px] text-[var(--gw-text-muted)]">
              {identity ? identity.id.slice(0, 8) : "…"}
            </p>
          </div>
        </div>

        <p className="mt-3 text-[12px] leading-[1.6] text-[var(--gw-text-muted)]">
          기록은 이 기기에만 묶여 있습니다. 앱을 지우거나 다른 기기에서 열면 통계가
          처음부터 시작합니다. 로그인이 생기면 지금까지 친 기록을 그대로 옮겨 줍니다.
        </p>

        <span className="gw-label-ko mt-6 block">로그인</span>
        <div className="mt-2 flex flex-col gap-2">
          {AUTH_PROVIDERS.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={!p.available}
              className="flex items-center justify-between rounded-[var(--gw-radius-control)] border border-[var(--gw-border)] px-4 py-3.5 text-left opacity-55 transition disabled:cursor-not-allowed"
            >
              <span className="text-[14px] font-semibold text-[var(--gw-text-primary)]">
                {p.label}
              </span>
              <span className="gw-label-ko text-[10px]">{p.note}</span>
            </button>
          ))}
        </div>

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
