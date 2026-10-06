import type { NextRequest } from "next/server";
import { z } from "@/lib/validation";
import { withUser, readBoundedBody } from "@/lib/server/http";
import { RequestError } from "@/lib/server/errors";
import { IMPORT_LIMITS } from "@/lib/music/import/limits";
import { saveFileImport } from "@/lib/music/library";

export const runtime = "nodejs";
const encodingSchema = z.enum(["auto", "utf-8", "utf-16le", "utf-16be", "gb18030"]);
const sourceSchema = z.enum(["file", "qqmusic", "netease", "kugou", "qishui", "spotify"]);

export function POST(request: NextRequest) {
  return withUser(request, async (userId) => {
    const body = await readBoundedBody(request, IMPORT_LIMITS.maxBatchBytes + 256 * 1024);
    let form: FormData;
    try { form = await new Response(body as BodyInit, { headers: { "content-type": request.headers.get("content-type") ?? "" } }).formData(); }
    catch { throw new RequestError(400, "需要 multipart/form-data 歌单文件。", "INVALID_UPLOAD"); }
    const encoding = encodingSchema.safeParse(form.get("encoding") ?? "auto");
    if (!encoding.success) throw new RequestError(400, "文件编码选项无效。");
    const declaredSource = sourceSchema.safeParse(form.get("sourceProvider") ?? "file");
    if (!declaredSource.success) throw new RequestError(400, "文件来源平台选项无效。");
    const entries = form.getAll("files");
    if (!entries.length || entries.length > IMPORT_LIMITS.maxFiles || entries.some((entry) => !(entry instanceof File))) throw new RequestError(400, "files 需要 1–10 个文件。");
    const uploaded = entries as File[];
    if (uploaded.some((file) => file.size > IMPORT_LIMITS.maxFileBytes) || uploaded.reduce((sum, file) => sum + file.size, 0) > IMPORT_LIMITS.maxBatchBytes) throw new RequestError(413, "每个文件最多 2 MiB，合计最多 10 MiB。");
    const files = await Promise.all(uploaded.map(async (file) => ({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()), encoding: encoding.data })));
    return saveFileImport(userId, files, "library", undefined, declaredSource.data);
  }, true);
}
