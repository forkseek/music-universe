import type { NextRequest } from "next/server";
import { withUser, requireSameOrigin } from "@/lib/server/http";
import { limitPlayerRequests } from "@/lib/music/providers/radiohand-qq";
import { pollQqLogin } from "@/lib/music/providers/qq-account";
export const runtime = "nodejs";
export function GET(request: NextRequest) {
  return withUser(request, (userId) => { requireSameOrigin(request); limitPlayerRequests(userId); return pollQqLogin(userId, request.signal, request.nextUrl.searchParams.get("loginId") ?? undefined); }, true);
}
