import type { NextRequest } from "next/server";
import { withUser } from "@/lib/server/http";
import { logoutQqAccount } from "@/lib/music/providers/qq-account";
export const runtime = "nodejs";
export function POST(request: NextRequest) {
  return withUser(request, (userId) => logoutQqAccount(userId));
}
