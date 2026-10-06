import type { Metadata } from "next";
import { connection } from "next/server";
import "@xyflow/react/dist/style.css";
import "./globals.css";
import "./stages.css";
import "./video-theme.css";
import "./interactive-hall.css";
import "./hall-living.css";
import "./music-player.css";
import "./scene-rooms.css";
import "./hall-background-music.css";
import { SceneTransitionProvider } from "@/components/home/SceneTransition";

export const metadata: Metadata = {
  title: "Music World · 从歌单开始",
  description: "导入歌单、生成音乐关系地图，并从真实歌曲连接出发保存五站 Journey。",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  // Render per request so every document receives a fresh CSP script nonce.
  await connection();
  return <html lang="zh-CN"><body><SceneTransitionProvider>{children}</SceneTransitionProvider></body></html>;
}
