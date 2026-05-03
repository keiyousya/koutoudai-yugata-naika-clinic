#!/usr/bin/env node

/**
 * shift_periods テーブルに submission_unlocked カラムを追加するマイグレーション
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
  console.log("Adding submission_unlocked column to shift_periods table...");

  try {
    // submission_unlocked カラムを追加（既存のカラムがある場合はエラーにならないようにチェック）
    await db.execute(`
      ALTER TABLE shift_periods ADD COLUMN submission_unlocked INTEGER DEFAULT 0
    `);

    console.log("✓ Migration completed successfully");
  } catch (error) {
    if (error.message && error.message.includes("duplicate column name")) {
      console.log("✓ Column already exists, skipping");
    } else {
      console.error("Migration failed:", error);
      process.exit(1);
    }
  }
}

migrate().then(() => {
  console.log("Done");
  process.exit(0);
});
