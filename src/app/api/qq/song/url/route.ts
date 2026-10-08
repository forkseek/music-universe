import type { NextRequest } from "next/server";
import { withUser, requireSameOrigin } from "@/lib/server/http";
import { radiohandSongUrl, limitPlayerRequests, issueAudioTicket } from "@/lib/music/providers/radiohand-qq";
import { qqAccountResolve } from "@/lib/music/providers/qq-account";
export const runtime = "nodejs";
export function GET(request: NextRequest) {
  return withUser(request, async (userId) => {
    requireSameOrigin(request); await limitPlayerRequests(userId);
    const mid = request.nextUrl.searchParams.get("mid") ?? "";
    const mediaMid = request.nextUrl.searchParams.get("mediaMid") ?? "";
    const account = await qqAccountResolve(userId, mid, mediaMid, request.signal);
    if (account) return account.playable
      ? issueAudioTicket(userId, account.url, account.quality, account.trial)
      : { provider: "qq", url: "", playable: false, reason: account.reason, message: account.message };
    return radiohandSongUrl(userId, mid, mediaMid, request.signal);
  });
}
