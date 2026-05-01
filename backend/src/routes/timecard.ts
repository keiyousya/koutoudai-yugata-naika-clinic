import { Hono } from "hono";
import { createClient } from "@libsql/client";
import { z } from "zod";

type Bindings = {
  TURSO_URL: string;
  TURSO_AUTH_TOKEN: string;
  ADMIN_API_KEY: string;
  VIEWER_API_KEY: string;
};

const timecard = new Hono<{ Bindings: Bindings }>();

// ========================================
// ヘルパー
// ========================================

function getDb(env: Bindings) {
  return createClient({
    url: env.TURSO_URL,
    authToken: env.TURSO_AUTH_TOKEN,
  });
}

const adminAuth = async (c: any, next: any) => {
  const apiKey = c.req.header("X-Admin-API-Key");
  const validApiKey = c.env.ADMIN_API_KEY;
  if (!validApiKey) return next();
  if (!apiKey || apiKey !== validApiKey) {
    return c.json({ error: "認証に失敗しました" }, 401);
  }
  return next();
};

const viewerOrAdminAuth = async (c: any, next: any) => {
  const adminKey = c.req.header("X-Admin-API-Key");
  const viewerKey = c.req.header("X-Viewer-API-Key");
  const validAdmin = c.env.ADMIN_API_KEY;
  const validViewer = c.env.VIEWER_API_KEY;

  // 開発環境（キー未設定）の場合はスキップ
  if (!validAdmin && !validViewer) return next();

  if (validAdmin && adminKey === validAdmin) return next();
  if (validViewer && viewerKey === validViewer) return next();

  return c.json({ error: "認証に失敗しました" }, 401);
};

// ========================================
// バリデーション
// ========================================

const punchSchema = z.object({
  card_uid: z.string().min(1, "カードUIDは必須です"),
  method: z.enum(["nfc", "manual", "admin"]).default("nfc"),
});

const staffSchema = z.object({
  name: z.string().min(1, "名前は必須です").max(50),
  card_uid: z.string().min(1, "カードUIDは必須です"),
});

// ========================================
// 打刻 API
// ========================================

// 打刻
timecard.post("/punch", async (c) => {
  const db = getDb(c.env);
  const body = await c.req.json();

  const parsed = punchSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0].message }, 400);
  }

  const { card_uid, method } = parsed.data;

  // スタッフ検索
  const staffResult = await db.execute({
    sql: "SELECT id, name FROM staff WHERE card_uid = ? AND is_active = 1",
    args: [card_uid],
  });

  if (staffResult.rows.length === 0) {
    return c.json({ error: "unknown_card", message: "未登録のカードです" }, 404);
  }

  const staff = staffResult.rows[0];
  const staffId = staff.id as number;
  const staffName = staff.name as string;

  // 今日の日付（JST）
  const now = new Date();
  const jstOffset = 9 * 60 * 60 * 1000;
  const jst = new Date(now.getTime() + jstOffset);
  const today = jst.toISOString().slice(0, 10);
  const timeStr = jst.toISOString().slice(11, 16);

  // 最新レコード取得
  const latestResult = await db.execute({
    sql: `SELECT type, timestamp FROM timecard_records
          WHERE staff_id = ? AND date(timestamp) = ?
          ORDER BY timestamp DESC LIMIT 1`,
    args: [staffId, today],
  });

  // 5分以内の重複チェック
  if (latestResult.rows.length > 0) {
    const lastTimestamp = latestResult.rows[0].timestamp as string;
    const lastTime = new Date(lastTimestamp + "Z");
    const diffMs = jst.getTime() - lastTime.getTime();
    if (diffMs < 5 * 60 * 1000) {
      return c.json({
        error: "duplicate",
        message: "5分以内の連続打刻のため無視しました",
      }, 429);
    }
  }

  // 出勤/退勤判定
  let recordType: string;
  if (latestResult.rows.length === 0 || latestResult.rows[0].type === "out") {
    recordType = "in";
  } else {
    recordType = "out";
  }

  // 記録挿入（JST で保存）
  const timestamp = `${today} ${jst.toISOString().slice(11, 19)}`;
  await db.execute({
    sql: "INSERT INTO timecard_records (staff_id, type, method, timestamp) VALUES (?, ?, ?, ?)",
    args: [staffId, recordType, method, timestamp],
  });

  const typeName = recordType === "in" ? "出勤" : "退勤";

  return c.json({
    staff_name: staffName,
    type: recordType,
    timestamp,
    message: `${staffName}さん ${typeName} ${timeStr}`,
  }, 201);
});

