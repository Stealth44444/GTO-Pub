// 틀린 곳을 다시 만나게 한다.
//
// 기록이 쌓여도 다시 만날 방법이 없으면 실력은 안 바뀐다. 손해가 컸던 판단을
// 모아 같은 상황을 다시 물어본다.
//
// 고친 스팟은 목록에서 내린다. 안 내리면 틀린 적이 있는 모든 자리가 영원히
// 위에 남아, 이미 고친 것을 계속 다시 풀게 된다. 기준은 "가장 최근 판단이
// 깨끗했는가" 하나다 — 어제 열 번 틀렸어도 오늘 맞혔으면 고친 것이다.
//
// 프리플랍과 포스트플랍을 모두 다룬다. 둘은 스팟을 되살리는 방법이 달라서
// 따로 고르고 마지막에 합친다 — 프리플랍은 자리와 상황 이름만 있으면 되지만,
// 포스트플랍은 그 보드 파일을 받아와 라인을 따라 노드까지 걸어가야 한다.

import type { Attempt } from "./stats.ts";
import { evAt, type SeatsData, type Stage } from "./seatGame.ts";

export type ReviewSpot = {
  /** 같은 스팟을 두 번 넣지 않기 위한 열쇠. */
  key: string;
  kind: "preflop";
  seat: string;
  handCode: string;
  stage: Stage;
  /** 지난번에 고른 것과 그때의 손실. */
  lastAction: string;
  lastLossBb: number;
  /** 같은 스팟을 몇 번 틀렸나. 반복해서 틀리는 곳이 진짜 누수다. */
  misses: number;
};

/**
 * 이 아래는 복습거리가 아니다. 무난한 선택까지 다시 풀게 하면 정작 새는 곳에
 * 쓸 시간이 사라진다. grading.ts의 "무난" 경계와 같은 값이어야 한다.
 */
const CLEAN_BB = 0.05;

/** 플랍 이후에 틀린 판단. 그 노드를 그대로 다시 세우는 데 필요한 것만 담는다. */
export type PostflopReviewSpot = {
  key: string;
  kind: "postflop";
  street: string;
  seat: string;
  handCode: string;
  /** 무늬까지. 보드와 맞물리는 방식이 달라 무늬 없이는 다른 핸드가 된다. */
  heroCards: string;
  spotFile: string;
  heroPlayer: 0 | 1;
  /** 솔버 트리의 라인. 빈 문자열이면 플랍 첫 노드다. */
  line: string;
  board: string[];
  lastAction: string;
  lastLossBb: number;
  misses: number;
};

/** "vsOpen:UTG" → { kind: "vsOpen", opener: "UTG" } */
export function parseStage(line: string | null, seat: string): Stage | null {
  if (!line) return null;
  if (line === "firstIn") return { kind: "firstIn" };
  const [kind, who, opener] = line.split(":");
  if (kind === "vsOpen" && who) return { kind: "vsOpen", opener: who };
  if (kind === "vsJam" && who) {
    // 내가 열었다가 3벳을 맞은 경우와 앞의 오픈 올인을 맞은 경우는 다르다.
    // 기록만으로는 갈라지지 않으므로, 3벳자가 내 뒤면 내가 연 것으로 본다.
    // 세 번째 칸은 3벳 올인 밑에 깔린 오픈. 있으면 뒷자리에서 받은 3벳 올인이다.
    return { kind: "vsJam", jammer: who, iOpened: false, ...(opener ? { opener } : {}) };
  }
  void seat;
  return null;
}

/**
 * 복습할 스팟을 고른다.
 *
 * 같은 스팟을 여러 번 틀렸으면 한 번만 넣되 횟수를 센다. 정렬은 손실이 큰
 * 순서 — 고쳐서 돌아오는 양이 큰 것부터 본다.
 */
