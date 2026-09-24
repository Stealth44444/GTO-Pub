// scripts 안의 테스트를 전부 돌린다.
//
// 실행: npm test
//
// 파일마다 npm 스크립트를 따로 두면, 새로 쓴 테스트가 스크립트를 얻지 못해
// 조용히 빠진다. 실제로 두 개가 그렇게 빠져 있었다. 폴더를 훑는 쪽이 낫다.

import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";

const files = readdirSync("scripts")
  .filter((f) => f.endsWith(".test.ts"))
  .sort();

let failed = 0;
for (const file of files) {
  const res = spawnSync("node", ["--experimental-strip-types", `scripts/${file}`], {
    stdio: ["ignore", "pipe", "pipe"],
    encoding: "utf8",
  });
  const ok = res.status === 0;
  if (!ok) failed += 1;
  // 통과한 것은 마지막 줄만 — 대개 "n개 통과"다. 실패한 것은 전부 보여준다.
  // 타입 스트리핑 경고는 매번 세 줄씩 끼어들어 요약을 가린다. 걷어낸다.
  const body = `${res.stdout ?? ""}${res.stderr ?? ""}`
    .split("\n")
    .filter(
      (l) =>
        !/ExperimentalWarning|trace-warnings|"type": "module"|Reparsing as ES module/.test(l),
    )
    .join("\n")
    .trimEnd();
  const tail = ok ? (body.split("\n").at(-1) ?? "") : `\n${body}`;
  console.log(`${ok ? "PASS" : "FAIL"} ${file} ${tail}`);
}

console.log(`\n${files.length - failed}/${files.length} 통과`);
process.exit(failed > 0 ? 1 : 0);
