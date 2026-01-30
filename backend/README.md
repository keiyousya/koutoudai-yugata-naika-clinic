# 勾当台夕方内科クリニック 予約API

Cloudflare Workers + Turso で構築した予約システムバックエンド

## セットアップ手順

### 1. Turso のセットアップ

```bash
# Turso CLI インストール
brew install tursodatabase/tap/turso

# ログイン
turso auth login

# データベース作成
turso db create koutoudai-clinic

# 接続情報を取得
turso db show koutoudai-clinic --url
turso db tokens create koutoudai-clinic
```

### 2. データベース初期化

```bash
# 環境変数設定
export TURSO_URL="libsql://your-db-url"
export TURSO_AUTH_TOKEN="your-token"

# テーブル作成
npm run db:setup
```

### 3. Cloudflare Workers へデプロイ

```bash
# Cloudflare にログイン
npx wrangler login

# シークレット設定
npx wrangler secret put TURSO_URL
npx wrangler secret put TURSO_AUTH_TOKEN

# デプロイ
npm run deploy
```

### 4. フロントエンドの設定を更新

`src/components/Reservation.astro` の `apiBaseUrl` を
デプロイされたWorkerのURLに変更:

```ts
const reservationConfig = {
  enabled: true,
  apiBaseUrl: "https://koutoudai-reservation-api.<your-subdomain>.workers.dev",
};
```

## API エンドポイント

| メソッド | パス | 説明 |
|---------|------|------|
| GET | `/` | ヘルスチェック |
| GET | `/api/reservations` | 予約一覧取得 |
| POST | `/api/reservations` | 予約作成 |
| GET | `/api/reservations/:id` | 予約詳細 |
| PUT | `/api/reservations/:id` | ステータス更新 |
| DELETE | `/api/reservations/:id` | 予約削除 |
| GET | `/api/availability/:date` | 空き状況確認 |

## ローカル開発

```bash
npm run dev
```

http://localhost:8787 でAPIが起動します。