export function pickReviewSpots(
  attempts: Attempt[],
  data: SeatsData,
  limit = 20,
): ReviewSpot[] {
  const byKey = new Map<string, ReviewSpot>();
  const fixed = new Set<string>();

  for (const a of attempts) {
    if (a.street !== "preflop") continue;
    const stage = parseStage(a.nodeLine, a.position);
    if (!stage) continue;
    const key = `${a.position}|${a.handCode}|${a.nodeLine}`;

    // 기록은 최신부터 온다. 이 스팟에서 마지막으로 한 판단이 깨끗했으면
    // 고친 것이다 — 그 앞의 실수는 세지 않는다.
    if (a.evLossBb <= CLEAN_BB) {
      if (!byKey.has(key)) fixed.add(key);
      continue;
    }
    if (fixed.has(key)) continue;

    // 그 상황의 EV가 없으면 다시 물어봐도 채점할 수 없다.
    const ev = evAt(data, a.position, stage, a.handCode);
    if (!ev.some((v) => v !== null)) continue;

    const found = byKey.get(key);
    if (found) {
      found.misses += 1;
      if (a.evLossBb > found.lastLossBb) {
        found.lastLossBb = a.evLossBb;
        found.lastAction = a.userAction;
      }
      continue;
    }
    byKey.set(key, {
      key,
      kind: "preflop",
      seat: a.position,
      handCode: a.handCode,
      stage,
      lastAction: a.userAction,
      lastLossBb: a.evLossBb,
      misses: 1,
    });
  }

  return [...byKey.values()]
    .sort((x, y) => y.misses * y.lastLossBb - x.misses * x.lastLossBb)
    .slice(0, limit);
}

/**
 * 플랍 이후에 틀린 판단을 고른다.
 *
 * 되살릴 수 없는 기록은 버린다. 보드 파일, 히어로의 두 장, 어느 쪽이었는지 —
 * 셋 중 하나라도 없으면 그 노드를 다시 세울 수 없고, 못 세우면 채점도 못 한다.
 * 이 셋을 남기기 전에 쌓인 기록이 그렇다.
 */
export function pickPostflopSpots(
  attempts: Attempt[],
  limit = 20,
): PostflopReviewSpot[] {
  const byKey = new Map<string, PostflopReviewSpot>();

  const fixed = new Set<string>();

  for (const a of attempts) {
    if (!a.street || a.street === "preflop") continue;
    if (!a.spotFile || !a.heroCards || a.heroPlayer === null) continue;
    // 라인은 빈 문자열일 수 있다 — 플랍 첫 판단이 그렇다. null만 걸러낸다.
    if (a.nodeLine === null) continue;

    const key = `${a.spotFile}|${a.heroCards}|${a.nodeLine}`;
    if (a.evLossBb <= CLEAN_BB) {
      if (!byKey.has(key)) fixed.add(key);
      continue;
    }
    if (fixed.has(key)) continue;

    const found = byKey.get(key);
    if (found) {
      found.misses += 1;
      if (a.evLossBb > found.lastLossBb) {
        found.lastLossBb = a.evLossBb;
        found.lastAction = a.userAction;
      }
      continue;
    }
    byKey.set(key, {
      key,
      kind: "postflop",
      street: a.street,
      seat: a.position,
      handCode: a.handCode,
      heroCards: a.heroCards,
      spotFile: a.spotFile,
      heroPlayer: a.heroPlayer,
      line: a.nodeLine,
      board: a.board ? a.board.split(" ").filter(Boolean) : [],
      lastAction: a.userAction,
      lastLossBb: a.evLossBb,
      misses: 1,
    });
  }

  return [...byKey.values()]
    .sort((x, y) => y.misses * y.lastLossBb - x.misses * x.lastLossBb)
    .slice(0, limit);
}

/** 상황을 사람이 읽는 한 줄로. */
export function describeStage(stage: Stage): string {
  if (stage.kind === "firstIn") return "앞이 모두 접었습니다";
  if (stage.kind === "vsOpen") return `${stage.opener}가 열었습니다`;
  return `${stage.jammer}가 올인했습니다`;
}

/** 프리플랍과 포스트플랍을 한 줄에 세운다. 고칠 값이 큰 것부터 만난다. */
export type AnyReviewSpot = ReviewSpot | PostflopReviewSpot;

export function pickAllReviewSpots(
  attempts: Attempt[],
  data: SeatsData,
  limit = 20,
): AnyReviewSpot[] {
  const all: AnyReviewSpot[] = [
    ...pickReviewSpots(attempts, data, limit),
    ...pickPostflopSpots(attempts, limit),
  ];
  return all
    .sort((x, y) => y.misses * y.lastLossBb - x.misses * x.lastLossBb)
    .slice(0, limit);
}

/** 스트릿 이름을 화면에 쓰는 말로. */
export const STREET_KO: Record<string, string> = {
  preflop: "프리플랍",
  flop: "플랍",
  turn: "턴",
  river: "리버",
};
