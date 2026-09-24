// 올인이 콜되면 보드를 끝까지 깔아야 한다.
//
// 지금은 프리플랍 올인이 콜되는 순간 판이 끝나 승패가 나오지 않는다. 판돈을
// 다 넣고 결과를 못 보는 건 게임이 아니다. 포스트플랍 스팟은 런아웃이 미리
// 정해져 있지만 올인 대결은 그 데이터를 쓰지 않으므로, 여기서 남은 덱에서
// 무작위로 다섯 장을 깐다.

const RANKS = "23456789TJQKA";
const SUITS = "cdhs";

/** 두 핸드와 겹치지 않는 보드 5장. */
export function dealRunout(used: string[], rnd: () => number): string[] {
  const taken = new Set(used);
  const deck: string[] = [];
  for (const r of RANKS) {
    for (const s of SUITS) {
      const card = `${r}${s}`;
      if (!taken.has(card)) deck.push(card);
    }
  }
  // 앞에서 다섯 장만 필요하므로 그만큼만 섞는다.
  for (let i = 0; i < 5; i++) {
    const j = i + Math.floor(rnd() * (deck.length - i));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck.slice(0, 5);
}
