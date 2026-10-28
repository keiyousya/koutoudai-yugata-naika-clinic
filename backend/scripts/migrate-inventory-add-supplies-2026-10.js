#!/usr/bin/env node

/**
 * 2026年10月に備品（category_id=2）を在庫管理の品目に追加するマイグレーション
 *
 * 関連する品目のすぐ後ろに並ぶように、after に指定した品目の次へ差し込む
 * （後ろの品目の sort_order を1つずつずらす）。after が無ければ末尾に足す。
 *
 * 依頼のうち、シリンジ1ml・アルコール綿（消毒綿）・尿カップ・マスク（サージカルマスク）・
 * シュアホルダ・点滴保護フィルム（輸液固定フィルム）は既に登録済みのため追加しない。
 * 単位と定数（規定量 order_threshold）は品目ごとに指定。定数なしの品目は 0（発注に載らない）。
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

const items = [
  { name: "サーフロ：22G", dosage: "", unit: "箱数", threshold: 1, after: "翼状針23G" },
  { name: "消毒綿（大箱）", dosage: "100枚", unit: "箱数", threshold: 1, after: "消毒綿" },
  { name: "注射針：27G", dosage: "", unit: "箱数", threshold: 1, after: "注射針：22G" },
  { name: "膿盆", dosage: "", unit: "個数", threshold: 0, after: "医療廃棄物：感染性廃棄物箱" },
  { name: "感染ゴミ用の小袋", dosage: "", unit: "束数", threshold: 3, after: "膿盆" },
  { name: "紙コップ（内服用）", dosage: "", unit: "個数", threshold: 0, after: "尿カップ" },
  { name: "薬袋：定期", dosage: "", unit: "束数", threshold: 1, after: null },
  { name: "薬袋：頓用", dosage: "", unit: "束数", threshold: 1, after: null },
  { name: "手提げ袋（薬渡し用）", dosage: "", unit: "束数", threshold: 1, after: null },
  { name: "コピー用紙", dosage: "", unit: "個数", threshold: 0, after: null },
];

async function migrate() {
  console.log("備品の品目を追加します...");

  for (const item of items) {
    const existing = await db.execute({
      sql: `SELECT id FROM inventory_items WHERE category_id = 2 AND name = ? AND COALESCE(dosage, '') = ?`,
      args: [item.name, item.dosage],
    });
    if (existing.rows.length > 0) {
      console.log(`- 既に存在するためスキップ: ${item.name} ${item.dosage}`);
      continue;
    }

    let sortOrder;
    const anchor = item.after
      ? await db.execute({
          sql: `SELECT sort_order FROM inventory_items WHERE category_id = 2 AND name = ? ORDER BY sort_order DESC LIMIT 1`,
          args: [item.after],
        })
      : null;
    if (anchor && anchor.rows.length > 0) {
      sortOrder = Number(anchor.rows[0].sort_order) + 1;
      await db.execute({
        sql: `UPDATE inventory_items SET sort_order = sort_order + 1 WHERE category_id = 2 AND sort_order >= ?`,
        args: [sortOrder],
      });
    } else {
      const max = await db.execute(
        `SELECT COALESCE(MAX(sort_order), 0) AS max FROM inventory_items WHERE category_id = 2`
      );
      sortOrder = Number(max.rows[0].max) + 1;
    }

    await db.execute({
      sql: `INSERT INTO inventory_items
              (category_id, name, dosage, unit, sort_order, order_threshold, is_orderable, supplier)
            VALUES (2, ?, ?, ?, ?, ?, 0, 'toho')`,
      args: [item.name, item.dosage || null, item.unit, sortOrder, item.threshold],
    });
    console.log(`✓ ${item.name} ${item.dosage}`);
  }

  const result = await db.execute(
    `SELECT COUNT(*) AS count FROM inventory_items WHERE category_id = 2 AND is_active = 1`
  );
  console.log(`  備品: ${result.rows[0].count}品目`);
}

migrate().then(() => {
  console.log("完了");
  process.exit(0);
});
