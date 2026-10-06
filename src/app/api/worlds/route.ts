import type { NextRequest } from "next/server";
import { z } from "@/lib/validation";
import { withUser, readJson } from "@/lib/server/http";
import { RequestError } from "@/lib/server/errors";
import { createWorld } from "@/lib/music/worlds";

export const runtime = "nodejs";
const input = z.object({ name: z.string().trim().min(1).max(100), scope: z.enum(["library", "demo"]).default("library") }).strict();
export function POST(request: NextRequest) {
  return withUser(request, async (userId) => {
    const parsed = input.safeParse(await readJson(request));
    if (!parsed.success) throw new RequestError(400, "世界名称需为 1–100 字符，scope 为 library 或 demo。用户归属由会话确定。");
    return createWorld(userId, parsed.data.name, parsed.data.scope);
  });
}
