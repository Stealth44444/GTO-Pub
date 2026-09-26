# 크기가 있는 3벳 — 계획 A (엔진·솔버·지표)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 엔진이 3벳(IP 7.5 / 블라인드 9)·4벳 올인·그 대응을 칠 수 있게 하고, 30bb 프리플랍을 3벳까지 넣어 다시 풀어(0회차: 3벳 팟 가치 = 승률 × 팟), 플랍 도달률을 잰다.

**Architecture:** 스펙 `docs/superpowers/specs/2026-09-27-sized-threebet-design.md`의 1·3·5절 중 엔진과 솔버 부분. 3벳 팟 칩은 `scripts/game.ts` 한 곳에서 낸다. 엔진은 새 필드가 없는 데이터(지금 20bb)에서 지금과 똑같이 동작한다(`canThreeBet`). 솔버는 `solve-preflop-seats.ts`를 두고 새 스크립트로 만든다 — 기존 20bb 풀이 경로를 건드리지 않는다. 3벳 팟 플랍 EV 표(`flopev3-*.json`)가 있으면 쓰고 없으면 승률 × 팟으로 근사하는 자리를 미리 만들어, 계획 B는 표만 만들고 다시 돌리면 되게 한다.

**Tech Stack:** TypeScript, `node --experimental-strip-types` 테스트(`npm test`가 `scripts/*.test.ts`를 훑는다).

**계획 B(다음):** 3벳 팟 플랍 EV 파이프라인과 수렴, 화면(3벳 팟 결과·기대값 정산), 런 `handOutcome`, 복습, 30bb 켜기.

---

## 파일

| 파일 | 상태 | 책임 |
|---|---|---|
| `scripts/game.ts` | 수정 | `threeBetTo`, `threeBetChips` |
| `scripts/game.test.ts` | 신규 | 3벳 팟 칩 값 |
| `src/lib/seatGame.ts` | 수정 | 3벳·4벳 액션, 단계, 결과, 투입액 |
| `scripts/seatGame.test.ts` | 수정 | 가짜 데이터로 흐름·투입액 |
| `scripts/solve-preflop-3bet.ts` | 신규 | 3벳까지 넣은 자리별 프리플랍 솔버 |
| `scripts/flop-reach.ts` | 신규 | 플랍 도달률(단일 레이즈 / 3벳 팟) |
| `scripts/flopReach.test.ts` | 신규 | 20bb에서 현재 값(≈14.9%) 재현 |

## 계산 규칙 (모든 태스크 공통)

- `posted(BB) = 1 + 앤티`, `posted(SB) = 0.5`, 나머지 0. `DEAD = 0.5 + 1 + 앤티`.
- 3벳 크기 `T(seat)`: SB·BB는 9, 나머지는 7.5.
- 3벳한 자리 k의 총 투입 `kInv = T(k) + (k가 BB면 앤티)`. BB의 앤티는 이미 낸 죽은 돈이고 3벳 금액과 따로다.
- 오프너 h, 3벳 k일 때 관여하지 않은 죽은 돈 `rest = DEAD − posted(h) − posted(k)`.
  - 원래 솔버의 `win = OPEN + DEAD − posted(k)`는 오프너가 SB면 0.5를 두 번 센다. 새 솔버는 `rest`를 쓴다.
- 3벳 팟 플랍 팟 `pot3 = T(k) + kInv + rest`. 유효 스택 `STACK − kInv`와 `STACK − T(k)` 중 작은 쪽.
- 올인 팟 `2 × STACK + rest`(스택에 블라인드·앤티가 들어 있다 — 기존 솔버와 같은 규칙).

---

### Task 1: 3벳 팟 칩 (`game.ts`)

**Files:** Modify `scripts/game.ts`, Create `scripts/game.test.ts`

- [ ] **Step 1: 테스트**

```ts
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
```

