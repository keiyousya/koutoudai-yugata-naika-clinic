---
name: shift-calendar
description: シフト管理DBの公開済みシフトのうち、田村さつき以外の分をGoogleカレンダーの「家族」カレンダーに登録する。「10月のシフトをカレンダーに入れて」「来月のシフト登録しておいて」と頼まれたときに使う。
argument-hint: "[対象月（例: 2026-11）。省略時は翌月]"
---

# シフトのカレンダー登録

対象月: $ARGUMENTS（省略時は翌月）

## 登録ルール

- 対象: `shift_assignments` のうち **田村さつき以外** 全員
- 登録先: Googleカレンダーの **「家族」** カレンダー（`family08116150111335324801@group.calendar.google.com`）。個人カレンダー（primary）には入れない
- タイトル: **氏名だけ**（例: `佐々木えりか`）。「シフト」や（看護）（事務）は付けない
- 色: **全員バナナ**（`colorId: "5"`）
- 時間: `day` = 14:00〜17:00、`evening` = 17:00〜21:00（`+09:00`）
- **細矢理奈が同じ日に day と evening の両方に入っているときは、14:00〜19:00 の1件にまとめる**（シフト上は14〜21時だが、本人には14〜19時で伝えているため）
- `availability: AVAILABILITY_FREE`、`useDefaultReminders: false`（通知なし）

## 手順

1. **シフトを取得する**（`backend/.dev.vars` が無ければ memory の turso-cli-in-wsl の手順で再生成）

   ```bash
   cd backend
   export $(tr -d '\r' < .dev.vars | grep -v '^#' | xargs)
   node --input-type=module -e '
   import { createClient } from "@libsql/client";
   const db = createClient({ url: process.env.TURSO_URL, authToken: process.env.TURSO_AUTH_TOKEN });
   const m = "2026-11";
   console.log((await db.execute({ sql: "SELECT * FROM shift_periods WHERE month=?", args: [m] })).rows);
   const r = await db.execute({ sql: "SELECT a.date,a.slot,a.role,s.name FROM shift_assignments a JOIN shift_staff s ON s.id=a.staff_id WHERE a.date LIKE ? ORDER BY a.date,a.slot", args: [m + "%"] });
   for (const x of r.rows) console.log(x.date, x.slot, x.role, x.name);
   '
   ```

   - `shift_periods.published_at` が null（未公開）なら、登録前にユーザーに確認する。シフトがまだ変わる可能性がある

2. **重複を確認する**: 「家族」カレンダーの対象月を `list_events` で見て、既に同じ名前・日時の予定があればそれは作らない。シフトが変わっていて古い予定が残っている場合は、削除してよいかユーザーに確認する

3. **登録する**: 田村さつき以外の行を、上の登録ルールで `create_event` する（並列でよい）

4. **報告する**: 名前ごとに日付と件数を表でまとめる。失敗した件があればそれも書く
