---
name: lineworks-shift
description: シフト管理DBの公開済みシフトを、LINE WORKS のカレンダー「看護師シフト」「受付事務シフト」に WORKS MCP で登録する。スタッフが確定シフトを見る唯一の場所。「LINE WORKSにシフト入れて」「来月のシフトをLINE WORKSに登録して」と頼まれたときに使う。
argument-hint: "[対象月（例: 2026-12）。省略時は翌月]"
---

# シフトの LINE WORKS カレンダー登録

対象月: $ARGUMENTS（省略時は翌月）

確定シフトは **LINE WORKS のカレンダーが唯一の正**。shift アプリのスタッフ画面には確定シフトを出していない（管理画面のみ）。そのため公開したシフトは必ずここに登録する。Google「家族」カレンダーへの登録（`/shift-calendar`）とは別物で、ルールも違う。

## 前提

- MCP サーバー `works-mcp`（`https://mcp.worksmobile.com/mcp`、user scope）が接続済みであること。未認証なら `/mcp` → `works-mcp` でユーザーに LINE WORKS ログインしてもらう
- LINE WORKS 管理画面で「WORKS MCP」アプリを追加済み（利用メンバーは田村慧人のみ）

## 登録先

| role | カレンダー | calendarId | 色 |
|------|-----------|------------|----|
| `nurse` | 看護師シフト | `c_500449741_8363210d-9503-4d7d-9565-039bf2b15cf4` | 水色 |
| `clerk` | 受付事務シフト | `c_500449741_e541dac9-bb84-4901-a9ba-9dce2732b1b8` | コーラル |

- 色はカレンダー単位（予定ごとには指定できない）。カレンダーの作成・色・共有の変更は MCP ではできないので Chrome で `https://calendar.worksmobile.com/` を操作する
- 両カレンダーともスタッフ全員に「予定の詳細を閲覧」で共有済み。**新しいスタッフが入ったら両カレンダーの共有に追加する**

## 登録ルール

- 対象: `shift_assignments` の **全員**（田村さつきも含む）
- タイトル: **氏名だけ**（例: `佐々木えりか`）
- 時間: `day` = 14:00〜17:00、`evening` = 17:00〜21:00（`timeZone: "Asia/Tokyo"`）
- **同じ人が同じ日に day と evening の両方に入っているときは 14:00〜21:00 の1件にまとめる**
- ただし **細矢理奈の day+evening は 14:00〜19:00 の1件**（本人には14〜19時で伝えているため）
- `transparency: "TRANSPARENT"`、`sendNotification: false`、reminders は付けない

## 手順

1. **シフトを取得して登録リストを作る**（`backend/.dev.vars` が無ければ memory の turso-cli-in-wsl の手順で再生成）

   ```bash
   cd backend
   export $(tr -d '\r' < .dev.vars | grep -v '^#' | xargs)
   node --input-type=module -e '
   import { createClient } from "@libsql/client";
   const db = createClient({ url: process.env.TURSO_URL, authToken: process.env.TURSO_AUTH_TOKEN });
   const m = "2026-12";
   console.log((await db.execute({ sql: "SELECT * FROM shift_periods WHERE month=?", args: [m] })).rows);
   const r = await db.execute({ sql: "SELECT a.date,a.slot,a.role,s.name FROM shift_assignments a JOIN shift_staff s ON s.id=a.staff_id WHERE a.date LIKE ? ORDER BY a.date,a.slot", args: [m + "%"] });
   const g = {};
   for (const x of r.rows) { const k = x.date + "|" + x.name + "|" + x.role; (g[k] ||= []).push(x.slot); }
   let n = 0;
   for (const [k, s] of Object.entries(g)) {
     const [d, name, role] = k.split("|");
     const st = s.includes("day") ? "14:00" : "17:00";
     let en = s.includes("evening") ? "21:00" : "17:00";
     if (s.length === 2 && name === "細矢理奈") en = "19:00";
     console.log(role, d, st, en, name); n++;
   }
   console.log(n);
   '
   ```

   - `shift_periods.published_at` が null（未公開）なら、登録前にユーザーに確認する

2. **重複を確認する**: 両カレンダーの対象月を `calendar_list_events` で見る（範囲は最大31日、UTC で `2026-11-30T15:00:00%2B00:00` 〜 `2026-12-31T14:59:59%2B00:00` のように指定）。同じ名前・日時の予定は作らない。シフトが変わって古い予定が残っている場合は、`calendar_delete_event` で消してよいかユーザーに確認する

3. **登録する**: 1件だけ `calendar_create_event` して成功を確かめてから、残りを並列で登録する

4. **報告する**: カレンダーごと・名前ごとに件数をまとめる。失敗した件があればそれも書く
