import { parsePlaylistFile } from "@/lib/music/import/parse";
import { NO_CAPABILITIES, type MusicProvider } from "./types";

export const fileProvider: MusicProvider = {
  id: "file", name: "歌单文件", official: false,
  isAvailable: async () => true,
  getAvailability: async () => ({ available: true }),
  getCapabilities: () => ({ ...NO_CAPABILITIES, fileImport: true }),
  parseFile: parsePlaylistFile,
};
