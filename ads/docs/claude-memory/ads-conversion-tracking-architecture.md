---
name: ads-conversion-tracking-architecture
description: 広告のコンバージョン計測が2リポジトリにまたがる構成、Google/ヤフー両媒体のタグ、40日間CVが0件だったgtagバグ
metadata: 
  node_type: memory
  type: project
  originSessionId: 1b47f8dd-3dec-437b-a42f-7daa3de3896b
  modified: 2026-08-11T04:27:58.338Z
---

広告の効果測定は**HP側（このリポジトリ）と procyon 側（keiyousya/helix）の2系統**に分かれている。混同しないこと。

## 系統1: Google Ads へのCV送信（HP側・このリポジトリ）

- タグ: `<ADS_TAG_ID>`、CVアクション「LINE友だち追加」= `<CONVERSION_SEND_TO>`
- 定数は `frontend/src/config/line.ts`、発火は `frontend/src/layouts/Layout.astro`
- LINEボタン（`a[href*="lin.ee/"]`）のクリックを href 基準で拾って発火。友だち追加の完了はLINEアプリ内なのでサイトから観測できず、**クリック＝追加の意思をCVとして数える**設計
- gclid付き流入時は友だち追加URLを経路別URL（`lin.ee/<AD_ROUTE>`、通常は `lin.ee/<ORGANIC_ROUTE>`）へ差し替え、判定は sessionStorage で他ページにも持ち越す

**🐛 2026-08-10発見: このCVは2026-07-01の実装から40日間1件も送信されていなかった。**
`define:vars` 付きの `<script>` を Astro が IIFE で包むため `function gtag()` がグローバルにならず、`window.gtag` が undefined。CV送信側が `typeof window.gtag === "function"` をガードにしていたため常に false だった。`gtag('js')`/`gtag('config')` は `window.dataLayer` がグローバルなので動いており、**クリックイベントだけが落ちる**という気づきにくい壊れ方。修正は `window.gtag = function gtag(){...}` と明示代入（PR #21）。

**教訓: Astro の `define:vars` スクリプトで宣言した関数はグローバルにならない。** グローバルに置きたいものは `window.` へ明示代入する。

## 系統1b: LINEヤフー広告へのCV送信（HP側・2026-08-11追加）

- コンバージョン測定「LINE友だち追加」= 検索広告アカウントの conversionTrackerId `<YAHOO_TRACKER_ID>`、`yahoo_conversion_id: <YAHOO_CONVERSION_ID>` / `yahoo_conversion_label: <YAHOO_CONVERSION_LABEL>`（目的 CONTACT / ユニーク / 30日）
- `lyads conversion add|list|tag` で作成・確認できる。**`advancedSnippet` は ADD のレスポンスに入らず GET で取り直すと返る**
- サイトジェネラルタグ（`s.yimg.jp/images/listing/tool/cv/ytag.js` + `ytag({type:"ycl_cookie", config:{ycl_use_non_cookie_storage:true}})`）は**アカウント固有の値を持たない共通タグ**で、head のなるべく上に置く。`Layout.astro` に直書き
- Google と同じ `a[href*="lin.ee/"]` のクリックで、`gtag` と `ytag` を両方発火させている
- `type` は検索広告 `yss_conversion` / ディスプレイ広告 `yjad_conversion`。アカウントが別なのでタグも別物

**未対応: yclid 流入時のLINE経路別URL差し替え。** URL差し替えは `gclid` のみ見ている。ヤフー広告経由の友だち追加は procyon 側では organic に混ざる（媒体側のCV計測は yclid ベースなので正しく取れる）。ヤフー用の経路別URLをLINE公式アカウントで発行すれば分離できる。

## 系統2: procyon 側の流入元記録（keiyousya/helix）

- `line_users.acquisition_source` (organic/google_ads) に記録し、`/ad-metrics/listing-performance` の `lineFollowGoogleAdsCount` として返す
- 受け口は実装済み（`procyon-line/src/lib/liff.ts` の `captureAcquisitionSource()` が LIFF URL の `?source=` を localStorage へ退避）
- **しかし `?source=` を付けて LIFF を起動する導線が存在せず常にNULL。** HP側の広告導線は `lin.ee` の経路別URLで分けており、これはLINE公式アカウント側の友だち追加経路なので、その後LIFFが開かれるときのURLにクエリは引き継がれない
- 起票済み: **helix#1778**（根本原因と対応案A/B/C）。症状側は helix#1745

## 計測の使い分け

| 知りたいこと | 見る場所 | 信頼度 |
|---|---|---|
| 広告クリック→LINE追加意思 | Google Ads「LINE友だち追加」CV | PR #21マージ後から有効 |
| 同上（ヤフー面） | LINEヤフー広告「LINE友だち追加」CV | 2026-08-11設置 |
| 実際の友だち追加数 | LINE公式アカウントの経路別URL統計 | 動作中 |
| 予約総数 | procyon `reservationCount` | 全流入・キャンセル込みで鈍い |
| 広告経由の友だち追加 | procyon `lineFollowGoogleAdsCount` | **常に0（helix#1778待ち）** |

「ローカルアクション-経路」CVは経路タップであって来院でも予約でもない。判断材料にしない。

**How to apply:** CV数がおかしいと思ったら、まず `gads report --query "SELECT segments.conversion_action_name, metrics.conversions FROM campaign ..."` でアクション別の内訳を見る。合計だけ見ていると「ローカルアクション-経路」に埋もれて気づけない。関連: [[clinic-ad-schedule-ops]] [[procyon-ad-metrics-api]]
