import type { NextRequest } from "next/server";
import { withUser, requireSameOrigin } from "@/lib/server/http";
import { radiohandSearch, limitPlayerRequests } from "@/lib/music/providers/radiohand-qq";
export const runtime = "nodejs";
export function GET(request: NextRequest) {
  return withUser(request, async (userId) => {
    requireSameOrigin(request); limitPlayerRequests(userId);
    const songs = await radiohandSearch(request.nextUrl.searchParams.get("keywords") ?? "", Number(request.nextUrl.searchParams.get("limit") ?? 8), request.signal);
    return { provider: "qq", songs, hasMore: false };
  }, true);
}
