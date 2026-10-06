import { NO_CAPABILITIES, type MusicProvider } from "./types";

export const neteaseProvider: MusicProvider = {
  id: "netease", name: "网易云音乐", official: false,
  isAvailable: async () => false,
  getAvailability: async () => ({ available: false, reason: "OFFICIAL_INTEGRATION_PENDING", message: "账号连接待官方接入；可通过文件 Provider 导入导出的歌单。" }),
  getCapabilities: () => ({ ...NO_CAPABILITIES, fileImport: true }),
};
