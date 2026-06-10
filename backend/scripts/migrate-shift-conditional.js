#!/usr/bin/env node

/**
 * shift_requests テーブルを更新するマイグレーション
 * - availability に 'conditional' を追加
 * - UNIQUE 制約を (staff_id, date) から (staff_id, date, slot) に変更
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
  console.log("=== shift_requests テーブルの更新 ===\n");

  try {
    // 現在のテーブル構造を確認
    console.log("1. 現在のテーブル構造を確認...");
    const tableInfo = await db.execute(`PRAGMA table_info(shift_requests)`);
    console.log("   現在のカラム:", tableInfo.rows.map((r) => r.name).join(", "));

    // 既存データをバックアップ
    console.log("\n2. 既存データをバックアップ...");
    const existingData = await db.execute(`SELECT * FROM shift_requests`);
    console.log(`   ${existingData.rows.length} 件のデータ`);

    // 新しいテーブルを作成
    console.log("\n3. 新しいテーブルを作成...");
    await db.execute(`
      CREATE TABLE IF NOT EXISTS shift_requests_new (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        staff_id INTEGER NOT NULL REFERENCES shift_staff(id),
        date TEXT NOT NULL,
        slot TEXT NOT NULL DEFAULT 'evening' CHECK(slot IN ('day', 'evening')),
        availability TEXT NOT NULL CHECK(availability IN ('available', 'conditional', 'unavailable')),
        note TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now')),
        UNIQUE (staff_id, date, slot)
      )
    `);
    console.log("   ✓ shift_requests_new テーブル作成完了");

    // データを移行
    console.log("\n4. データを移行...");
    if (existingData.rows.length > 0) {
      // slot カラムが存在するかチェック
      const hasSlot = tableInfo.rows.some((r) => r.name === "slot");

      if (hasSlot) {
        await db.execute(`
          INSERT INTO shift_requests_new (id, staff_id, date, slot, availability, note, created_at, updated_at)
          SELECT id, staff_id, date, COALESCE(slot, 'evening'), availability, note, created_at, updated_at
          FROM shift_requests
        `);
      } else {
        await db.execute(`
          INSERT INTO shift_requests_new (id, staff_id, date, slot, availability, note, created_at, updated_at)
          SELECT id, staff_id, date, 'evening', availability, note, created_at, updated_at
          FROM shift_requests
        `);
      }
      console.log(`   ✓ ${existingData.rows.length} 件のデータを移行完了`);
    } else {
      console.log("   移行するデータなし");
    }

    // 古いテーブルを削除
    console.log("\n5. 古いテーブルを削除...");
    await db.execute(`DROP TABLE shift_requests`);
    console.log("   ✓ shift_requests テーブル削除完了");

    // 新しいテーブルをリネーム
    console.log("\n6. 新しいテーブルをリネーム...");
    await db.execute(`ALTER TABLE shift_requests_new RENAME TO shift_requests`);
    console.log("   ✓ shift_requests_new → shift_requests リネーム完了");

    // インデックスを再作成
    console.log("\n7. インデックスを再作成...");
    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_shift_requests_date ON shift_requests(date)
    `);
    await db.execute(`
      CREATE INDEX IF NOT EXISTS idx_shift_requests_staff ON shift_requests(staff_id)
    `);
    console.log("   ✓ インデックス作成完了");

    // 最終確認
    console.log("\n8. 最終確認...");
    const newTableInfo = await db.execute(`PRAGMA table_info(shift_requests)`);
    console.log("   更新後のカラム:", newTableInfo.rows.map((r) => r.name).join(", "));

    const dataCount = await db.execute(`SELECT COUNT(*) as count FROM shift_requests`);
    console.log(`   データ件数: ${dataCount.rows[0].count}`);

    // shift_assignments テーブルの更新
    console.log("\n=== shift_assignments テーブルの更新 ===\n");

    // 現在のテーブル構造を確認
    console.log("9. shift_assignments テーブル構造を確認...");
    const assignTableInfo = await db.execute(`PRAGMA table_info(shift_assignments)`);
    const hasAssignSlot = assignTableInfo.rows.some((r) => r.name === "slot");
    console.log("   現在のカラム:", assignTableInfo.rows.map((r) => r.name).join(", "));

    if (!hasAssignSlot) {
      console.log("   slot カラムが存在しません。テーブルを再作成します...");

      // 既存データをバックアップ
      console.log("\n10. shift_assignments データをバックアップ...");
      const existingAssignData = await db.execute(`SELECT * FROM shift_assignments`);
      console.log(`   ${existingAssignData.rows.length} 件のデータ`);

      // 新しいテーブルを作成
      console.log("\n11. 新しい shift_assignments テーブルを作成...");
      await db.execute(`
        CREATE TABLE IF NOT EXISTS shift_assignments_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          date TEXT NOT NULL,
          slot TEXT NOT NULL DEFAULT 'evening' CHECK(slot IN ('day', 'evening')),
          role TEXT NOT NULL CHECK(role IN ('nurse', 'clerk')),
          staff_id INTEGER NOT NULL REFERENCES shift_staff(id),
          created_at TEXT NOT NULL DEFAULT (datetime('now')),
          updated_at TEXT NOT NULL DEFAULT (datetime('now')),
          UNIQUE (date, slot, role)
        )
      `);
      console.log("   ✓ shift_assignments_new テーブル作成完了");

      // データを移行（既存データは evening スロットとして扱う）
      console.log("\n12. shift_assignments データを移行...");
      if (existingAssignData.rows.length > 0) {
        await db.execute(`
          INSERT INTO shift_assignments_new (id, date, slot, role, staff_id, created_at, updated_at)
          SELECT id, date, 'evening', role, staff_id, created_at, updated_at
          FROM shift_assignments
        `);
        console.log(`   ✓ ${existingAssignData.rows.length} 件のデータを移行完了`);
      } else {
        console.log("   移行するデータなし");
      }

      // 古いテーブルを削除
      console.log("\n13. 古い shift_assignments テーブルを削除...");
      await db.execute(`DROP TABLE shift_assignments`);
      console.log("   ✓ shift_assignments テーブル削除完了");

      // 新しいテーブルをリネーム
      console.log("\n14. 新しいテーブルをリネーム...");
      await db.execute(`ALTER TABLE shift_assignments_new RENAME TO shift_assignments`);
      console.log("   ✓ shift_assignments_new → shift_assignments リネーム完了");

      // インデックスを再作成
      console.log("\n15. インデックスを再作成...");
      await db.execute(`
        CREATE INDEX IF NOT EXISTS idx_shift_assignments_date ON shift_assignments(date)
      `);
      console.log("   ✓ インデックス作成完了");
    } else {
      console.log("   slot カラムは既に存在します。スキップします。");
    }

    console.log("\n=== マイグレーション完了 ===");
  } catch (error) {
    console.error("\nマイグレーション失敗:", error);
    process.exit(1);
  }
}

migrate().then(() => {
  console.log("Done");
  process.exit(0);
});
