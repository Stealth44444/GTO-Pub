// 숏스택 푸시/폴드 균형을 계산한다.
//
// 모델:
//   - 히어로 앞은 전원 폴드한 상태 (RFI 스팟)
//   - 히어로는 올인 또는 폴드만 선택 가능
//   - 뒤 플레이어들은 순서대로 콜 또는 폴드하며, 자리마다 콜 레인지를 따로 갖는다
//     (BB는 이미 넣은 돈이 있으므로 앞자리보다 넓게 콜한다)
//   - BB 앤티 방식. BB가 블라인드 1bb에 더해 앤티를 낸다 (기본 1bb, ANTE 환경변수로 변경).
//     앤티는 이 모델의 유효 범위를 좌우한다 — 자세한 이유는 main()의 주석 참조.
//   - 칩EV 기준 (ICM 미적용 — 리바인 구간은 칩EV가 지배적이므로 타당한 출발점)
//
// 단순화 (명시적으로 기록):
//   콜하는 사람이 최대 1명이라고 가정한다. 즉 먼저 콜한 사람과 헤즈업으로 간다.
//   2명 이상 콜은 빈도가 낮고, 3인 이상 올인 승률은 2인 승률표로 계산할 수 없다.
//   푸시/폴드 계산에서 널리 쓰이는 근사이며, 히어로의 올인 EV를 약간 과대평가한다.
//   또한 핸드 대 레인지 승률에서 카드 제거 효과를 무시한다.
//
// 풀이: fictitious play — 히어로 올인 레인지와 각 자리의 콜 레인지를
//       서로에 대한 최적 대응으로 번갈아 갱신해 수렴시킨다.
//
// 실행: node --experimental-strip-types scripts/solve-pushfold.ts

import { readFileSync, writeFileSync } from "node:fs";

type EquityTable = {
  hands: string[];
  equity: number[];
  targetSamplesPerMatchup: number;
  generatedAt: string;
};

const raw = JSON.parse(readFileSync("scripts/data/equity.json", "utf8")) as EquityTable;
const HANDS = raw.hands;
const N = HANDS.length;
const EQ = raw.equity;

// 각 핸드의 조합 수 (페어 6, 수티드 4, 오프수트 12)
const COMBOS = HANDS.map((code) => (code.length === 2 ? 6 : code.endsWith("s") ? 4 : 12));
const TOTAL_COMBOS = COMBOS.reduce((a, b) => a + b, 0); // 1326

function equityVsRange(i: number, range: Float64Array): number {
  let weighted = 0;
  let total = 0;
  const base = i * N;
  for (let j = 0; j < N; j++) {
    const w = range[j] * COMBOS[j];
    if (w === 0) continue;
    weighted += w * EQ[base + j];
    total += w;
  }
  return total === 0 ? 0 : weighted / total;
}

function rangeFrequency(range: Float64Array): number {
  let sum = 0;
  for (let j = 0; j < N; j++) sum += range[j] * COMBOS[j];
  return sum / TOTAL_COMBOS;
}

// n인 테이블의 자리 이름 (액션 순서대로, 마지막 둘이 SB/BB)
function seatNames(n: number): string[] {
  if (n === 6) return ["UTG", "HJ", "CO", "BTN", "SB", "BB"];
  if (n === 9) return ["UTG", "UTG1", "UTG2", "LJ", "HJ", "CO", "BTN", "SB", "BB"];
  const fromBack = ["BB", "SB", "BTN", "CO", "HJ", "LJ", "UTG2", "UTG1", "UTG"];
  return fromBack.slice(0, n).reverse();
}

// 자리별 이미 낸 금액 (SB=0.5, BB=1+앤티, 나머지 0).
// BB 앤티는 BB가 내는 돈이므로 BB의 투자액에 포함된다. 별도 데드머니로 또 더하면
// BB가 콜할 때의 팟과 남은 스택이 둘 다 틀어진다.
function postedByseat(n: number, anteBb: number): number[] {
  const posted = new Array(n).fill(0);
  posted[n - 2] = 0.5;
  posted[n - 1] = 1 + anteBb;
  return posted;
}

type Spot = {
  stackBb: number;
  tableSize: number;
  heroSeat: number; // 0 = 첫 액션
  anteBb: number; // BB가 블라인드와 별도로 내는 앤티 (현대 토너먼트의 "BB 앤티")
};

type Solution = {
  shove: Float64Array;
  calls: Float64Array[]; // 히어로 뒤 자리들의 콜 레인지 (액션 순서)
};

// 올인이 콜됐을 때의 최종 팟.
// 두 사람의 블라인드는 각자 스택에 포함돼 있으므로 중복 계산하지 않는다.
// 폴드한 사람들이 남긴 블라인드와 앤티만 추가 데드머니다.
function potWhenCalled(spot: Spot, heroPosted: number, callerPosted: number, totalPosted: number) {
  const deadFromFolders = totalPosted - heroPosted - callerPosted;
  return 2 * spot.stackBb + Math.max(0, deadFromFolders);
}

