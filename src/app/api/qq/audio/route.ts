import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { SESSION_COOKIE, findUser } from "@/lib/server/session";
import { RequestError } from "@/lib/server/errors";
import { radiohandAudio } from "@/lib/music/providers/radiohand-qq";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
    try {
        const userId = (await findUser(request.cookies.get(SESSION_COOKIE)?.value));
        if (!userId || request.headers.get("sec-fetch-site") === "cross-site")
            throw new RequestError(404, "播放请求无效。", "AUDIO_NOT_FOUND");
        return await radiohandAudio(userId, request.nextUrl.searchParams.get("ticket") ?? "", request.headers.get("range"), request.signal);
    }
    catch (error) {
        const known = error instanceof RequestError;
        return NextResponse.json({ error: { code: known ? error.code : "AUDIO_UPSTREAM_FAILED", message: known ? error.message : "音频暂时无法读取，请稍后重试。" } }, { status: known ? error.status : 502, headers: { "Cache-Control": "private, no-store", Vary: "Cookie" } });
    }
}
