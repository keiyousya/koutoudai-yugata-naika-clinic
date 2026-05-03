import { Hono } from "hono";
import { createClient, type Client } from "@libsql/client";
import { z } from "zod";
import { isHoliday } from "@holiday-jp/holiday_jp";

type Bindings = {
  TURSO_URL: string;
  TURSO_AUTH_TOKEN: string;
  ADMIN_API_KEY: string;
};

type Variables = {
  db: Client;
  staffId?: number;
  staffName?: string;
  staffRole?: string;
};

const shift = new Hono<{ Bindings: Bindings; Variables: Variables }>();

// ========================================
// ヘルパー
// ========================================

function getDb(env: Bindings) {
  return createClient({
    url: env.TURSO_URL,
    authToken: env.TURSO_AUTH_TOKEN,
  });
}

/**
 * SHA-256 ハッシュ計算（Workers 標準の crypto.subtle 利用）
 */
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

const staffCreateSchema = z.object({
  name: z.string().min(1, "名前は必須です").max(50, "名前は50文字以内です"),
  role: z.enum(["nurse", "clerk"], { error: "職種は nurse または clerk を指定してください" }),
  passcode: z.string().regex(/^\d{4}$/, "パスコードは4桁の数字です"),
  sort_order: z.number().int().min(0).optional().default(0),
});

const staffUpdateSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  role: z.enum(["nurse", "clerk"]).optional(),
  passcode: z.string().regex(/^\d{4}$/, "パスコードは4桁の数字です").optional(),
  sort_order: z.number().int().min(0).optional(),
  is_active: z.boolean().optional(),
});

const calendarOverrideSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日付はYYYY-MM-DD形式で指定してください"),
  is_open: z.boolean(),
  note: z.string().max(200).optional(),
});

const requestItemSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日付はYYYY-MM-DD形式で指定してください"),
  availability: z.enum(["available", "unavailable"], { error: "availability は available または unavailable を指定してください" }),
  note: z.string().max(200).optional(),
});

const requestsUpdateSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, "month は YYYY-MM 形式で指定してください"),
  items: z.array(requestItemSchema),
});

const assignmentItemSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日付はYYYY-MM-DD形式で指定してください"),
  role: z.enum(["nurse", "clerk"], { error: "role は nurse または clerk を指定してください" }),
  staff_id: z.number().int().positive("staff_id は正の整数を指定してください"),
});

const assignmentsUpdateSchema = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, "month は YYYY-MM 形式で指定してください"),
  assignments: z.array(assignmentItemSchema),
});

// ========================================
// カレンダーヘルパー
// ========================================

/**
 * 既定の営業日判定
 * - 月・火・日本の祝日は休診
 * - それ以外（水・木・金・土・日）は営業
 */
function isOpenByDefault(date: Date): boolean {
  const day = date.getDay(); // 0=日 ... 6=土
  if (day === 1 || day === 2) return false; // 月・火休診
  if (isHoliday(date)) return false; // 祝日休診
  return true;
}

/**
 * 指定月の全日付を取得
 */
function getDaysInMonth(yearMonth: string): string[] {
  const [year, month] = yearMonth.split("-").map(Number);
  const days: string[] = [];
  const date = new Date(year, month - 1, 1);
  while (date.getMonth() === month - 1) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    days.push(`${y}-${m}-${d}`);
    date.setDate(date.getDate() + 1);
  }
  return days;
}

/**
 * 現在の JST 時刻を取得
 */
function getNowJST(): Date {
  const now = new Date();
  const jstOffset = 9 * 60 * 60 * 1000;
  return new Date(now.getTime() + jstOffset);
}

/**
 * 締切判定
 * - 既定締切: 対象月の前月 1 日 00:00 (Asia/Tokyo)
 * - shift_periods.submission_locked_at が設定されていればその時刻を優先
 */
