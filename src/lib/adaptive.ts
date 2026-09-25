// 적응형 딜. 자주 잃는 상황을 더 자주 딜한다.
//
// 상황은 "내 자리 × 프리플랍 상황"이다(BB × 오픈 대응, SB × 올인 대응 …).
// 판단마다 그 상황의 손실을 지수이동평균으로 기록하고, 딜러는 손실이 큰 상황의
// 판을 더 자주 받아들인다. 고친 약점은 평균이 내려가며 저절로 덜 나온다.
//
// 기기에 저장한다. 서버 기록이 없어도 첫 판부터 움직이고, 판단 직후 바로 반영된다.
//
// import에 .ts를 붙이는 이유는 hand.ts와 같다(node 테스트와 Next 양쪽에서 로드).

import type { Stage } from "./seatGame.ts";

const KEY = "gto.adaptive.v1";

/** 최근 판단에 주는 무게. 0.2면 대략 최근 열 번이 평균을 좌우한다. */
const ALPHA = 0.2;

export type SkillEntry = { n: number; ema: number };
export type SkillMap = Record<string, SkillEntry>;

/** 프리플랍 상황의 이름. 오프너·올인한 자리는 묶는다 — 칸이 너무 잘면 표본이 안 쌓인다. */
export function situationKey(seat: string, stage: Stage): string {
  if (stage.kind === "firstIn") return `${seat}:first`;
  if (stage.kind === "vsOpen") return `${seat}:vsOpen`;
  return `${seat}:${stage.iOpened ? "vsJamOpened" : stage.opener ? "vsSqueeze" : "vsJam"}`;
}

export function recordLoss(map: SkillMap, key: string, lossBb: number): SkillMap {
  const prev = map[key];
  const ema = prev ? prev.ema + ALPHA * (lossBb - prev.ema) : lossBb;
  return { ...map, [key]: { n: (prev?.n ?? 0) + 1, ema: Number(ema.toFixed(4)) } };
}

/**
 * 이 상황의 판을 받아들일 무게(0.5~3).
 *
 * 처음 보는 상황은 1.5로 둔다. 모르는 곳을 먼저 가 봐야 약점인지 알 수 있다.
 * 손실 0.1bb마다 0.5씩 오른다 — "부정확" 구간(0.05~0.25bb)이 반복되는 상황이
 * 두세 배 자주 나온다. 아주 잘하는 상황도 0.5 아래로는 내리지 않는다. 다 뺄
 * 수는 없다 — 잘하는 것도 가끔 확인해야 잊지 않는다.
 */
export function weightFor(map: SkillMap, key: string): number {
  const e = map[key];
  if (!e || e.n < 3) return 1.5;
  return Math.min(3, Math.max(0.5, 0.75 + e.ema * 5));
}

export const MAX_WEIGHT = 3;

export function loadSkills(): SkillMap {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(window.localStorage.getItem(KEY) ?? "{}") as SkillMap;
  } catch {
    return {};
  }
}

export function saveSkills(map: SkillMap): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(map));
  } catch {
    // 저장이 막혀도 이번 세션 동안은 메모리의 값으로 계속 적응한다.
  }
}

/** 이 상황의 판을 받아들일지. 무게에 비례한 확률로 받는다(거절 표본 추출). */
export function acceptSituation(map: SkillMap, key: string, rnd: () => number): boolean {
  return rnd() < weightFor(map, key) / MAX_WEIGHT;
}

// 앱이 쓰는 기록. 처음 한 번만 저장소에서 읽고, 이후에는 메모리의 값을 고친다.
let cache: SkillMap | null = null;

export function currentSkills(): SkillMap {
  cache ??= loadSkills();
  return cache;
}

/** 판단 하나의 손실을 그 상황의 기록에 더하고 저장한다. */
export function noteLoss(key: string, lossBb: number): void {
  cache = recordLoss(currentSkills(), key, lossBb);
  saveSkills(cache);
}
