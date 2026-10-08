import { sql } from 'drizzle-orm';
import { getDatabase } from '@/db/connection';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const { db } = await getDatabase();
    await db.execute(sql`SELECT 1`);
    return Response.json({ ok: true, storage: 'postgresql' }, { headers: { 'Cache-Control': 'no-store' } });
  } catch { return Response.json({ ok: false, error: '数据库初始化或读取失败。' }, { status: 503, headers: { 'Cache-Control': 'no-store' } }); }
}
