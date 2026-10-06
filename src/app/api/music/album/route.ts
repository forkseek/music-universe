import type { NextRequest } from "next/server";
import { readJson, withUser } from "@/lib/server/http";
import { rateLimitMusic } from "@/lib/music/platforms/catalog";
import { resolvePlayingAlbum } from "@/lib/music/platforms/albums";
export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  return withUser(request, async userId => {
    rateLimitMusic(userId, "album");
    return resolvePlayingAlbum(userId, await readJson(request, 4096), request.signal);
  });
}
