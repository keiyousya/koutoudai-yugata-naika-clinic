import { createClient } from "@libsql/client";

const db = createClient({
  url: process.env.TURSO_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function setup() {
  console.log("Creating reservations table...");

  await db.execute(`
    CREATE TABLE IF NOT EXISTS reservations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      email TEXT,
      date TEXT NOT NULL,
      time TEXT NOT NULL,
      symptoms TEXT,
      status TEXT DEFAULT 'pending',
      created_at TEXT DEFAULT (datetime('now'))
    )
  `);

  console.log("Table created successfully!");

  // インデックス作成
  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_reservations_date
    ON reservations(date)
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_reservations_status
    ON reservations(status)
  `);

  console.log("Indexes created successfully!");
  console.log("Database setup complete!");
}

setup().catch(console.error);
