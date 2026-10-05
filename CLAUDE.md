# CLAUDE.md

プロジェクト全体のルール・コンテキスト。Claude Codeが参照する。

## プロジェクト概要

勾当台夕方内科クリニックの業務全般を集約したモノリポ。

## 技術スタック

- **フロントエンド**: React 19, Vite, TanStack Router, TanStack Query, TailwindCSS v4, Radix UI, CVA
- **バックエンド**: Hono, Cloudflare Workers, Turso (libsql/SQLite)
- **パッケージ管理**: pnpm workspaces
- **デプロイ**: GitHub Actions → フロントは GitHub Pages、APIは Cloudflare Workers
- **UIパターン**: shadcn/ui風コンポーネント（`components/ui/`）、`cn()` ユーティリティ
- **バリデーション**: Zod

## Cloudflare Workers

- **アカウント**: kit_tamtam@icloud.com（Account ID: ad2580c6aef7859a99719a4cc65419d7）
- **認証**: `npx wrangler login` でOAuth認証（ブラウザ操作が必要、Claude Code内では実行不可）
- **GitHub Actions**: `CLOUDFLARE_API_TOKEN` シークレットで自動デプロイ

### Worker一覧

| Worker名 | 設定ファイル | ローカルポート | 用途 |
|-----------|-------------|---------------|------|
| koutoudai-reservation-api | wrangler.toml | 8789 | 予約API |
| koutoudai-timecard-api | wrangler.timecard.toml | 8789 | タイムカードAPI |
| koutoudai-shift-api | wrangler.shift.toml | 8790 | シフトAPI |
| koutoudai-inventory-api | wrangler.inventory.toml | 8791 | 在庫管理API |
| koutoudai-internal-forms | wrangler.internal-forms.toml | 8793 | 院内専用帳票（パスワード認証。https://koutoudai-internal-forms.kit-tamtam.workers.dev） |

### 新規Workerのsecrets設定

```bash
echo "値" | npx wrangler secret put KEY --config wrangler.XXX.toml
```

## データベース (Turso)

- **DB名**: koutoudai-clinic
- **URL**: libsql://koutoudai-clinic-tamurakeito.aws-ap-northeast-1.turso.io
- **接続情報**: `backend/.dev.vars` に記載（git管理外）
- **セットアップスクリプト**: `backend/scripts/setup-*-db.js`

## アプリ別メモ

### inventory（在庫管理）

- フロントポート: 5177、ベースパス: `/inventory/`
- カテゴリ: category_id=1 → 医薬品、category_id=2 → 備品
- 医薬品: 32品目（2026-09にデエビゴ・ベタヒスチン・ゾコーバ・ダイチロナ・インフルワクチンを追加。インフルワクチンは納入元別に Meiji・東邦 / Meiji・スズケン / デンカ・スズケン の3行。`backend/scripts/migrate-inventory-add-items-2026-09.js`）、備品: 42品目
- 発注対象・規定量は品目ごとにDB管理（`inventory_items.is_orderable` / `order_threshold`）。発注管理画面の「発注設定」から変更可能
- 初期設定は医薬品25品目 + 迅速検査キット3種（flu/cov、strep、myco）が発注対象
- 発注先: 東邦薬品株式会社 中野様、署名: 田村さつき
- メール件名: 「薬の注文のお願い（勾当台夕方内科　田村）」

### shift（シフト管理）

- フロントポート: 5176、ベースパス: `/shift/`
- 認証: スタッフID + パスコード（SHA-256ハッシュ）
- 公開済みシフト（田村さつき以外）のGoogleカレンダー「家族」への登録は `/shift-calendar` スキル

### timecard（タイムカード）

- フロントポート: 5175、ベースパス: `/timecard/`
- PWA対応、WebUSB NFC読み取り（Sony PaSoRi）

### shisetsu-kijun（施設基準）

