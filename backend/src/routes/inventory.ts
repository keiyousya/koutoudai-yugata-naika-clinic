import { Hono } from "hono";
import { createClient } from "@libsql/client";
import { z } from "zod";

type Bindings = {
  TURSO_URL: string;
  TURSO_AUTH_TOKEN: string;
  ADMIN_API_KEY: string;
};

const inventory = new Hono<{ Bindings: Bindings }>();

function getDb(env: Bindings) {
  return createClient({
    url: env.TURSO_URL,
    authToken: env.TURSO_AUTH_TOKEN,
  });
}

// 管理者認証ミドルウェア
const adminAuth = async (c: any, next: any) => {
  const apiKey = c.req.header("X-Admin-API-Key");
  const validApiKey = c.env.ADMIN_API_KEY;
  if (!validApiKey) return next();
  if (!apiKey || apiKey !== validApiKey) {
    return c.json({ error: "認証に失敗しました" }, 401);
  }
  return next();
};

// ========================================
// カテゴリ
// ========================================

// カテゴリ一覧
inventory.get("/categories", async (c) => {
  const db = getDb(c.env);
  const result = await db.execute(
    "SELECT * FROM inventory_categories ORDER BY sort_order"
  );
  return c.json(result.rows);
});

// ========================================
// 品目マスタ
// ========================================

// 品目一覧（カテゴリ別）
inventory.get("/items", async (c) => {
  const db = getDb(c.env);
  const categoryId = c.req.query("category_id");

  let sql =
    "SELECT i.*, c.name as category_name FROM inventory_items i JOIN inventory_categories c ON i.category_id = c.id WHERE i.is_active = 1";
  const args: any[] = [];

  if (categoryId) {
    sql += " AND i.category_id = ?";
    args.push(categoryId);
  }

  sql += " ORDER BY c.sort_order, i.sort_order";

  const result = await db.execute({ sql, args });
  return c.json(result.rows);
});

// 品目追加
const createItemSchema = z.object({
  category_id: z.number().int().positive(),
  name: z.string().min(1, "品名は必須です"),
  dosage: z.string().nullable().optional(),
  unit: z.string().default("箱数"),
  sort_order: z.number().int().default(0),
});

inventory.post("/items", adminAuth, async (c) => {
  const db = getDb(c.env);
  const body = await c.req.json();
  const parsed = createItemSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: parsed.error.issues[0].message },
      400
    );
  }

  const { category_id, name, dosage, unit, sort_order } = parsed.data;

  const result = await db.execute({
    sql: `INSERT INTO inventory_items (category_id, name, dosage, unit, sort_order)
          VALUES (?, ?, ?, ?, ?)`,
    args: [category_id, name, dosage || null, unit, sort_order],
  });

  return c.json(
    { success: true, id: Number(result.lastInsertRowid) },
    201
  );
});

// 品目更新
inventory.put("/items/:id", adminAuth, async (c) => {
  const db = getDb(c.env);
  const id = c.req.param("id");
  const body = await c.req.json();

  const updateItemSchema = z.object({
    name: z.string().min(1).optional(),
    dosage: z.string().nullable().optional(),
    unit: z.string().optional(),
    sort_order: z.number().int().optional(),
    is_active: z.number().int().min(0).max(1).optional(),
  });

  const parsed = updateItemSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: parsed.error.issues[0].message },
      400
    );
  }

  const fields: string[] = [];
  const args: any[] = [];

  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) {
      fields.push(`${key} = ?`);
      args.push(value);
    }
  }

  if (fields.length === 0) {
    return c.json({ error: "更新するフィールドがありません" }, 400);
  }

  fields.push("updated_at = datetime('now')");
  args.push(id);

  await db.execute({
    sql: `UPDATE inventory_items SET ${fields.join(", ")} WHERE id = ?`,
    args,
  });

  return c.json({ success: true });
});

// ========================================
// 在庫記録（日別チェックシート）
// ========================================

