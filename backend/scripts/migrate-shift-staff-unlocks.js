#!/usr/bin/env node

/**
 * スタッフ個別の提出ロック解除を保持する shift_staff_unlocks テーブルを追加するマイグレーション
 */

import { createClient } from "@libsql/client";

const TURSO_URL = process.env.TURSO_URL;
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;

if (!TURSO_URL || !TURSO_AUTH_TOKEN) {
  console.error("環境変数 TURSO_URL と TURSO_AUTH_TOKEN を設定してください");
  process.exit(1);
}

const db = createClient({
  url: TURSO_URL,
  authToken: TURSO_AUTH_TOKEN,
});

async function migrate() {
  console.log("Creating shift_staff_unlocks table...");
  await db.execute(`
    CREATE TABLE IF NOT EXISTS shift_staff_unlocks (
      month TEXT NOT NULL,
      staff_id INTEGER NOT NULL REFERENCES shift_staff(id),
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      PRIMARY KEY (month, staff_id)
    )
  `);
  console.log("✓ Migration completed successfully");
}

migrate()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Migration failed:", error);
    process.exit(1);
  });
