// 프리플랍 솔브 결과를 포스트플랍 익스포터가 먹는 레인지 문자열로 바꾼다.
//
// 이게 피드백 루프의 연결부다. 포스트플랍은 "양쪽이 어떤 레인지로 플랍에
// 왔는가"를 가정하고 풀리고, 프리플랍은 그 결과로 나온 플랍 EV를 써서 레인지를
// 정한다. 한쪽을 고치면 다른 쪽을 다시 풀어야 한다.
//
// 실행: node --experimental-strip-types scripts/preflop-ranges.ts

import { existsSync, readFileSync } from "node:fs";

const SOLVED = "src/data/preflop-btn-bb.json";

/**
 * 빈도가 0인 핸드도 아주 낮은 비중으로 남긴다.
 *
 * 레인지에서 빼버리면 그 핸드는 플랍 EV를 잃고, 다음 프리플랍 솔브에서 콜이라는
 * 선택지 자체가 사라진다. 그러면 폴드 아니면 올인으로 몰려 답이 왜곡된다.
 * 실제로 좁은 레인지로 풀었을 때 BB가 콜 6% / 올인 45%가 나왔다.
 */
const FLOOR = 0.05;

type Solved = {
  btn: { open: Record<string, number>; callVsShove: Record<string, number> };
  bb: { call: Record<string, number>; shove: Record<string, number> };
};

/**
 * 익스포터가 읽는 "AA:1.0,KK:0.62,..." 문자열.
 *
 * keep에 없는 핸드는 아예 뺀다. 프리플랍에서 100% 접는 핸드는 플랍에 올 일이
 * 없고, 비중 0.05로라도 남기면 조합 수가 1326개 전부가 되어 파일이 3배가 된다.
 */
export function rangeString(
  freq: Record<string, number>,
  hands: string[],
  keep: (code: string) => boolean,
): string {
  return hands
    .filter(keep)
    .map((code) => {
      const w = Math.max(freq[code] ?? 0, FLOOR);
      return `${code}:${Math.round(w * 1000) / 1000}`;
    })
    .join(",");
}

export function loadRanges(hands: string[]): { oop: string; ip: string } | null {
  if (!existsSync(SOLVED)) return null;
  const solved = JSON.parse(readFileSync(SOLVED, "utf8")) as Solved;
  // BB가 조금이라도 지키는 핸드만 남긴다. 올인하는 핸드도 남겨야 한다 —
  // 다음 바퀴에서 "콜이 더 나았나"를 따지려면 그 핸드의 플랍 EV가 필요하다.
  const bbDefends = (code: string) =>
    (solved.bb.call[code] ?? 0) > 0 || (solved.bb.shove[code] ?? 0) > 0;
  const btnOpens = (code: string) => (solved.btn.open[code] ?? 0) > 0;

  return {
    // OOP = BB가 콜해서 플랍을 본 레인지. IP = BTN이 연 레인지.
    oop: rangeString(solved.bb.call, hands, bbDefends),
    ip: rangeString(solved.btn.open, hands, btnOpens),
  };
}

if (process.argv[1]?.endsWith("preflop-ranges.ts")) {
  const solved = JSON.parse(readFileSync(SOLVED, "utf8")) as Solved & { hands: string[] };
  const r = loadRanges(solved.hands)!;
  console.log("OOP (BB 콜):");
  console.log(r.oop.slice(0, 300) + " …");
  console.log("\nIP (BTN 오픈):");
  console.log(r.ip.slice(0, 300) + " …");
}
