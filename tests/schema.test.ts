import { describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import { openDatabase } from "./helpers/database";
import { albums, tracks, users, userTrackSignals } from "@/db/schema";

describe("PostgreSQL schema", () => {
  it("applies all migrations and creates the 19 application tables", async () => {
    const context = await openDatabase();
    try {
      const tables = await context.db.select({ tablename: sql<string>`tablename` }).from(sql`pg_tables`).where(sql`schemaname = 'public'`);
      expect(tables).toHaveLength(19);
      expect(tables).toContainEqual({ tablename: "music_runtime_state" });
      expect(tables).toContainEqual({ tablename: "qq_accounts" });
      expect(tables).toContainEqual({ tablename: "platform_accounts" });
    } finally { await context.close(); }
  });

  it("rejects cross-owner references, checks durations and cascades deletion", async () => {
    const context = await openDatabase();
    const { db } = context;
    try {
      await db.insert(users).values([{ id: "a", sessionTokenHash: "hash-a" }, { id: "b", sessionTokenHash: "hash-b" }]);
      await db.insert(albums).values({ id: "album-a", userId: "a", name: "Album", normalizedName: "album" });
      const track = { userId: "a", title: "Song", canonicalKey: "same", versionKey: "original", albumId: "album-a" };
      await db.insert(tracks).values([{ ...track, id: "track-a" }, { ...track, id: "track-a2" }]);
      await expect(db.insert(tracks).values({ ...track, id: "bad-owner", userId: "b" })).rejects.toThrow();
      await expect(db.insert(tracks).values({ ...track, id: "bad-duration", durationMs: -1 })).rejects.toThrow();
      await db.insert(userTrackSignals).values({ userId: "a", trackId: "track-a" });
      expect((await db.select().from(userTrackSignals))[0]).toMatchObject({ liked: null, recentlyPlayed: null, preferenceScore: 0 });
      await db.delete(users).where(eq(users.id, "a"));
      expect(await db.select().from(tracks)).toHaveLength(0);
      expect(await db.select().from(userTrackSignals)).toHaveLength(0);
      expect(await db.select().from(users)).toHaveLength(1);
    } finally { await context.close(); }
  });
});
