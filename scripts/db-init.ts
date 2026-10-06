import { getDatabase } from "../src/db/connection";

const { sqlite } = getDatabase();
try {
  const integrity = sqlite.pragma("integrity_check", { simple: true });
  const violations = sqlite.pragma("foreign_key_check");
  if (integrity !== "ok" || !Array.isArray(violations) || violations.length) throw new Error("数据库完整性检查未通过。");
  console.log(JSON.stringify({ initialized: true, integrity, journalMode: sqlite.pragma("journal_mode", { simple: true }), foreignKeys: sqlite.pragma("foreign_keys", { simple: true }) }));
} finally { sqlite.close(); }
