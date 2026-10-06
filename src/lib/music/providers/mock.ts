import { NO_CAPABILITIES, type MusicProvider } from "./types";
import catalog from "../demo/catalog.json";
import { validateRow } from "../import/validate";

export const demoProvider: MusicProvider = {
  id: "demo", name: "Demo Music Library", official: false,
  isAvailable: async () => true,
  getAvailability: async () => ({ available: true }),
  getCapabilities: () => ({ ...NO_CAPABILITIES, playlists: true }),
  listPlaylists: async () => catalog.albums.map((album, index) => ({ externalId: `demo-album-${index}`, provider: "demo", name: `Demo 编辑歌单 · ${album.artist} / ${album.album}`, trackCount: album.tracks.length })),
  getPlaylistTracks: async (playlistId) => {
    const index = Number(playlistId.replace(/^demo-album-/u, ""));
    const album = catalog.albums[index];
    if (!album || playlistId !== `demo-album-${index}`) throw new Error("未知 Demo 歌单。");
    return album.tracks.map((title, trackIndex) => {
      const checked = validateRow({ title, artist: album.artist, album: album.album, genre: album.genre,
        provider: "demo", externalId: `demo-${index}-${trackIndex}`, playlistExternalId: playlistId,
        playlistName: `Demo 编辑歌单 · ${album.artist} / ${album.album}` }, "demo-library.json", index * 3 + trackIndex + 1);
      if (!checked.track) throw new Error("Demo 数据校验失败。");
      return { ...checked.track, source: { ...checked.track.source, importedVia: "demo" as const } };
    });
  },
};
