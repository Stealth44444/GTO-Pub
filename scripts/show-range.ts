// 계산된 푸시/폴드 레인지를 13×13 그리드로 출력한다 (포커에서 쓰는 표준 표기).
// 대각선 = 포켓 페어, 우상단 = 수티드, 좌하단 = 오프수트.
//
// 실행: node --experimental-strip-types scripts/show-range.ts [인원] [스택bb] [포지션]
//   예: node --experimental-strip-types scripts/show-range.ts 9 10 BTN

import { readFileSync } from "node:fs";

const RANKS = "AKQJT98765432";

type Spot = {
  tableSize: number;
  stackBb: number;
  position: string;
  shoveFrequencyPct: number;
  exploitabilityBb: number;
  shove: Record<string, number>;
};

const data = JSON.parse(readFileSync("src/data/pushfold.json", "utf8")) as {
  model: string;
  spots: Spot[];
};

function handCode(i: number, j: number): string {
  if (i === j) return RANKS[i] + RANKS[i];
  return i < j ? RANKS[i] + RANKS[j] + "s" : RANKS[j] + RANKS[i] + "o";
}

function cell(freq: number): string {
  if (freq >= 0.995) return " ## ";
  if (freq >= 0.5) return " ++ ";
  if (freq >= 0.05) return " .. ";
  return "    ";
}

function show(spot: Spot) {
  console.log(
    `${spot.tableSize}인 / ${spot.stackBb}bb / ${spot.position} — 올인 ${spot.shoveFrequencyPct}%  (오차 ${spot.exploitabilityBb}bb)`,
  );
  console.log("      " + [...RANKS].map((r) => `  ${r} `).join(""));
  for (let i = 0; i < 13; i++) {
    let row = `  ${RANKS[i]}  `;
    for (let j = 0; j < 13; j++) {
      row += cell(spot.shove[handCode(i, j)] ?? 0);
    }
    console.log(row);
  }
  console.log("  ## 항상 올인   ++ 대부분 올인   .. 가끔 올인   (빈칸) 폴드\n");
}

const [sizeArg, stackArg, posArg] = process.argv.slice(2);
if (sizeArg && stackArg && posArg) {
  const spot = data.spots.find(
    (s) => s.tableSize === Number(sizeArg) && s.stackBb === Number(stackArg) && s.position === posArg,
  );
  if (!spot) {
    console.log("해당 스팟을 찾을 수 없습니다.");
    process.exit(1);
  }
  show(spot);
} else {
  // 기본: 9인 10bb에서 앞자리와 뒷자리를 비교
  for (const pos of ["UTG", "BTN", "SB"]) {
    const spot = data.spots.find((s) => s.tableSize === 9 && s.stackBb === 10 && s.position === pos);
    if (spot) show(spot);
  }
}
