// EV 파이프라인이 끝나기를 기다렸다가 구간별 보드 생성을 이어 돌린다.
//
// 실행: node --experimental-strip-types scripts/chain-boards.ts
//
// 두 단계를 한 프로세스로 묶지 않는 이유는, 앞 단계가 이미 돌고 있는 중에도
// 뒤를 예약해 둘 수 있어야 해서다. 앞 단계가 끝난 걸 확인하는 방법은 상태
// 파일 하나뿐이다 — 프로세스를 붙잡고 있으면 이 감시자가 죽을 때 같이 죽는다.

import { spawn } from "node:child_process";
import { existsSync, readFileSync, appendFileSync } from "node:fs";

const STATUS = "scripts/data/pipeline-status.json";
const LOG = "scripts/data/pipeline.log";
const POLL_MS = 30_000;
/** 열두 시간. 이보다 오래 걸리면 뭔가 잘못된 것이고, 기다려봐야 소용없다. */
const GIVE_UP_AT = Date.now() + 12 * 60 * 60 * 1000;

function log(line: string) {
  const text = `[${new Date().toISOString().slice(11, 19)}] ${line}\n`;
  appendFileSync(LOG, text);
  console.log(text.trimEnd());
}

function evDone(): boolean {
  if (!existsSync(STATUS)) return false;
  try {
    const raw = JSON.parse(readFileSync(STATUS, "utf8")) as { step?: string };
    return raw.step === "완료";
  } catch {
    // 쓰는 도중에 읽었다. 다음 차례에 다시 본다.
    return false;
  }
}

function startBoards() {
  log("EV 단계 완료 확인, 보드 생성 시작");
  const child = spawn("node", ["--experimental-strip-types", "scripts/pipeline-boards.ts"], {
    stdio: ["ignore", "inherit", "inherit"],
  });
  child.on("exit", (code) => log(`보드 생성 종료 (코드 ${code})`));
}

function tick() {
  if (evDone()) {
    startBoards();
    return;
  }
  if (Date.now() > GIVE_UP_AT) {
    log("EV 단계가 열두 시간 안에 끝나지 않아 감시를 멈춥니다");
    return;
  }
  setTimeout(tick, POLL_MS);
}

log("EV 단계 완료를 기다립니다");
tick();
