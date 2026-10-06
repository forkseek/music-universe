import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { journalMode, openDatabase } from "@/db/connection";

function withJournalMode(value: string | undefined, run: () => void) {
  const previous = process.env.SQLITE_JOURNAL_MODE;
  if (value === undefined) delete process.env.SQLITE_JOURNAL_MODE;
  else process.env.SQLITE_JOURNAL_MODE = value;
  try { run(); } finally {
    if (previous === undefined) delete process.env.SQLITE_JOURNAL_MODE;
    else process.env.SQLITE_JOURNAL_MODE = previous;
  }
}

describe("SQLite journal mode", () => {
  it("defaults to WAL so local development and the existing schema tests are unaffected", () => {
    expect(journalMode(undefined)).toBe("WAL");
    expect(journalMode("")).toBe("WAL");
    expect(journalMode("   ")).toBe("WAL");
  });

  it("accepts a rollback journal for network volumes and rejects everything else", () => {
    expect(journalMode("delete")).toBe("DELETE");
    expect(journalMode(" Delete ")).toBe("DELETE");
    expect(journalMode("truncate")).toBe("TRUNCATE");
    expect(journalMode("PERSIST")).toBe("PERSIST");
    // The allowlist is what keeps an environment value out of the SQL text.
    expect(() => journalMode("MEMORY")).toThrow(/取值非法/u);
    expect(() => journalMode("WAL; DROP TABLE users")).toThrow(/取值非法/u);
  });

  it("actually applies the requested journal when the database is opened", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "music-world-journal-"));
    try {
      withJournalMode("DELETE", () => {
        const context = openDatabase(path.join(directory, "rollback.db"));
        try {
          // A network-backed volume cannot host WAL, so the deployment must land on "delete".
          expect(context.sqlite.pragma("journal_mode", { simple: true })).toBe("delete");
          // Migrations still run and referential integrity stays on for this path.
          expect(context.sqlite.pragma("foreign_keys", { simple: true })).toBe(1);
          expect(context.sqlite.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all().length).toBeGreaterThan(0);
        } finally { context.sqlite.close(); }
      });

      withJournalMode(undefined, () => {
        const context = openDatabase(path.join(directory, "wal.db"));
        try {
          expect(context.sqlite.pragma("journal_mode", { simple: true })).toBe("wal");
        } finally { context.sqlite.close(); }
      });
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