// 月別在庫記録取得
inventory.get("/records", async (c) => {
  const db = getDb(c.env);
  const month = c.req.query("month"); // YYYY-MM
  const categoryId = c.req.query("category_id");

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return c.json({ error: "monthパラメータ（YYYY-MM形式）は必須です" }, 400);
  }

  let sql = `
    SELECT r.*, i.name as item_name, i.dosage, i.unit, i.sort_order as item_sort_order,
           c.name as category_name, c.sort_order as category_sort_order
    FROM inventory_records r
    JOIN inventory_items i ON r.item_id = i.id
    JOIN inventory_categories c ON i.category_id = c.id
    WHERE r.date LIKE ? AND i.is_active = 1
  `;
  const args: any[] = [`${month}-%`];

  if (categoryId) {
    sql += " AND i.category_id = ?";
    args.push(categoryId);
  }

  sql += " ORDER BY c.sort_order, i.sort_order, r.date";

  const result = await db.execute({ sql, args });
  return c.json(result.rows);
});

// 在庫記録の一括保存（日別）
const saveRecordsSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日付はYYYY-MM-DD形式"),
  records: z.array(
    z.object({
      item_id: z.number().int().positive(),
      quantity: z.number().nullable(),
    })
  ),
  recorded_by: z.string().optional(),
});

inventory.post("/records", async (c) => {
  const db = getDb(c.env);
  const body = await c.req.json();
  const parsed = saveRecordsSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: parsed.error.issues[0].message },
      400
    );
  }

  const { date, records, recorded_by } = parsed.data;

  for (const record of records) {
    await db.execute({
      sql: `INSERT INTO inventory_records (item_id, date, quantity, recorded_by)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(item_id, date) DO UPDATE SET
              quantity = excluded.quantity,
              recorded_by = excluded.recorded_by,
              updated_at = datetime('now')`,
      args: [record.item_id, date, record.quantity, recorded_by || null],
    });
  }

  return c.json({ success: true, count: records.length });
});

// 単一在庫記録の更新
inventory.put("/records/:itemId/:date", async (c) => {
  const db = getDb(c.env);
  const itemId = c.req.param("itemId");
  const date = c.req.param("date");
  const body = await c.req.json();

  const { quantity, recorded_by } = body;

  await db.execute({
    sql: `INSERT INTO inventory_records (item_id, date, quantity, recorded_by)
          VALUES (?, ?, ?, ?)
          ON CONFLICT(item_id, date) DO UPDATE SET
            quantity = excluded.quantity,
            recorded_by = excluded.recorded_by,
            updated_at = datetime('now')`,
    args: [itemId, date, quantity, recorded_by || null],
  });

  return c.json({ success: true });
});

// ========================================
// 使用期限管理
// ========================================

// 使用期限一覧
inventory.get("/expiry", async (c) => {
  const db = getDb(c.env);
  const itemId = c.req.query("item_id");

  let sql = `
    SELECT e.*, i.name as item_name, i.dosage
    FROM inventory_expiry e
    JOIN inventory_items i ON e.item_id = i.id
    WHERE i.is_active = 1
  `;
  const args: any[] = [];

  if (itemId) {
    sql += " AND e.item_id = ?";
    args.push(itemId);
  }

  sql += " ORDER BY e.expiry_date ASC";

  const result = await db.execute({ sql, args });
  return c.json(result.rows);
});

// 使用期限の登録・更新
const expirySchema = z.object({
  item_id: z.number().int().positive(),
  expiry_date: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/, "期限はYYYY-MMまたはYYYY-MM-DD形式"),
  lot_number: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
});

inventory.post("/expiry", async (c) => {
  const db = getDb(c.env);
  const body = await c.req.json();
  const parsed = expirySchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: parsed.error.issues[0].message },
      400
    );
  }

  const { item_id, expiry_date, lot_number, note } = parsed.data;

  const result = await db.execute({
    sql: `INSERT INTO inventory_expiry (item_id, expiry_date, lot_number, note)
          VALUES (?, ?, ?, ?)`,
    args: [item_id, expiry_date, lot_number || null, note || null],
  });

  return c.json(
    { success: true, id: Number(result.lastInsertRowid) },
    201
  );
});

