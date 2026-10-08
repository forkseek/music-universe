import type { NextRequest } from "next/server";
import { withUser } from "@/lib/server/http";
import { readJourney } from "@/lib/music/journeys";
export const runtime = "nodejs";
export function GET(request: NextRequest, { params }: {
    params: Promise<{
        id: string;
    }>;
}) {
    return withUser(request, async (userId) => (await readJourney(userId, (await params).id)));
}