- [ ] **Step 2: 실패 확인** — `threeBetTo` 없음.
- [ ] **Step 3: 구현** (`scripts/game.ts` 끝에)

```ts
/** 3벳 크기(bb). 블라인드는 오프너보다 먼저 치는 자리라 더 크게 친다. */
export function threeBetTo(seat: string): number {
  return seat === "SB" || seat === "BB" ? 9 : 7.5;
}

/**
 * 3벳 팟의 플랍 시점 팟과 유효 스택(칩, 1칩 = 0.1bb).
 *
 *   팟 = 3벳액 × 2 + 판에 안 낀 블라인드(죽은 돈) + 앤티
 *   유효 스택 = 스택 − 3벳액 − (3벳한 쪽이 BB면 앤티까지)
 *
 * BB의 앤티는 3벳액과 따로 이미 낸 죽은 돈이다. 오프너의 블라인드(SB 오픈)는
 * 3벳에 콜하는 금액 안에 들어 있다.
 */
export function threeBetChips(opener: string, threeBettor: string): { pot: number; stack: number } {
  const t = threeBetTo(threeBettor);
  const inHand = new Set([opener, threeBettor]);
  const dead = (inHand.has("SB") ? 0 : 0.5) + (inHand.has("BB") ? 0 : 1);
  const pot = 2 * t + dead + ANTE_BB;
  const stack = STACK_BB - t - (threeBettor === "BB" ? ANTE_BB : 0);
  return { pot: Math.round(pot * 10), stack: Math.round(stack * 10) };
}
```

- [ ] **Step 4: 통과 확인** — `node …/game.test.ts`와 `STACK=30 node …/game.test.ts` 둘 다.
- [ ] **Step 5: 커밋** — "Compute 3-bet pot chips in one place"

---

### Task 2: 엔진 — 데이터 형식과 선택지

**Files:** Modify `src/lib/seatGame.ts`, `scripts/seatGame.test.ts`

- `SeatAction`에 `"threebet"`. `ACTION_LABEL.threebet = "3벳"`.
- `SeatsData`: 최상위 `threeBetToBb?: { ip: number; blind: number }`. 자리 항목에 (오프너의 스팟 안):
  - `vsOpenThreeBet?: Record<caller, Record<hand, freq>>` + `ev.vsOpenThreeBet?`
  - `vsThreeBetCall?`, `vsThreeBetJam?: Record<threeBettor, …>` (오프너의 대응) + EV
  - `vsFourBetCall?: Record<threeBettor, …>` (3벳한 자리의 4벳 대응) + EV
- `Stage`에 `{ kind: "vsThreeBet"; threeBettor }`(나는 오프너), `{ kind: "vsFourBet"; opener }`(나는 3벳한 자리).
- `canThreeBet(data) = Boolean(data.threeBetToBb)`, `threeBetToOf(data, seat)`.
- `actionsAt(stage, open = true, threeBet = false)`:
  - vsOpen: `threeBet ? ["fold","call","threebet","jam"] : ["fold","call","jam"]`
  - vsThreeBet: `["fold","call","jam"]`, vsFourBet: `["fold","call"]`
- 내부 호출은 전부 `actionsFor(data, stage)`(= `actionsAt(stage, canOpen(data), canThreeBet(data))`)로.
- `labelFor(data, action, seat?)` — 3벳은 `3벳 ${threeBetToOf(data, seat)}bb`.
- `evAt`/`freqAt`에 새 단계. 폴드 EV: vsThreeBet는 `−openToBb`, vsFourBet는 `−(T + BB면 앤티)`.

테스트(가짜 데이터, 핸드 `[AA, KK, 72o]`):
- 3벳 필드가 없으면 vsOpen 선택지가 지금과 같다(`["fold","call","jam"]`).
- 있으면 `["fold","call","threebet","jam"]`, 라벨 `3벳 7.5bb`(BTN) / `3벳 9bb`(BB).
- `evAt` vsThreeBet / vsFourBet 값과 폴드 EV.

