import type { NextRequest } from "next/server";
import { readAlbumCover } from "@/lib/music/platforms/albums";
import { albumCoverErrorResponse } from "@/lib/music/platforms/album-cover-response";

export const runtime = "nodejs";
export async function GET(request: NextRequest, context: { params: Promise<{ provider: string; id: string }> }) {
    try {
        const { provider, id } = await context.params;
        return await readAlbumCover(provider, id, request.signal);
    } catch (error) {
        return albumCoverErrorResponse(error);
    }
}
