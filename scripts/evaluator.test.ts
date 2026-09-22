// 평가기 검증. 이 위에 승률 계산이 올라가므로 여기서 틀리면 전부 무의미해진다.
import { evaluate7, categoryOf, parseCards, Category, CATEGORY_NAMES } from "./evaluator.ts";

let passed = 0;
let failed = 0;

function expectCategory(hand: string, expected: Category, label: string) {
  const actual = categoryOf(evaluate7(parseCards(hand)));
  if (actual === expected) {
    passed++;
  } else {
    failed++;
    console.log(
      `  FAIL [${label}] ${hand}: 기대 ${CATEGORY_NAMES[expected]}, 실제 ${CATEGORY_NAMES[actual]}`,
    );
  }
}

function expectStronger(a: string, b: string, label: string) {
  const sa = evaluate7(parseCards(a));
  const sb = evaluate7(parseCards(b));
  if (sa > sb) {
    passed++;
  } else {
    failed++;
    console.log(`  FAIL [${label}] "${a}" 가 "${b}" 보다 강해야 하는데 ${sa} vs ${sb}`);
  }
}

function expectEqual(a: string, b: string, label: string) {
  const sa = evaluate7(parseCards(a));
  const sb = evaluate7(parseCards(b));
  if (sa === sb) {
    passed++;
  } else {
    failed++;
    console.log(`  FAIL [${label}] "${a}" 와 "${b}" 가 같아야 하는데 ${sa} vs ${sb}`);
  }
}

console.log("족보 분류");
expectCategory("As Ks Qs Js Ts 2h 3d", Category.StraightFlush, "로열");
expectCategory("5s 4s 3s 2s As Kh Qd", Category.StraightFlush, "스틸 휠 플러시");
expectCategory("9c 9d 9h 9s 2c 3d 4h", Category.Quads, "쿼드");
expectCategory("9c 9d 9h 2s 2c 3d 4h", Category.FullHouse, "풀하우스");
expectCategory("9c 9d 9h 2s 2c 2d 4h", Category.FullHouse, "트립스 두 벌");
expectCategory("As Ks Qs 7s 2s 3d 4h", Category.Flush, "플러시");
expectCategory("9c 8d 7h 6s 5c Ad Kh", Category.Straight, "스트레이트");
expectCategory("As 5d 4h 3s 2c Kd Qh", Category.Straight, "휠");
expectCategory("9c 9d 9h 2s 3c 5d 7h", Category.Trips, "트립스");
expectCategory("9c 9d 2h 2s 3c 5d 7h", Category.TwoPair, "투페어");
expectCategory("9c 9d 2h 3s 4c 6d 8h", Category.Pair, "원페어");
expectCategory("9c 7d 2h 3s 4c 6d Jh", Category.HighCard, "하이카드");

console.log("강도 비교");
expectStronger("As Ks Qs Js Ts 2h 3d", "9c 9d 9h 9s 2c 3d 4h", "스플 > 쿼드");
expectStronger("9c 9d 9h 9s 2c 3d 4h", "9c 9d 9h 2s 2c 3d 4h", "쿼드 > 풀하");
expectStronger("9c 9d 9h 2s 2c 3d 4h", "As Ks Qs 7s 2s 3d 4h", "풀하 > 플러시");
expectStronger("As Ks Qs 7s 2s 3d 4h", "9c 8d 7h 6s 5c Ad Kh", "플러시 > 스트");
expectStronger("9c 8d 7h 6s 5c Ad Kh", "9c 9d 9h 2s 3c 5d 7h", "스트 > 트립스");
expectStronger("Ac Ad 9h 2s 3c 5d 7h", "Kc Kd 9h 2s 3c 5d 7h", "AA > KK 페어");
expectStronger("9c 8d 7h 6s 5c 2d 3h", "8c 7d 6h 5s 4c 2d 3h", "높은 스트레이트");

console.log("동점 / 킥커");
expectEqual("Ac Ad Kh Qs Jc 2d 3h", "As Ah Kd Qc Jd 2s 3c", "같은 페어+킥커");
expectStronger("Ac Ad Kh Qs Jc 2d 3h", "Ac Ad Kh Qs Tc 2d 3h", "킥커 J > T");
expectEqual("5s 4h 3d 2c As Kh Qd", "5c 4d 3h 2s Ac Kd Qh", "같은 휠");

// 휠은 최약 스트레이트여야 한다
expectStronger("6c 5h 4d 3s 2c Kd Qh", "5s 4h 3d 2c As Kh Qd", "6하이 스트 > 휠");

// 7장 중 최고 5장을 골라야 한다
expectStronger("As Ks Qs Js Ts 9s 8s", "9s 8s 7s 6s 5s Ks Qs", "로열 > 9하이 스플");
expectEqual("As 2s 3s 4s 5s 6s 7h", "Ks 2s 3s 4s 5s 6s 7h", "둘 다 6하이 스플(A·K 무관)");
// 6장이 같은 무늬면 상위 5장만 센다
expectStronger("As Ks Qs Js 9s 2s 3h", "As Ks Qs Js 8s 2s 3h", "플러시 5번째 카드 비교");
expectEqual("As Ks Qs Js 9s 2s 3h", "As Ks Qs Js 9s 4s 7h", "플러시 6번째 카드는 무관");

console.log(`\n통과 ${passed} / 실패 ${failed}`);
if (failed > 0) process.exitCode = 1;