- [ ] Step 1 테스트 → Step 2 실패 → Step 3 구현 → Step 4 통과 + `npm test` 전체 → Step 5 커밋 "Give the seat engine a sized 3-bet and a 4-bet jam"

---

### Task 3: 엔진 — 흐름과 투입액

**Files:** Modify `src/lib/seatGame.ts`, `scripts/seatGame.test.ts`

- `GameState.threeBettor: string | null`.
- `Outcome`에 `{ kind: "threebetFlop"; opener; threeBettor }`.
- `stepFor(data, seats, seat, action, opts?: { keptBb?; facingJam?; callToBb? })` — 기존 위치 인자를 옵션으로 바꾼다. 3벳 스텝은 `raise`, `committedBb = T + (BB면 앤티)`. 3벳 콜은 `callToBb = T`.
- 뒤 자리가 3벳하면: `threeBettor` 기록 → `foldRest` → `answerThreeBet`:
  - 오프너가 히어로면 `vsThreeBet` 차례.
  - 아니면 샘플: 폴드(오픈액 유지) → `folded`(3벳 승) / 콜(3벳액) → `threebetFlop` / 올인 → `answerFourBet`.
- `answerFourBet`: 3벳한 자리가 히어로면 `vsFourBet` 차례, 아니면 샘플: 폴드(3벳액 유지) → `folded`(오프너 승) / 콜(스택 전부) → `allin`.
- `applyHeroAction` 맨 앞에 새 분기: 히어로의 3벳, vsThreeBet, vsFourBet.

테스트(가짜 데이터, 빈도 0/1로 결정적):
- 히어로 BTN이 CO 오픈에 3벳, CO가 4벳 올인, 히어로 콜 → `allin CO/BTN`, BTN 투입 = 스택, CO 투입 = 스택.
- 히어로 CO 오픈, BTN 3벳, 히어로 콜 → `threebetFlop`, CO 투입 7.5.
- 히어로 오픈 후 3벳에 폴드 → 오픈액 2.5 유지, `folded` BTN 승.
- 3벳한 BTN이 4벳에 폴드 → BTN 투입 7.5 유지.
- BB 3벳 → BB 투입 9 + 앤티.
- 3벳 뒤 자리(SB, BB)가 폴드 스텝으로 차례로 남는다.
- 새 필드가 없는 20bb 데이터로 5,000판 — 결과 종류에 `threebetFlop`이 없다.

- [ ] 테스트 → 실패 → 구현 → 통과 + `npm test` + `npx tsc --noEmit` → 커밋 "Play out a sized 3-bet: the opener answers, a 4-bet jam gets answered"

---

### Task 4: 프리플랍 솔버 (`solve-preflop-3bet.ts`)

**Files:** Create `scripts/solve-preflop-3bet.ts`

`solve-preflop-seats.ts`의 구조(자리별 스팟, 뒤 자리 순차 첫 대응, 피셔스 플레이 `rate = 1/(iter+2)`, 마지막에 수렴 전략 상대로 EV 재계산)를 그대로 따르고 다음을 더한다.

전략(오프너 h의 스팟 안, 뒤 자리 k마다):
- `vThree[k]` — k의 3벳 빈도. vsOpen에서 `fold / call / three / jam3`, 생존 확률 `survive *= 1 − fCall − fThree − fJam`.
- `oCall3[k]`, `oJam4[k]` — h의 3벳 대응.
- `kCall4[k]` — k의 4벳 대응.