// 반복수는 수렴 품질을 좌우한다. 400회는 최대 오차 0.065bb, 4000회는 0.009bb였다.
function solve(spot: Spot, iterations = Number(process.env.ITERS ?? 4000)): Solution {
  const posted = postedByseat(spot.tableSize, spot.anteBb);
  const totalPosted = posted.reduce((a, b) => a + b, 0);
  const heroPosted = posted[spot.heroSeat];
  const behind: number[] = [];
  for (let s = spot.heroSeat + 1; s < spot.tableSize; s++) behind.push(s);

  const shove = new Float64Array(N).fill(0.15);
  const calls = behind.map(() => new Float64Array(N).fill(0.15));
  const nextShove = new Float64Array(N);
  const nextCalls = behind.map(() => new Float64Array(N));

  const risked = spot.stackBb - heroPosted;
  const deadMoney = totalPosted - heroPosted;

  for (let iter = 0; iter < iterations; iter++) {
    const freqs = calls.map(rangeFrequency);

    // 각 자리가 "첫 콜러"가 될 확률 (앞사람들이 전부 폴드하고 자기가 콜)
    const firstCaller = new Array(behind.length).fill(0);
    let survive = 1;
    for (let k = 0; k < behind.length; k++) {
      firstCaller[k] = survive * freqs[k];
      survive *= 1 - freqs[k];
    }
    const allFold = survive;

    // 히어로의 최적 대응
    for (let i = 0; i < N; i++) {
      let ev = allFold * deadMoney;
      for (let k = 0; k < behind.length; k++) {
        if (firstCaller[k] === 0) continue;
        const pot = potWhenCalled(spot, heroPosted, posted[behind[k]], totalPosted);
        ev += firstCaller[k] * (equityVsRange(i, calls[k]) * pot - risked);
      }
      nextShove[i] = ev > 0 ? 1 : 0;
    }

    // 각 자리의 최적 대응
    for (let k = 0; k < behind.length; k++) {
      const callerPosted = posted[behind[k]];
      const pot = potWhenCalled(spot, heroPosted, callerPosted, totalPosted);
      const callerRisk = spot.stackBb - callerPosted;
      for (let j = 0; j < N; j++) {
        nextCalls[k][j] = equityVsRange(j, shove) * pot - callerRisk > 0 ? 1 : 0;
      }
    }

    // 평균화하며 이동 (fictitious play)
    const rate = 1 / (iter + 2);
    for (let i = 0; i < N; i++) {
      shove[i] += (nextShove[i] - shove[i]) * rate;
      for (let k = 0; k < behind.length; k++) {
        calls[k][i] += (nextCalls[k][i] - calls[k][i]) * rate;
      }
    }
  }

  return { shove, calls };
}

// 히어로가 올인했을 때의 EV(폴드 대비, bb). 폴드의 EV가 0이므로 이 값이 곧
// 두 액션의 EV 차이다. 양수면 올인이, 음수면 폴드가 낫고, 절댓값이 틀렸을 때
// 잃는 bb다. 앱의 채점과 ev_loss_bb 기록이 이 값을 쓴다.
function shoveEvByHand(spot: Spot, sol: Solution): Float64Array {
  const posted = postedByseat(spot.tableSize, spot.anteBb);
  const totalPosted = posted.reduce((a, b) => a + b, 0);
  const heroPosted = posted[spot.heroSeat];
  const behind: number[] = [];
  for (let s = spot.heroSeat + 1; s < spot.tableSize; s++) behind.push(s);

  const risked = spot.stackBb - heroPosted;
  const deadMoney = totalPosted - heroPosted;
  const freqs = sol.calls.map(rangeFrequency);

  const firstCaller = new Array(behind.length).fill(0);
  let survive = 1;
  for (let k = 0; k < behind.length; k++) {
    firstCaller[k] = survive * freqs[k];
    survive *= 1 - freqs[k];
  }

  const ev = new Float64Array(N);
  for (let i = 0; i < N; i++) {
    let e = survive * deadMoney;
    for (let k = 0; k < behind.length; k++) {
      if (firstCaller[k] === 0) continue;
      const pot = potWhenCalled(spot, heroPosted, posted[behind[k]], totalPosted);
      e += firstCaller[k] * (equityVsRange(i, sol.calls[k]) * pot - risked);
    }
    ev[i] = e;
  }
  return ev;
}

