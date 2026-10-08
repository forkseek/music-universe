import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { DatabaseContext } from "@/db/connection";
import { openDatabase } from "./helpers/database";
import { createSession } from "@/lib/server/session";
import { deleteLibrary, readLibrary, saveImportReport } from "@/lib/music/library";
import { createWorld, readWorld } from "@/lib/music/worlds";
import { createJourney, readJourney } from "@/lib/music/journeys";
import { prepareQQMusicImport, qqMusicImportSchema } from "@/lib/music/providers/qqmusic-payload";
const folders: string[] = [];
const contexts: DatabaseContext[] = [];
async function fixture() {
    const folder = mkdtempSync(path.join(tmpdir(), "music-world-qq-"));
    folders.push(folder);
    const context = (await openDatabase(path.join(folder, "music.db")));
    contexts.push(context);
    return { context, userId: (await createSession(context)).userId };
}
afterEach(async () => {
    for (const context of contexts.splice(0))
        if (!context.closed)
            await context.close();
    for (const folder of folders.splice(0)) {
        const target = path.resolve(folder);
        if (path.dirname(target) !== path.resolve(tmpdir()) || !path.basename(target).startsWith("music-world-qq-"))
            throw new Error("Unsafe cleanup path");
        rmSync(target, { recursive: true, force: true });
    }
});
describe("QQ Music metadata import", () => {
    it("stores official-source metadata once, even after repeat or changed display text", async () => {
        const { context, userId } = (await fixture());
        const payload = qqMusicImportSchema.parse({ kind: "playlist", playlist: { externalId: "123", name: "My Songs" }, tracks: [
                { title: "First Song", artists: ["Singer"], album: "Album", externalId: "77",
                    externalUrl: "https://untrusted.invalid/audio.mp3" },
            ] });
        const prepared = prepareQQMusicImport(payload);
        expect(prepared.report.warnings[0].code).toBe("URL_OMITTED");
        const first = (await saveImportReport(userId, prepared.report, [prepared.file], "library", context, "qqmusic"));
        const repeat = (await saveImportReport(userId, prepared.report, [prepared.file], "library", context, "qqmusic"));
        expect(first.addedTracks).toBe(1);
        expect(repeat.reused).toBe(true);
        const renamed = qqMusicImportSchema.parse({ ...payload, playlist: { externalId: "123", name: "Renamed" } });
        const next = prepareQQMusicImport(renamed);
        const third = (await saveImportReport(userId, next.report, [next.file], "library", context, "qqmusic"));
        expect(third.addedTracks).toBe(0);
        expect(third.addedSources).toBe(0);
        const library = (await readLibrary(userId, "library", context));
        expect(library.counts).toMatchObject({ tracks: 1, sources: 1, playlists: 1 });
        expect(library.tracks[0].sources[0]).toMatchObject({ provider: "qqmusic", importedVia: "official",
            externalId: "77", playlistExternalId: "123" });
        expect(library.tracks[0].sources[0].externalUrl).toBeUndefined();
    });
    it("merges recent play with the playlist track while keeping a distinct source and true signal", async () => {
        const { context, userId } = (await fixture());
        const playlist = prepareQQMusicImport(qqMusicImportSchema.parse({ kind: "playlist", playlist: { externalId: "1", name: "Songs" },
            tracks: [{ title: "Shared Song", artists: ["Singer"], externalId: "77" }] }));
        (await saveImportReport(userId, playlist.report, [playlist.file], "library", context, "qqmusic"));
        const recent = prepareQQMusicImport(qqMusicImportSchema.parse({ kind: "recent",
            tracks: [{ title: "Shared Song", artists: ["Singer"], externalId: "77" }] }));
        (await saveImportReport(userId, recent.report, [recent.file], "library", context, "qqmusic"));
        const library = (await readLibrary(userId, "library", context));
        expect(library.counts).toMatchObject({ tracks: 1, sources: 2 });
        expect(library.signals[0].recentlyPlayed).toBe(true);
        expect(library.tracks[0].sources.map((source) => source.playlistExternalId)).toContain("1");
    });
    it("rejects oversized or extra client fields, including audio URLs and fake auth data", () => {
        const valid = { kind: "recent", tracks: [{ title: "Song", artists: ["Singer"], externalId: "77" }] };
        expect(qqMusicImportSchema.safeParse(valid).success).toBe(true);
        expect(qqMusicImportSchema.safeParse({ ...valid, cookie: "secret" }).success).toBe(false);
        expect(qqMusicImportSchema.safeParse({ ...valid, tracks: [{ ...valid.tracks[0], audioUrl: "https://example.com/song.mp3" }] }).success).toBe(false);
        expect(qqMusicImportSchema.safeParse({ ...valid, tracks: Array.from({ length: 5001 }, () => valid.tracks[0]) }).success).toBe(false);
    });
    it("deletes one session's QQ tracks, world and Journey without affecting another session", async () => {
        const { context, userId } = (await fixture());
        const other = (await createSession(context)).userId;
        const payload = qqMusicImportSchema.parse({ kind: "playlist", playlist: { externalId: "42", name: "Saved" },
            tracks: Array.from({ length: 6 }, (_, index) => ({ title: `Saved ${index}`, artists: ["Singer"], externalId: String(index + 1) })) });
        for (const owner of [userId, other]) {
            const { file, report } = prepareQQMusicImport(payload);
            (await saveImportReport(owner, report, [file], "library", context, "qqmusic"));
        }
        const a = (await createWorld(userId, "A", "library", context)).world;
        const b = (await createWorld(other, "B", "library", context)).world;
        const aJourney = (await createJourney(userId, a.id, a.nodes.find((node) => node.type === "track")!.id, context));
        const bJourney = (await createJourney(other, b.id, b.nodes.find((node) => node.type === "track")!.id, context));
        expect(aJourney.nodes).toHaveLength(5);
        (await deleteLibrary(userId, context));
        expect((await readLibrary(userId, "library", context)).counts.tracks).toBe(0);
        await expect(async () => (await readWorld(userId, a.id, context))).rejects.toThrow();
        await expect(async () => (await readJourney(userId, aJourney.id, context))).rejects.toThrow();
        expect((await readLibrary(other, "library", context)).counts.tracks).toBe(6);
        expect((await readJourney(other, bJourney.id, context)).nodes).toHaveLength(5);
    });
});
