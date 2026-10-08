import type { NextRequest } from "next/server";
import { requireSameOrigin, readJson, withUser } from "@/lib/server/http";
import { RequestError } from "@/lib/server/errors";
import { parsePlatform, rateLimitMusic, resolvePlatformSong, searchPlatform } from "@/lib/music/platforms/catalog";
import { cancelLogin, logoutPlatform, platformStatus, pollPlatformLogin, startPlatformLogin } from "@/lib/music/platforms/login";
import { readPlatformLyrics } from "@/lib/music/platforms/lyrics";
import { revokeMedia } from "@/lib/music/platforms/media";
import { record, text } from "@/lib/music/platforms/types";
export const runtime = "nodejs";
type Context = {
    params: Promise<{
        provider: string;
        action: string;
    }>;
};
export async function GET(request: NextRequest, context: Context) {
    const params = await context.params;
    return withUser(request, async (userId) => {
        requireSameOrigin(request);
        const provider = parsePlatform(params.provider);
        rateLimitMusic(userId, params.action);
        if (params.action === "status")
            return platformStatus(userId, provider, request.signal);
        if (params.action === "search")
            return searchPlatform(userId, provider, request.nextUrl.searchParams.get("q") || "", Number(request.nextUrl.searchParams.get("page") || 1), request.signal);
        if (params.action === "lyrics")
            return readPlatformLyrics(userId, provider, request.nextUrl.searchParams.get("id") || "", request.signal);
        if (params.action === "poll")
            return pollPlatformLogin(userId, provider, request.nextUrl.searchParams.get("id") || "");
        throw new RequestError(404, "无效的音乐请求。", "ACTION_NOT_FOUND");
    });
}
export async function POST(request: NextRequest, context: Context) {
    const params = await context.params;
    return withUser(request, async (userId) => {
        const provider = parsePlatform(params.provider);
        rateLimitMusic(userId, params.action);
        const body = record(await readJson(request, 4096));
        if (params.action === "login")
            return startPlatformLogin(userId, provider, request);
        if (params.action === "cancel")
            return cancelLogin(userId, provider, text(body.loginId, 100));
        if (params.action === "logout") {
            revokeMedia(userId, provider);
            return (await logoutPlatform(userId, provider));
        }
        if (params.action === "play")
            return resolvePlatformSong(userId, provider, text(body.playbackId, 100), request.signal);
        throw new RequestError(404, "无效的音乐请求。", "ACTION_NOT_FOUND");
    });
}
