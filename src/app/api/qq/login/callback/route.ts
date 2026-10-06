import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, findUser } from "@/lib/server/session";
import { completeQqOAuth } from "@/lib/music/providers/qq-oauth";
export const runtime = "nodejs";

// QQ callbacks have no custom API header. Authenticate the HttpOnly session and owner-bound state.
export async function GET(request: NextRequest) {
  let success = false;
  try {
    const owner = findUser(request.cookies.get(SESSION_COOKIE)?.value);
    if (owner) {
      const result = await completeQqOAuth(owner, request.nextUrl.searchParams.get("state") || "", request.nextUrl.searchParams.get("code") || "", request.nextUrl.searchParams.has("error"));
      success = result.status === "success";
    }
  } catch { /* Keep authorization codes, responses and tokens out of logs and HTML. */ }
  return NextResponse.redirect(new URL("/api/qq/login/complete?status=" + (success ? "success" : "error"), request.url), { status: 303, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}
