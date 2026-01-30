import { Hono } from "hono";
import { cors } from "hono/cors";
import { createClient } from "@libsql/client";

type Bindings = {
  TURSO_URL: string;
  TURSO_AUTH_TOKEN: string;
};

const app = new Hono<{ Bindings: Bindings }>();

// CORS設定（フロントエンドからのアクセスを許可）
app.use(
  "/api/*",
  cors({
    origin: [
      "http://localhost:4321",
      "https://keiyousya.github.io",
    ],
    allowMethods: ["GET", "POST", "PUT", "DELETE"],
  })
);

// DBクライアント取得
function getDb(env: Bindings) {
  return createClient({
    url: env.TURSO_URL,
    authToken: env.TURSO_AUTH_TOKEN,
  });
}

// ヘルスチェック
app.get("/", (c) => {
  return c.json({ status: "ok", message: "勾当台夕方内科クリニック予約API" });
});

// 予約一覧取得（管理用）
app.get("/api/reservations", async (c) => {
  const db = getDb(c.env);
  const result = await db.execute(
    "SELECT * FROM reservations ORDER BY date DESC, time DESC"
  );
  return c.json(result.rows);
});

// 予約作成
app.post("/api/reservations", async (c) => {
  const db = getDb(c.env);
  const body = await c.req.json();

  const { name, phone, email, date, time, symptoms } = body;

  // バリデーション
  if (!name || !phone || !date || !time) {
    return c.json({ error: "必須項目が不足しています" }, 400);
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
    sql: `INSERT INTO reservations (name, phone, email, date, time, symptoms, status, created_at)
          VALUES (?, ?, ?, ?, ?, ?, 'pending', datetime('now'))`,
    args: [name, phone, email || null, date, time, symptoms || null],
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

// 予約詳細取得
app.get("/api/reservations/:id", async (c) => {
  const db = getDb(c.env);
  const id = c.req.param("id");

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
app.put("/api/reservations/:id", async (c) => {
  const db = getDb(c.env);
  const id = c.req.param("id");
  const body = await c.req.json();
  const { status } = body;

  if (!["pending", "confirmed", "cancelled"].includes(status)) {
    return c.json({ error: "無効なステータスです" }, 400);
  }

  await db.execute({
    sql: "UPDATE reservations SET status = ? WHERE id = ?",
    args: [status, id],
  });

  return c.json({ success: true, message: "ステータスを更新しました" });
});

// 予約削除（管理用）
app.delete("/api/reservations/:id", async (c) => {
  const db = getDb(c.env);
  const id = c.req.param("id");

  await db.execute({
    sql: "DELETE FROM reservations WHERE id = ?",
    args: [id],
  });

  return c.json({ success: true, message: "予約を削除しました" });
});

// 空き状況確認
app.get("/api/availability/:date", async (c) => {
  const db = getDb(c.env);
  const date = c.req.param("date");

  // その日の予約済み時間を取得
  const result = await db.execute({
    sql: "SELECT time FROM reservations WHERE date = ? AND status != 'cancelled'",
    args: [date],
  });

  const bookedTimes = result.rows.map((row) => row.time);

  // 全時間枠
  const allSlots = [
    "17:00",
    "17:30",
    "18:00",
    "18:30",
    "19:00",
    "19:30",
    "20:00",
    "20:30",
  ];

  // 空き時間を計算
  const availableSlots = allSlots.filter(
    (slot) => !bookedTimes.includes(slot)
  );

  return c.json({
    date,
    availableSlots,
    bookedTimes,
  });
});

export default app;
