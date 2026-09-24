// 풀어 둔 보드를 Supabase Storage에 올린다.
//
// 실행: NEXT_PUBLIC_SUPABASE_URL=… SUPABASE_UPLOAD_KEY=… \
//       node --experimental-strip-types scripts/upload-boards.ts
//
// 보드는 런아웃 하나가 약 210KB라, 조합과 런아웃을 늘리면 금방 수백 MB가 된다.
// 저장소에 두면 clone과 배포가 그만큼 무거워지므로 public/postflop은 로컬
// 작업 폴더로만 쓰고, 앱은 버킷의 공개 주소에서 받는다.
//
// 보드 파일은 한 번 올리면 바뀌지 않으므로(이름에 플랍·런아웃이 들어 있다)
// 이미 있으면 건너뛰고 오래 캐시한다. 목록(index*.json)은 보드가 늘 때마다
// 바뀌므로 늘 덮어쓰고 캐시를 짧게 둔다.
//
// 버킷 쓰기는 기본으로 막혀 있다. 올릴 때만 만료 시각이 박힌 임시 정책을 연다.

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = "public/postflop";
const BUCKET = "postflop";
/** 버킷 안의 경로 접두사. 형식이 바뀌면 올려서 옛 앱이 새 파일을 받지 않게 한다. */
const PREFIX = "v1";
const PARALLEL = 6;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_UPLOAD_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) {
  console.error("NEXT_PUBLIC_SUPABASE_URL과 SUPABASE_UPLOAD_KEY가 필요합니다");
  process.exit(1);
}

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name.startsWith(".")) continue; // .done 곁기록은 올리지 않는다
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...walk(path));
    else if (name.endsWith(".json.gz") || name.endsWith(".json")) out.push(path);
  }
  return out;
}

const files = walk(ROOT).map((p) => relative(ROOT, p).split("\\").join("/"));
const isIndex = (f: string) => !f.endsWith(".gz");

async function exists(file: string): Promise<boolean> {
  const res = await fetch(`${url}/storage/v1/object/public/${BUCKET}/${PREFIX}/${file}`, {
    method: "HEAD",
  });
  return res.ok;
}

async function upload(file: string): Promise<void> {
  const res = await fetch(`${url}/storage/v1/object/${BUCKET}/${PREFIX}/${file}`, {
    method: "POST",
    headers: {
      apikey: key!,
      Authorization: `Bearer ${key}`,
      "Content-Type": isIndex(file) ? "application/json" : "application/gzip",
      "x-upsert": "true",
      // Storage는 이 값을 공개 주소의 Cache-Control max-age로 쓴다.
      "cache-control": isIndex(file) ? "60" : "31536000",
    },
    body: readFileSync(join(ROOT, file)),
  });
  if (!res.ok) throw new Error(`${file}: ${res.status} ${await res.text()}`);
}

let uploaded = 0;
let skipped = 0;
const queue = [...files.filter((f) => !isIndex(f)), ...files.filter(isIndex)];
// 목록은 보드를 다 올린 뒤에 올린다. 먼저 올리면 앱이 아직 없는 보드를 고를 수 있다.
const boards = queue.filter((f) => !isIndex(f));
const indexes = queue.filter(isIndex);

async function run(list: string[], force: boolean) {
  let next = 0;
  await Promise.all(
    Array.from({ length: PARALLEL }, async () => {
      while (next < list.length) {
        const file = list[next++];
        if (!force && (await exists(file))) {
          skipped += 1;
          continue;
        }
        await upload(file);
        uploaded += 1;
        if (uploaded % 50 === 0) console.log(`  ${uploaded}개 올림`);
      }
    }),
  );
}

await run(boards, false);
await run(indexes, true);
console.log(`올림 ${uploaded} · 이미 있음 ${skipped} · 전체 ${files.length}`);
