import { z } from "@/lib/validation";

const candidateSchema = z.object({
  id: z.uuid(), title: z.string().min(1).max(200), artists: z.array(z.string().min(1).max(120)).min(1).max(10),
  album: z.string().max(200).optional(), genres: z.array(z.string().max(80)).max(10), preferenceScore: z.number().finite().min(0),
}).strict();

export const aiJourneyInputSchema = z.object({
  schemaVersion: z.literal(1), worldId: z.uuid(), worldName: z.string().max(120), startTrackId: z.uuid(),
  intent: z.string().trim().min(1).max(120), length: z.number().int().min(1).max(5),
  candidates: z.array(candidateSchema).min(1).max(40),
  relations: z.array(z.object({
    relation: z.enum(["same_artist", "same_album", "same_genre", "user_cooccurrence"]),
    sourceLabel: z.string().max(200), targetLabel: z.string().max(200), reason: z.string().max(300),
    trackIds: z.array(z.uuid()).min(1).max(40),
  }).strict()).max(80),
}).strict();

export const aiJourneyOutputSchema = z.object({
  summary: z.string().trim().min(1).max(240),
  stops: z.array(z.object({ trackId: z.uuid(), reason: z.string().trim().min(4).max(240) }).strict()).min(1).max(5),
}).strict();

export const aiJourneyOutputJsonSchema = z.toJSONSchema(aiJourneyOutputSchema);
export type AIJourneyInput = z.infer<typeof aiJourneyInputSchema>;
export type AIJourneyOutput = z.infer<typeof aiJourneyOutputSchema>;

/** Adapters return the model's raw text; the application validates it before saving. */
export interface AIProvider {
  generateJourney(input: AIJourneyInput, signal: AbortSignal): Promise<string>;
}

export class InvalidAIOutput extends Error {
  constructor(public readonly code: "invalid_json" | "invalid_schema" | "wrong_length" | "wrong_start" | "duplicate_track" | "unknown_track") {
    super(code);
  }
}

export function parseAIJourneyOutput(raw: string, input: AIJourneyInput): AIJourneyOutput {
  let data: unknown;
  try { data = JSON.parse(raw); } catch { throw new InvalidAIOutput("invalid_json"); }
  const parsed = aiJourneyOutputSchema.safeParse(data);
  if (!parsed.success) throw new InvalidAIOutput("invalid_schema");
  const output = parsed.data;
  if (output.stops.length !== input.length) throw new InvalidAIOutput("wrong_length");
  if (output.stops[0].trackId !== input.startTrackId) throw new InvalidAIOutput("wrong_start");
  const chosen = output.stops.map((stop) => stop.trackId);
  if (new Set(chosen).size !== chosen.length) throw new InvalidAIOutput("duplicate_track");
  const allowed = new Set(input.candidates.map((track) => track.id));
  if (chosen.some((id) => !allowed.has(id))) throw new InvalidAIOutput("unknown_track");
  return output;
}
