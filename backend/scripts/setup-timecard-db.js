import { createClient } from "@libsql/client";

const db = createClient({
  url: process.env.TURSO_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function setup() {
  console.log("Creating staff table...");

  await db.execute(`
    CREATE TABLE IF NOT EXISTS staff (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      card_uid TEXT UNIQUE NOT NULL,
      is_active INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  console.log("Creating timecard_records table...");

  await db.execute(`
    CREATE TABLE IF NOT EXISTS timecard_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      staff_id INTEGER NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('in', 'out')),
      method TEXT NOT NULL DEFAULT 'nfc',
      timestamp TEXT DEFAULT (datetime('now')),
      FOREIGN KEY (staff_id) REFERENCES staff(id)
    )
  `);

  // 既存テーブルに method カラムがなければ追加（マイグレーション）
  console.log("Migrating: adding method column if needed...");
  try {
    await db.execute(`ALTER TABLE timecard_records ADD COLUMN method TEXT NOT NULL DEFAULT 'nfc'`);
    console.log("  -> method column added.");
  } catch (e) {
    if (String(e).includes("duplicate column")) {
      console.log("  -> method column already exists, skipping.");
    } else {
      throw e;
    }
  }

  // is_modified カラム追加（マイグレーション）
  console.log("Migrating: adding is_modified column if needed...");
  try {
    await db.execute(`ALTER TABLE timecard_records ADD COLUMN is_modified INTEGER DEFAULT 0`);
    console.log("  -> is_modified column added.");
  } catch (e) {
    if (String(e).includes("duplicate column")) {
      console.log("  -> is_modified column already exists, skipping.");
    } else {
      throw e;
    }
  }

  // 変更ログテーブル作成
  console.log("Creating timecard_edit_log table...");
  await db.execute(`
    CREATE TABLE IF NOT EXISTS timecard_edit_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      record_id INTEGER NOT NULL,
      action TEXT NOT NULL CHECK(action IN ('create', 'update', 'delete')),
      changes TEXT NOT NULL,
      edited_at TEXT DEFAULT (datetime('now'))
    )
  `);

  console.log("Creating indexes...");

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_timecard_records_staff_id
    ON timecard_records(staff_id)
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_timecard_records_timestamp
    ON timecard_records(timestamp)
  `);

  console.log("Timecard database setup complete!");
}

setup().catch(console.error);
