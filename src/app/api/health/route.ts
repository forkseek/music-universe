import { getDatabase } from "@/db/connection";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export function GET() {
  try {
    const { sqlite } = getDatabase();
    sqlite.prepare("SELECT 1").get();
    return Response.json({ ok: true, storage: "sqlite", persistentPathConfigured: !!process.env.DATABASE_PATH }, { headers: { "Cache-Control": "no-store" } });
  } catch { return Response.json({ ok: false, error: "数据库初始化或读取失败。" }, { status: 503 }); }
}
