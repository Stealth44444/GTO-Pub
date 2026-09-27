// 실행: node --experimental-strip-types scripts/allinEquity.test.ts
import { allinEquity, multiwayEquity, seeded } from "../src/lib/allinEquity.ts";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) pass += 1;
  else {
    fail += 1;
    console.error(`  실패: ${name}`);
  }
}

// AhAd 대 KsKc 프리플랍은 약 81.3%. 흔히 말하는 81.9%는 클래스 평균이고,
// 무늬가 겹치지 않는 이 조합은 KK의 플러시 길이 둘 다 살아 있어 조금 낮다.
// (20만 샘플로 81.2%를 확인했다.)
{
  const eq = allinEquity(["Ah", "Ad"], ["Ks", "Kc"], [], seeded(1));
  console.log(`  AhAd vs KsKc ${(eq * 100).toFixed(1)}%`);
  check("AhAd vs KsKc ≈ 81.3%", Math.abs(eq - 0.813) < 0.01);
}
// 같은 핸드는 반반.
{
  const eq = allinEquity(["Ah", "Kd"], ["As", "Kc"], [], seeded(2));
  check("AKo 대 AKo ≈ 50%", Math.abs(eq - 0.5) < 0.02);
}
// 플랍 전수. K72에서 셋을 맞은 KK를 상대로 AA는 에이스 두 장이 남았다.
{
  const eq = allinEquity(["Ah", "Ad"], ["Ks", "Kc"], ["Kd", "7h", "2c"], seeded(3));
  console.log(`  AA vs KK on Kd7h2c ${(eq * 100).toFixed(1)}%`);
  check("셋 상대 AA는 한 자릿수 %", eq > 0.05 && eq < 0.1);
}
// 턴 전수: 남은 44장.
{
  const eq = allinEquity(["Ah", "Ad"], ["Ks", "Kc"], ["Kd", "7h", "2c", "3s"], seeded(4));
  check("턴에서 AA는 에이스 두 장 = 2/44", Math.abs(eq - 2 / 44) < 1e-9);
}
// 리버는 결과 그대로.
{
  const river = ["2d", "7h", "9c", "3s", "4d"];
  check("리버에서 이긴 쪽은 1", allinEquity(["Ah", "Ad"], ["Ks", "Kc"], river, seeded(5)) === 1);
  check("리버에서 진 쪽은 0", allinEquity(["Ks", "Kc"], ["Ah", "Ad"], river, seeded(5)) === 0);
  check("리버 무승부는 0.5", allinEquity(["Ah", "Kd"], ["As", "Kc"], river, seeded(5)) === 0.5);
}
// 같은 씨앗이면 같은 값.
check("seeded도 재현된다", seeded(7)() === seeded(7)());
check(
  "재현된다",
  allinEquity(["Ah", "Ad"], ["Ks", "Kc"], [], seeded(9)) ===
    allinEquity(["Ah", "Ad"], ["Ks", "Kc"], [], seeded(9)),
);

// 3인 승률. 무승부는 나눠 갖는다 — 셋의 합은 1이다.
{
  const eq = multiwayEquity([["Ah", "Ad"], ["Ks", "Kc"], ["Qh", "Qd"]], [], seeded(11));
  console.log(`  AA/KK/QQ ${eq.map((x) => (x * 100).toFixed(1)).join(" / ")}%`);
  check("3인 승률의 합은 1", Math.abs(eq[0] + eq[1] + eq[2] - 1) < 1e-9);
  check("AA가 약 65%", eq[0] > 0.6 && eq[0] < 0.7);
  check("KK가 QQ보다 높다", eq[1] > eq[2]);
}
{
  // 리버까지 깔려 있으면 결과 그대로. 셋이 같은 스트레이트면 삼등분.
  const board = ["Ts", "Js", "Qd", "Kc", "Ah"];
  const eq = multiwayEquity([["2c", "3c"], ["4d", "5d"], ["6h", "7h"]], board, seeded(12));
  check("보드가 이기면 삼등분", eq.every((x) => Math.abs(x - 1 / 3) < 1e-9));
  const eq2 = multiwayEquity([["Ac", "Ad"], ["2c", "3d"], ["2h", "3h"]], ["As", "Kd", "7c", "4s", "9h"], seeded(12));
  check("트립스가 다 가져간다", eq2[0] === 1 && eq2[1] === 0);
}

console.log(`통과 ${pass}, 실패 ${fail}`);
process.exit(fail > 0 ? 1 : 0);