- 当院の施設基準の台帳・要件・掲示先を管理する Markdown ディレクトリ（ビルド対象外）
- **施設基準に関することはすべて `shisetsu-kijun/` で管理する**。運用ルールは `shisetsu-kijun/README.md`
- 届出書の提出物・控えは `filings/kouseikyoku/` 側に置き、双方からリンクする
- 受理状況の確認は `/shisetsu-kijun` スキル（東北厚生局HPをChrome操作）

### forms（予診票などの帳票）

- 実体は `frontend/public/forms/`。**院内印刷用とWeb公開用を1ファイルで兼ねる**（コピーを作らない）
- Astro の `public/` なのでビルドでそのまま配信される。例: `https://koutoudai-yugata-naika.clinic/forms/flu-vaccine-yoshinhyo.html`
- A4印刷前提（`@page` 指定）。画面上部の印刷ボタンは `@media print` で非表示にする
- インフル予診票は**任意接種用**。65歳以上の定期接種は仙台市の様式を使う（`tasks/2026-09-sendai-elderly-flu-vaccine.md`）
- **院内専用の帳票（罹患証明書・指導用紙など）は公開しない**。リポジトリ直下の `internal-forms/` に置き、Worker `koutoudai-internal-forms` がパスワード認証の後に配信する（https://koutoudai-internal-forms.kit-tamtam.workers.dev）。帳票を足したら `internal-forms/index.html` の一覧にも1行足す
- 院内帳票のパスワードは secret の `FORMS_PASSWORD`（`echo "値" | npx wrangler secret put FORMS_PASSWORD --config wrangler.internal-forms.toml`）。変えるとログイン中の全員がログアウトされる

### instagram（Instagram投稿・広告の画像）

- `instagram/*.html` に画像をHTMLで作り、`.post` 要素をスクリーンショットしてPNGにする（ビルド対象外、PNGはリポジトリに入れない）
- 広告の画像作成〜Meta広告マネージャでの出稿は `/instagram-ads` スキル

### clinical-guidelines（診療ガイドラインまとめ）

- 他プロジェクトでも使うため、別リポジトリ [keiyousya/clinical-guidelines](https://github.com/keiyousya/clinical-guidelines) に切り出した（2026-10）。このリポジトリには置かない
- ローカルでは `../clinical-guidelines/` にクローン済み。追記・更新はそちらで行う（運用ルールは同リポジトリの README.md）
- ガイドライン側には当院固有の運用メモを書かない。**自院メモ（外来での使いどころ・在庫・紹介基準など）は `clinical-notes/` にガイドライン側と同じパスで置く**（`clinical-notes/README.md`）

## 外部サービス

- **LINE WORKS**: フリープランのためBot API / Developer Console 利用不可。通知はPWA等で代替。
- **helix（電子カルテ）**: https://koutoudai-yugata-naika.helix.keiyousya.com 。Chrome操作で扱う（ログイン済み前提）。診察前準備（問診・検査結果の確認と下書きカルテ作成）は `/shinsatsu-junbi` スキル、カルテ記載・傷病名登録は `/karte` スキル、患者向けお知らせは `/announcement` スキル
- **WebORCA（レセコン）**: https://weborca.cloud.orcamo.jp/ 。Chrome操作で扱う（ログインはユーザーが手動）。OASCIS登録用の点検用UKEファイルの出力〜匿名化〜OASCIS登録は `/orca-tenken-uke` スキル
- **TKC（給与計算）**: https://cloud.tkc.co.jp/px/sqru5tu443/tma/gen 。Chrome操作で扱う（ログイン済み前提）。毎月15日支給の給与の入力〜支給確定〜振込依頼書の印刷は `/tkc-kyuyo` スキル
- **GitHub Pages**: https://keiyousya.github.io/ 配下に各アプリをサブディレクトリでデプロイ
- **カスタムドメイン**: https://koutoudai-yugata-naika.clinic

## 開発コマンド

```bash
pnpm dev              # HP + 予約API
pnpm dev:admin        # 管理画面 + API
pnpm dev:timecard     # タイムカード + API
pnpm dev:shift        # シフト + API
pnpm dev:inventory    # 在庫管理 + API
```
