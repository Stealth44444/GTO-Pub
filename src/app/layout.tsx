import type { Metadata, Viewport } from "next";
import { Spline_Sans_Mono } from "next/font/google";
import "./globals.css";

/**
 * 목소리를 둘로 나눈다.
 *
 * 산문(설명·라벨)은 Pretendard. 한글 UI에서 가장 정제된 활자이고, Noto Sans KR의
 * 밋밋한 기본값 인상을 벗는다. CDN에서 가변 폰트로 받는다.
 *
 * 계측값(bb, %, 포지션, 핸드 코드)은 Spline Sans Mono. 이 앱의 본질은 EV를 읽는
 * 도구라, 숫자가 산문과 같은 활자를 쓰면 읽어야 할 것이 묻힌다. 고정폭이라
 * 자릿수가 바뀌어도 표가 흔들리지 않는다.
 */
const mono = Spline_Sans_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "GTO 트레이너",
  description: "홀덤펍 20bb 게임을 프리플랍부터 리버까지 한 판씩 쳐보며 배우는 트레이너",
  manifest: "/manifest.json",
  // iOS는 매니페스트의 아이콘을 보지 않는다. 이걸 빼면 홈 화면에 화면을
  // 축소한 스크린샷이 올라간다.
  icons: {
    icon: [
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "GTO 트레이너",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: "#07090B",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className={`${mono.variable} h-full antialiased`}>
      <head>
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="min-h-full flex flex-col bg-[var(--gw-bg)] text-[var(--gw-text-primary)] overscroll-none">
        {children}
      </body>
    </html>
  );
}
