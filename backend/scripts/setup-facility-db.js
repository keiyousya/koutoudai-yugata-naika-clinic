import { createClient } from "@libsql/client";

const db = createClient({
  url: process.env.TURSO_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function setup() {
  console.log("=== Facility DB Setup ===\n");

  // facility_staff テーブル
  console.log("Creating facility_staff table...");
  await db.execute(`
    CREATE TABLE IF NOT EXISTS facility_staff (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      passcode_hash TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // facility_temperature_logs テーブル
  console.log("Creating facility_temperature_logs table...");
  await db.execute(`
    CREATE TABLE IF NOT EXISTS facility_temperature_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      staff_id INTEGER NOT NULL REFERENCES facility_staff(id),
      equipment_name TEXT NOT NULL,
      temperature REAL NOT NULL,
      recorded_date TEXT NOT NULL,
      recorded_time TEXT NOT NULL,
      note TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // インデックス作成
  console.log("\nCreating indexes...");

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_facility_temp_logs_date
    ON facility_temperature_logs(recorded_date)
  `);
  console.log("  -> idx_facility_temp_logs_date");

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_facility_temp_logs_equipment
    ON facility_temperature_logs(equipment_name, recorded_date)
  `);
  console.log("  -> idx_facility_temp_logs_equipment");

  console.log("\n=== Facility DB setup complete! ===");
}

setup().catch(console.error);
