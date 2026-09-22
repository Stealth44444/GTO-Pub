import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // C:\Users\Sony\package-lock.json 때문에 루트를 잘못 추론하는 걸 방지
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
