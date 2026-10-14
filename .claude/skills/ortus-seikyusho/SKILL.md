---
name: ortus-seikyusho
description: 顧問税理士（オルタス税理士法人）から毎月クリニックのメール（さくら）に届く請求書PDFを取り出して、HLプリンタで印刷する。「オルタスの請求書を印刷して」「税理士の請求書出して」と頼まれたときに使う。
---

# オルタス税理士法人の請求書の印刷

- 毎月上旬に `fms-tkcmail@tkc.co.jp`（差出人名「オルタス税理士法人」）から件名「請求書をお送りいたします。」で届く。添付 `YYYYMM01_326_001.pdf`（A4 1枚）
- インボイスなので**紙に印刷して保存する**決まり（メール本文の注意書き）。印刷した紙が原本扱い
- 中身はほぼ毎月同じ: 会計顧問報酬 40,000 − 値引 10,000 ＋ 戦略経営者支援システムレンタル料 15,000 ＝ 税込 49,500円。七十七銀行 大学病院前支店から20日過ぎに口座振替

## 手順

1. `mcp__sakura-mail__search_messages`（query: `オルタス`）で該当月のメールの UID を調べる。未読のまま残っている月があれば、印刷済みか確認する
2. sakura-mail MCP には添付を取り出す機能がないので、同じフォルダの `fetch-attachments.mts` で IMAP から直接取る（読み取り専用で、既読も付かない）:

   ```bash
   OUT=<scratchpad>/ortus-YYYYMM; mkdir -p $OUT
   cd ~/dev/agent-mail/apps/server && pnpm exec tsx \
     ~/dev/koutoudai-yugata-naika-clinic/.claude/skills/ortus-seikyusho/fetch-attachments.mts <UID> $OUT
   ```

3. 中身を確認する。Read ツールでは PDF の和文フォントが欠けて表示されるので、macOS で PNG にして見る:

   ```bash
   sips -s format png $OUT/*.pdf --out $OUT/preview.png
   ```

4. 印刷して、キューが空になるまで待つ:

   ```bash
   lpr -P Brother_HL_L8430CDW -o media=A4 $OUT/*.pdf
   lpstat -o Brother_HL_L8430CDW   # 空になれば完了
   ```

5. 請求日・金額・振替日をユーザーに報告する。メールの既読・未読は変えない

関連: カード売上の振込明細の印刷は `/card-meisai`。
