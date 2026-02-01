# 勾当台夕方内科クリニック

勾当台夕方内科クリニックのホームページおよび予約システム

## プロジェクト構成

```
.
├── frontend/   # クリニックHP（Astro）
├── backend/    # 予約API（Cloudflare Workers + Turso）
└── admin/      # 管理画面（React + Vite）
```

## 技術スタック

| パッケージ | 技術 |
|-----------|------|
| frontend | Astro, TypeScript |
| backend | Hono, Cloudflare Workers, Turso (SQLite) |
| admin | React, Vite, TanStack Router, TailwindCSS |

## セットアップ

### 依存関係のインストール

```bash
pnpm install
```

### 環境変数の設定

#### backend

`backend/.dev.vars` を作成:

```
TURSO_URL=libsql://your-db-url
TURSO_AUTH_TOKEN=your-token
ADMIN_API_KEY=your-admin-key
```

#### admin

`admin/.env.development` を作成:

```
VITE_API_URL=http://localhost:8789
```

## 開発

### フロントエンド + バックエンド

```bash
pnpm dev
```

- フロントエンド: http://localhost:4321
- バックエンドAPI: http://localhost:8789

### 管理画面 + バックエンド

```bash
pnpm dev:admin
```

- 管理画面: http://localhost:5173
- バックエンドAPI: http://localhost:8789

### 個別起動

```bash
pnpm dev:frontend  # フロントエンドのみ
pnpm dev:backend   # バックエンドのみ
```

## デプロイ

### フロントエンド

```bash
pnpm build
```

`frontend/dist` に静的ファイルが生成されます。

### バックエンドAPI

```bash
pnpm deploy:api
```

Cloudflare Workers にデプロイされます。

## API ドキュメント

詳細は [backend/README.md](./backend/README.md) を参照してください。
