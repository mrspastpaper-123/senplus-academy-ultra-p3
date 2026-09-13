import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SENPlus+ Academy Ultra P5",
  description: "香港小五個人化學習與練習平台",
  other: { "codex-preview": "development" },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="zh-Hant">
      <body className="antialiased">{children}</body>
    </html>
  );
}
