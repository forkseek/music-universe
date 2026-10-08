import type { NextRequest } from "next/server";
import { withUser } from "@/lib/server/http";
import { deleteLibrary, readLibrary } from "@/lib/music/library";
import { RequestError } from "@/lib/server/errors";
export const runtime = "nodejs";
export function GET(request: NextRequest) {
    return withUser(request, async (userId) => {
        const scope = request.nextUrl.searchParams.get("scope") ?? "library";
        if (scope !== "library" && scope !== "demo")
            throw new RequestError(400, "库类型无效。");
        return (await readLibrary(userId, scope));
    }, true);
}
export function DELETE(request: NextRequest) { return withUser(request, async (userId) => (await deleteLibrary(userId))); }
