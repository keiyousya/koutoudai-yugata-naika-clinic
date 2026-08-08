#!/usr/bin/env node

/**
 * inventory_items テーブルに発注設定カラムを追加するマイグレーション
 * - order_threshold: 品目ごとの規定量（発注の閾値）
 * - is_orderable:    発注管理の対象にするか
 *
 * 初期値: 医薬品は全品目、備品は迅速検査キットのみ発注対象
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

const columns = [
  `ALTER TABLE inventory_items ADD COLUMN order_threshold INTEGER NOT NULL DEFAULT 5`,
  `ALTER TABLE inventory_items ADD COLUMN is_orderable INTEGER NOT NULL DEFAULT 0`,
];

// 既存データの初期値（既に設定済みの環境で上書きしないよう、カラム追加時のみ実行）
const seeds = [
  `UPDATE inventory_items SET is_orderable = 1 WHERE category_id = 1`,
  `UPDATE inventory_items SET is_orderable = 1 WHERE category_id = 2 AND name LIKE '迅速検査キット%'`,
];

async function migrate() {
  console.log("inventory_items に発注設定カラムを追加します...");

  let added = false;

  for (const sql of columns) {
    try {
      await db.execute(sql);
      added = true;
      console.log("✓", sql);
    } catch (error) {
      if (error.message && error.message.includes("duplicate column name")) {
        console.log("- 既に存在するためスキップ:", sql);
      } else {
        console.error("✗ 失敗:", error);
        process.exit(1);
      }
    }
  }

  if (!added) {
    console.log("カラムは既に追加済みです。初期値の設定はスキップします。");
    return;
  }

  for (const sql of seeds) {
    const result = await db.execute(sql);
    console.log(`✓ ${result.rowsAffected}件更新:`, sql);
  }
}

migrate().then(() => {
  console.log("完了");
  process.exit(0);
});
