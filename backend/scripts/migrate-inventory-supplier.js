#!/usr/bin/env node

/**
 * inventory_items テーブルに発注先カラムを追加するマイグレーション
 * - supplier: 'toho'（東邦薬品）/ 'suzuken'（スズケン）
 *
 * 初期値: 全品目を 'toho'（現行の運用をそのまま維持し、
 *         スズケンに回す品目は発注設定画面から個別に切り替える）
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

const column = `ALTER TABLE inventory_items ADD COLUMN supplier TEXT NOT NULL DEFAULT 'toho'`;

async function migrate() {
  console.log("inventory_items に発注先カラムを追加します...");

  try {
    await db.execute(column);
    console.log("✓", column);
  } catch (error) {
    if (error.message && error.message.includes("duplicate column name")) {
      console.log("- 既に存在するためスキップ:", column);
    } else {
      console.error("✗ 失敗:", error);
      process.exit(1);
    }
  }

  const result = await db.execute(
    `SELECT supplier, COUNT(*) as count FROM inventory_items WHERE is_active = 1 GROUP BY supplier`
  );
  result.rows.forEach((row) => {
    console.log(`  ${row.supplier}: ${row.count}件`);
  });
}

migrate().then(() => {
  console.log("完了");
  process.exit(0);
});
