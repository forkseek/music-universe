import type { NormalizedTrack } from "@/types/music";
import { matchText } from "../normalize/text";

/** The fallback understands only these phrases and only matches imported genre labels. */
export function explicitGenreHints(intent: string): string[] {
  const normalized = matchText(intent);
  const hints: string[] = [];
  if (/梦幻|梦境|dreamy|dreamlike/u.test(normalized)) hints.push("dream pop", "shoegaze", "ambient");
  if (/摇滚|\brock\b/u.test(normalized)) hints.push("rock", "alternative rock", "indie rock");
  if (/电子|\belectronic\b/u.test(normalized)) hints.push("electronic", "synthpop", "ambient");
  return [...new Set(hints)];
}

export function matchedIntentGenre(track: NormalizedTrack, hints: string[]): string | undefined {
  return track.genre?.find((genre) => hints.some((hint) => matchText(genre).includes(hint)));
}
