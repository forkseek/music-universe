import type { NormalizedTrack } from "@/types/music";
import type { MusicWorld } from "@/types/world";
import type { GraphPlaylist } from "../graph/buildGraph";
import { deriveTrackSignal } from "../signals";
import { matchText } from "../normalize/text";
import { explicitGenreHints, matchedIntentGenre } from "./intent";

export interface PlannedStop { trackId: string; reason: string }

function sharedFacts(a: NormalizedTrack, b: NormalizedTrack, playlists: GraphPlaylist[]) {
  const artists = a.artists.map((artist) => matchText(artist.name));
  const sharedArtist = b.artists.find((artist) => artists.includes(matchText(artist.name)));
  const sharedAlbum = a.album && b.album && matchText(a.album.name) === matchText(b.album.name) && !!sharedArtist;
  const genres = (a.genre ?? []).map(matchText);
  const sharedGenre = b.genre?.find((genre) => genres.includes(matchText(genre)));
  const sharedPlaylist = playlists.find((playlist) => playlist.trackIds.includes(a.id) && playlist.trackIds.includes(b.id));
  return { sharedArtist, sharedAlbum, sharedGenre, sharedPlaylist };
}

export function planJourney(world: MusicWorld, tracks: NormalizedTrack[], playlists: GraphPlaylist[], startNodeId: string, length = 5, intent = ""): PlannedStop[] {
  const node = world.nodes.find((item) => item.id === startNodeId);
  if (!node || !Number.isInteger(length) || length < 1 || length > 5) throw new Error("无效的世界节点或路线长度。");
  const byId = new Map(tracks.map((track) => [track.id, track]));
  const hints = explicitGenreHints(intent);
  const ranked = [...tracks].sort((a, b) => deriveTrackSignal(b).preferenceScore - deriveTrackSignal(a).preferenceScore
    || Number(Boolean(matchedIntentGenre(b, hints))) - Number(Boolean(matchedIntentGenre(a, hints)))
    || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
  const start = node.trackId ? byId.get(node.trackId) : ranked.find((track) => node.metadata.trackIds.includes(track.id));
  if (!start) throw new Error("这个节点没有可用的真实歌曲。");
  const chosen = new Set([start.id]);
  const result: PlannedStop[] = [{ trackId: start.id, reason: node.type === "track" ? "从当前歌曲出发。" : `从「${node.label}」关联的真实歌曲出发。` }];
  let current = start;
  while (result.length < Math.min(length, tracks.length)) {
    let best: NormalizedTrack | undefined;
    let bestScore = -Infinity;
    for (const candidate of ranked) {
      if (chosen.has(candidate.id)) continue;
      const facts = sharedFacts(current, candidate, playlists);
      const score = (facts.sharedArtist ? 5 : 0) + (facts.sharedAlbum ? 4 : 0) + (facts.sharedPlaylist ? 3 : 0)
        + (facts.sharedGenre ? 2 : 0) + deriveTrackSignal(candidate).preferenceScore * 0.2
        + (matchedIntentGenre(candidate, hints) ? 8 : 0);
      if (score > bestScore) { best = candidate; bestScore = score; }
    }
    if (!best) break;
    const facts = sharedFacts(current, best, playlists);
    const reasons = [facts.sharedArtist && `同艺术家 ${facts.sharedArtist.name}`, facts.sharedAlbum && `同专辑 ${best.album!.name}`,
      facts.sharedPlaylist && `同歌单 ${facts.sharedPlaylist.name}`, facts.sharedGenre && `同流派 ${facts.sharedGenre}`].filter(Boolean);
    const matchedGenre = matchedIntentGenre(best, hints);
    const direction = matchedGenre ? `命中方向相关的已导入流派标签 ${matchedGenre}` : "";
    result.push({ trackId: best.id, reason: reasons.length ? `接续上一站：${[...reasons, direction].filter(Boolean).join("、")}。`
      : direction ? `库中暂无线索证明与上一站直接相连；${direction}。` : "库中暂无线索证明与上一站直接相连；继续探索另一首已导入歌曲。" });
    chosen.add(best.id); current = best;
  }
  return result;
}
