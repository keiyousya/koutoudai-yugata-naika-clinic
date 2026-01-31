import { Hono } from "hono";
import { cors } from "hono/cors";
import { createClient } from "@libsql/client";
import { z } from "zod";

type Bindings = {
  TURSO_URL: string;
  TURSO_AUTH_TOKEN: string;
  ADMIN_API_KEY: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// ========================================
// バリデーションスキーマ
// ========================================

const reservationSchema = z.object({
  name: z.string().min(1, "氏名は必須です").max(100, "氏名は100文字以内で入力してください"),
  name_kana: z.string().min(1, "フリガナは必須です").max(100, "フリガナは100文字以内で入力してください"),
  phone: z.string().regex(/^[0-9\-]{10,15}$/, "電話番号の形式が正しくありません"),
  email: z.string().email({ message: "メールアドレスの形式が正しくありません" }).max(255).nullable().optional(),
  gender: z.enum(["male", "female", "other"], { error: "性別を選択してください" }),
  birthdate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "生年月日の形式が正しくありません"),
  visit_type: z.enum(["first", "return"], { error: "受診種別を選択してください" }),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日付の形式が正しくありません"),
  time: z.string().regex(/^\d{2}:\d{2}$/, "時刻の形式が正しくありません"),
  symptoms: z.string().max(1000, "症状は1000文字以内で入力してください").nullable().optional(),
});

const statusSchema = z.object({
  status: z.enum([
    "not_visited",
    "checked_in",
    "in_consultation",
    "consultation_done",
    "paid",
    "cancelled",
  ], { error: "無効なステータスです" }),
});

// 診療時間枠のホワイトリスト
const validTimeSlots = [
  "17:00", "17:15", "17:30", "17:45",
  "18:00", "18:15", "18:30", "18:45",
  "19:00", "19:15", "19:30", "19:45",
  "20:00", "20:15", "20:30", "20:45",
];

// ========================================
// レートリミット（簡易実装）
// ========================================

const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_WINDOW_MS = 60 * 1000; // 1分
const RATE_LIMIT_MAX_REQUESTS = 10; // 1分あたり10リクエスト

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const record = rateLimitMap.get(ip);

  if (!record || now > record.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }

  if (record.count >= RATE_LIMIT_MAX_REQUESTS) {
    return false;
  }

  record.count++;
  return true;
}

// 古いエントリをクリーンアップ
function cleanupRateLimitMap() {
  const now = Date.now();
  for (const [ip, record] of rateLimitMap.entries()) {
    if (now > record.resetAt) {
      rateLimitMap.delete(ip);
    }
  }
}

// 定期的にクリーンアップ（メモリリーク防止）
setInterval(cleanupRateLimitMap, 5 * 60 * 1000);

// ========================================
// ミドルウェア
// ========================================

// CORS設定（フロントエンドからのアクセスを許可）
app.use(
  "/api/*",
  cors({
    origin: (origin) => {
      // ローカル開発を許可
      if (origin?.startsWith("http://localhost:")) return origin;
      // 本番を許可（カスタムドメイン）
      if (origin === "https://koutoudai-yugata-naika.clinic") return origin;
      // 本番を許可（GitHub Pages）
      if (origin === "https://keiyousya.github.io") return origin;
      return null;
    },
    allowMethods: ["GET", "POST", "PUT", "DELETE"],
  })
);

// 管理用APIの認証ミドルウェア
const adminAuthMiddleware = async (c: any, next: any) => {
  const apiKey = c.req.header("X-Admin-API-Key");
  const validApiKey = c.env.ADMIN_API_KEY;

  // 開発環境（APIキー未設定）の場合はスキップ
  if (!validApiKey) {
    console.warn("警告: ADMIN_API_KEY が設定されていません。本番環境では必ず設定してください。");
    return next();
  }

  if (!apiKey || apiKey !== validApiKey) {
    return c.json({ error: "認証に失敗しました" }, 401);
  }

  return next();
};

// グローバルエラーハンドリング
app.onError((err, c) => {
  console.error("API Error:", err);

  // Zodバリデーションエラー
  if (err instanceof z.ZodError) {
    const messages = err.issues.map((issue) => issue.message).join(", ");
    return c.json({ error: messages }, 400);
  }

  // 本番環境では詳細なエラーを隠す
  return c.json({ error: "サーバーエラーが発生しました" }, 500);
});

// ========================================
// ヘルパー関数
// ========================================

function getDb(env: Bindings) {
  return createClient({
    url: env.TURSO_URL,
    authToken: env.TURSO_AUTH_TOKEN,
  });
}

function getClientIP(c: any): string {
  return c.req.header("CF-Connecting-IP") ||
         c.req.header("X-Forwarded-For")?.split(",")[0]?.trim() ||
         "unknown";
}

// ========================================
// 公開API
// ========================================

// ヘルスチェック
app.get("/", (c) => {
  return c.json({ status: "ok", message: "勾当台夕方内科クリニック予約API" });
});

