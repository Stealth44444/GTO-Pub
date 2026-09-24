// 보드 종류 이름.
//
// 실행: node --experimental-strip-types scripts/texture.test.ts
//
// 이름을 틀리게 붙이면 배우는 사람이 잘못된 범주를 익힌다. 틀린 채로 굳으면
// 나중에 고치는 것이 처음 배우는 것보다 어렵다.

import { textureTags } from "../src/lib/texture.ts";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) pass += 1;
  else {
    fail += 1;
    console.error(`  실패: ${name}`);
  }
}

const labels = (board: string): string[] =>
  textureTags(board.match(/../g) ?? []).map((t) => t.label);
const has = (board: string, label: string) => labels(board).includes(label);

// ── 무늬 ────────────────────────────────────────────────────────────────

check("무늬 셋이 같으면 모노톤", has("AsKs7s", "모노톤"));
check("무늬 둘이 같으면 투톤", has("AsKs7h", "투톤"));
check("무늬가 다 다르면 레인보우", has("AsKh7d", "레인보우"));
check("모노톤은 투톤이 아니다", !has("AsKs7s", "투톤"));

// ── 숫자 겹침 ───────────────────────────────────────────────────────────

check("둘이 같으면 페어보드", has("AsAh7d", "페어보드"));
check("셋이 같으면 트립스보드", has("AsAhAd", "트립스보드"));
check("트립스는 페어라고 부르지 않는다", !has("AsAhAd", "페어보드"));
check("안 겹치면 둘 다 아니다", !has("AsKh7d", "페어보드") && !has("AsKh7d", "트립스보드"));

// ── 연결 ────────────────────────────────────────────────────────────────

check("붙어 있으면 커넥티드", has("9s8h7d", "커넥티드"));
check("한 칸 떨어져도 커넥티드", has("9s8h6d", "커넥티드"));
check("멀리 떨어지면 드라이", has("As8h2d", "드라이"));
check("애매하면 둘 다 안 붙인다", !has("Ks9h7d", "커넥티드") && !has("Ks9h7d", "드라이"));

{
  // 페어가 있으면 서로 다른 숫자가 둘뿐이라 연결을 말할 수 없다.
  const l = labels("AsAh7d");
  check("페어보드에는 연결 이름을 안 붙인다", !l.includes("커넥티드") && !l.includes("드라이"));
}

// ── 높이 ────────────────────────────────────────────────────────────────

check("A가 있으면 A하이", has("As8h2d", "A하이"));
check("K가 가장 크면 K하이", has("Ks8h2d", "K하이"));
check("낮으면 로우보드", has("8s5h2d", "로우보드"));
check("중간은 높이를 안 붙인다", labels("Ts9h7d").every((l) => !l.endsWith("하이")));

// ── 개수와 모양 ─────────────────────────────────────────────────────────

{
  check("세 장이 안 되면 비어 있다", textureTags(["As", "Kh"]).length === 0);
  check("이름은 세 개까지", labels("AsAs7s").length <= 3);
  const tags = textureTags(["9s", "8s", "7s"]);
  check("이름마다 설명이 붙는다", tags.every((t) => t.hint.length > 0));
  check("겹치는 이름이 없다", new Set(tags.map((t) => t.label)).size === tags.length);
}

{
  // 턴과 리버가 붙어도 돌아야 한다. 다섯 장에서도 같은 규칙이다.
  const five = labels("AsKs7h3d2c");
  check("다섯 장도 이름이 나온다", five.length > 0);
  check("다섯 장에서도 셋까지", five.length <= 3);
}

console.log(`통과 ${pass}, 실패 ${fail}`);
process.exit(fail > 0 ? 1 : 0);
