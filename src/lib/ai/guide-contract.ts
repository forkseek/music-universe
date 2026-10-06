import { z } from "@/lib/validation";

export const guideInputSchema = z.object({
  worldId: z.uuid(), nodeId: z.string().min(1).max(80), targetNodeId: z.uuid().optional(), journeyId: z.uuid().optional(),
  question: z.string().trim().min(1).max(240),
}).strict();

/** Context prepared on the server for a future Guide model call. */
export const guideModelInputSchema = z.object({
  schemaVersion: z.literal(1), worldId: z.uuid(), question: z.string().min(1).max(240),
  currentNode: z.object({ id: z.string().max(80), label: z.string().max(200), basis: z.string().max(300),
    relatedTracks: z.array(z.object({ id: z.uuid(), title: z.string().max(200), artists: z.array(z.string().max(120)) }).strict()).max(20) }).strict(),
  userProfile: z.object({ likedTrackIds: z.array(z.uuid()).max(40), recentlyPlayedTrackIds: z.array(z.uuid()).max(40),
    importedGenres: z.array(z.object({ name: z.string().max(80), trackCount: z.number().int().min(1) }).strict()).max(20) }).strict(),
  nearbyNodes: z.array(z.object({ id: z.uuid(), label: z.string().max(200), relation: z.string().max(80),
    reason: z.string().max(300), trackIds: z.array(z.uuid()).max(40) }).strict()).max(12),
  comparisonNode: z.object({ id: z.uuid(), label: z.string().max(200), basis: z.string().max(300),
    connections: z.array(z.object({ relation: z.string().max(80), reason: z.string().max(300),
      trackIds: z.array(z.uuid()).max(40) }).strict()).max(4) }).strict().optional(),
  currentJourney: z.object({ id: z.uuid(), trackIds: z.array(z.uuid()).max(5) }).strict().optional(),
}).strict();

/** Future AI Guide adapters must return only these three fields. */
export const aiGuideOutputSchema = z.object({
  intent: z.enum(["dreamier", "rockier", "electronic"]).nullable(), recommendedNodeIds: z.array(z.uuid()).max(5),
  explanation: z.string().min(1).max(1200),
}).strict();

export const guideOutputSchema = aiGuideOutputSchema.extend({
  mode: z.literal("facts"), directionSupported: z.boolean(),
  evidence: z.array(z.object({ reason: z.string(), trackIds: z.array(z.uuid()) }).strict()).max(4),
}).strict();

export type GuideInput = z.infer<typeof guideInputSchema>;
export type GuideModelInput = z.infer<typeof guideModelInputSchema>;
export type GuideOutput = z.infer<typeof guideOutputSchema>;

/** A future model recommendation is advisory until every node is verified against the saved world. */
export function validateGuideRecommendations(raw: unknown, allowedNodeIds: Iterable<string>) {
  const output = aiGuideOutputSchema.parse(raw);
  const allowed = new Set(allowedNodeIds);
  if (new Set(output.recommendedNodeIds).size !== output.recommendedNodeIds.length
    || output.recommendedNodeIds.some((id) => !allowed.has(id))) throw new Error("Guide 推荐包含重复或不存在的节点。");
  return output;
}
