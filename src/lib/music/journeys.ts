import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { getDatabase } from "@/db/connection";
import { journeys, journeyNodes } from "@/db/schema";
import type { MusicJourney } from "@/types/world";
import { readLibrary } from "./library";
import { readWorld } from "./worlds";
import { toWorldTrack } from "./present";
import { planJourney } from "./journey/planner";
import { RequestError } from "@/lib/server/errors";
import { buildAIJourneyInput, requestAIJourney } from "@/lib/ai/journey";
import { getConfiguredAIProvider } from "@/lib/ai/client";
import type { AIJourneyOutput, AIProvider } from "@/lib/ai/contract";

export function listJourneys(userId: string, worldId: string, context = getDatabase()) {
  return context.db.select({ id: journeys.id, title: journeys.title, createdAt: journeys.createdAt, mode: journeys.mode }).from(journeys)
    .where(and(eq(journeys.userId, userId), eq(journeys.worldId, worldId))).orderBy(desc(journeys.createdAt), desc(journeys.id)).all();
}

export function readJourney(userId: string, journeyId: string, context = getDatabase()): MusicJourney {
  const journey = context.db.select().from(journeys).where(and(eq(journeys.userId, userId), eq(journeys.id, journeyId))).get();
  if (!journey) throw new RequestError(404, "未找到这条旅行路线。", "NOT_FOUND");
  const world = readWorld(userId, journey.worldId, context);
  const library = readLibrary(userId, world.scope, context);
  const byId = new Map(library.tracks.map((track) => [track.id, track]));
  const rows = context.db.select().from(journeyNodes).where(and(eq(journeyNodes.userId, userId), eq(journeyNodes.journeyId, journeyId))).orderBy(asc(journeyNodes.position)).all();
  return { id: journey.id, worldId: journey.worldId, title: journey.title, intent: journey.intent, mode: journey.mode,
    createdAt: journey.createdAt.toISOString(), requestedLength: 5,
    nodes: rows.map((row) => {
      const track = byId.get(row.trackId);
      if (!track) throw new RequestError(404, "路线歌曲已不存在。", "NOT_FOUND");
      return { position: row.position, trackId: track.id, track: toWorldTrack(track), reason: row.reason };
    }) };
}

function prepareJourney(userId: string, worldId: string, startNodeId: string, intent: string, context: ReturnType<typeof getDatabase>, startTrackId?: string) {
  const world = readWorld(userId, worldId, context);
  const library = readLibrary(userId, world.scope, context);
  if (listJourneys(userId, worldId, context).length >= 50) throw new RequestError(409, "这个世界已保存 50 条路线。", "JOURNEY_LIMIT");
  const startTrack = startTrackId ? library.tracks.find((track) => track.id === startTrackId) : undefined;
  if (startTrackId && !startTrack) throw new RequestError(400, "路线起点歌曲不属于这个音乐库。", "INVALID_START_TRACK");
  const syntheticNodeId = startTrack ? `route:${startTrack.id}` : startNodeId;
  const planningWorld = startTrack ? { ...world, nodes: [...world.nodes, { id: syntheticNodeId, type: "track" as const, label: startTrack.title,
    trackId: startTrack.id, weight: 1, metadata: { trackIds: [startTrack.id], basis: "已保存路线中的真实歌曲" } }] } : world;
  let stops;
  try { stops = planJourney(planningWorld, library.tracks, library.playlists, syntheticNodeId, 5, intent); }
  catch { throw new RequestError(400, "请选择此世界中有歌曲依据的节点。", "INVALID_START_NODE"); }
  const startNode = planningWorld.nodes.find((node) => node.id === syntheticNodeId)!;
  return { world, library, startNode, stops };
}

function saveJourney(userId: string, worldId: string, title: string, intent: string, mode: "deterministic" | "ai",
  stops: { trackId: string; reason: string }[], context: ReturnType<typeof getDatabase>): MusicJourney {
  const id = crypto.randomUUID();
  context.db.insert(journeys).values({ id, userId, worldId, title, intent, mode }).run();
  for (const [position, stop] of stops.entries()) context.db.insert(journeyNodes).values({ userId, journeyId: id, trackId: stop.trackId, position, reason: stop.reason }).run();
  return readJourney(userId, id, context);
}

export function createJourney(userId: string, worldId: string, startNodeId: string, context = getDatabase(), startTrackId?: string): MusicJourney {
  return context.sqlite.transaction(() => {
    const prepared = prepareJourney(userId, worldId, startNodeId, "", context, startTrackId);
    return saveJourney(userId, worldId, `从「${prepared.startNode.label}」出发`, "基础探索", "deterministic", prepared.stops, context);
  }).immediate();
}

export async function createGuidedJourney(userId: string, worldId: string, startNodeId: string, intent: string,
  context = getDatabase(), startTrackId?: string, options: { provider?: AIProvider | null; timeoutMs?: number } = {}): Promise<MusicJourney> {
  const direction = intent.trim();
  if (!direction || direction.length > 120) throw new RequestError(400, "探索方向需填写 1–120 个字符。", "INVALID_INTENT");
  // Never hold a SQLite transaction open across a model request.
  const initial = prepareJourney(userId, worldId, startNodeId, direction, context, startTrackId);
  const provider = options.provider === undefined ? getConfiguredAIProvider() : options.provider;
  let generated: AIJourneyOutput | undefined;
  if (provider) {
    try {
      const input = buildAIJourneyInput(initial.world, initial.library.tracks, initial.stops[0].trackId, direction);
      generated = await requestAIJourney(input, provider, options.timeoutMs);
    } catch { generated = undefined; }
  }
  return context.sqlite.transaction(() => {
    const current = prepareJourney(userId, worldId, startNodeId, direction, context, startTrackId);
    const available = new Set(current.library.tracks.map((track) => track.id));
    const proposed = generated?.stops;
    const validNow = proposed && proposed.length === current.stops.length && proposed[0].trackId === current.stops[0].trackId
      && proposed.every((stop) => available.has(stop.trackId));
    return saveJourney(userId, worldId, `从「${current.startNode.label}」出发`, direction, validNow ? "ai" : "deterministic",
      validNow ? proposed : current.stops, context);
  }).immediate();
}
