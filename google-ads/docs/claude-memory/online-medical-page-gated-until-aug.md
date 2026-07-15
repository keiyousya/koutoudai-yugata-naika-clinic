---
name: online-medical-page-gated-until-aug
description: オンライン診療ページは完成済みだが2026年8月まで非公開ゲート中。公開時の解除箇所一覧
metadata:
  type: project
---

`frontend/src/pages/online-medical.astro`（オンライン診療＝情報通信機器を用いた診療の施設基準掲示ページ）は内容完成済みだが、**2026年8月公開予定**のため現在は非公開ゲート中。

**Why:** 施設基準の届出前で、正式公開は8月。それまで患者・検索エンジンに見せたくない。

**How to apply:** frontend は GitHub Pages 配信（`.github/workflows/deploy.yml`）でサーバー処理不可 → 本物のHTTP Basic認証は使えない。代替としてクライアントサイドのパスワードゲート（SHA-256ハッシュ照合、内容はソースには残る＝暗号学的秘匿ではない）を実装。

8月公開時に解除する箇所（各所に `TODO(2026-08)` コメントあり）:
- `online-medical.astro`: `#om-gate` ブロック・末尾 `<script>`・`Layout` の `noindex={true}` を削除
- `astro.config.mjs`: sitemap の `filter`（online-medical 除外）を解除
- `components/DisclosureLinks.astro`: オンライン診療カードのコメントアウト解除＋グリッドを `repeat(3, 1fr)` に戻す
- `components/Footer.astro`: フッターのオンライン診療リンクのコメントアウト解除

チェックリストは厚労省「基準等遵守の確認をするためのチェックリスト（医療機関ver.）」全文を再現。詳細は [[clinic-ad-schedule-ops]] のクリニック運用も参照。
