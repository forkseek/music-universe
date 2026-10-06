import { type NextRequest, NextResponse } from "next/server";
import { SESSION_COOKIE, findUser } from "@/lib/server/session";
import { RequestError } from "@/lib/server/errors";
import { musicAudio } from "@/lib/music/platforms/media";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try {
    const userId = findUser(request.cookies.get(SESSION_COOKIE)?.value);
    if (!userId || request.headers.get("sec-fetch-site") === "cross-site") throw new RequestError(404, "播放请求无效。", "AUDIO_NOT_FOUND");
    return await musicAudio(userId, request.nextUrl.searchParams.get("ticket") || "", request.headers.get("range"), request.signal);
  } catch (error) {
    return NextResponse.json({ error: { message: error instanceof RequestError ? error.message : "音频暂时无法读取，请重新点击播放。" } }, { status: error instanceof RequestError ? error.status : 502, headers: { "Cache-Control": "private, no-store" } });
  }
}
