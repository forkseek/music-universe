import type { NextRequest } from "next/server";
import { readAlbumCover } from "@/lib/music/platforms/albums";
import { RequestError } from "@/lib/server/errors";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try { return await readAlbumCover(request.nextUrl.searchParams.get("provider") || "", request.nextUrl.searchParams.get("id") || "", request.signal); }
  catch (error) { return Response.json({ error: { message: "专辑封面暂不可用。" } }, { status: error instanceof RequestError ? error.status : 502 }); }
}