async function isSubmissionLocked(db: Client, month: string): Promise<boolean> {
  // shift_periods から手動ロック・ロック解除を確認
  const periodResult = await db.execute({
    sql: "SELECT submission_locked_at, submission_unlocked FROM shift_periods WHERE month = ?",
    args: [month],
  });

  if (periodResult.rows.length > 0) {
    const row = periodResult.rows[0];

    // 手動でロック解除されている場合は、既定締切に関係なく提出可能
    if (row.submission_unlocked === 1) {
      return false;
    }

    // 手動ロックが設定されている場合は、強制的にロック
    if (row.submission_locked_at) {
      return true;
    }
  }

  // 既定締切: 対象月の前月 1 日 00:00 (JST)
  const [year, mon] = month.split("-").map(Number);
  const deadlineDate = new Date(year, mon - 2, 1, 0, 0, 0); // 前月1日 UTC
  // JSTとして解釈するため、9時間引く（UTC→JST変換の逆）
  const deadlineJST = new Date(deadlineDate.getTime());

  const nowJST = getNowJST();
  return nowJST >= deadlineJST;
}

// ========================================
// 認証ミドルウェア
// ========================================

/**
 * 管理者認証ミドルウェア
 * X-Admin-API-Key ヘッダで ADMIN_API_KEY を検証
 */
const adminAuth = async (
  c: { req: any; env: Bindings; json: (data: any, status?: number) => Response; set: (key: string, value: any) => void },
  next: () => Promise<void>
) => {
  const apiKey = c.req.header("X-Admin-API-Key");
  const validApiKey = c.env.ADMIN_API_KEY;

  // 開発環境（APIキー未設定）の場合はスキップ
  if (!validApiKey) {
    console.warn("警告: ADMIN_API_KEY が設定されていません。本番環境では必ず設定してください。");
    c.set("db", getDb(c.env));
    return next();
  }

  if (!apiKey || apiKey !== validApiKey) {
    return c.json({ error: "認証に失敗しました" }, 401);
  }

  c.set("db", getDb(c.env));
  return next();
};

/**
 * スタッフ認証ミドルウェア
 * X-Staff-Id + X-Staff-Passcode で DB の passcode_hash と照合
 */
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
  c.set("db", db);

  // スタッフ検索
  const result = await db.execute({
    sql: "SELECT id, name, role, passcode_hash FROM shift_staff WHERE id = ? AND is_active = 1",
    args: [staffId],
  });

  if (result.rows.length === 0) {
    return c.json({ error: "スタッフが見つかりません" }, 401);
  }

  const staff = result.rows[0];
  const passcodeHash = await sha256(passcode);

  if (passcodeHash !== staff.passcode_hash) {
    return c.json({ error: "パスコードが正しくありません" }, 401);
  }

  c.set("staffId", staff.id as number);
  c.set("staffName", staff.name as string);
  c.set("staffRole", staff.role as string);

  return next();
};

// ========================================
// 疎通テスト用エンドポイント
// ========================================

// 認証不要の ping
shift.get("/_ping", (c) => {
  return c.json({ status: "ok", message: "shift API is running" });
});

// 管理者認証テスト
shift.get("/_ping/admin", adminAuth, (c) => {
  return c.json({ status: "ok", message: "admin auth successful" });
});

// スタッフ認証テスト
shift.get("/_ping/staff", staffAuth, (c) => {
  return c.json({
    status: "ok",
    message: "staff auth successful",
    staff: {
      id: c.get("staffId"),
      name: c.get("staffName"),
      role: c.get("staffRole"),
    },
  });
});

// ========================================
// 公開 API（認証不要）
// ========================================

// セレクタ用スタッフ一覧（id, name, role のみ）
shift.get("/staff", async (c) => {
  const db = getDb(c.env);
  const result = await db.execute(
    "SELECT id, name, role FROM shift_staff WHERE is_active = 1 ORDER BY sort_order, id"
  );
  return c.json(result.rows);
});

