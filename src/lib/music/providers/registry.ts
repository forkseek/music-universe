import type { MusicProvider, MusicProviderId } from "./types";
import { fileProvider } from "./file";
import { qqMusicProvider } from "./qqmusic";
import { neteaseProvider } from "./netease";
import { kugouProvider, qishuiProvider, spotifyProvider } from "./file-only";
import { demoProvider } from "./mock";

const providers: ReadonlyMap<MusicProviderId, MusicProvider> = new Map([
  ["file", fileProvider], ["qqmusic", qqMusicProvider],
  ["netease", neteaseProvider], ["kugou", kugouProvider],
  ["qishui", qishuiProvider], ["spotify", spotifyProvider], ["demo", demoProvider],
]);

export function getProvider(id: MusicProviderId): MusicProvider {
  const provider = providers.get(id);
  if (!provider) throw new Error(`未注册的 Music Provider：${id}`);
  return provider;
}

export async function listProviderStatuses() {
  return Promise.all([...providers.values()].map(async (provider) => ({
    id: provider.id, name: provider.name, official: provider.official,
    ...await provider.getAvailability(), capabilities: provider.getCapabilities(),
  })));
}
