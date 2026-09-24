// 틀린 곳을 다시 만나게 한다.
//
// 기록이 쌓여도 다시 만날 방법이 없으면 실력은 안 바뀐다. 손해가 컸던 판단을
// 모아 같은 상황을 다시 물어본다.
//
// 지금은 프리플랍만 다룬다. 포스트플랍은 보드와 라인이 다 기록되지만, 그
// 스팟 파일을 받아와 트리를 되짚는 일이 필요해서 따로 붙인다.

import type { Attempt } from "./stats.ts";
import { evAt, type SeatsData, type Stage } from "./seatGame.ts";

export type ReviewSpot = {
  /** 같은 스팟을 두 번 넣지 않기 위한 열쇠. */
  key: string;
  seat: string;
  handCode: string;
  stage: Stage;
  /** 지난번에 고른 것과 그때의 손실. */
  lastAction: string;
  lastLossBb: number;
  /** 같은 스팟을 몇 번 틀렸나. 반복해서 틀리는 곳이 진짜 누수다. */
  misses: number;
};

/** "vsOpen:UTG" → { kind: "vsOpen", opener: "UTG" } */
export function parseStage(line: string | null, seat: string): Stage | null {
  if (!line) return null;
  if (line === "firstIn") return { kind: "firstIn" };
  const [kind, who] = line.split(":");
  if (kind === "vsOpen" && who) return { kind: "vsOpen", opener: who };
  if (kind === "vsJam" && who) {
    // 내가 열었다가 3벳을 맞은 경우와 앞의 오픈 올인을 맞은 경우는 다르다.
    // 기록만으로는 갈라지지 않으므로, 3벳자가 내 뒤면 내가 연 것으로 본다.
    return { kind: "vsJam", jammer: who, iOpened: false };
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

  for (const a of attempts) {
    if (a.street !== "preflop") continue;
    if (a.evLossBb <= 0.05) continue; // 무난한 선택은 복습거리가 아니다
    const stage = parseStage(a.nodeLine, a.position);
    if (!stage) continue;
    // 그 상황의 EV가 없으면 다시 물어봐도 채점할 수 없다.
    const ev = evAt(data, a.position, stage, a.handCode);
    if (!ev.some((v) => v !== null)) continue;

    const key = `${a.position}|${a.handCode}|${a.nodeLine}`;
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

/** 상황을 사람이 읽는 한 줄로. */
export function describeStage(stage: Stage): string {
  if (stage.kind === "firstIn") return "앞이 모두 접었습니다";
  if (stage.kind === "vsOpen") return `${stage.opener}가 열었습니다`;
  return `${stage.jammer}가 올인했습니다`;
}