// 提出ロック状況・公開状況
shift.get("/periods/:month", async (c) => {
  const month = c.req.param("month");
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return c.json({ error: "month は YYYY-MM 形式で指定してください" }, 400);
  }

  const db = getDb(c.env);
  const result = await db.execute({
    sql: "SELECT month, submission_locked_at, submission_unlocked, published_at, created_at FROM shift_periods WHERE month = ?",
    args: [month],
  });

  if (result.rows.length === 0) {
    // レコードがない場合は既定の締切判定を行う
    const locked = await isSubmissionLocked(db, month);
    return c.json({
      month,
      submission_locked: locked,
      submission_locked_at: null,
      submission_unlocked: 0,
      published: false,
      published_at: null,
    });
  }

  const row = result.rows[0];
  // submission_lockedの判定をisSubmissionLocked関数に委譲
  const locked = await isSubmissionLocked(db, month);
  return c.json({
    month: row.month,
    submission_locked: locked,
    submission_locked_at: row.submission_locked_at,
    submission_unlocked: row.submission_unlocked || 0,
    published: row.published_at !== null,
    published_at: row.published_at,
  });
});

// 営業日カレンダー
shift.get("/calendar", async (c) => {
  const month = c.req.query("month");
  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return c.json({ error: "month パラメータ (YYYY-MM) が必要です" }, 400);
  }

  const db = getDb(c.env);
  const days = getDaysInMonth(month);

  // 例外日を取得
  const overridesResult = await db.execute({
    sql: "SELECT date, is_open, note FROM shift_calendar_overrides WHERE date LIKE ?",
    args: [`${month}%`],
  });

  const overrides = new Map<string, { is_open: boolean; note?: string }>();
  for (const row of overridesResult.rows) {
    overrides.set(row.date as string, {
      is_open: row.is_open === 1,
      note: row.note as string | undefined,
    });
  }

  // 各日の営業可否を計算
  const result = days.map((dateStr) => {
    const date = new Date(dateStr);
    const override = overrides.get(dateStr);

    if (override) {
      return {
        date: dateStr,
        is_open: override.is_open,
        reason: "override" as const,
        note: override.note,
      };
    }

    const isOpen = isOpenByDefault(date);
    return {
      date: dateStr,
      is_open: isOpen,
      reason: "weekly" as const,
    };
  });

  return c.json({ month, days: result });
});

// スタッフログイン
shift.post("/auth/login", async (c) => {
  const body = await c.req.json();
  const { staff_id, passcode } = body;

  if (!staff_id || !passcode) {
    return c.json({ error: "スタッフIDとパスコードは必須です" }, 400);
  }

  const db = getDb(c.env);
  const result = await db.execute({
    sql: "SELECT id, name, role, passcode_hash FROM shift_staff WHERE id = ? AND is_active = 1",
    args: [staff_id],
  });

  if (result.rows.length === 0) {
    return c.json({ error: "スタッフが見つかりません" }, 401);
  }

  const staff = result.rows[0];
  const passcodeHash = await sha256(passcode);

  if (passcodeHash !== staff.passcode_hash) {
    return c.json({ error: "パスコードが正しくありません" }, 401);
  }

  return c.json({
    success: true,
    staff: {
      id: staff.id,
      name: staff.name,
      role: staff.role,
    },
  });
});

// ========================================
// スタッフ認証が必要な API
// ========================================

// 自分の希望一覧
shift.get("/requests/me", staffAuth, async (c) => {
  const db = c.get("db");
  const staffId = c.get("staffId");
  const month = c.req.query("month");

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return c.json({ error: "month パラメータ (YYYY-MM) が必要です" }, 400);
  }

  const result = await db.execute({
    sql: `SELECT id, date, availability, note, created_at, updated_at
          FROM shift_requests
          WHERE staff_id = ? AND date LIKE ?
          ORDER BY date`,
    args: [staffId, `${month}%`],
  });

  return c.json({
    month,
    staff_id: staffId,
    requests: result.rows,
  });
});

