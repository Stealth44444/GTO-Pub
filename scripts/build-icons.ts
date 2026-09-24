// 홈 화면 아이콘을 만든다.
//
// 실행: npm run icons
//
// SVG 하나만 두면 안드로이드가 설치 아이콘을 제대로 못 그린다. 크롬은 PNG
// 192·512를 요구하고, iOS는 apple-touch-icon(180)을 따로 본다. QR을 찍고
// 홈 화면에 추가하는 것이 이 앱의 주 경로이므로 여기서 어긋나면 안 된다.
//
// 마스크형 아이콘은 안쪽 80%만 남는다. 여백을 넣은 판을 따로 뽑는다.

import { readFileSync, writeFileSync } from "node:fs";
import sharp from "sharp";

const SRC = "public/icon.svg";
/** 앱 배경과 같은 색. 투명하게 두면 안드로이드가 흰 판을 깐다. */
const BG = { r: 7, g: 9, b: 11, alpha: 1 };

type Job = { out: string; size: number; padPct: number };

const JOBS: Job[] = [
  { out: "public/icon-192.png", size: 192, padPct: 0 },
  { out: "public/icon-512.png", size: 512, padPct: 0 },
  // 마스크형: 잘려도 그림이 남도록 안쪽으로 밀어 넣는다.
  { out: "public/icon-maskable-512.png", size: 512, padPct: 0.14 },
  // iOS는 모서리를 스스로 깎는다. 여백 없이 꽉 채운다.
  { out: "public/apple-touch-icon.png", size: 180, padPct: 0 },
];

const svg = readFileSync(SRC);

for (const job of JOBS) {
  const inner = Math.round(job.size * (1 - job.padPct * 2));
  const pad = Math.round((job.size - inner) / 2);
  const png = await sharp(svg, { density: 384 })
    .resize(inner, inner)
    .extend({ top: pad, bottom: pad, left: pad, right: pad, background: BG })
    .flatten({ background: BG })
    .png({ compressionLevel: 9 })
    .toBuffer();
  writeFileSync(job.out, png);
  console.log(`${job.out} — ${job.size}px, ${Math.round(png.length / 1024)}KB`);
}
