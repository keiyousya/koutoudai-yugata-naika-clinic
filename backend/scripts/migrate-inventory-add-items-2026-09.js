#!/usr/bin/env node

/**
 * 2026年9月に新規採用した医薬品・ワクチンを在庫管理の品目に追加するマイグレーション
 * （東邦薬品・スズケンとの9月のメールでの注文・納品実績をもとに作成）
 *
 * - デエビゴ錠 2.5mg / ベタヒスチンメシル酸塩錠 12mg / ゾコーバ錠 125mg … 東邦薬品
 * - ダイチロナ（新型コロナワクチン、1人分・未使用時返品可） … 東邦薬品
 * - インフルエンザワクチン … 納入元ごとに分けて管理する
 *   - Meiji（2V入=4人分） … 東邦薬品（100人分）
 *   - Meiji（2V入=4人分） … スズケン（25箱）
 *   - デンカ（1V入=2人分） … スズケン（25箱）
 *
 * インフルエンザワクチンも発注対象として登録する。
 * 同名・同規格の品目が既にあればスキップするので、再実行しても安全。
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

// category_id=1（医薬品）
const items = [
  { name: "デエビゴ錠", dosage: "2.5mg", unit: "箱数", threshold: 1, orderable: 1, supplier: "toho" },
  { name: "ベタヒスチンメシル酸塩錠", dosage: "12mg", unit: "箱数", threshold: 1, orderable: 1, supplier: "toho" },
  { name: "ゾコーバ錠", dosage: "125mg", unit: "x7錠", threshold: 1, orderable: 1, supplier: "toho" },
  { name: "ダイチロナ（コロナワクチン）", dosage: "1人分", unit: "バイアル", threshold: 2, orderable: 1, supplier: "toho" },
  { name: "インフルエンザワクチン（Meiji・東邦）", dosage: "2V入・4人分", unit: "箱数", threshold: 5, orderable: 1, supplier: "toho" },
  { name: "インフルエンザワクチン（Meiji・スズケン）", dosage: "2V入・4人分", unit: "箱数", threshold: 5, orderable: 1, supplier: "suzuken" },
  { name: "インフルエンザワクチン（デンカ・スズケン）", dosage: "1V入・2人分", unit: "箱数", threshold: 5, orderable: 1, supplier: "suzuken" },
];

async function migrate() {
  console.log("医薬品・ワクチンの品目を追加します...");

  const max = await db.execute(
    `SELECT COALESCE(MAX(sort_order), 0) AS max FROM inventory_items WHERE category_id = 1`
  );
  let sortOrder = Number(max.rows[0].max);

  for (const item of items) {
    const existing = await db.execute({
      sql: `SELECT id FROM inventory_items WHERE category_id = 1 AND name = ? AND dosage = ?`,
      args: [item.name, item.dosage],
    });
    if (existing.rows.length > 0) {
      console.log(`- 既に存在するためスキップ: ${item.name} ${item.dosage}`);
      continue;
    }

    sortOrder += 1;
    await db.execute({
      sql: `INSERT INTO inventory_items
              (category_id, name, dosage, unit, sort_order, order_threshold, is_orderable, supplier)
            VALUES (1, ?, ?, ?, ?, ?, ?, ?)`,
      args: [item.name, item.dosage, item.unit, sortOrder, item.threshold, item.orderable, item.supplier],
    });
    console.log(`✓ ${item.name} ${item.dosage}（${item.supplier}）`);
  }

  const result = await db.execute(
    `SELECT COUNT(*) AS count FROM inventory_items WHERE category_id = 1 AND is_active = 1`
  );
  console.log(`  医薬品: ${result.rows[0].count}品目`);
}

migrate().then(() => {
  console.log("完了");
  process.exit(0);
});