// 予約作成（公開）
app.post("/api/reservations", async (c) => {
  // レートリミットチェック
  const clientIP = getClientIP(c);
  if (!checkRateLimit(clientIP)) {
    return c.json({ error: "リクエストが多すぎます。しばらくしてから再度お試しください。" }, 429);
  }

  const db = getDb(c.env);
  const body = await c.req.json();

  // バリデーション
  const parseResult = reservationSchema.safeParse(body);
  if (!parseResult.success) {
    const messages = parseResult.error.issues.map((issue) => issue.message).join(", ");
    return c.json({ error: messages }, 400);
  }

  const { name, name_kana, phone, email, gender, birthdate, visit_type, date, time, symptoms } = parseResult.data;

  // 時間枠のホワイトリストチェック
  if (!validTimeSlots.includes(time)) {
    return c.json({ error: "無効な時間枠です" }, 400);
  }

  // 日付の妥当性チェック（過去の日付は不可）
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const reservationDate = new Date(date);
  if (reservationDate < today) {
    return c.json({ error: "過去の日付は予約できません" }, 400);
  }

  // 同じ日時に予約がないかチェック
  const existing = await db.execute({
    sql: "SELECT id FROM reservations WHERE date = ? AND time = ? AND status != 'cancelled'",
    args: [date, time],
  });

  if (existing.rows.length > 0) {
    return c.json({ error: "この時間帯はすでに予約が入っています" }, 409);
  }

  // 予約登録
  const result = await db.execute({
    sql: `INSERT INTO reservations (name, name_kana, phone, email, gender, birthdate, visit_type, date, time, symptoms, status, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'not_visited', datetime('now'))`,
    args: [name, name_kana, phone, email || null, gender, birthdate, visit_type, date, time, symptoms || null],
  });

  return c.json(
    {
      success: true,
      message: "予約を受け付けました",
      id: Number(result.lastInsertRowid),
    },
    201
  );
});

// 空き状況確認（公開）
app.get("/api/availability/:date", async (c) => {
  const db = getDb(c.env);
  const date = c.req.param("date");

  // 日付形式のバリデーション
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return c.json({ error: "日付の形式が正しくありません" }, 400);
  }

  // その日の予約済み時間を取得
  const result = await db.execute({
    sql: "SELECT time FROM reservations WHERE date = ? AND status != 'cancelled'",
    args: [date],
  });

  const bookedTimes = result.rows.map((row) => row.time);

  // 空き時間を計算
  const availableSlots = validTimeSlots.filter(
    (slot) => !bookedTimes.includes(slot)
  );

  return c.json({
    date,
    availableSlots,
    bookedTimes,
  });
});

// ========================================
// 管理用API（認証必須）
// ========================================

// 予約一覧取得（管理用）
app.get("/api/reservations", adminAuthMiddleware, async (c) => {
  const db = getDb(c.env);
  const result = await db.execute(
    "SELECT * FROM reservations ORDER BY date DESC, time DESC"
  );
  return c.json(result.rows);
});

// 予約詳細取得（管理用）
app.get("/api/reservations/:id", adminAuthMiddleware, async (c) => {
  const db = getDb(c.env);
  const id = c.req.param("id");

  // IDのバリデーション
  if (!/^\d+$/.test(id)) {
    return c.json({ error: "無効なIDです" }, 400);
  }

  const result = await db.execute({
    sql: "SELECT * FROM reservations WHERE id = ?",
    args: [id],
  });

  if (result.rows.length === 0) {
    return c.json({ error: "予約が見つかりません" }, 404);
  }

  return c.json(result.rows[0]);
});

// 予約ステータス更新（管理用）
app.put("/api/reservations/:id", adminAuthMiddleware, async (c) => {
  const db = getDb(c.env);
  const id = c.req.param("id");
  const body = await c.req.json();

  // IDのバリデーション
  if (!/^\d+$/.test(id)) {
    return c.json({ error: "無効なIDです" }, 400);
  }

  // ステータスのバリデーション
  const parseResult = statusSchema.safeParse(body);
  if (!parseResult.success) {
    const messages = parseResult.error.issues.map((issue) => issue.message).join(", ");
    return c.json({ error: messages }, 400);
  }

  const { status } = parseResult.data;

  // 予約の存在確認
  const existing = await db.execute({
    sql: "SELECT id FROM reservations WHERE id = ?",
    args: [id],
  });

  if (existing.rows.length === 0) {
    return c.json({ error: "予約が見つかりません" }, 404);
  }

  await db.execute({
    sql: "UPDATE reservations SET status = ? WHERE id = ?",
    args: [status, id],
  });

  return c.json({ success: true, message: "ステータスを更新しました" });
});

// 予約削除（管理用）
app.delete("/api/reservations/:id", adminAuthMiddleware, async (c) => {
  const db = getDb(c.env);
  const id = c.req.param("id");

  // IDのバリデーション
  if (!/^\d+$/.test(id)) {
    return c.json({ error: "無効なIDです" }, 400);
  }

  // 予約の存在確認
  const existing = await db.execute({
    sql: "SELECT id FROM reservations WHERE id = ?",
    args: [id],
  });

  if (existing.rows.length === 0) {
    return c.json({ error: "予約が見つかりません" }, 404);
  }

  await db.execute({
    sql: "DELETE FROM reservations WHERE id = ?",
    args: [id],
  });

  return c.json({ success: true, message: "予約を削除しました" });
});

export default app;
