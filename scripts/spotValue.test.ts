// 실행: node --experimental-strip-types scripts/spotValue.test.ts
import { isStudyWorthy, spotBand, spotGap } from "../src/lib/spotValue.ts";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) pass += 1;
  else {
    fail += 1;
    console.error(`  실패: ${name}`);
  }
}

check("최선과 차선의 차이", spotGap([0, 0.3, -1]) === 0.3);
check("값 없는 액션은 뺀다", spotGap([-2, null, -1.5]) === 0.5);
check("비교할 것이 하나뿐이면 null", spotGap([0, null]) === null);
check("1bb 초과는 뻔함", spotBand(1.2) === "trivial");
check("1bb는 명확", spotBand(1) === "clear");
check("0.25bb 초과는 명확", spotBand(0.3) === "clear");
check("0.25bb는 접전", spotBand(0.25) === "close");
check("0.05bb는 접전", spotBand(0.05) === "close");
check("0.05bb 미만은 무차별", spotBand(0.04) === "indifferent");
check("접전은 공부할 만하다", isStudyWorthy([0, 0.1]));
check("명확도 공부할 만하다", isStudyWorthy([0, 0.9]));
check("뻔한 것은 아니다", !isStudyWorthy([0, 3]));
check("무차별은 아니다", !isStudyWorthy([0, 0.01]));
check("비교할 수 없으면 아니다", !isStudyWorthy([0, null]));

console.log(`통과 ${pass}, 실패 ${fail}`);
process.exit(fail > 0 ? 1 : 0);
