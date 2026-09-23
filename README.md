# GTO Pub 트레이너

홀덤펍 유저를 위한 숏스택 트레이너. 한 판씩 스팟을 보고 액션을 고르면 EV 손실로 채점한다.
QR로 들어오는 웹앱이라 첫 로드 크기가 곧 진입 마찰이다.

제품 배경과 스코프는 상위 폴더의 `session-brief.md`에 있다.

## 시작하기

```bash
npm install
cp .env.local.example .env.local   # Supabase URL과 anon key를 채운다
npm run dev
```

환경변수가 없어도 UI는 동작한다. 기록만 서버에 남지 않는다 (`src/lib/supabase.ts`가 null을 반환).

## ⚠ Supabase 스키마를 먼저 적용할 것

앱은 `training_attempts`에 스팟 정보(`mode`, `table_size`, `stack_bb`, `ante_bb`,
`shover_position`)와 `ev_loss_bb`를 함께 쓴다. **스키마를 적용하지 않고 배포하면 모든
기록 insert가 실패한다.**

`supabase/schema.sql`을 SQL 편집기에서 실행한다. 컬럼 추가는 전부
`add column if not exists`, 제약은 `drop ... if exists` 후 재생성이라 여러 번 돌려도
안전하다. 단 맨 아래 `create policy` 문들은 정책이 이미 있으면 실패하므로, 기존 DB를
갱신할 때는 `alter table` 구간만 실행하면 된다.

## 솔버

레인지는 외부에서 가져오지 않고 직접 계산한다. 재생성이 필요할 때만 돌리면 되고,
결과물(`src/data/*.json`)은 저장소에 커밋되어 있다.

| 명령 | 하는 일 |
|---|---|
| `npm run solver:test` | 핸드 평가기 검증. 이게 틀리면 나머지가 전부 무의미하다 |
| `npm run solver:equity` | 169×169 프리플랍 올인 승률표 → `scripts/data/equity.json`. 오래 걸린다 (현재 표는 매치업당 20만 샘플) |
| `npm run solver:pushfold` | 푸시/폴드 균형 → `src/data/pushfold.json`, `src/data/pushfold-calls.json`. 수 분 |
| `npm run grading:test` | 채점 경계값 검증. 실제 스팟을 넣어 등급이 상식에 맞는지 본다 |

`scripts/verify-exact.ts`는 특정 매치업을 보드 전수 열거로 계산해 샘플링 표를 검증한다
(`node --experimental-strip-types scripts/verify-exact.ts AKs QQ`).

환경변수로 조정한다: `ITERS`(fictitious play 반복수, 기본 4000), `ANTE`(BB 앤티 bb,
기본 1).

### 데이터 형식에서 주의할 점

`shoveEvBb`와 `callEvBb`는 **핸드 이름이 아니라 최상위 `hands` 순서의 배열**이다.
키를 169개씩 되풀이하면 gzip 후에도 172KB가 되어 배열로 바꿨다 (→ 114KB).

배열에 문자열 키로 접근하면 조용히 틀린다. `ev["AKs"]`는 `undefined`지만 `ev["66"]`은
**인덱스 66**으로 해석되어 엉뚱한 핸드의 EV를 돌려준다. 반드시 `hands`로 만든 색인을
거쳐 읽는다 (`src/lib/scenarios.ts`의 `HAND_INDEX`, `src/lib/callspots.ts`의 `index`).

콜 데이터(84KB gz)는 번들에 없고 올인 대응 카테고리를 열 때 동적 import로 받는다.
올인 트레이너만 쓰는 사람이 받을 이유가 없어서다.

## 채점

빈도가 아니라 **EV 손실(bb)** 로 5단계를 매긴다. 최선 구간 경계 `0.01bb`는 솔버 자체
최대 오차 `0.009bb`에서 왔다 — 그보다 작은 차이는 이 데이터로 구분할 수 없으므로 틀렸다고
말할 근거가 없다. 혼합 전략 스팟에서 어느 쪽을 골라도 최선으로 나오는 게 이 때문이다.

기준은 `src/lib/grading.ts`에 모여 있고 `scripts/grading.test.ts`가 지킨다.

## 모델의 한계 (의도적 단순화)

레인지를 손보기 전에 읽을 것. 전부 `scripts/solve-pushfold.ts` 주석에도 적혀 있다.

- **BB 앤티 1bb를 전제로 푼다.** 앤티 0으로 풀면 데드머니가 블라인드 1.5bb뿐이라
  16bb 이상에서 콜 손익분기 승률이 48%까지 올라가고, 균형이 "빅페어만 콜"로 무너진다.
  그 레인지 상대로는 A5s가 88보다 승률이 높아져 중간 페어가 빠지고 약한 수티드 에이스가
  들어가는 비정상 레인지가 나온다. 앤티 구조가 다른 매장을 대상으로 하면 `ANTE`를 바꿔
  다시 생성해야 하고, 화면의 팟·스택 표시(`preflopPot`, `postedBlind`)도 같은 값을 써야 한다.
- **콜하는 사람이 최대 1명이라고 가정한다.** 2명 이상 콜은 2인 승률표로 계산할 수 없다.
  그래서 콜 레인지는 사실상 "내가 마지막 액션자일 때"의 답이고, 뒤에 남은 사람이 많은
  자리일수록 실제보다 넓게 나온다. **올인 대응 카테고리가 블라인드만 다루는 이유다**
  (BB는 뒤에 아무도 없어 정확, SB는 BB 하나만 남아 오차가 작다).
- **칩EV 기준, ICM 미적용.** 상금권 근처에서는 어긋난다.
- **핸드 대 레인지 승률에서 카드 제거 효과를 무시한다.**
- **푸시/폴드는 20bb 근처가 한계다.** 실제로는 그 깊이에서 올인이 아니라 레이즈로
  여는데, 레이즈의 EV를 재려면 포스트플랍을 풀어야 한다. 같은 이유로 `프리플랍 오프닝`과
  `오픈 대응` 카테고리는 아직 열 수 없다 (`src/lib/poker.ts`의 레인지는 솔버 산출물이
  아니라 하드코딩된 단순화 값이다).

## 구조

```
scripts/           솔버와 검증. 앱 런타임과 분리되어 있다
src/data/          솔버 산출물 (커밋됨)
src/lib/           도메인 로직 — poker, scenarios, grading, stats, callspots
src/components/    화면
supabase/          스키마
```

학습 카테고리는 `src/lib/scenarios.ts`의 `MODES`에 있다. `available: false`인 항목은
메뉴에서 시작이 막히고, `solutionFor`도 빈 값을 돌려준다 — 다른 모드의 정답을 잘못
돌려주지 않기 위해서다.
