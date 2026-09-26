// 실행: STACK=30 node --experimental-strip-types scripts/game.test.ts
// 깊이는 모듈을 읽을 때 정해지므로 30bb 값은 STACK=30으로 돌린다. npm test는
// 기본 20bb로 돌리므로 두 깊이를 모두 식으로 검사한다.
import { STACK_BB, threeBetChips, threeBetTo } from "./game.ts";

let pass = 0;
let fail = 0;
function check(name: string, cond: boolean) {
  if (cond) pass += 1;
  else {
    fail += 1;
    console.error(`  실패: ${name}`);
  }
}

check("IP 3벳은 7.5", threeBetTo("BTN") === 7.5);
check("BB 3벳은 9", threeBetTo("BB") === 9);
check("SB 3벳은 9", threeBetTo("SB") === 9);

// 칩 단위는 flopChips와 같다(1칩 = 0.1bb).
const ip = threeBetChips("CO", "BTN");
check("IP 3벳 팟 17.5", ip.pot === 175);
check("IP 3벳 유효 스택", ip.stack === Math.round((STACK_BB - 7.5) * 10));
const bb = threeBetChips("BTN", "BB");
check("BB 3벳 팟 19.5", bb.pot === 195);
check("BB 3벳 유효 스택(앤티까지 냄)", bb.stack === Math.round((STACK_BB - 9 - 1) * 10));
const sb = threeBetChips("BTN", "SB");
check("SB 3벳 팟 20", sb.pot === 200);
check("SB 3벳 유효 스택", sb.stack === Math.round((STACK_BB - 9) * 10));
const sbOpen = threeBetChips("SB", "BB");
check("SB 오픈에 BB 3벳: 죽은 돈은 앤티뿐", sbOpen.pot === 190);

console.log(`통과 ${pass}, 실패 ${fail}`);
process.exit(fail > 0 ? 1 : 0);
