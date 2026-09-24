// 승률표를 앱이 받아갈 수 있는 자리에 둔다.
//
// 실행: npm run equity:publish
//
// scripts/data/equity.json 은 계산 결과 원본이라 만든 날짜와 표본 수까지 들어
// 있다. 앱에 필요한 것은 표 두 개뿐이고, 200KB를 그냥 내보낼 이유도 없다.

import { readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";

const SRC = "scripts/data/equity.json";
const OUT = "public/equity.json.gz";

const raw = JSON.parse(readFileSync(SRC, "utf8")) as {
  hands: string[];
  equity: number[];
};

if (raw.hands.length !== 169 || raw.equity.length !== 169 * 169) {
  console.error(
    `승률표 모양이 다릅니다: 핸드 ${raw.hands.length}개, 값 ${raw.equity.length}개`,
  );
  process.exit(1);
}

const slim = JSON.stringify({ hands: raw.hands, equity: raw.equity });
const gz = gzipSync(Buffer.from(slim), { level: 9 });
writeFileSync(OUT, gz);

console.log(
  `${OUT} — 원본 ${Math.round(slim.length / 1024)}KB → 압축 ${Math.round(gz.length / 1024)}KB`,
);
