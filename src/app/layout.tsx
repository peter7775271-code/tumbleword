import type { Metadata, Viewport } from "next";
import { GAME_NAME } from "@/lib/game/constants";
import "./globals.css";

export const metadata: Metadata = {
  title: GAME_NAME,
  description: "A party word game: one shared screen, everyone plays on their phone.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0b1027",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
