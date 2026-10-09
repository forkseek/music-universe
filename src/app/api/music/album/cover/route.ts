import type { NextRequest } from "next/server";
import { readAlbumCover } from "@/lib/music/platforms/albums";
import { albumCoverErrorResponse } from "@/lib/music/platforms/album-cover-response";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try { return await readAlbumCover(request.nextUrl.searchParams.get("provider") || "", request.nextUrl.searchParams.get("id") || "", request.signal); }
  catch (error) { return albumCoverErrorResponse(error); }
}
