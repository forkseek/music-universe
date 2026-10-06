import type { NormalizedTrack } from "@/types/music";
import type { MusicWorld } from "@/types/world";
import { deriveTrackSignal } from "@/lib/music/signals";
import { explicitGenreHints, matchedIntentGenre } from "@/lib/music/journey/intent";
import { aiJourneyInputSchema, InvalidAIOutput, parseAIJourneyOutput, type AIJourneyInput, type AIJourneyOutput, type AIProvider } from "./contract";

export function buildAIJourneyInput(world: MusicWorld, tracks: NormalizedTrack[], startTrackId: string, intent: string): AIJourneyInput {
  const start = tracks.find((track) => track.id === startTrackId);
  if (!start) throw new Error("起点歌曲不存在。");
  const hints = explicitGenreHints(intent);
  const ranked = [...tracks].filter((track) => track.id !== startTrackId).sort((a, b) =>
    Number(Boolean(matchedIntentGenre(b, hints))) - Number(Boolean(matchedIntentGenre(a, hints)))
    || deriveTrackSignal(b).preferenceScore - deriveTrackSignal(a).preferenceScore
    || a.title.localeCompare(b.title) || a.id.localeCompare(b.id));
  const chosen = [start, ...ranked].slice(0, 40);
  const allowed = new Set(chosen.map((track) => track.id));
  const nodes = new Map(world.nodes.map((node) => [node.id, node]));
  return aiJourneyInputSchema.parse({ schemaVersion: 1, worldId: world.id, worldName: world.name.slice(0, 120), startTrackId,
    intent, length: Math.min(5, chosen.length), candidates: chosen.map((track) => ({ id: track.id, title: track.title.slice(0, 200),
      artists: track.artists.slice(0, 10).map((artist) => artist.name.slice(0, 120)), album: track.album?.name.slice(0, 200),
      genres: (track.genre ?? []).slice(0, 10).map((genre) => genre.slice(0, 80)),
      preferenceScore: deriveTrackSignal(track).preferenceScore })),
    relations: world.edges.flatMap((edge) => {
      const trackIds = edge.evidence.trackIds.filter((id) => allowed.has(id));
      if (!trackIds.length) return [];
      return [{ relation: edge.relation, sourceLabel: (nodes.get(edge.source)?.label ?? "").slice(0, 200),
        targetLabel: (nodes.get(edge.target)?.label ?? "").slice(0, 200), reason: edge.reason.slice(0, 300), trackIds: trackIds.slice(0, 40) }];
    }).slice(0, 80),
  });
}

/** Retry malformed or invalid model output once. Transport failures fall back immediately. */
export async function requestAIJourney(input: AIJourneyInput, provider: AIProvider, timeoutMs = 8_000): Promise<AIJourneyOutput | undefined> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const raw = await Promise.race([
        provider.generateJourney(input, controller.signal),
        new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("AI_TIMEOUT")); }, timeoutMs); }),
      ]);
      return parseAIJourneyOutput(raw, input);
    } catch (error) {
      if (!(error instanceof InvalidAIOutput) || attempt === 1) return undefined;
    } finally { if (timer) clearTimeout(timer); }
  }
  return undefined;
}
