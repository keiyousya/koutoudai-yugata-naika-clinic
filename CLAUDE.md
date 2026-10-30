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
- 医薬品: 35品目（2026-09にデエビゴ・ベタヒスチン・ゾコーバ・ダイチロナ・インフルワクチンを追加。インフルワクチンは納入元別に Meiji・東邦 / Meiji・スズケン / デンカ・スズケン の3行。`backend/scripts/migrate-inventory-add-items-2026-09.js`。2026-10にブデホル・フルチカゾン点鼻液・ゲンタマイシン軟膏を追加。`migrate-inventory-add-items-2026-10.js`）、備品: 52品目（2026-10に27G針・サーフロ22G・膿盆・薬袋などを追加。`migrate-inventory-add-supplies-2026-10.js`）
- 発注対象・規定量（＝定数）は品目ごとにDB管理（`inventory_items.is_orderable` / `order_threshold`）。発注管理画面の「発注設定」から変更可能。`order_threshold = 0` は「定数なし」で、カウント画面にバッジで出る（2026-10に初期値のまま残っていた 5 を 0 に一括リセット）
- 初期設定は医薬品25品目 + 迅速検査キット3種（flu/cov、strep、myco）が発注対象
- 発注先: 東邦薬品株式会社 中野様、署名: 田村さつき
- メール件名: 「薬の注文のお願い（勾当台夕方内科　田村）」

### shift（シフト管理）

- フロントポート: 5176、ベースパス: `/shift/`
- 認証: スタッフID + パスコード（SHA-256ハッシュ）
- **確定シフトは LINE WORKS のカレンダー「看護師シフト」「受付事務シフト」が唯一の正**（2026-10）。スタッフ画面（`/view`）には確定シフトを出さず案内だけ表示し、管理画面からは引き続き閲覧できる。公開したシフトの LINE WORKS への登録は `/lineworks-shift` スキル
- 公開済みシフト（田村さつき以外）のGoogleカレンダー「家族」への登録は `/shift-calendar` スキル

### timecard（タイムカード）

- フロントポート: 5175、ベースパス: `/timecard/`
- PWA対応、WebUSB NFC読み取り（Sony PaSoRi）

### envelope（封筒印刷）

- フロントポート: 5179、ベースパス: `/envelope/`（バックエンドなし）
- 長形3号・長形4号に宛名を縦書きで印刷する。HL-L8430CDW の多目的トレイから、ブラウザの印刷ダイアログで出す（ドライバに長3・長4が定形サイズとしてある。角2は幅がトレイの上限215.9mmを超えるので不可）
- 宛先帳・差出人・位置調整はブラウザの localStorage にだけ保存する（宛先は個人情報なのでリポジトリ・サーバーに置かない）
- 郵便番号→住所の補完は zipcloud API

### shisetsu-kijun（施設基準）

- 当院の施設基準の台帳・要件・掲示先を管理する Markdown ディレクトリ（ビルド対象外）
- **施設基準に関することはすべて `shisetsu-kijun/` で管理する**。運用ルールは `shisetsu-kijun/README.md`
- 届出書の提出物・控えは `filings/kouseikyoku/` 側に置き、双方からリンクする
- 受理状況の確認は `/shisetsu-kijun` スキル（東北厚生局HPをChrome操作）

### notices（院内掲示物）

- 院内に貼る掲示物のHTMLは `notices/` に置く（ビルド対象外）
- 施設基準・療担規則で義務になっている掲示の一覧は `shisetsu-kijun/keiji.md`。掲示物を足したり、基準を届け出たりしたらそこも直す

### forms（予診票などの帳票）

- 実体は `frontend/public/forms/`。**HTMLが原本で、院内印刷用とWeb公開用を兼ねる**（手でコピーを作らない）
- 患者向けには同名の **PDF を公開する**（HTMLは端末によってスタイルが崩れるため。2026-10）。PDFはHTMLから `pnpm --filter frontend forms:pdf`（ローカルのChromeで印刷）で作り、コミットする。**HTMLを直したら必ずPDFも作り直す**
- Astro の `public/` なのでビルドでそのまま配信される。例: `https://koutoudai-yugata-naika.clinic/forms/flu-vaccine-yoshinhyo.pdf`
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

- **LINE WORKS**: フリープランのためBot API / Developer Console 利用不可（トーク送信はMCPでは不可、Chrome で https://talk.worksmobile.com/ を操作）。採用者への入職案内（書類・制服・初回出勤日の候補）は `/nyushoku-annai` スキル。公式の **WORKS MCP**（MCPサーバー `works-mcp`、user scope、利用メンバーは田村慧人のみ）でカレンダー・掲示板・メール・タスク（自分あてのみ）などを操作できる。カレンダーの作成・色・共有設定はMCPでは不可なので Chrome（https://calendar.worksmobile.com/）で行う
- **helix（電子カルテ）**: https://koutoudai-yugata-naika.helix.keiyousya.com 。Chrome操作で扱う（ログイン済み前提）。診察前準備（問診・検査結果の確認と下書きカルテ作成）は `/shinsatsu-junbi` スキル、カルテ記載・傷病名登録は `/karte` スキル、患者向けお知らせは `/announcement` スキル
- **WebORCA（レセコン）**: https://weborca.cloud.orcamo.jp/ 。Chrome操作で扱う（ログインはユーザーが手動）。OASCIS登録用の点検用UKEファイルの出力〜匿名化〜OASCIS登録は `/orca-tenken-uke` スキル
- **TKC（給与計算）**: https://cloud.tkc.co.jp/px/sqru5tu443/tma/gen 。Chrome操作で扱う（ログイン済み前提）。毎月15日支給の給与の入力〜支給確定〜振込依頼書の印刷は `/tkc-kyuyo` スキル
- **毎月の印刷物**: カード売上の振込明細（JCB Link・七十七カード Vpass）は `/card-meisai`、税理士（オルタス税理士法人）の請求書は `/ortus-seikyusho`。どちらも HL（`Brother_HL_L8430CDW`）に `lpr` で出す
- **GitHub Actions の Claude Code**: Issue・PR の「@claude」で動き（`.github/workflows/claude.yml`、Max プランのトークン）、作業して PR を作る。AI秘書（keiyousya/agent-secretary）からも依頼できる。資料だけの PR（`ads/docs/`・`tasks/`・`shisetsu-kijun/`・`clinical-notes/`・`filings/`・`notices/`）は `claude-automerge.yml` が自動でマージし、それ以外は CI（`ci.yml`）が通った後に田村個人が確認してマージする
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
