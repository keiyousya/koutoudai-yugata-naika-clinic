import { createClient } from "@libsql/client";

const db = createClient({
  url: process.env.TURSO_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function setup() {
  console.log("=== Shift DB Setup ===\n");

  // shift_staff テーブル
  console.log("Creating shift_staff table...");
  await db.execute(`
    CREATE TABLE IF NOT EXISTS shift_staff (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('nurse', 'clerk')),
      passcode_hash TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // shift_calendar_overrides テーブル
  console.log("Creating shift_calendar_overrides table...");
  await db.execute(`
    CREATE TABLE IF NOT EXISTS shift_calendar_overrides (
      date TEXT PRIMARY KEY,
      is_open INTEGER NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // shift_periods テーブル
  console.log("Creating shift_periods table...");
  await db.execute(`
    CREATE TABLE IF NOT EXISTS shift_periods (
      month TEXT PRIMARY KEY,
      submission_locked_at TEXT,
      published_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // shift_requests テーブル
  console.log("Creating shift_requests table...");
  await db.execute(`
    CREATE TABLE IF NOT EXISTS shift_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      staff_id INTEGER NOT NULL REFERENCES shift_staff(id),
      date TEXT NOT NULL,
      availability TEXT NOT NULL CHECK(availability IN ('available', 'unavailable')),
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (staff_id, date)
    )
  `);

  // shift_assignments テーブル
  console.log("Creating shift_assignments table...");
  await db.execute(`
    CREATE TABLE IF NOT EXISTS shift_assignments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('nurse', 'clerk')),
      staff_id INTEGER NOT NULL REFERENCES shift_staff(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE (date, role)
    )
  `);

  // インデックス作成
  console.log("\nCreating indexes...");

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_shift_staff_role ON shift_staff(role)
  `);
  console.log("  -> idx_shift_staff_role");

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_shift_requests_date ON shift_requests(date)
  `);
  console.log("  -> idx_shift_requests_date");

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_shift_requests_staff ON shift_requests(staff_id)
  `);
  console.log("  -> idx_shift_requests_staff");

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_shift_assignments_date ON shift_assignments(date)
  `);
  console.log("  -> idx_shift_assignments_date");

  console.log("\n=== Shift DB setup complete! ===");
}

setup().catch(console.error);
