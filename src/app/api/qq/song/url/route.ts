import type { NextRequest } from "next/server";
import { withUser, requireSameOrigin } from "@/lib/server/http";
import { radiohandSongUrl, limitPlayerRequests } from "@/lib/music/providers/radiohand-qq";
export const runtime = "nodejs";
export function GET(request: NextRequest) {
  return withUser(request, (userId) => {
    requireSameOrigin(request); limitPlayerRequests(userId);
    return radiohandSongUrl(userId, request.nextUrl.searchParams.get("mid") ?? "", request.nextUrl.searchParams.get("mediaMid") ?? "", request.signal);
  });
}