// 최적 대응 대비 손실(bb/핸드). 0에 가까울수록 균형에 가깝다.
function exploitability(spot: Spot, sol: Solution): number {
  const posted = postedByseat(spot.tableSize, spot.anteBb);
  const totalPosted = posted.reduce((a, b) => a + b, 0);
  const heroPosted = posted[spot.heroSeat];
  const behind: number[] = [];
  for (let s = spot.heroSeat + 1; s < spot.tableSize; s++) behind.push(s);

  const risked = spot.stackBb - heroPosted;
  const deadMoney = totalPosted - heroPosted;
  const freqs = sol.calls.map(rangeFrequency);

  const firstCaller = new Array(behind.length).fill(0);
  let survive = 1;
  for (let k = 0; k < behind.length; k++) {
    firstCaller[k] = survive * freqs[k];
    survive *= 1 - freqs[k];
  }

  let loss = 0;
  let weight = 0;

  for (let i = 0; i < N; i++) {
    let ev = survive * deadMoney;
    for (let k = 0; k < behind.length; k++) {
      if (firstCaller[k] === 0) continue;
      const pot = potWhenCalled(spot, heroPosted, posted[behind[k]], totalPosted);
      ev += firstCaller[k] * (equityVsRange(i, sol.calls[k]) * pot - risked);
    }
    loss += (Math.max(0, ev) - sol.shove[i] * ev) * COMBOS[i];
    weight += COMBOS[i];
  }

  for (let k = 0; k < behind.length; k++) {
    const callerPosted = posted[behind[k]];
    const pot = potWhenCalled(spot, heroPosted, callerPosted, totalPosted);
    const callerRisk = spot.stackBb - callerPosted;
    for (let j = 0; j < N; j++) {
      const ev = equityVsRange(j, sol.shove) * pot - callerRisk;
      loss += (Math.max(0, ev) - sol.calls[k][j] * ev) * COMBOS[j];
      weight += COMBOS[j];
    }
  }

  return loss / weight;
}

function main() {
  console.log(
    `승률표: ${raw.generatedAt} (매치업당 ${raw.targetSamplesPerMatchup.toLocaleString()} 샘플)\n`,
  );

  // BB 앤티. 앤티가 0이면 데드머니가 블라인드 1.5bb뿐이라, 16bb 이상에서 콜 손익분기
  // 승률이 48%까지 올라가고 균형이 "빅페어만 콜"로 무너진다. 그 레인지 상대로는
  // A5s가 88보다 승률이 높아져(88은 빅페어 전부에게 19%, A5s는 AA에게만 12%)
  // 중간 페어가 빠지고 약한 수티드 에이스가 들어가는 비정상 레인지가 나온다.
  const anteBb = Number(process.env.ANTE ?? 1);
  console.log(`BB 앤티: ${anteBb}bb
`);

  const tableSizes = [9, 6];
  const stacks = [8, 10, 12, 15, 20];
  const results: Record<string, unknown>[] = [];

  for (const tableSize of tableSizes) {
    const names = seatNames(tableSize);
    console.log(`=== ${tableSize}인 테이블 ===`);
    console.log("스택   " + names.slice(0, -1).map((s) => s.padStart(6)).join(""));

    for (const stackBb of stacks) {
      const row: string[] = [];
      let worstExploit = 0;

      // BB는 RFI 올인 주체가 아니므로 제외
      for (let heroSeat = 0; heroSeat < tableSize - 1; heroSeat++) {
        const spot: Spot = { stackBb, tableSize, heroSeat, anteBb };
        const sol = solve(spot);
        const expl = exploitability(spot, sol);
        const ev = shoveEvByHand(spot, sol);
        worstExploit = Math.max(worstExploit, expl);
        const freq = rangeFrequency(sol.shove) * 100;
        row.push(`${freq.toFixed(1)}%`.padStart(6));

        results.push({
          tableSize,
          stackBb,
          anteBb,
          position: names[heroSeat],
          shoveFrequencyPct: Number(freq.toFixed(2)),
          exploitabilityBb: Number(expl.toFixed(5)),
          shove: Object.fromEntries(
            HANDS.map((h, i) => [h, Number(sol.shove[i].toFixed(3))]).filter(
              ([, v]) => (v as number) >= 0.005,
            ),
          ),
          // 전 핸드를 담는다. 어떤 핸드가 나와도 채점해야 하므로 걸러낼 수 없다.
          shoveEvBb: Object.fromEntries(HANDS.map((h, i) => [h, Number(ev[i].toFixed(3))])),
        });
      }

      console.log(`${String(stackBb).padStart(3)}bb ` + row.join("") + `   (최대 오차 ${worstExploit.toFixed(4)}bb)`);
    }
    console.log("");
  }

  writeFileSync(
    "src/data/pushfold.json",
    JSON.stringify({
      generatedAt: new Date().toISOString(),
      model: "chipEV push/fold, RFI spot, at most one caller assumed",
      anteBb,
      equitySource: { generatedAt: raw.generatedAt, samples: raw.targetSamplesPerMatchup },
      spots: results,
    }),
  );
  console.log("저장: src/data/pushfold.json");
}

main();
