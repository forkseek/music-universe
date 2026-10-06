import type { NormalizedTrack, TrackSource } from "@/types/music";
import { matchText } from "./text";

function sourceKey(source: TrackSource): string {
  // File+row retains each genuine occurrence, and makes re-import idempotent.
  return JSON.stringify([source.provider, source.importedVia, source.externalId ?? null,
    source.playlistExternalId ?? null, source.fileName ?? null, source.row ?? null,
    source.rawMetadata]);
}

type DurationRange = { min: number; max: number } | undefined;

function durationRange(track: NormalizedTrack): DurationRange {
  const durations = [track.durationMs, ...track.sources.map((s) => s.rawMetadata.durationMs)].filter((v): v is number => v !== undefined);
  return durations.length ? { min: Math.min(...durations), max: Math.max(...durations) } : undefined;
}

function combineRanges(a: DurationRange, b: DurationRange): DurationRange {
  if (!a) return b;
  if (!b) return a;
  return { min: Math.min(a.min, b.min), max: Math.max(a.max, b.max) };
}

function artistKey(track: NormalizedTrack): string {
  return JSON.stringify([matchText(track.artists[0].name), track.artists.slice(1).map((artist) => matchText(artist.name)).sort()]);
}

function compatible(a: NormalizedTrack, b: NormalizedTrack, rangeA: DurationRange, rangeB: DurationRange, artistsA: string, artistsB: string): boolean {
  const combined = combineRanges(rangeA, rangeB);
  if (a.versionKey !== b.versionKey || (combined && combined.max - combined.min > Math.max(2_000, combined.min * 0.01))) return false;
  if (a.isrc && b.isrc && a.isrc !== b.isrc) return false;
  if (a.isrc && a.isrc === b.isrc) {
    // Even an ISRC may be mistyped; conflicting artist evidence is not ignored.
    return artistsA === artistsB;
  }
  return a.canonicalKey === b.canonicalKey;
}

function mergeInto(target: NormalizedTrack, incoming: NormalizedTrack, known: Set<string>, incomingKeys: string[]) {
  for (const [index, source] of incoming.sources.entries()) {
    const key = incomingKeys[index];
    if (!known.has(key)) {
      target.sources.push(structuredClone(source));
      known.add(key);
    }
  }
  target.isrc ??= incoming.isrc;
  target.album ??= incoming.album ? { ...incoming.album } : undefined;
  target.durationMs ??= incoming.durationMs;
  target.releaseDate ??= incoming.releaseDate;
  if (incoming.genre) target.genre = [...new Set([...(target.genre ?? []), ...incoming.genre])];
}

export interface DeduplicationResult {
  tracks: NormalizedTrack[];
  mergedRecords: number;
}

export function deduplicateTracks(input: readonly NormalizedTrack[], preserveIds: ReadonlySet<string> = new Set()): DeduplicationResult {
  const tracks: NormalizedTrack[] = [];
  const byIsrc = new Map<string, Set<number>>();
  const byKey = new Map<string, Set<number>>();
  // Cache accumulated evidence; never rescan all prior sources for each row.
  const sourceKeys: Set<string>[] = [];
  const durations: DurationRange[] = [];
  const artistKeys: string[] = [];
  const index = (map: Map<string, Set<number>>, key: string, id: number) => {
    const bucket = map.get(key) ?? new Set<number>();
    bucket.add(id);
    map.set(key, bucket);
  };
  // Index stronger evidence first so an ISRC-less row cannot bridge two ISRCs.
  const ordered = input.map((track, order) => ({ track, order })).sort((a, b) =>
    Number(!!b.track.isrc) - Number(!!a.track.isrc) || Number(b.track.durationMs !== undefined) - Number(a.track.durationMs !== undefined) || a.order - b.order);
  const firstSeen: number[] = [];
  for (const { track, order } of ordered) {
    const range = durationRange(track);
    const artists = artistKey(track);
    const incomingKeys = track.sources.map(sourceKey);
    const possible = new Set([...(byKey.get(track.canonicalKey) ?? []), ...(track.isrc ? byIsrc.get(track.isrc) ?? [] : [])]);
    const matches = [...possible].filter((id) => !(preserveIds.has(tracks[id].id) && preserveIds.has(track.id) && tracks[id].id !== track.id)
      && compatible(tracks[id], track, durations[id], range, artistKeys[id], artists));
    let selected: number | undefined;
    const repeated = matches.filter((id) => incomingKeys.some((key) => sourceKeys[id].has(key)));
    if (repeated.length === 1) selected = repeated[0];
    else if (matches.length === 1) selected = matches[0];
    else if (matches.length > 1) {
      // Album is supporting evidence only when identity otherwise has ambiguity.
      const sameAlbum = track.album ? matches.filter((id) => tracks[id].album && matchText(tracks[id].album!.name) === matchText(track.album!.name)) : [];
      if (sameAlbum.length === 1) selected = sameAlbum[0];
    }
    if (selected === undefined) {
      selected = tracks.length;
      tracks.push(structuredClone(track));
      firstSeen.push(order);
      sourceKeys.push(new Set(incomingKeys));
      durations.push(range);
      artistKeys.push(artists);
    } else {
      mergeInto(tracks[selected], track, sourceKeys[selected], incomingKeys);
      durations[selected] = combineRanges(durations[selected], range);
      // Strong-evidence sorting must not replace an earlier library UUID/display.
      if (order < firstSeen[selected]) {
        tracks[selected].id = track.id;
        tracks[selected].title = track.title;
        tracks[selected].artists = structuredClone(track.artists);
        tracks[selected].canonicalKey = track.canonicalKey;
      }
      firstSeen[selected] = Math.min(firstSeen[selected], order);
    }
    index(byKey, track.canonicalKey, selected);
    if (track.isrc) index(byIsrc, track.isrc, selected);
  }
  return {
    tracks: tracks.map((track, index) => ({ track, order: firstSeen[index] })).sort((a, b) => a.order - b.order).map((item) => item.track),
    mergedRecords: input.length - tracks.length,
  };
}