// 今日の記録一覧
timecard.get("/today", async (c) => {
  const db = getDb(c.env);

  // JST の今日
  const now = new Date();
  const jst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const today = jst.toISOString().slice(0, 10);

  const result = await db.execute({
    sql: `SELECT r.id, r.staff_id, s.name as staff_name, r.type, r.method, r.timestamp, r.is_modified
          FROM timecard_records r
          JOIN staff s ON r.staff_id = s.id
          WHERE date(r.timestamp) = ?
          ORDER BY r.timestamp ASC`,
    args: [today],
  });

  return c.json(result.rows);
});

// 月次履歴（Admin or Viewer 認証必須）
timecard.get("/history", viewerOrAdminAuth, async (c) => {
  const db = getDb(c.env);
  const month = c.req.query("month");

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return c.json({ error: "month パラメータ (YYYY-MM) が必要です" }, 400);
  }

  const result = await db.execute({
    sql: `SELECT r.id, r.staff_id, s.name as staff_name, r.type, r.method, r.timestamp, r.is_modified
          FROM timecard_records r
          JOIN staff s ON r.staff_id = s.id
          WHERE strftime('%Y-%m', r.timestamp) = ?
          ORDER BY r.timestamp ASC`,
    args: [month],
  });

  return c.json(result.rows);
});