값(h 핸드 i, k 핸드 j):
- `V3h(i, k)` = 3벳 팟에서 오프너의 플랍 가치. 표가 있으면 표, 없으면 `eq(i, k의 3벳 레인지) × pot3`.
- `V3k(j, k)` = 같은 것의 3벳한 쪽. 없으면 `eq(j, h 오픈 ∧ 3벳 콜 레인지) × pot3`.
- h가 k의 3벳을 받았을 때: `fold = −OPEN`, `call = V3h − T(k)`, `jam4 = (1 − c4)(kInv + rest) + c4 × (eq(i, k 3벳 ∧ 4벳 콜) × allinPot − STACK)`, 여기서 `c4 = freq(3벳 ∧ 4벳 콜) / freq(3벳)`.
- evOpen에 `firstThree[k] × max(fold, call, jam4)`를 더한다.
- k의 3벳 EV: 오프너의 오픈 조건부 대응 비율 `(pf, pc, pj)`로 `pf × (OPEN + rest) + pc × (V3k − kInv) + pj × max(−kInv, eq(j, 오픈 ∧ 4벳) × allinPot − STACK)`.
- k의 4벳 콜: `eq(j, 오픈 ∧ 4벳) × allinPot − STACK > −kInv`.
- 3벳 올인(jam3)의 뺏는 몫은 `OPEN + rest`(원래 솔버의 0.5 중복을 고친 식).

3벳 팟 플랍 EV 표: `src/data/flopev3-<오프너 구간>-<ip|bb|sb>-<깊이>bb.json`(형식은 `flopev-*.json`과 같다 — `flopEvBb[0]`=OOP, `[1]`=IP). 파일이 없으면 근사를 쓰고 어느 쪽을 썼는지 출력한다.

출력: `withDepth("src/data/preflop-seats.json")` — 30bb면 기존 파일을 덮는다(깃이 이전 판을 갖고 있다). 기존 필드와 새 필드, `threeBetToBb: { ip: 7.5, blind: 9 }`, `note`에 "0회차: 3벳 팟 = 승률 × 팟" 같은 출처.

요약 출력: 자리별 오픈·오픈올인, BB의 BTN 오픈 대응(콜/3벳/올인), BTN 오픈의 3벳 대응(폴드/콜/4벳), 그리고 **결정당 평균 후회**(각 결정 노드에서 최선 EV − 전략 EV를 도달 가중으로 평균, bb) — 수렴 확인용.

- [ ] Step 1: 스크립트 작성
- [ ] Step 2: `STACK=30 ITERS=3000 node --experimental-strip-types scripts/solve-preflop-3bet.ts` — 요약 확인, 평균 후회가 0.01bb 수준인지
- [ ] Step 3: 엔진 테스트 전체 통과(새 30bb 파일을 엔진이 읽는다) → 커밋 "Solve 30bb preflop with a sized 3-bet (round 0: equity-valued 3-bet pots)"

---

### Task 5: 플랍 도달률

**Files:** Create `scripts/flop-reach.ts`, `scripts/flopReach.test.ts`

- `flopReach(data, hands, rnd, n)` — 엔진으로 n판을 모든 자리 샘플로 돌려(`heroSeat = "__nobody__"`) 결과 종류별 비율: 단일 레이즈 플랍(`flop`), 3벳 팟(`threebetFlop`), 올인, 폴드.
- 테스트: 20bb 현재 데이터로 `flop` 비율이 13~17%(다른 세션이 잰 14.9% 근처).
- 스크립트: `STACK=30`으로 새 30bb 파일의 도달률 출력.

- [ ] 테스트 → 구현 → 통과 → 30bb 측정 → 커밋 "Measure how often hands reach the flop"

---

### Task 6: 마무리

- [ ] `npm test`, `npx tsc --noEmit`, `npm run lint` 전부 통과
- [ ] 20bb 앱 동작이 그대로인지 브라우저로 한 판 전체 몇 판(3벳 필드가 없으니 선택지 변화 없음)
- [ ] `git fetch` 후 겹침 확인, 사용자에게 푸시 여부 묻기
- [ ] 결과(30bb 도달률, 3벳 빈도, 평균 후회)를 보고하고 계획 B로
