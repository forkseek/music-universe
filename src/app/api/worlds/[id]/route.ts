import type { NextRequest } from "next/server";
import { withUser } from "@/lib/server/http";
import { readWorld } from "@/lib/music/worlds";
export const runtime = "nodejs";
export async function GET(request: NextRequest, { params }: {
    params: Promise<{
        id: string;
    }>;
}) {
    const { id } = await params;
    return withUser(request, async (userId) => (await readWorld(userId, id)));
}
