import type { NextRequest } from "next/server";
import { getDatabase } from "@/db/connection";
import { withUser, readJson } from "@/lib/server/http";
import { RequestError } from "@/lib/server/errors";
import { saveImportReport } from "@/lib/music/library";
import { prepareQQMusicImport, qqMusicImportSchema } from "@/lib/music/providers/qqmusic-payload";
export const runtime = "nodejs";
export function POST(request: NextRequest) {
    return withUser(request, async (userId) => {
        if (process.env.NEXT_PUBLIC_ENABLE_QQMUSIC !== "true")
            throw new RequestError(403, "QQ 音乐官方导入尚未开放；请使用歌单文件。", "FEATURE_DISABLED");
        const input = qqMusicImportSchema.safeParse(await readJson(request, 6 * 1024 * 1024));
        if (!input.success)
            throw new RequestError(400, "QQ 音乐歌曲元数据不符合导入格式，请重新从官方面板读取。", "INVALID_QQMUSIC_IMPORT");
        const { file, report } = prepareQQMusicImport(input.data);
        return (await saveImportReport(userId, report, [file], "library", (await getDatabase()), "qqmusic"));
    }, true);
}
