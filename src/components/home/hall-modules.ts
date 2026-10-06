export const hallModules = [
  { id: "world", title: "音乐电台", symbol: "♫", icon: "音符", x: 42.9, y: 43.1, size: 14, label: "below", detail: "进入互动播放空间。搜索 QQ 音乐、聆听旋律，还能从这里继续探索音乐地图。" },
  { id: "library", title: "我的曲库", symbol: "◉", icon: "唱片", x: 31.2, y: 22, size: 10.5, label: "above", detail: "查看已经导入的收藏和保存的音乐世界。从喜欢的歌出发，继续上次的探索。" },
  { id: "import", title: "导入歌单", symbol: "↥", icon: "话筒", x: 24.7, y: 39.3, size: 8, label: "left", detail: "带来 CSV、JSON 或 TXT 歌单。先预览整理与合并结果，再把歌曲保存到你的曲库。" },
  { id: "demo", title: "Demo 漫游", symbol: "✧", icon: "吉他", x: 53.4, y: 18.7, size: 10, label: "above", detail: "不用准备歌单，也能先去看看。跟随向导探索 60 首歌组成的演示世界，开启五站旅程。" },
  { id: "journey", title: "我的旅程", symbol: "♡", icon: "爱心", x: 59.6, y: 35.8, size: 7.5, label: "right", detail: "打开保存的五站路线，定位每一首歌。也可以选择一个新的起点，再出发一次。" },
  { id: "guide", title: "音乐向导", symbol: "▥", icon: "钢琴", x: 57.9, y: 52.7, size: 8.5, label: "right", detail: "问问歌曲与节点的关系，查看已有依据。告诉向导你想探索的方向，寻找下一站。" },
  { id: "qq", title: "连接音乐", symbol: "♬", icon: "耳机", x: 29.7, y: 57.5, size: 8.5, label: "below", detail: "查看当前环境的官方音乐连接。连接可用时带来你的歌单，也可以选择文件导入。" },
] as const;

export type HallModule = (typeof hallModules)[number]["id"];
export type HallStage = "hall" | HallModule;

export function hallStageFromHash(): HallStage {
  const value = window.location.hash.slice(1);
  return hallModules.some((module) => module.id === value) ? value as HallModule : "hall";
}
