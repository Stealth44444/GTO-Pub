// 이 앱의 "누가 쓰고 있는가".
//
// 지금은 전부 게스트다. QR로 들어와 바로 치는 게 이 도구의 전제라, 로그인을
// 앞세우면 첫 판까지 가는 길이 막힌다. 그래서 로그인은 나중에 붙이되, 붙일 때
// 앱 전체를 고치지 않도록 지금 이음매만 만들어 둔다.
//
// 규칙 하나: 기록을 남기는 코드는 getGuestId()를 직접 부르지 말고 여기를 통한다.
// 그래야 로그인이 생겼을 때 바꿀 곳이 이 파일 하나로 끝난다.

import { getGuestId } from "./guest";

export type AuthProvider = "kakao" | "phone";

export type Identity =
  | { kind: "guest"; id: string; nickname: null }
  | { kind: "user"; id: string; nickname: string | null; provider: AuthProvider };

export type ProviderInfo = {
  id: AuthProvider;
  label: string;
  /** 아직 붙이지 않았다. 붙기 전까지는 버튼을 눌러도 되는 것처럼 보이면 안 된다. */
  available: boolean;
  note: string;
};

/**
 * 홀덤펍 손님은 카카오가 사실상 기본이고, 전화번호는 카카오를 안 쓰는 경우의
 * 대비책이다. 스키마(users.auth_provider)도 이 둘을 전제로 열어 뒀다.
 */
export const AUTH_PROVIDERS: ProviderInfo[] = [
  { id: "kakao", label: "카카오로 계속하기", available: false, note: "채널 심사 준비 중" },
  { id: "phone", label: "전화번호로 계속하기", available: false, note: "문자 발송 연동 전" },
];

export function getIdentity(): Identity {
  // 로그인이 붙으면 여기서 세션을 먼저 확인하고, 없을 때만 게스트로 떨어진다.
  return { kind: "guest", id: getGuestId(), nickname: null };
}

/** 기록을 남길 때 쓰는 id. 게스트든 회원이든 이 값 하나로 통일한다. */
export function currentUserId(): string {
  return getIdentity().id;
}

/**
 * 게스트가 쌓은 기록을 로그인 계정으로 넘기는 일이 반드시 필요하다.
 * 로그인하자마자 통계가 0이 되면 아무도 로그인하지 않는다.
 *
 * 서버에서 training_attempts.user_id를 옮기는 작업이라, 실제 구현은 로그인이
 * 붙을 때 Supabase 함수로 만든다. 지금은 넘겨야 할 값이 무엇인지만 고정한다.
 */
export type PendingMerge = { guestId: string; intoUserId: string };

export function planMerge(intoUserId: string): PendingMerge | null {
  const guestId = getGuestId();
  if (!guestId || guestId === intoUserId) return null;
  return { guestId, intoUserId };
}