inventory.put("/expiry/:id", async (c) => {
  const db = getDb(c.env);
  const id = c.req.param("id");
  const body = await c.req.json();
  const parsed = expirySchema.partial().safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: parsed.error.issues[0].message },
      400
    );
  }

  const fields: string[] = [];
  const args: any[] = [];

  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) {
      fields.push(`${key} = ?`);
      args.push(value);
    }
  }

  if (fields.length === 0) {
    return c.json({ error: "更新するフィールドがありません" }, 400);
  }

  fields.push("updated_at = datetime('now')");
  args.push(id);

  await db.execute({
    sql: `UPDATE inventory_expiry SET ${fields.join(", ")} WHERE id = ?`,
    args,
  });

  return c.json({ success: true });
});

inventory.delete("/expiry/:id", adminAuth, async (c) => {
  const db = getDb(c.env);
  const id = c.req.param("id");

  await db.execute({
    sql: "DELETE FROM inventory_expiry WHERE id = ?",
    args: [id],
  });

  return c.json({ success: true });
});

// ========================================
// 発注管理
// ========================================

// 発注一覧
inventory.get("/orders", async (c) => {
  const db = getDb(c.env);
  const status = c.req.query("status");

  let sql = `
    SELECT o.*, i.name as item_name, i.dosage, i.unit
    FROM inventory_orders o
    JOIN inventory_items i ON o.item_id = i.id
  `;
  const args: any[] = [];

  if (status) {
    sql += " WHERE o.status = ?";
    args.push(status);
  }

  sql += " ORDER BY o.created_at DESC";

  const result = await db.execute({ sql, args });
  return c.json(result.rows);
});

// 発注作成
const createOrderSchema = z.object({
  item_id: z.number().int().positive(),
  quantity: z.number().positive("数量は1以上"),
  ordered_by: z.string().optional(),
  note: z.string().nullable().optional(),
});

inventory.post("/orders", async (c) => {
  const db = getDb(c.env);
  const body = await c.req.json();
  const parsed = createOrderSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: parsed.error.issues[0].message },
      400
    );
  }

  const { item_id, quantity, ordered_by, note } = parsed.data;

  const result = await db.execute({
    sql: `INSERT INTO inventory_orders (item_id, quantity, ordered_by, note)
          VALUES (?, ?, ?, ?)`,
    args: [item_id, quantity, ordered_by || null, note || null],
  });

  return c.json(
    { success: true, id: Number(result.lastInsertRowid) },
    201
  );
});

// 発注ステータス更新
const updateOrderSchema = z.object({
  status: z.enum(["pending", "ordered", "delivered", "cancelled"]),
  note: z.string().nullable().optional(),
});

inventory.put("/orders/:id", async (c) => {
  const db = getDb(c.env);
  const id = c.req.param("id");
  const body = await c.req.json();
  const parsed = updateOrderSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: parsed.error.issues[0].message },
      400
    );
  }

  const { status, note } = parsed.data;
  const now = "datetime('now')";

  let extraFields = "";
  if (status === "ordered") {
    extraFields = ", ordered_at = datetime('now')";
  } else if (status === "delivered") {
    extraFields = ", delivered_at = datetime('now')";
  }

  const args: any[] = [status];
  if (note !== undefined) {
    extraFields += ", note = ?";
    args.push(note);
  }
  args.push(id);

  await db.execute({
    sql: `UPDATE inventory_orders SET status = ?, updated_at = datetime('now')${extraFields} WHERE id = ?`,
    args,
  });

  return c.json({ success: true });
});

inventory.delete("/orders/:id", adminAuth, async (c) => {
  const db = getDb(c.env);
  const id = c.req.param("id");

  await db.execute({
    sql: "DELETE FROM inventory_orders WHERE id = ?",
    args: [id],
  });

  return c.json({ success: true });
});

export default inventory;