// 公開済み確定シフトを取得
shift.get("/assignments", staffAuth, async (c) => {
  const db = c.get("db");
  const month = c.req.query("month");

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return c.json({ error: "month パラメータ (YYYY-MM) が必要です" }, 400);
  }

  // 公開状況を確認
  const periodResult = await db.execute({
    sql: "SELECT published_at FROM shift_periods WHERE month = ?",
    args: [month],
  });

  if (periodResult.rows.length === 0 || !periodResult.rows[0].published_at) {
    return c.json({ error: "シフトはまだ公開されていません" }, 404);
  }

  const publishedAt = periodResult.rows[0].published_at;

  // 確定シフトを取得
  const result = await db.execute({
    sql: `SELECT a.date, a.role, a.staff_id, s.name as staff_name
          FROM shift_assignments a
          JOIN shift_staff s ON a.staff_id = s.id
          WHERE a.date LIKE ?
          ORDER BY a.date, a.role`,
    args: [`${month}%`],
  });

  const assignments = result.rows.map((row) => ({
    date: row.date,
    role: row.role,
    staff: {
      id: row.staff_id,
      name: row.staff_name,
    },
  }));

  return c.json({
    month,
    published_at: publishedAt,
    assignments,
  });
});

// 自分の希望を月単位で一括上書き
shift.put("/requests/me", staffAuth, async (c) => {
  const db = c.get("db");
  const staffId = c.get("staffId");
  const body = await c.req.json();

  const parsed = requestsUpdateSchema.safeParse(body);
  if (!parsed.success) {
    const messages = parsed.error.issues.map((issue) => issue.message).join(", ");
    return c.json({ error: messages }, 400);
  }

  const { month, items } = parsed.data;

  // 締切チェック
  const locked = await isSubmissionLocked(db, month);
  if (locked) {
    return c.json({ error: "提出期限が過ぎています" }, 423);
  }

  // 日付の重複チェック
  const dates = items.map((item) => item.date);
  const uniqueDates = new Set(dates);
  if (dates.length !== uniqueDates.size) {
    return c.json({ error: "重複した日付があります" }, 400);
  }

  // 日付が指定月の範囲内かチェック
  for (const item of items) {
    if (!item.date.startsWith(month)) {
      return c.json({ error: `日付 ${item.date} は ${month} の範囲外です` }, 400);
    }
  }

  // 既存の希望を削除
  await db.execute({
    sql: "DELETE FROM shift_requests WHERE staff_id = ? AND date LIKE ?",
    args: [staffId, `${month}%`],
  });

  // 新しい希望を挿入
  for (const item of items) {
    await db.execute({
      sql: `INSERT INTO shift_requests (staff_id, date, availability, note, created_at, updated_at)
            VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
      args: [staffId, item.date, item.availability, item.note || null],
    });
  }

  return c.json({
    success: true,
    message: `${month} の希望を登録しました`,
    count: items.length,
  });
});

// ========================================
// 管理者用スタッフ管理 API
// ========================================

// 全スタッフ一覧（無効含む）
shift.get("/admin/staff", adminAuth, async (c) => {
  const db = c.get("db");
  const result = await db.execute(
    "SELECT id, name, role, is_active, sort_order, created_at, updated_at FROM shift_staff ORDER BY sort_order, id"
  );
  return c.json(result.rows);
});

// スタッフ登録
shift.post("/admin/staff", adminAuth, async (c) => {
  const db = c.get("db");
  const body = await c.req.json();

  const parsed = staffCreateSchema.safeParse(body);
  if (!parsed.success) {
    const messages = parsed.error.issues.map((issue) => issue.message).join(", ");
    return c.json({ error: messages }, 400);
  }

  const { name, role, passcode, sort_order } = parsed.data;
  const passcodeHash = await sha256(passcode);

  const result = await db.execute({
    sql: `INSERT INTO shift_staff (name, role, passcode_hash, sort_order, created_at, updated_at)
          VALUES (?, ?, ?, ?, datetime('now'), datetime('now'))`,
    args: [name, role, passcodeHash, sort_order],
  });

  return c.json({
    success: true,
    id: Number(result.lastInsertRowid),
    message: `「${name}」さんを登録しました`,
  }, 201);
});

// スタッフ更新
shift.put("/admin/staff/:id", adminAuth, async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");

  if (!/^\d+$/.test(id)) {
    return c.json({ error: "無効なIDです" }, 400);
  }

  const body = await c.req.json();
  const parsed = staffUpdateSchema.safeParse(body);
  if (!parsed.success) {
    const messages = parsed.error.issues.map((issue) => issue.message).join(", ");
    return c.json({ error: messages }, 400);
  }

  const { name, role, passcode, sort_order, is_active } = parsed.data;

  // 存在確認
  const existing = await db.execute({
    sql: "SELECT id FROM shift_staff WHERE id = ?",
    args: [id],
  });

  if (existing.rows.length === 0) {
    return c.json({ error: "スタッフが見つかりません" }, 404);
  }

  const updates: string[] = ["updated_at = datetime('now')"];
  const args: (string | number)[] = [];

  if (name !== undefined) {
    updates.push("name = ?");
    args.push(name);
  }
  if (role !== undefined) {
    updates.push("role = ?");
    args.push(role);
  }
  if (passcode !== undefined) {
    const passcodeHash = await sha256(passcode);
    updates.push("passcode_hash = ?");
    args.push(passcodeHash);
  }
  if (sort_order !== undefined) {
    updates.push("sort_order = ?");
    args.push(sort_order);
  }
  if (is_active !== undefined) {
    updates.push("is_active = ?");
    args.push(is_active ? 1 : 0);
  }

  if (args.length === 0) {
    return c.json({ error: "更新する項目がありません" }, 400);
  }

  args.push(parseInt(id, 10));
  await db.execute({
    sql: `UPDATE shift_staff SET ${updates.join(", ")} WHERE id = ?`,
    args,
  });

  return c.json({ success: true, message: "スタッフ情報を更新しました" });
});

// スタッフ無効化（論理削除）
shift.delete("/admin/staff/:id", adminAuth, async (c) => {
  const db = c.get("db");
  const id = c.req.param("id");

  if (!/^\d+$/.test(id)) {
    return c.json({ error: "無効なIDです" }, 400);
  }

  const existing = await db.execute({
    sql: "SELECT id, name FROM shift_staff WHERE id = ?",
    args: [id],
  });

  if (existing.rows.length === 0) {
    return c.json({ error: "スタッフが見つかりません" }, 404);
  }

  await db.execute({
    sql: "UPDATE shift_staff SET is_active = 0, updated_at = datetime('now') WHERE id = ?",
    args: [id],
  });

  return c.json({
    success: true,
    message: `「${existing.rows[0].name}」さんを無効化しました`,
  });
});

// ========================================
// 管理者用カレンダー例外日 API
// ========================================

// 例外日一覧
shift.get("/admin/calendar/overrides", adminAuth, async (c) => {
  const db = c.get("db");
  const result = await db.execute(
    "SELECT date, is_open, note, created_at FROM shift_calendar_overrides ORDER BY date"
  );
  return c.json(result.rows);
});

// 例外日追加
shift.post("/admin/calendar/overrides", adminAuth, async (c) => {
  const db = c.get("db");
  const body = await c.req.json();

  const parsed = calendarOverrideSchema.safeParse(body);
  if (!parsed.success) {
    const messages = parsed.error.issues.map((issue) => issue.message).join(", ");
    return c.json({ error: messages }, 400);
  }

  const { date, is_open, note } = parsed.data;

  // 既存チェック
  const existing = await db.execute({
    sql: "SELECT date FROM shift_calendar_overrides WHERE date = ?",
    args: [date],
  });

  if (existing.rows.length > 0) {
    // 更新
    await db.execute({
      sql: "UPDATE shift_calendar_overrides SET is_open = ?, note = ? WHERE date = ?",
      args: [is_open ? 1 : 0, note || null, date],
    });
    return c.json({ success: true, message: `${date} の例外日を更新しました` });
  }

  // 新規挿入
  await db.execute({
    sql: "INSERT INTO shift_calendar_overrides (date, is_open, note, created_at) VALUES (?, ?, ?, datetime('now'))",
    args: [date, is_open ? 1 : 0, note || null],
  });

  return c.json({
    success: true,
    message: `${date} を${is_open ? "臨時診療" : "臨時休診"}として登録しました`,
  }, 201);
});

// 例外日削除
shift.delete("/admin/calendar/overrides/:date", adminAuth, async (c) => {
  const db = c.get("db");
  const date = c.req.param("date");

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return c.json({ error: "日付の形式が不正です" }, 400);
  }

  const existing = await db.execute({
    sql: "SELECT date FROM shift_calendar_overrides WHERE date = ?",
    args: [date],
  });

  if (existing.rows.length === 0) {
    return c.json({ error: "例外日が見つかりません" }, 404);
  }

  await db.execute({
    sql: "DELETE FROM shift_calendar_overrides WHERE date = ?",
    args: [date],
  });

  return c.json({ success: true, message: `${date} の例外日を削除しました` });
});

// ========================================
// 管理者用希望・締切管理 API
// ========================================

// 全スタッフの希望をマトリクスで取得
shift.get("/admin/requests", adminAuth, async (c) => {
  const db = c.get("db");
  const month = c.req.query("month");

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return c.json({ error: "month パラメータ (YYYY-MM) が必要です" }, 400);
  }

  // 有効なスタッフ一覧
  const staffResult = await db.execute(
    "SELECT id, name, role FROM shift_staff WHERE is_active = 1 ORDER BY sort_order, id"
  );

  // 全希望を取得
  const requestsResult = await db.execute({
    sql: `SELECT r.staff_id, r.date, r.availability, r.note
          FROM shift_requests r
          JOIN shift_staff s ON r.staff_id = s.id
          WHERE r.date LIKE ? AND s.is_active = 1
          ORDER BY r.date, r.staff_id`,
    args: [`${month}%`],
  });

  // マトリクスを構築
  const days = getDaysInMonth(month);
  const matrix: Record<string, Record<number, { availability: string; note?: string }>> = {};

  for (const day of days) {
    matrix[day] = {};
  }

  for (const row of requestsResult.rows) {
    const date = row.date as string;
    const staffId = row.staff_id as number;
    if (matrix[date]) {
      matrix[date][staffId] = {
        availability: row.availability as string,
        note: row.note as string | undefined,
      };
    }
  }

  return c.json({
    month,
    staff: staffResult.rows,
    days,
    matrix,
  });
});

// 手動ロック
shift.post("/admin/periods/:month/lock", adminAuth, async (c) => {
  const db = c.get("db");
  const month = c.req.param("month");

  if (!/^\d{4}-\d{2}$/.test(month)) {
    return c.json({ error: "month は YYYY-MM 形式で指定してください" }, 400);
  }

  // レコードがなければ作成、あれば更新
  const existing = await db.execute({
    sql: "SELECT month FROM shift_periods WHERE month = ?",
    args: [month],
  });

  if (existing.rows.length === 0) {
    await db.execute({
      sql: "INSERT INTO shift_periods (month, submission_locked_at, submission_unlocked, created_at) VALUES (?, datetime('now'), 0, datetime('now'))",
      args: [month],
    });
  } else {
    await db.execute({
      sql: "UPDATE shift_periods SET submission_locked_at = datetime('now'), submission_unlocked = 0 WHERE month = ?",
      args: [month],
    });
  }

  return c.json({ success: true, message: `${month} の提出をロックしました` });
});

// ロック解除
shift.delete("/admin/periods/:month/lock", adminAuth, async (c) => {
  const db = c.get("db");
  const month = c.req.param("month");

  if (!/^\d{4}-\d{2}$/.test(month)) {
    return c.json({ error: "month は YYYY-MM 形式で指定してください" }, 400);
  }

  const existing = await db.execute({
    sql: "SELECT month FROM shift_periods WHERE month = ?",
    args: [month],
  });

  if (existing.rows.length === 0) {
    // レコードがなければ作成して、ロック解除状態に設定
    await db.execute({
      sql: "INSERT INTO shift_periods (month, submission_locked_at, submission_unlocked, created_at) VALUES (?, NULL, 1, datetime('now'))",
      args: [month],
    });
  } else {
    await db.execute({
      sql: "UPDATE shift_periods SET submission_locked_at = NULL, submission_unlocked = 1 WHERE month = ?",
      args: [month],
    });
  }

  return c.json({ success: true, message: `${month} のロックを解除しました` });
});

// ========================================
// 管理者用確定シフト API
// ========================================

// 確定シフト取得（未公開含む）
shift.get("/admin/assignments", adminAuth, async (c) => {
  const db = c.get("db");
  const month = c.req.query("month");

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return c.json({ error: "month パラメータ (YYYY-MM) が必要です" }, 400);
  }

  // 公開状況
  const periodResult = await db.execute({
    sql: "SELECT published_at FROM shift_periods WHERE month = ?",
    args: [month],
  });

  const publishedAt = periodResult.rows.length > 0 ? periodResult.rows[0].published_at : null;

  // 確定シフト
  const result = await db.execute({
    sql: `SELECT a.id, a.date, a.role, a.staff_id, s.name as staff_name, a.created_at, a.updated_at
          FROM shift_assignments a
          JOIN shift_staff s ON a.staff_id = s.id
          WHERE a.date LIKE ?
          ORDER BY a.date, a.role`,
    args: [`${month}%`],
  });

  const assignments = result.rows.map((row) => ({
    id: row.id,
    date: row.date,
    role: row.role,
    staff: {
      id: row.staff_id,
      name: row.staff_name,
    },
    created_at: row.created_at,
    updated_at: row.updated_at,
  }));

  return c.json({
    month,
    published: publishedAt !== null,
    published_at: publishedAt,
    assignments,
  });
});

// 確定シフト一括上書き
shift.put("/admin/assignments", adminAuth, async (c) => {
  const db = c.get("db");
  const month = c.req.query("month");
  const force = c.req.query("force") === "1";

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return c.json({ error: "month パラメータ (YYYY-MM) が必要です" }, 400);
  }

  const body = await c.req.json();
  const parsed = assignmentsUpdateSchema.safeParse(body);
  if (!parsed.success) {
    const messages = parsed.error.issues.map((issue) => issue.message).join(", ");
    return c.json({ error: messages }, 400);
  }

  const { assignments } = parsed.data;

  // monthパラメータとbodyのmonthが一致するか確認
  if (parsed.data.month !== month) {
    return c.json({ error: "クエリパラメータの month と body の month が一致しません" }, 400);
  }

  // (date, role) の重複チェック
  const seen = new Set<string>();
  for (const a of assignments) {
    const key = `${a.date}:${a.role}`;
    if (seen.has(key)) {
      return c.json({ error: `${a.date} の ${a.role} が重複しています` }, 400);
    }
    seen.add(key);
  }

  // 日付範囲チェック
  for (const a of assignments) {
    if (!a.date.startsWith(month)) {
      return c.json({ error: `日付 ${a.date} は ${month} の範囲外です` }, 400);
    }
  }

  // スタッフ情報を取得
  const staffResult = await db.execute(
    "SELECT id, name, role FROM shift_staff"
  );
  const staffMap = new Map<number, { name: string; role: string }>();
  for (const row of staffResult.rows) {
    staffMap.set(row.id as number, { name: row.name as string, role: row.role as string });
  }

  // バリデーション
  const warnings: string[] = [];
  for (const a of assignments) {
    const staff = staffMap.get(a.staff_id);
    if (!staff) {
      return c.json({ error: `スタッフID ${a.staff_id} が見つかりません` }, 400);
    }
    if (staff.role !== a.role) {
      return c.json({ error: `スタッフ「${staff.name}」の職種 (${staff.role}) と割当の職種 (${a.role}) が一致しません` }, 400);
    }
  }

  // 希望との整合性チェック（警告のみ）
  if (!force) {
    const requestsResult = await db.execute({
      sql: "SELECT staff_id, date, availability FROM shift_requests WHERE date LIKE ?",
      args: [`${month}%`],
    });
    const unavailableMap = new Map<string, boolean>();
    for (const row of requestsResult.rows) {
      if (row.availability === "unavailable") {
        unavailableMap.set(`${row.staff_id}:${row.date}`, true);
      }
    }

    for (const a of assignments) {
      if (unavailableMap.has(`${a.staff_id}:${a.date}`)) {
        const staff = staffMap.get(a.staff_id);
        warnings.push(`${a.date} の ${staff?.name} さんは「不可」と回答しています`);
      }
    }

    // 営業日チェック
    const overridesResult = await db.execute({
      sql: "SELECT date, is_open FROM shift_calendar_overrides WHERE date LIKE ?",
      args: [`${month}%`],
    });
    const overrides = new Map<string, boolean>();
    for (const row of overridesResult.rows) {
      overrides.set(row.date as string, row.is_open === 1);
    }

    for (const a of assignments) {
      const date = new Date(a.date);
      let isOpen = isOpenByDefault(date);
      if (overrides.has(a.date)) {
        isOpen = overrides.get(a.date)!;
      }
      if (!isOpen) {
        warnings.push(`${a.date} は営業日ではありません`);
      }
    }

    if (warnings.length > 0) {
      return c.json({
        error: "警告があります。強制的に保存する場合は ?force=1 を付けてください",
        warnings,
      }, 400);
    }
  }

  // 既存の割当を削除
  await db.execute({
    sql: "DELETE FROM shift_assignments WHERE date LIKE ?",
    args: [`${month}%`],
  });

  // 新しい割当を挿入
  for (const a of assignments) {
    await db.execute({
      sql: `INSERT INTO shift_assignments (date, role, staff_id, created_at, updated_at)
            VALUES (?, ?, ?, datetime('now'), datetime('now'))`,
      args: [a.date, a.role, a.staff_id],
    });
  }

  return c.json({
    success: true,
    message: `${month} のシフトを保存しました`,
    count: assignments.length,
    warnings: force ? warnings : undefined,
  });
});

// 公開
shift.post("/admin/periods/:month/publish", adminAuth, async (c) => {
  const db = c.get("db");
  const month = c.req.param("month");

  if (!/^\d{4}-\d{2}$/.test(month)) {
    return c.json({ error: "month は YYYY-MM 形式で指定してください" }, 400);
  }

  // レコードがなければ作成、あれば更新
  const existing = await db.execute({
    sql: "SELECT month FROM shift_periods WHERE month = ?",
    args: [month],
  });

  if (existing.rows.length === 0) {
    await db.execute({
      sql: "INSERT INTO shift_periods (month, published_at, created_at) VALUES (?, datetime('now'), datetime('now'))",
      args: [month],
    });
  } else {
    await db.execute({
      sql: "UPDATE shift_periods SET published_at = datetime('now') WHERE month = ?",
      args: [month],
    });
  }

  return c.json({ success: true, message: `${month} のシフトを公開しました` });
});

// 公開取り下げ
shift.delete("/admin/periods/:month/publish", adminAuth, async (c) => {
  const db = c.get("db");
  const month = c.req.param("month");

  if (!/^\d{4}-\d{2}$/.test(month)) {
    return c.json({ error: "month は YYYY-MM 形式で指定してください" }, 400);
  }

  const existing = await db.execute({
    sql: "SELECT month FROM shift_periods WHERE month = ?",
    args: [month],
  });

  if (existing.rows.length === 0) {
    return c.json({ success: true, message: `${month} は公開されていません` });
  }

  await db.execute({
    sql: "UPDATE shift_periods SET published_at = NULL WHERE month = ?",
    args: [month],
  });

  return c.json({ success: true, message: `${month} のシフト公開を取り下げました` });
});

export default shift;
export { adminAuth, staffAuth, sha256, getDb };
