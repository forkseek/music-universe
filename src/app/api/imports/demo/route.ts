import type { NextRequest } from "next/server";
import { withUser } from "@/lib/server/http";
import { getProvider } from "@/lib/music/providers/registry";
import { importProviderLibrary } from "@/lib/music/import/provider";
import { saveImportReport } from "@/lib/music/library";
export const runtime = "nodejs";
export function POST(request: NextRequest) {
    return withUser(request, async (userId) => {
        const { report, file } = await importProviderLibrary(getProvider("demo"));
        return (await saveImportReport(userId, report, [file], "demo"));
    }, true);
}
