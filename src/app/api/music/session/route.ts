import type { NextRequest } from "next/server";
import { requireSameOrigin, withUser } from "@/lib/server/http";
export const runtime = "nodejs";
export function GET(request: NextRequest) { return withUser(request, () => { requireSameOrigin(request); return { ok: true }; }, true); }
