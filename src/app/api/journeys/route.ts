import type { NextRequest } from "next/server";
import { z } from "@/lib/validation";
import { withUser, readJson } from "@/lib/server/http";
import { RequestError } from "@/lib/server/errors";
import { createJourney, createGuidedJourney } from "@/lib/music/journeys";
export const runtime = "nodejs";
const input = z.object({ worldId: z.uuid(), startNodeId: z.uuid().optional(), startTrackId: z.uuid().optional(), length: z.literal(5).optional(),
    intent: z.string().trim().max(120).optional() })
    .strict().refine((value) => Boolean(value.startNodeId) !== Boolean(value.startTrackId));
export function POST(request: NextRequest) {
    return withUser(request, async (userId) => {
        const parsed = input.safeParse(await readJson(request));
        if (!parsed.success)
            throw new RequestError(400, "需要 worldId 和一个有效起点；路线长度固定为 5。", "INVALID_JOURNEY_INPUT");
        const { worldId, startNodeId, startTrackId, intent } = parsed.data;
        return intent ? createGuidedJourney(userId, worldId, startNodeId ?? startTrackId!, intent, undefined, startTrackId)
            : (await createJourney(userId, worldId, startNodeId ?? startTrackId!, undefined, startTrackId));
    });
}