// CSV エクスポート（Admin or Viewer 認証必須）
timecard.get("/export", viewerOrAdminAuth, async (c) => {
  const db = getDb(c.env);
  const month = c.req.query("month");

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return c.json({ error: "month パラメータ (YYYY-MM) が必要です" }, 400);
  }

  const result = await db.execute({
    sql: `SELECT r.id, r.staff_id, s.name as staff_name, r.type, r.method, r.timestamp, r.is_modified
          FROM timecard_records r
          JOIN staff s ON r.staff_id = s.id
          WHERE strftime('%Y-%m', r.timestamp) = ?
          ORDER BY r.timestamp ASC`,
    args: [month],
  });

  // スタッフごとの集計データ
  const staffSummary: Record<string, { totalMinutes: number; workDays: Set<string> }> = {};

  // CSV 生成（BOM 付き UTF-8）
  const bom = "\uFEFF";
  let csv = bom + "日付,時刻,スタッフ名,種別,打刻方法,修正\n";
  for (const row of result.rows) {
    const typeName = row.type === "in" ? "出勤" : "退勤";
    const methodName = row.method === "admin" ? "管理者" : row.method === "manual" ? "手動" : "NFC";
    const modified = row.is_modified ? "修正済" : "";
    const ts = String(row.timestamp).replace("T", " ").replace(/\.\d+Z?$/, "");
    const [date, time] = ts.split(" ");
    csv += `${date || ""},${time || ""},${row.staff_name},${typeName},${methodName},${modified}\n`;

    const staffName = row.staff_name as string;
    if (!staffSummary[staffName]) {
      staffSummary[staffName] = { totalMinutes: 0, workDays: new Set() };
    }

    // 出勤日数カウント（出勤レコードの日付をカウント）
    if (row.type === "in" && date) {
      staffSummary[staffName].workDays.add(date);
    }

    // 勤務時間計算（退勤時刻 - 17:00）
    if (row.type === "out" && time) {
      const [hours, minutes] = time.split(":").map(Number);
      const endMinutes = hours * 60 + minutes;
      const startMinutes = 17 * 60; // 17:00
      if (endMinutes > startMinutes) {
        staffSummary[staffName].totalMinutes += endMinutes - startMinutes;
      }
    }
  }

  // サマリーセクションを追加
  csv += "\n";
  csv += "【スタッフ別集計】\n";
  csv += "スタッフ名,出勤日数,合計勤務時間\n";
  for (const [staffName, data] of Object.entries(staffSummary)) {
    const totalHours = Math.floor(data.totalMinutes / 60);
    const totalMins = data.totalMinutes % 60;
    const timeStr = `${totalHours}時間${totalMins}分`;
    csv += `${staffName},${data.workDays.size}日,${timeStr}\n`;
  }

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="timecard_${month}.csv"`,
    },
  });
});

// 個人履歴（カードUID認証）
timecard.get("/my-history", async (c) => {
  const db = getDb(c.env);
  const cardUid = c.req.header("X-Card-UID");
  const month = c.req.query("month");

  if (!cardUid) {
    return c.json({ error: "カードUIDが必要です" }, 401);
  }

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return c.json({ error: "month パラメータ (YYYY-MM) が必要です" }, 400);
  }

  // カードUIDからスタッフを特定
  const staffResult = await db.execute({
    sql: "SELECT id, name FROM staff WHERE card_uid = ? AND is_active = 1",
    args: [cardUid],
  });

  if (staffResult.rows.length === 0) {
    return c.json({ error: "未登録のカードです" }, 404);
  }

  const staff = staffResult.rows[0];

  const result = await db.execute({
    sql: `SELECT r.id, r.staff_id, s.name as staff_name, r.type, r.method, r.timestamp, r.is_modified
          FROM timecard_records r
          JOIN staff s ON r.staff_id = s.id
          WHERE r.staff_id = ? AND strftime('%Y-%m', r.timestamp) = ?
          ORDER BY r.timestamp ASC`,
    args: [staff.id, month],
  });

  return c.json({
    staff_name: staff.name,
    records: result.rows,
  });
});

// ========================================
// 打刻記録の管理 API（Admin 認証必須）
// ========================================

// 打刻記録の修正
timecard.put("/records/:id", adminAuth, async (c) => {
  const db = getDb(c.env);
  const id = c.req.param("id");

  if (!/^\d+$/.test(id)) {
    return c.json({ error: "無効なIDです" }, 400);
  }

  const body = await c.req.json();
  const { timestamp, type } = body;

  if (!timestamp && !type) {
    return c.json({ error: "更新する項目がありません" }, 400);
  }
  if (type && type !== "in" && type !== "out") {
    return c.json({ error: "種別は in または out のみです" }, 400);
  }

  // 既存レコード取得
  const existing = await db.execute({
    sql: "SELECT id, staff_id, type, method, timestamp, is_modified FROM timecard_records WHERE id = ?",
    args: [id],
  });

  if (existing.rows.length === 0) {
    return c.json({ error: "レコードが見つかりません" }, 404);
  }

  const old = existing.rows[0];
  const changes: Record<string, { old: any; new: any }> = {};

  const updates: string[] = ["is_modified = 1"];
  const args: any[] = [];

  if (timestamp !== undefined && timestamp !== old.timestamp) {
    changes.timestamp = { old: old.timestamp, new: timestamp };
    updates.push("timestamp = ?");
    args.push(timestamp);
  }
  if (type !== undefined && type !== old.type) {
    changes.type = { old: old.type, new: type };
    updates.push("type = ?");
    args.push(type);
  }

  if (Object.keys(changes).length === 0) {
    return c.json({ error: "変更がありません" }, 400);
  }

  args.push(id);
  await db.execute({
    sql: `UPDATE timecard_records SET ${updates.join(", ")} WHERE id = ?`,
    args,
  });

  // 変更ログ記録
  await db.execute({
    sql: "INSERT INTO timecard_edit_log (record_id, action, changes) VALUES (?, 'update', ?)",
    args: [id, JSON.stringify(changes)],
  });

  return c.json({ success: true, message: "レコードを更新しました" });
});

// 打刻記録の削除
timecard.delete("/records/:id", adminAuth, async (c) => {
  const db = getDb(c.env);
  const id = c.req.param("id");

  if (!/^\d+$/.test(id)) {
    return c.json({ error: "無効なIDです" }, 400);
  }

  const existing = await db.execute({
    sql: `SELECT r.id, r.staff_id, s.name as staff_name, r.type, r.method, r.timestamp
          FROM timecard_records r
          JOIN staff s ON r.staff_id = s.id
          WHERE r.id = ?`,
    args: [id],
  });

  if (existing.rows.length === 0) {
    return c.json({ error: "レコードが見つかりません" }, 404);
  }

  const old = existing.rows[0];

  // 物理削除
  await db.execute({
    sql: "DELETE FROM timecard_records WHERE id = ?",
    args: [id],
  });

  // 変更ログ記録
  await db.execute({
    sql: "INSERT INTO timecard_edit_log (record_id, action, changes) VALUES (?, 'delete', ?)",
    args: [id, JSON.stringify({
      staff_id: old.staff_id,
      staff_name: old.staff_name,
      type: old.type,
      method: old.method,
      timestamp: old.timestamp,
    })],
  });

  return c.json({ success: true, message: "レコードを削除しました" });
});

// 過去日の打刻記録を新規作成
timecard.post("/records", adminAuth, async (c) => {
  const db = getDb(c.env);
  const body = await c.req.json();
  const { staff_id, type, timestamp } = body;

  if (!staff_id || !type || !timestamp) {
    return c.json({ error: "staff_id, type, timestamp は必須です" }, 400);
  }
  if (type !== "in" && type !== "out") {
    return c.json({ error: "種別は in または out のみです" }, 400);
  }

  // スタッフ存在確認
  const staffResult = await db.execute({
    sql: "SELECT id, name FROM staff WHERE id = ?",
    args: [staff_id],
  });
  if (staffResult.rows.length === 0) {
    return c.json({ error: "スタッフが見つかりません" }, 404);
  }

  const result = await db.execute({
    sql: "INSERT INTO timecard_records (staff_id, type, method, timestamp, is_modified) VALUES (?, ?, 'admin', ?, 1)",
    args: [staff_id, type, timestamp],
  });

  const recordId = Number(result.lastInsertRowid);

  // 変更ログ記録
  await db.execute({
    sql: "INSERT INTO timecard_edit_log (record_id, action, changes) VALUES (?, 'create', ?)",
    args: [recordId, JSON.stringify({
      staff_id,
      staff_name: staffResult.rows[0].name,
      type,
      timestamp,
    })],
  });

  return c.json({
    success: true,
    id: recordId,
    message: "レコードを作成しました",
  }, 201);
});

// 変更履歴取得
timecard.get("/records/:id/edits", viewerOrAdminAuth, async (c) => {
  const db = getDb(c.env);
  const id = c.req.param("id");

  if (!/^\d+$/.test(id)) {
    return c.json({ error: "無効なIDです" }, 400);
  }

  const result = await db.execute({
    sql: "SELECT id, record_id, action, changes, edited_at FROM timecard_edit_log WHERE record_id = ? ORDER BY edited_at DESC",
    args: [id],
  });

  return c.json(result.rows);
});

// ========================================
// スタッフ管理 API（Admin 認証必須）
// ========================================

// スタッフ一覧
timecard.get("/staff", adminAuth, async (c) => {
  const db = getDb(c.env);
  const result = await db.execute(
    "SELECT id, name, card_uid, is_active, created_at FROM staff ORDER BY id"
  );
  return c.json(result.rows);
});

// スタッフ登録
timecard.post("/staff", adminAuth, async (c) => {
  const db = getDb(c.env);
  const body = await c.req.json();

  const parsed = staffSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: parsed.error.issues[0].message }, 400);
  }

  const { name, card_uid } = parsed.data;

  // 重複チェック
  const existing = await db.execute({
    sql: "SELECT id, name FROM staff WHERE card_uid = ?",
    args: [card_uid],
  });

  if (existing.rows.length > 0) {
    return c.json({
      error: `このカードは既に「${existing.rows[0].name}」さんとして登録されています`,
    }, 409);
  }

  const result = await db.execute({
    sql: "INSERT INTO staff (name, card_uid) VALUES (?, ?)",
    args: [name, card_uid],
  });

  return c.json({
    success: true,
    id: Number(result.lastInsertRowid),
    message: `「${name}」さんを登録しました`,
  }, 201);
});

// スタッフ更新
timecard.put("/staff/:id", adminAuth, async (c) => {
  const db = getDb(c.env);
  const id = c.req.param("id");

  if (!/^\d+$/.test(id)) {
    return c.json({ error: "無効なIDです" }, 400);
  }

  const body = await c.req.json();
  const { name, card_uid, is_active } = body;

  const existing = await db.execute({
    sql: "SELECT id FROM staff WHERE id = ?",
    args: [id],
  });

  if (existing.rows.length === 0) {
    return c.json({ error: "スタッフが見つかりません" }, 404);
  }

  // card_uid の重複チェック（自分自身を除く）
  if (card_uid) {
    const dup = await db.execute({
      sql: "SELECT id, name FROM staff WHERE card_uid = ? AND id != ?",
      args: [card_uid, id],
    });
    if (dup.rows.length > 0) {
      return c.json({
        error: `このカードは既に「${dup.rows[0].name}」さんとして登録されています`,
      }, 409);
    }
  }

  const updates: string[] = [];
  const args: any[] = [];

  if (name !== undefined) {
    updates.push("name = ?");
    args.push(name);
  }
  if (card_uid !== undefined) {
    updates.push("card_uid = ?");
    args.push(card_uid);
  }
  if (is_active !== undefined) {
    updates.push("is_active = ?");
    args.push(is_active ? 1 : 0);
  }

  if (updates.length === 0) {
    return c.json({ error: "更新する項目がありません" }, 400);
  }

  args.push(id);
  await db.execute({
    sql: `UPDATE staff SET ${updates.join(", ")} WHERE id = ?`,
    args,
  });

  return c.json({ success: true, message: "スタッフ情報を更新しました" });
});

// スタッフ削除（論理削除）
timecard.delete("/staff/:id", adminAuth, async (c) => {
  const db = getDb(c.env);
  const id = c.req.param("id");

  if (!/^\d+$/.test(id)) {
    return c.json({ error: "無効なIDです" }, 400);
  }

  const existing = await db.execute({
    sql: "SELECT id FROM staff WHERE id = ?",
    args: [id],
  });

  if (existing.rows.length === 0) {
    return c.json({ error: "スタッフが見つかりません" }, 404);
  }

  await db.execute({
    sql: "UPDATE staff SET is_active = 0 WHERE id = ?",
    args: [id],
  });

  return c.json({ success: true, message: "スタッフを無効化しました" });
});

export default timecard;
