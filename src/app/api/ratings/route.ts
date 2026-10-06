import type { NextRequest } from "next/server";
import { z } from "@/lib/validation";
import { withUser, readJson } from "@/lib/server/http";
import { RequestError } from "@/lib/server/errors";
import { resolveTrackRatings } from "@/lib/music/ratings";

export const runtime = "nodejs";

const input = z.object({
  tracks: z.array(z.object({
    key: z.string().trim().min(1).max(200),
    title: z.string().trim().min(1).max(200),
    artist: z.string().trim().max(200).optional(),
    durationMs: z.number().finite().positive().max(24 * 60 * 60 * 1000).optional(),
  }).strict()).min(1).max(50),
}).strict();

/** 曲目大众热度评分。上游不可用时返回空表 + degraded，避免让页面因评分而报错。 */
export function POST(request: NextRequest) {
  return withUser(request, async () => {
    const parsed = input.safeParse(await readJson(request));
    if (!parsed.success) throw new RequestError(400, "评分请求格式无效。", "RATING_QUERY_INVALID");
    const hits = await resolveTrackRatings(parsed.data.tracks, request.signal);
    return {
      source: "netease" as const,
      degraded: hits.size === 0,
      ratings: Object.fromEntries([...hits].map(([key, hit]) => [key, hit.rating])),
    };
  }, true);
}
