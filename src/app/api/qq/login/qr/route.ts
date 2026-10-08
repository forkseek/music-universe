import type { NextRequest } from "next/server";
import { withUser, requireSameOrigin } from "@/lib/server/http";
import { limitPlayerRequests } from "@/lib/music/providers/radiohand-qq";
import { startQqLogin } from "@/lib/music/providers/qq-account";
export const runtime = "nodejs";
export function GET(request: NextRequest) {
  return withUser(request, async (userId) => { requireSameOrigin(request); await limitPlayerRequests(userId); return startQqLogin(userId, request.signal, request); }, true);
}
