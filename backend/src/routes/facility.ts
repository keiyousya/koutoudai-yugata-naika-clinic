import { Hono } from "hono";
import { createClient, type Client } from "@libsql/client";
import { z } from "zod";

type Bindings = {
  TURSO_URL: string;
  TURSO_AUTH_TOKEN: string;
  ADMIN_API_KEY: string;
};

type Variables = {
  db: Client;
  staffId?: number;
  staffName?: string;
};

const facility = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// ========================================
// ヘルパー
// ========================================

function getDb(env: Bindings) {
  return createClient({
    url: env.TURSO_URL,
    authToken: env.TURSO_AUTH_TOKEN,
  });
}

async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

// ========================================
// バリデーションスキーマ
// ========================================

const temperatureLogSchema = z.object({
  equipment_name: z.string().min(1, "設備名は必須です").max(100),
  temperature: z.number({ error: "温度は数値で入力してください" }),
  recorded_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日付はYYYY-MM-DD形式で指定してください"),
  recorded_time: z.string().regex(/^\d{2}:\d{2}$/, "時刻はHH:MM形式で指定してください"),
  note: z.string().max(500).optional(),
});

// ========================================
// 認証ミドルウェア
// ========================================

const adminAuth = async (
  c: { req: any; env: Bindings; json: (data: any, status?: number) => Response; set: (key: string, value: any) => void },
  next: () => Promise<void>
) => {
  const apiKey = c.req.header("X-Admin-API-Key");
  const validApiKey = c.env.ADMIN_API_KEY;

  if (!validApiKey) {
    console.warn("警告: ADMIN_API_KEY が設定されていません");
    c.set("db", getDb(c.env));
    return next();
  }

  if (!apiKey || apiKey !== validApiKey) {
    return c.json({ error: "認証に失敗しました" }, 401);
  }

  c.set("db", getDb(c.env));
  return next();
};

const staffAuth = async (
  c: { req: any; env: Bindings; json: (data: any, status?: number) => Response; set: (key: string, value: any) => void; get: (key: string) => any },
  next: () => Promise<void>
) => {
  const staffIdHeader = c.req.header("X-Staff-Id");
  const passcode = c.req.header("X-Staff-Passcode");

  if (!staffIdHeader || !passcode) {
    return c.json({ error: "認証情報が不足しています" }, 401);
  }

  const staffId = parseInt(staffIdHeader, 10);
  if (isNaN(staffId)) {
    return c.json({ error: "無効なスタッフIDです" }, 401);
  }

  const db = getDb(c.env);
  const result = await db.execute({
    sql: "SELECT id, name, passcode_hash FROM facility_staff WHERE id = ? AND is_active = 1",
    args: [staffId],
  });

  if (result.rows.length === 0) {
    return c.json({ error: "スタッフが見つかりません" }, 401);
  }

  const staff = result.rows[0];
  const hash = await sha256(passcode);

  if (hash !== staff.passcode_hash) {
    return c.json({ error: "パスコードが正しくありません" }, 401);
  }

  c.set("db", db);
  c.set("staffId", staff.id);
  c.set("staffName", staff.name);
  return next();
};

// ========================================
// 公開API（認証不要）
// ========================================

// スタッフ一覧（ログイン用）
facility.get("/staff", async (c) => {
  const db = getDb(c.env);
  const result = await db.execute(
    "SELECT id, name FROM facility_staff WHERE is_active = 1 ORDER BY sort_order, id"
  );
  return c.json(result.rows);
});

// ログイン
facility.post("/auth/login", async (c) => {
  const db = getDb(c.env);
  const body = await c.req.json();
  const { staff_id, passcode } = body;

  if (!staff_id || !passcode) {
    return c.json({ error: "スタッフIDとパスコードは必須です" }, 400);
  }

  const result = await db.execute({
    sql: "SELECT id, name, passcode_hash FROM facility_staff WHERE id = ? AND is_active = 1",
    args: [staff_id],
  });

  if (result.rows.length === 0) {
    return c.json({ error: "スタッフが見つかりません" }, 401);
  }

  const staff = result.rows[0];
  const hash = await sha256(passcode);

  if (hash !== staff.passcode_hash) {
    return c.json({ error: "パスコードが正しくありません" }, 401);
  }

  return c.json({
    success: true,
    staff: { id: staff.id, name: staff.name },
  });
});

// ========================================
// スタッフ認証API
// ========================================

