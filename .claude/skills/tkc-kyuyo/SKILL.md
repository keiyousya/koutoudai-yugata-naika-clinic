---
name: tkc-kyuyo
description: TKC（給与計算クラウド）で毎月15日支給のスタッフ給与を、タイムカードとの照合・入力・計算・支給確定・振込依頼書の印刷までChrome操作で進める。「10月15日支払の給与をTKCに登録したい」「今月の給与やろう」「振込依頼書を印刷して」と頼まれたときに使う。
argument-hint: "[支給日（例: 2026-11-15）。省略時は直近の15日]"
---

# TKC 給与計算（毎月15日支給）

対象支給日: $ARGUMENTS（省略時は直近の15日）

- TKC: https://cloud.tkc.co.jp/px/sqru5tu443/tma/gen （ログイン済み前提。切れていたらユーザーにログインしてもらう）
- 支給日は**毎月15日**。計算期間は**前月1日〜前月末日**、**給与月分＝支給月**（10/15支給なら「2026年10月分」）
- 給与体系はパートのみ実質稼働。時給・通勤手当（日額）は社員マスタに入っていて、出勤日数と時間を入れれば自動計算される
- スタッフは住民税の天引きなし、社保なし。所得税は乙欄（約3.063%）
- 田村さつき（専従者）は「支給開始していない社員」として対象外のまま。触らない

## 画面操作のコツ

- 画面遷移が遅い。クリック後は 2 秒待ってからスクリーンショット。中身は `get_page_text` の方が確実
- **日付入力欄は直接タイプすると確定時に消えることがある**（給与支給日の登録画面の「給与計算期間」）。カレンダーアイコンから選ぶ
- 入力画面のURL: `.../pxmninputresult/gen/salaryresults/{支給日}/{社員id}/edit`（佐々木=1, 池田=3, 細矢=6, 星=7）。一覧: `.../pxmninputresult/gen/salaryresults?is_canimportcsv=1&ymd_pymt={支給日}`

## 手順

### 1. 状況確認

1. 「社員別給与・賞与の入力」→ 支給日カレンダーで対象月を開く
2. 対象支給日の「処理開始」→ 給与支給日画面で **計算期間と「月分」を確認**。月分が支給月になっていなければ手順2へ
3. 「入力・計算・CSV読込へ」→ 社員ごとの入力・計算状況（済み／支給なし／空欄）とエキスパートチェックの警告を見る
4. 前月の支給日が「支給確定」されているかも確認する（メニュー「支給確定」）

### 2. 支給日が無い・月分が違うとき

- 「給与の支給日登録」→ **「個別に登録」** を選ぶ → 計算期間（前月1日〜末日）・支給日（15日）をカレンダーで選択 → **給与月分が支給月になっていることを確認**してOK
- 給与月分は**一度登録すると修正できない**。間違っていたら支給日の削除→登録し直しになる。**削除はユーザーに押してもらう**（自動実行の安全判定で止められる。入力済みのデータも消えるので確認を取る）
- 「月分が当月分の2回目以降」というエキスパートチェックの警告は、月分の重複が原因

### 3. 勤怠をタイムカードと照合する

シフトDB（`shift_assignments`）は月によって入っていないので、**タイムカード（`timecard_records`）を正とする**。時刻は JST で保存されている（+9 しない）。

```bash
cd backend
export $(tr -d '\r' < .dev.vars | grep -v '^#' | xargs)
node --input-type=module -e '
import { createClient } from "@libsql/client";
const db = createClient({ url: process.env.TURSO_URL, authToken: process.env.TURSO_AUTH_TOKEN });
const from = "2026-09-01", to = "2026-10-01";
const r = await db.execute({ sql: "SELECT s.name, r.type, r.timestamp, r.is_modified FROM timecard_records r JOIN staff s ON s.id=r.staff_id WHERE r.timestamp >= ? AND r.timestamp < ? ORDER BY s.name, r.timestamp", args: [from, to] });
for (const x of r.rows) console.log(x.name, x.type, x.timestamp, x.is_modified);
'
```

- **出勤時間の数え方**: 始業＝シフト開始時刻（日中枠 14:00／夕方枠 17:00。打刻がそれより遅ければ打刻時刻）、終業＝退勤打刻。日ごとに足す
  - 例: 16:45 出勤・21:44 退勤 → 17:00〜21:44 = 4:44
- 出勤日数は「平日出勤」欄に入れる（土日も平日出勤で入れている）
- 打刻漏れ（in だけ／out だけ）があればユーザーに確認する
- TKC に既に入っている値と食い違ったら、計算根拠を示してユーザーに確認してから直す

### 4. 入力・計算

1. 出勤がある人: 入力画面で「平日出勤」に日数、「出勤時間」に `hh:mm` → **計算**
2. 出勤がない人: 「支給なし」を選んで「更新して次社員」
3. 全員が「済み」か「支給なし」になり、エキスパートチェックに警告が無いことを確認
4. 結果（出勤・基本給・通勤手当・所得税・差引支給額）を表にしてユーザーに見せる

### 5. 退職者がいるとき

1. 「社員」→ 該当者の「確認」→ 左メニュー「退職」→ 修正 → 退職日・退職区分（普通退職）→ OK。「退職済み」チェックは付けない
2. 給与の社員別入力画面の「支給終了の設定画面へ」→ **最終支給日の画面で**「今回で支給終了」にチェック → OK
3. 社員マスタを変えると未確定の給与が未計算に戻ることがある。終わったら一覧で状態を見直す

### 6. 支給確定

- **ユーザーの明示的な指示があってから**押す。メニュー「支給確定」→ 古い支給日から順に「確定」→「はい」
- 確定すると入力・計算できなくなる（戻すときは「確定解除」）

### 7. 振込依頼書の印刷（HLプリンタ）

1. メニュー「振込依頼」→ 支給日を選び、振込元（七十七銀行 大学病院前支店）の行を**ダブルクリック**
2. 件数・金額を確認 → 「振込依頼書の印刷」→ 既定のまま（依頼書のみ）→ **PDF**
3. 開いたPDFタブで保存:

   ```js
   const data = await PDFViewerApplication.pdfDocument.getData();
   const a = document.createElement('a');
   a.href = URL.createObjectURL(new Blob([data], {type:'application/pdf'}));
   a.download = 'tkc-furikomi-irai-YYYYMMDD.pdf'; a.click();
   ```

4. PowerShell で HL に送る（Adobe Reader 11）:

   ```powershell
   Start-Process "C:\Program Files (x86)\Adobe\Reader 11.0\Reader\AcroRd32.exe" -ArgumentList '/n','/t',"`"$env:USERPROFILE\Downloads\tkc-furikomi-irai-YYYYMMDD.pdf`"",'"HL-L8430CDW_A4"'
   ```

   キューはすぐ空になるので、紙が出たかはユーザーに確認する

### 8. 残り（未整備）

- 給与明細の配信（メニュー「給与明細」）はまだ手順化していない。やったら追記する
