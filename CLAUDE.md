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

- **アカウント**: tamurakeito@keiyousya.com（Account ID: b0c1ef333c5f849d72e79434ae51e562）
- **認証**: `npx wrangler login` でOAuth認証（ブラウザ操作が必要、Claude Code内では実行不可）
- **GitHub Actions**: `CLOUDFLARE_API_TOKEN` シークレットで自動デプロイ

### Worker一覧

| Worker名 | 設定ファイル | ローカルポート | 用途 |
|-----------|-------------|---------------|------|
| koutoudai-reservation-api | wrangler.toml | 8789 | 予約API |
| koutoudai-timecard-api | wrangler.timecard.toml | 8789 | タイムカードAPI |
| koutoudai-shift-api | wrangler.shift.toml | 8790 | シフトAPI |
| koutoudai-inventory-api | wrangler.inventory.toml | 8791 | 在庫管理API |

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
- 医薬品: 25品目、備品: 39品目
- 発注管理は医薬品のみ対象、規定量は一律5箱
- 発注先: 東邦薬品株式会社 中野様、署名: 田村さつき
- メール件名: 「薬の注文のお願い（勾当台夕方内科　田村）」

### shift（シフト管理）

- フロントポート: 5176、ベースパス: `/shift/`
- 認証: スタッフID + パスコード（SHA-256ハッシュ）

### timecard（タイムカード）

- フロントポート: 5175、ベースパス: `/timecard/`
- PWA対応、WebUSB NFC読み取り（Sony PaSoRi）

## 外部サービス

- **LINE WORKS**: フリープランのためBot API / Developer Console 利用不可。通知はPWA等で代替。
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
