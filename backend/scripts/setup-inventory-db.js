// 在庫管理データベースのセットアップスクリプト
// Usage: TURSO_URL=... TURSO_AUTH_TOKEN=... node scripts/setup-inventory-db.js

import { createClient } from "@libsql/client";

const db = createClient({
  url: process.env.TURSO_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

const statements = [
  // カテゴリ（医薬品 / 備品）
  `CREATE TABLE IF NOT EXISTS inventory_categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  // 品目マスタ
  `CREATE TABLE IF NOT EXISTS inventory_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL REFERENCES inventory_categories(id),
    name TEXT NOT NULL,
    dosage TEXT,
    unit TEXT NOT NULL DEFAULT '箱数',
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  // 月次在庫チェックシート（日別記録）
  `CREATE TABLE IF NOT EXISTS inventory_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL REFERENCES inventory_items(id),
    date TEXT NOT NULL,
    quantity REAL,
    recorded_by TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(item_id, date)
  )`,

  // 使用期限管理
  `CREATE TABLE IF NOT EXISTS inventory_expiry (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL REFERENCES inventory_items(id),
    expiry_date TEXT NOT NULL,
    lot_number TEXT,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  // 発注シート
  `CREATE TABLE IF NOT EXISTS inventory_orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    item_id INTEGER NOT NULL REFERENCES inventory_items(id),
    quantity REAL NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'ordered', 'delivered', 'cancelled')),
    ordered_by TEXT,
    ordered_at TEXT,
    delivered_at TEXT,
    note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`,

  // インデックス
  `CREATE INDEX IF NOT EXISTS idx_inventory_records_item_id ON inventory_records(item_id)`,
  `CREATE INDEX IF NOT EXISTS idx_inventory_records_date ON inventory_records(date)`,
  `CREATE INDEX IF NOT EXISTS idx_inventory_expiry_item_id ON inventory_expiry(item_id)`,
  `CREATE INDEX IF NOT EXISTS idx_inventory_orders_item_id ON inventory_orders(item_id)`,
  `CREATE INDEX IF NOT EXISTS idx_inventory_orders_status ON inventory_orders(status)`,

  // 初期カテゴリ
  `INSERT OR IGNORE INTO inventory_categories (name, sort_order) VALUES ('医薬品', 1)`,
  `INSERT OR IGNORE INTO inventory_categories (name, sort_order) VALUES ('備品', 2)`,

  // 初期医薬品データ（スプレッドシートから）
  `INSERT OR IGNORE INTO inventory_items (category_id, name, dosage, unit, sort_order) VALUES
    (1, 'アセトアミノフェン錠', '300mg', '箱数', 1),
    (1, 'アセトアミノフェン錠', '500mg', '箱数', 2),
    (1, 'ロキソプロフェン錠', '60mg', '箱数', 3),
    (1, 'カルボシステイン錠', '500mg', '箱数', 3),
    (1, 'モンテルカスト', '10mg', '箱数', 4),
    (1, 'トラネキサム酸', '250mg', '箱数', 5),
    (1, 'デキストロメトルファン', '15mg', '箱数', 6),
    (1, 'コデインリン酸塩錠', '5mg', '箱数', 7),
    (1, 'ドンペリドン錠', '10mg', '箱数', 8),
    (1, 'ビラノアOD', '20mg', '箱数', 9),
    (1, 'ビラスチン', '20mg', '箱数', 10),
    (1, 'ファモチジンOD', '20mg', '箱数', 11),
    (1, 'ブスコパン錠', '10mg', '箱数', 12),
    (1, 'エソメプラゾールカプセル', '20mg', '箱数', 13),
    (1, 'セファレキシン錠', '250mg', '箱数', 14),
    (1, 'サワシリンカプセル', '250mg', '箱数', 15),
    (1, 'オーグメンチン配合錠', '250rs', '箱数', 16),
    (1, 'レボフロキサシン', '500mg', '箱数', 17),
    (1, 'オセルタミビル', '75mg', '箱数', 18),
    (1, 'ミヤBM', '-', '箱数', 19),
    (1, 'シダキュア', '2000JAU', '箱数', 20),
    (1, 'ミティキュア', '3300JAU', '箱数', 21),
    (1, 'SPトローチ', '0.25mg', '箱数', 22),
    (1, 'レボノルゲストレル錠', '1.5mg', 'x60錠', 23),
    (1, 'セフトリアキソンNa静注用', '1g', 'バイアル', 24)`,

  // 初期備品データ
  `INSERT OR IGNORE INTO inventory_items (category_id, name, dosage, unit, sort_order) VALUES
    (2, '輸液ライン', NULL, '個数', 1),
    (2, '翼状針22G', NULL, '個数', 2),
    (2, '翼状針23G', NULL, '個数', 3),
    (2, '輸液：ラクテック', NULL, '個数', 4),
    (2, '輸液：生理食塩水', NULL, '個数', 5),
    (2, '輸液：１号液', NULL, '個数', 6),
    (2, '輸液：３号液', NULL, '個数', 7),
    (2, '輸液固定フィルム', NULL, '個数', 8),
    (2, '消毒綿', NULL, '個数', 9),
    (2, '優肌絆', NULL, '個数', 10),
    (2, 'シリンジ：10ml', NULL, '個数', 11),
    (2, 'シリンジ：1ml', NULL, '個数', 12),
    (2, '注射針：18G', NULL, '個数', 13),
    (2, '注射針：22G', NULL, '個数', 14),
    (2, '採血管：血算', NULL, '個数', 15),
    (2, '採血管：生化', NULL, '個数', 16),
    (2, '採血管：凝固', NULL, '個数', 17),
    (2, '尿スピッツ', NULL, '個数', 18),
    (2, '尿スピッツ（クラミジア・淋菌）', NULL, '個数', 19),
    (2, '便培養', NULL, '個数', 20),
    (2, '痰培養', NULL, '個数', 21),
    (2, '便潜血', NULL, '個数', 22),
    (2, '止血用の絆創膏', NULL, '個数', 23),
    (2, '手袋：S', NULL, '個数', 24),
    (2, '手袋：M', NULL, '個数', 25),
    (2, 'サージカルマスク', NULL, '個数', 26),
    (2, '診察台用シーツ', NULL, '個数', 27),
    (2, 'ペーパーシーツ', NULL, '個数', 28),
    (2, '舌圧子', NULL, '個数', 29),
    (2, '耳鏡', NULL, '個数', 30),
    (2, '不織布ガーゼ', NULL, '個数', 31),
    (2, '医療廃棄物：針ボックス', NULL, '個数', 32),
    (2, '医療廃棄物：感染性廃棄物箱', NULL, '個数', 33),
    (2, '迅速検査キット：flu/cov', NULL, '個数', 34),
    (2, '迅速検査キット：strep', NULL, '個数', 35),
    (2, '尿カップ', NULL, '個数', 36),
    (2, '尿検査用試験紙', NULL, '個数', 37),
    (2, '血糖測定用チップ・針', NULL, '個数', 38),
    (2, 'OS-1', NULL, '個数', 39)`,
];

async function setup() {
  console.log("在庫管理データベースのセットアップを開始...");

  for (const sql of statements) {
    try {
      await db.execute(sql);
      console.log("✓", sql.substring(0, 60).replace(/\n/g, " ") + "...");
    } catch (err) {
      console.error("✗ エラー:", err.message);
      console.error("  SQL:", sql.substring(0, 100));
    }
  }

  console.log("\nセットアップ完了!");
}

setup().catch(console.error);
