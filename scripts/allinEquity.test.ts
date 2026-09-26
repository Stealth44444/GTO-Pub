// 실행: node --experimental-strip-types scripts/allinEquity.test.ts
import { allinEquity, seeded } from "../src/lib/allinEquity.ts";

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

console.log(`통과 ${pass}, 실패 ${fail}`);
process.exit(fail > 0 ? 1 : 0);
