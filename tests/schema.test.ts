import { describe, expect, it } from "vitest";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";

function createDatabase() {
  const db = new DatabaseSync(":memory:");
  db.exec("PRAGMA foreign_keys = ON");
  for (const name of readdirSync("src/db/migrations").filter((name) => name.endsWith(".sql")).sort()) {
    db.exec(readFileSync(`src/db/migrations/${name}`, "utf8"));
  }
  return db;
}

describe("prepared SQLite schema", () => {
  it("creates all required tables and has no broken foreign key declarations", () => {
    const db = createDatabase();
    try {
      const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all();
      expect(tables).toHaveLength(18);
      expect(tables).toContainEqual({ name: "qq_accounts" });
      expect(tables).toContainEqual({ name: "platform_accounts" });
      expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    } finally { db.close(); }
  });
  it("rejects cross-owner references and permits distinct recordings with the same canonical key", () => {
    const db = createDatabase();
    try {
      const insertUser = db.prepare("INSERT INTO users(id, session_token_hash, created_at) VALUES (?, ?, 0)");
      insertUser.run("user-a", "hash-a"); insertUser.run("user-b", "hash-b");
      db.prepare("INSERT INTO albums(id, user_id, name, normalized_name) VALUES ('album-a', 'user-a', 'Album', 'album')").run();
      const insertTrack = db.prepare("INSERT INTO tracks(id, user_id, title, canonical_key, version_key, album_id, created_at) VALUES (?, ?, 'Song', 'same-key', 'original', ?, 0)");
      insertTrack.run("track-a", "user-a", "album-a");
      insertTrack.run("track-a2", "user-a", "album-a");
      expect(() => insertTrack.run("track-b", "user-b", "album-a")).toThrow(/FOREIGN KEY/u);
      db.prepare("INSERT INTO user_track_signals(user_id, track_id) VALUES ('user-a', 'track-a')").run();
      const signal = db.prepare("SELECT * FROM user_track_signals").get();
      expect(signal).toMatchObject({ liked: null, recently_played: null, preference_score: 0 });
      db.prepare("DELETE FROM users WHERE id = 'user-a'").run();
      expect(db.prepare("SELECT * FROM tracks").all()).toHaveLength(0);
      expect(db.prepare("SELECT * FROM user_track_signals").all()).toHaveLength(0);
      expect(db.prepare("SELECT * FROM users").all()).toHaveLength(1);
    } finally { db.close(); }
  });
});
