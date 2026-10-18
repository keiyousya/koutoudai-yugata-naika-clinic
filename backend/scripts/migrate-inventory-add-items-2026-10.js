#!/usr/bin/env node

/**
 * 2026年10月に新規採用した医薬品を在庫管理の品目に追加するマイグレーション
 * （東邦薬品との10月のメールでの注文をもとに作成）
 *
 * - ブデホル吸入粉末剤 30吸入 … 東邦薬品
 * - フルチカゾンフランカルボン酸エステル点鼻液 56噴霧 … 東邦薬品（1箱5本入）
 * - ゲンタマイシン軟膏 … 東邦薬品（品薄のためメーカーは在庫のある方）
 *
 * あわせて、最近スズケンに注文している備品の発注先を東邦→スズケンに直す。
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
  { name: "ブデホル吸入粉末剤", dosage: "30吸入", unit: "本数", threshold: 1, orderable: 1, supplier: "toho" },
  { name: "フルチカゾンフランカルボン酸エステル点鼻液", dosage: "56噴霧", unit: "本数", threshold: 1, orderable: 1, supplier: "toho" },
  { name: "ゲンタマイシン軟膏", dosage: "0.1%", unit: "本数", threshold: 1, orderable: 1, supplier: "toho" },
];

// category_id=2（備品）でスズケンに発注先を直すもの
const suzukenSupplies = ["尿カップ", "消毒綿", "注射針：18G", "止血用の絆創膏"];

async function migrate() {
  console.log("医薬品の品目を追加します...");

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

  console.log("備品の発注先をスズケンに直します...");
  for (const name of suzukenSupplies) {
    const res = await db.execute({
      sql: `UPDATE inventory_items SET supplier = 'suzuken' WHERE category_id = 2 AND name = ?`,
      args: [name],
    });
    console.log(`${res.rowsAffected > 0 ? "✓" : "- 見つからない:"} ${name}`);
  }
}

migrate().then(() => {
  console.log("完了");
  process.exit(0);
});
