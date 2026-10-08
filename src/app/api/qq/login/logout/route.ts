import type { NextRequest } from "next/server";
import { withUser } from "@/lib/server/http";
import { logoutQqAccount } from "@/lib/music/providers/qq-account";
import { revokeMedia } from "@/lib/music/platforms/media";
export const runtime = "nodejs";
export function POST(request: NextRequest) {
  return withUser(request, async (userId) => {
    await revokeMedia(userId, "qq");
    return logoutQqAccount(userId);
  });
}
