import type { NextRequest } from "next/server";
import { withUser, readBoundedBody } from "@/lib/server/http";
import { importPlaylistFiles } from "@/lib/music/import/library";
import { IMPORT_LIMITS } from "@/lib/music/import/limits";

/** Validation-only endpoint; input is a raw JSON track array, never client-generated IDs. */
export function POST(request: NextRequest) {
  return withUser(request, async () => importPlaylistFiles([{ name: "structured.json", bytes: await readBoundedBody(request, IMPORT_LIMITS.maxFileBytes) }]), true);
}
