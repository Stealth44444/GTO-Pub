import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // C:\Users\Sony\package-lock.json 때문에 루트를 잘못 추론하는 걸 방지
    root: path.resolve(__dirname),
  },
  async headers() {
    return [
      {
        // 스팟 파일은 이름이 곧 내용이다(플랍+런아웃). 같은 이름으로 다른 내용이
        // 올라올 일이 없으므로 영구 캐시로 둔다. 기본값 max-age=0이면 한 판마다
        // 175KB를 재검증하게 된다.
        source: "/postflop/:file*.json.gz",
        headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }],
      },
      {
        // 목록은 보드를 추가하면 바뀐다. 짧게 잡아 새 보드가 곧 반영되게 한다.
        source: "/postflop/index.json",
        headers: [{ key: "Cache-Control", value: "public, max-age=300" }],
      },
    ];
  },
};

export default nextConfig;
