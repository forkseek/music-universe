import { NO_CAPABILITIES, type MusicProvider } from "./types";

/** A user's own export can be imported, but these account APIs have no verified authorization in this Web app. */
export const kugouProvider: MusicProvider = {
  id: "kugou", name: "酷狗音乐", official: false,
  isAvailable: async () => false,
  getAvailability: async () => ({ available: false, reason: "OFFICIAL_INTEGRATION_PENDING",
    message: "账号接口需要酷狗开放平台授权；可导入自行提供的歌单文件。" }),
  getCapabilities: () => ({ ...NO_CAPABILITIES, fileImport: true }),
};

export const qishuiProvider: MusicProvider = {
  id: "qishui", name: "汽水音乐", official: false,
  isAvailable: async () => false,
  getAvailability: async () => ({ available: false, reason: "OFFICIAL_INTEGRATION_PENDING",
    message: "账号歌单接口尚无本项目可验证的官方权限；可导入自行提供的歌单文件。" }),
  getCapabilities: () => ({ ...NO_CAPABILITIES, fileImport: true }),
};

export const spotifyProvider: MusicProvider = {
  id: "spotify", name: "Spotify", official: false,
  isAvailable: async () => false,
  getAvailability: async () => ({ available: false, reason: "OFFICIAL_INTEGRATION_PENDING",
    message: "尚未配置获准用于本产品的 Spotify OAuth 应用；可导入自行提供的歌单文件。" }),
  getCapabilities: () => ({ ...NO_CAPABILITIES, fileImport: true }),
};
