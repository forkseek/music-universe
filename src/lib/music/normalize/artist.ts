import { displayText, matchText } from "./text";

export function splitFeaturing(value: string): { base: string; guests: string[] } {
  const clean = displayText(value);
  const match = /(?:\s*[([]\s*|\s+)(?:feat(?:uring)?|ft)\.?\s+([^()[\]]+)[)\]]?$/iu.exec(clean);
  if (!match) return { base: clean, guests: [] };
  const base = clean.slice(0, match.index).trim();
  if (!base) return { base: clean, guests: [] };
  // Do not split '&', ',', or '/' inside artist names (e.g. AC/DC).
  return { base, guests: [displayText(match[1])] };
}

export function normalizeArtists(names: string[], extraGuests: string[] = []) {
  const split = names.map(splitFeaturing);
  const all = [...split.map((item) => item.base), ...split.flatMap((item) => item.guests), ...extraGuests];
  const seen = new Set<string>();
  return all.filter((name) => {
    const key = matchText(name);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).map((name) => ({ name }));
}
