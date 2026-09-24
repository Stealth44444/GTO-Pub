// 보드를 몇 가지 종류로 부른다.
//
// 보드 하나하나를 외울 수는 없다. 22100가지가 있다. 대신 종류를 익히면 처음
// 보는 보드에서도 어디쯤인지 알 수 있다 — 프로들이 "모노톤에서는", "페어보드
// 에서는" 하고 말하는 것이 그 종류다.
//
// 여기서는 부르는 이름만 만든다. 그 종류에서 무엇을 해야 하는지는 화면에 함께
// 뜨는 레인지 비율이 말한다. 이름과 전략을 둘 다 여기서 적으면, 둘이 어긋나도
// 알 수 없다.

const RANKS = "23456789TJQKA";

export type TextureTag = {
  label: string;
  /** 왜 그렇게 부르는지 한 줄. 처음 듣는 말이면 이름만으로는 아무것도 아니다. */
  hint: string;
};

function rankIdx(card: string): number {
  return RANKS.indexOf(card[0]);
}

/**
 * 이 보드를 부르는 이름들.
 *
 * 세 개까지만 돌려준다. 다 붙이면 화면이 꼬리표로 덮이고, 덮이면 아무것도
 * 읽지 않는다. 순서는 이 보드에서 가장 크게 작용하는 것부터다.
 */
export function textureTags(board: string[]): TextureTag[] {
  if (board.length < 3) return [];
  const tags: TextureTag[] = [];

  const idx = board.map(rankIdx);
  const suits = board.map((c) => c[1]);
  const counts = new Map<string, number>();
  for (const s of suits) counts.set(s, (counts.get(s) ?? 0) + 1);
  const maxSuit = Math.max(...counts.values());

  // 같은 숫자가 겹치는가. 이게 있으면 다른 무엇보다 먼저 영향을 준다.
  const byRank = new Map<number, number>();
  for (const i of idx) byRank.set(i, (byRank.get(i) ?? 0) + 1);
  const maxRank = Math.max(...byRank.values());
  if (maxRank >= 3) {
    tags.push({ label: "트립스보드", hint: "같은 숫자 셋. 아무도 크게 안 맞습니다" });
  } else if (maxRank === 2) {
    tags.push({ label: "페어보드", hint: "같은 숫자 둘. 풀하우스가 있는 쪽이 유리합니다" });
  }

  if (maxSuit >= 3) {
    tags.push({ label: "모노톤", hint: "무늬가 하나. 플러시가 이미 완성돼 있습니다" });
  } else if (maxSuit === 2) {
    tags.push({ label: "투톤", hint: "무늬가 둘. 플러시 드로가 살아 있습니다" });
  } else {
    tags.push({ label: "레인보우", hint: "무늬가 모두 다름. 플러시 드로가 없습니다" });
  }

  // 숫자가 붙어 있는가. 페어를 뺀 서로 다른 숫자들로 본다.
  const uniq = [...new Set(idx)].sort((a, b) => b - a);
  if (uniq.length >= 3) {
    const span = uniq[0] - uniq[2];
    if (span <= 4) {
      tags.push({ label: "커넥티드", hint: "숫자가 붙어 있음. 스트레이트가 잘 만들어집니다" });
    } else if (span >= 8) {
      tags.push({ label: "드라이", hint: "숫자가 멀리 떨어짐. 드로가 잘 안 생깁니다" });
    }
  }

  // 가장 큰 카드. 레인지 우위가 어디로 가는지를 정한다.
  const high = uniq[0];
  if (high >= 11) {
    tags.push({
      label: `${RANKS[high]}하이`,
      hint: "높은 카드. 먼저 연 쪽이 더 자주 맞습니다",
    });
  } else if (high <= 8) {
    tags.push({ label: "로우보드", hint: "낮은 카드. 받은 쪽이 상대적으로 잘 맞습니다" });
  }

  return tags.slice(0, 3);
}
