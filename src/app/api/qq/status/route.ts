import type { NextRequest } from "next/server";
import { withUser, requireSameOrigin } from "@/lib/server/http";
import { radiohandStatus, limitPlayerRequests } from "@/lib/music/providers/radiohand-qq";
import { qqAccountStatus } from "@/lib/music/providers/qq-account";
export const runtime = "nodejs";
export function GET(request: NextRequest) {
  return withUser(request, async (userId) => {
    requireSameOrigin(request); limitPlayerRequests(userId);
    return await qqAccountStatus(userId, request.signal, request.nextUrl.searchParams.get("refresh") === "1", request) ?? radiohandStatus(request.signal);
  }, true);
}
