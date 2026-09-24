// 구간별 보드가 다 나왔으면 기본 보드 세트를 버린다.
//
// 실행: npm run boards:prune
//
// 기본 세트는 BTN 오픈·BB 콜 하나였다. 구간별 보드의 late가 정확히 그 조건이고,
// 그쪽은 다시 푼 레인지로 만들어졌으므로 더 낫다. 둘을 다 들고 있으면 20MB를
// 두 번 배포하고, 저장소에는 영원히 남는다.
//
// 앱은 구간이 없을 때만 기본 목록으로 떨어진다. 그래서 기본 목록을 late 쪽으로
// 돌려두면 떨어져도 옳은 보드를 쓴다.

import { existsSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { readdirSync } from "node:fs";

const ROOT = "public/postflop";
const INDEX = `${ROOT}/index.json`;
const BUCKETS = `${ROOT}/index-buckets.json`;
/** 기본 목록이 가리킬 구간. BTN 오픈·BB 콜이라 기존 기본 세트와 같은 조건이다. */
const STAND_IN = "late";
const NEEDED = ["early", "middle", "late", "sb"];

if (!existsSync(BUCKETS)) {
  console.error(`${BUCKETS} 가 없습니다. 먼저 npm run boards 를 끝내세요.`);
  process.exit(1);
}

const raw = JSON.parse(readFileSync(BUCKETS, "utf8")) as {
  buckets: Record<string, { file: string }[]>;
};

const missing = NEEDED.filter((n) => (raw.buckets[n]?.length ?? 0) === 0);
if (missing.length > 0) {
  console.error(`아직 없는 구간이 있습니다: ${missing.join(", ")}. 지우지 않습니다.`);
  process.exit(1);
}

const standIn = raw.buckets[STAND_IN];
const gone = standIn.filter((e) => !existsSync(`${ROOT}/${e.file}`));
if (gone.length > 0) {
  console.error(`${STAND_IN} 구간의 파일이 ${gone.length}개 비어 있습니다. 지우지 않습니다.`);
  process.exit(1);
}

// 기본 목록을 late 쪽으로 돌린다.
writeFileSync(INDEX, JSON.stringify({ spots: standIn }, null, 1));

// 루트에 있던 옛 보드만 지운다. 구간 폴더는 건드리지 않는다.
let removed = 0;
let freed = 0;
for (const name of readdirSync(ROOT)) {
  if (!name.endsWith(".json.gz")) continue;
  const path = `${ROOT}/${name}`;
  freed += readFileSync(path).length;
  rmSync(path);
  removed += 1;
}

console.log(
  `기본 보드 ${removed}개 삭제 (${Math.round(freed / 1024 / 1024)}MB). ` +
    `기본 목록은 ${STAND_IN} 구간 ${standIn.length}개를 가리킵니다.`,
);