// 温度記録の登録
facility.post("/temperature-logs", staffAuth, async (c) => {
  const db = c.get("db");
  const staffId = c.get("staffId");
  const body = await c.req.json();

  const parseResult = temperatureLogSchema.safeParse(body);
  if (!parseResult.success) {
    const messages = parseResult.error.issues.map((issue) => issue.message).join(", ");
    return c.json({ error: messages }, 400);
  }

  const { equipment_name, temperature, recorded_date, recorded_time, note } = parseResult.data;

  const result = await db.execute({
    sql: `INSERT INTO facility_temperature_logs (staff_id, equipment_name, temperature, recorded_date, recorded_time, note, created_at)
          VALUES (?, ?, ?, ?, ?, ?, datetime('now'))`,
    args: [staffId, equipment_name, temperature, recorded_date, recorded_time, note || null],
  });

  return c.json({ success: true, id: Number(result.lastInsertRowid) }, 201);
});

// 温度記録の取得（月別）
facility.get("/temperature-logs", staffAuth, async (c) => {
  const db = c.get("db");
  const month = c.req.query("month");

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return c.json({ error: "month パラメータ (YYYY-MM) が必要です" }, 400);
  }

  const result = await db.execute({
    sql: `SELECT l.id, l.staff_id, s.name as staff_name, l.equipment_name, l.temperature,
                 l.recorded_date, l.recorded_time, l.note, l.created_at
          FROM facility_temperature_logs l
          JOIN facility_staff s ON l.staff_id = s.id
          WHERE l.recorded_date LIKE ?
          ORDER BY l.recorded_date DESC, l.recorded_time DESC`,
    args: [`${month}-%`],
  });

  return c.json({ month, logs: result.rows });
});

// 温度記録の削除
facility.delete("/temperature-logs/:id", staffAuth, async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");

  if (!/^\d+$/.test(id)) {
    return c.json({ error: "無効なIDです" }, 400);
  }

  const existing = await db.execute({
    sql: "SELECT id FROM facility_temperature_logs WHERE id = ?",
    args: [id],
  });

  if (existing.rows.length === 0) {
    return c.json({ error: "記録が見つかりません" }, 404);
  }

  await db.execute({
    sql: "DELETE FROM facility_temperature_logs WHERE id = ?",
    args: [id],
  });

  return c.json({ success: true });
});

// ========================================
// 管理者API
// ========================================

// スタッフ一覧（管理用・全件）
facility.get("/admin/staff", adminAuth, async (c) => {
  const db = c.get("db");
  const result = await db.execute(
    "SELECT id, name, is_active, sort_order, created_at FROM facility_staff ORDER BY sort_order, id"
  );
  return c.json(result.rows);
});

// スタッフ登録
facility.post("/admin/staff", adminAuth, async (c) => {
  const db = c.get("db");
  const body = await c.req.json();
  const { name, passcode, sort_order } = body;

  if (!name || !passcode) {
    return c.json({ error: "名前とパスコードは必須です" }, 400);
  }

  if (!/^\d{4}$/.test(passcode)) {
    return c.json({ error: "パスコードは4桁の数字です" }, 400);
  }

  const hash = await sha256(passcode);
  const result = await db.execute({
    sql: `INSERT INTO facility_staff (name, passcode_hash, sort_order, created_at, updated_at)
          VALUES (?, ?, ?, datetime('now'), datetime('now'))`,
    args: [name, hash, sort_order ?? 0],
  });

  return c.json({ success: true, id: Number(result.lastInsertRowid) }, 201);
});

// スタッフ更新
facility.put("/admin/staff/:id", adminAuth, async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");
  const body = await c.req.json();

  const updates: string[] = [];
  const args: any[] = [];

  if (body.name !== undefined) {
    updates.push("name = ?");
    args.push(body.name);
  }
  if (body.passcode !== undefined) {
    if (!/^\d{4}$/.test(body.passcode)) {
      return c.json({ error: "パスコードは4桁の数字です" }, 400);
    }
    updates.push("passcode_hash = ?");
    args.push(await sha256(body.passcode));
  }
  if (body.is_active !== undefined) {
    updates.push("is_active = ?");
    args.push(body.is_active ? 1 : 0);
  }
  if (body.sort_order !== undefined) {
    updates.push("sort_order = ?");
    args.push(body.sort_order);
  }

  if (updates.length === 0) {
    return c.json({ error: "更新する項目がありません" }, 400);
  }

  updates.push("updated_at = datetime('now')");
  args.push(id);

  await db.execute({
    sql: `UPDATE facility_staff SET ${updates.join(", ")} WHERE id = ?`,
    args,
  });

  return c.json({ success: true });
});

export default facility;
