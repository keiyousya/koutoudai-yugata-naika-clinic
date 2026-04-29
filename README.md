# 勾当台夕方内科クリニック

勾当台夕方内科クリニックの業務全般を集約したモノレポ。ホームページ・予約システムから、経理・SNS・掲示物まで管理する。

## プロジェクト構成

```
.
├── frontend/    # クリニックHP（Astro）
├── backend/     # 予約・タイムカード・シフトAPI（Cloudflare Workers + Turso）
├── admin/       # 予約管理画面（React + Vite）
├── timecard/    # タイムカード打刻・閲覧画面（React + Vite）
├── shift/       # シフト管理システム（React + Vite）
├── shift-cli/   # シフト管理CLI（Node + Commander）
├── finance/     # 初期費用・月額費用の見積書
├── instagram/   # Instagram投稿用HTML
├── line/        # LINEリッチメニュー用HTML
├── notices/     # 院内掲示物
├── slides/      # 面接用クリニック紹介スライド（Slidev）
└── .github/     # CI/CD（GitHub Actions）
```

### アプリケーション

| パッケージ | 技術 | 概要 |
|-----------|------|------|
| frontend | Astro, TypeScript | クリニック公式HP（静的サイト） |
| backend | Hono, Cloudflare Workers, Turso (SQLite) | 予約・タイムカード・シフトAPI |
| admin | React, Vite, TanStack Router, TailwindCSS | 予約管理ダッシュボード |
| timecard | React, Vite, TanStack Router, TailwindCSS | タイムカード打刻・閲覧画面 |
| shift | React, Vite, TanStack Router, TailwindCSS | シフト希望提出・確定シフト閲覧・管理画面 |
| shift-cli | Node, Commander, TypeScript | シフト管理CLI（AI連携用） |

### 業務ドキュメント

| ディレクトリ | 内容 |
|-------------|------|
| finance/ | 初期費用見積一覧（`estimate.html`）と各業者見積PDF |
| instagram/ | 求人投稿画像HTML（`recruit.html`） |
| line/ | LINEリッチメニュー画像HTML（`rich-menu.html`） |
| notices/ | 院内掲示用の施設情報（`clinic-info.html`） |
| slides/ | 面接用クリニック紹介スライド（Slidev） |

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

GitHub Actions（`.github/workflows/deploy.yml`）により、`main` ブランチへの push で自動デプロイされる。

- **フロントエンド** → GitHub Pages
- **バックエンドAPI** → Cloudflare Workers

### 手動デプロイ

```bash
pnpm build        # フロントエンドビルド（frontend/dist に出力）
pnpm deploy:api   # バックエンドをCloudflare Workersへデプロイ
```

## API ドキュメント

詳細は [backend/README.md](./backend/README.md) を参照。
