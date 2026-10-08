import type { NextRequest } from "next/server";
import { withUser, requireSameOrigin } from "@/lib/server/http";
import { radiohandSearchPage, limitPlayerRequests } from "@/lib/music/providers/radiohand-qq";
export const runtime = "nodejs";
export function GET(request: NextRequest) {
  return withUser(request, async (userId) => {
    requireSameOrigin(request); await limitPlayerRequests(userId);
    return radiohandSearchPage(request.nextUrl.searchParams.get("keywords") ?? "", Number(request.nextUrl.searchParams.get("limit") ?? 12), request.signal, userId, Number(request.nextUrl.searchParams.get("page") ?? 1));
  }, true);
}
