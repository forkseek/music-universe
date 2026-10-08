import type { DatabaseContext } from "@/db/connection";
import "server-only";
import { and, asc, desc, eq } from "drizzle-orm";
import { userTransaction, getDatabase } from "@/db/connection";
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
export async function listJourneys(userId: string, worldId: string, context: DatabaseContext | Promise<DatabaseContext> = getDatabase()) {
    context = await context;
    return (await context.db.select({ id: journeys.id, title: journeys.title, createdAt: journeys.createdAt, mode: journeys.mode }).from(journeys)
        .where(and(eq(journeys.userId, userId), eq(journeys.worldId, worldId))).orderBy(desc(journeys.createdAt), desc(journeys.id)));
}
export async function readJourney(userId: string, journeyId: string, context: DatabaseContext | Promise<DatabaseContext> = getDatabase()): Promise<MusicJourney> {
    context = await context;
    const journey = (await context.db.select().from(journeys).where(and(eq(journeys.userId, userId), eq(journeys.id, journeyId))))[0];
    if (!journey)
        throw new RequestError(404, "未找到这条旅行路线。", "NOT_FOUND");
    const world = (await readWorld(userId, journey.worldId, context));
    const library = (await readLibrary(userId, world.scope, context));
    const byId = new Map(library.tracks.map((track) => [track.id, track]));
    const rows = (await context.db.select().from(journeyNodes).where(and(eq(journeyNodes.userId, userId), eq(journeyNodes.journeyId, journeyId))).orderBy(asc(journeyNodes.position)));
    return { id: journey.id, worldId: journey.worldId, title: journey.title, intent: journey.intent, mode: journey.mode,
        createdAt: journey.createdAt.toISOString(), requestedLength: 5,
        nodes: rows.map((row) => {
            const track = byId.get(row.trackId);
            if (!track)
                throw new RequestError(404, "路线歌曲已不存在。", "NOT_FOUND");
            return { position: row.position, trackId: track.id, track: toWorldTrack(track), reason: row.reason };
        }) };
}
async function prepareJourney(userId: string, worldId: string, startNodeId: string, intent: string, context: Awaited<ReturnType<typeof getDatabase>>, startTrackId?: string) {
    const world = (await readWorld(userId, worldId, context));
    const library = (await readLibrary(userId, world.scope, context));
    if ((await listJourneys(userId, worldId, context)).length >= 50)
        throw new RequestError(409, "这个世界已保存 50 条路线。", "JOURNEY_LIMIT");
    const startTrack = startTrackId ? library.tracks.find((track) => track.id === startTrackId) : undefined;
    if (startTrackId && !startTrack)
        throw new RequestError(400, "路线起点歌曲不属于这个音乐库。", "INVALID_START_TRACK");
    const syntheticNodeId = startTrack ? `route:${startTrack.id}` : startNodeId;
    const planningWorld = startTrack ? { ...world, nodes: [...world.nodes, { id: syntheticNodeId, type: "track" as const, label: startTrack.title,
                trackId: startTrack.id, weight: 1, metadata: { trackIds: [startTrack.id], basis: "已保存路线中的真实歌曲" } }] } : world;
    let stops;
    try {
        stops = planJourney(planningWorld, library.tracks, library.playlists, syntheticNodeId, 5, intent);
    }
    catch {
        throw new RequestError(400, "请选择此世界中有歌曲依据的节点。", "INVALID_START_NODE");
    }
    const startNode = planningWorld.nodes.find((node) => node.id === syntheticNodeId)!;
    return { world, library, startNode, stops };
}
async function saveJourney(userId: string, worldId: string, title: string, intent: string, mode: "deterministic" | "ai", stops: {
    trackId: string;
    reason: string;
}[], context: Awaited<ReturnType<typeof getDatabase>>): Promise<MusicJourney> {
    const id = crypto.randomUUID();
    (await context.db.insert(journeys).values({ id, userId, worldId, title, intent, mode }));
    for (const [position, stop] of stops.entries())
        (await context.db.insert(journeyNodes).values({ userId, journeyId: id, trackId: stop.trackId, position, reason: stop.reason }));
    return (await readJourney(userId, id, context));
}
export async function createJourney(userId: string, worldId: string, startNodeId: string, context: DatabaseContext | Promise<DatabaseContext> = getDatabase(), startTrackId?: string): Promise<MusicJourney> {
    context = await context;
    return userTransaction(await context, userId, async (context) => {
        const prepared = (await prepareJourney(userId, worldId, startNodeId, "", context, startTrackId));
        return (await saveJourney(userId, worldId, `从「${prepared.startNode.label}」出发`, "基础探索", "deterministic", prepared.stops, context));
    });
}
export async function createGuidedJourney(userId: string, worldId: string, startNodeId: string, intent: string, context: DatabaseContext | Promise<DatabaseContext> = getDatabase(), startTrackId?: string, options: {
    provider?: AIProvider | null;
    timeoutMs?: number;
} = {}): Promise<MusicJourney> {
    context = await context;
    const direction = intent.trim();
    if (!direction || direction.length > 120)
        throw new RequestError(400, "探索方向需填写 1–120 个字符。", "INVALID_INTENT");
    // Never hold a database transaction open across a model request.
    const initial = (await prepareJourney(userId, worldId, startNodeId, direction, context, startTrackId));
    const provider = options.provider === undefined ? getConfiguredAIProvider() : options.provider;
    let generated: AIJourneyOutput | undefined;
    if (provider) {
        try {
            const input = buildAIJourneyInput(initial.world, initial.library.tracks, initial.stops[0].trackId, direction);
            generated = await requestAIJourney(input, provider, options.timeoutMs);
        }
        catch {
            generated = undefined;
        }
    }
    return userTransaction(await context, userId, async (context) => {
        const current = (await prepareJourney(userId, worldId, startNodeId, direction, context, startTrackId));
        const available = new Set(current.library.tracks.map((track) => track.id));
        const proposed = generated?.stops;
        const validNow = proposed && proposed.length === current.stops.length && proposed[0].trackId === current.stops[0].trackId
            && proposed.every((stop) => available.has(stop.trackId));
        return (await saveJourney(userId, worldId, `从「${current.startNode.label}」出发`, direction, validNow ? "ai" : "deterministic", validNow ? proposed : current.stops, context));
    });
}
