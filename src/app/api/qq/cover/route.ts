import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { RequestError } from "@/lib/server/errors";
import { radiohandCover } from "@/lib/music/providers/radiohand-qq";
export const runtime = "nodejs";
export async function GET(request: NextRequest) {
  try { return await radiohandCover(request.nextUrl.searchParams.get("mid") ?? "", request.signal); }
  catch (error) { return NextResponse.json({ error: { message: "专辑封面暂不可用。" } }, { status: error instanceof RequestError ? error.status : 502 }); }
}
