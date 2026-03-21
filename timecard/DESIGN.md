# タイムカードシステム設計書

## 概要

クリニックのスタッフ出退勤管理を Web ベースで実現する。
既存のモノレポ構成・インフラ（Cloudflare Workers + Turso + GitHub Pages）に乗せて、複数 PC・OS を問わず使えるようにする。

**NFC カード（PaSoRi RC-S380）でのタッチ打刻**を主要な入力手段とし、WebUSB API でブラウザから直接リーダーを操作する。

## アーキテクチャ

```
┌───────────────────────────────────────────────────────┐
│  timecard (React SPA)                                 │
│  https://keiyousya.github.io/.../timecard/            │
│                                                       │
│  ┌──────────┐    WebUSB API    ┌──────────────────┐   │
│  │ ブラウザ  │ ◄─────────────► │ PaSoRi RC-S380   │   │
│  │ (Chrome) │                  │ (USB接続)        │   │
│  └────┬─────┘                  └──────────────────┘   │
│       │                                               │
└───────┼───────────────────────────────────────────────┘
        │ HTTPS (fetch)
        ▼
┌─────────────────────────────┐
│  backend (Hono)             │  ← Cloudflare Workers（既存を拡張）
│  /api/timecard/*            │
└──────────┬──────────────────┘
           │
           ▼
┌─────────────────────────────┐
│  Turso (SQLite)             │  ← 既存 DB に テーブル追加
│  staff / timecard_records   │
└─────────────────────────────┘
```

## NFC 読取方式: WebUSB

| 項目 | 内容 |
|------|------|
| API | WebUSB API（デスクトップ Chrome 対応） |
| デバイス | Sony PaSoRi RC-S380 |
| ライブラリ | `rc_s380_driver`（npm: [WebUSB-RC-S380](https://github.com/aruneko/WebUSB-RC-S380)） |
| 対応 OS | Windows / Mac / Linux（Chrome ブラウザ） |
| 仕組み | ブラウザから USB デバイスに直接アクセスし、APDU コマンドでカード UID を読取 |

**フォールバック:** WebUSB 非対応ブラウザ（Safari, Firefox）では手動 UID 入力フォームを表示。

### WebUSB 動作フロー

```
1. ユーザーが「NFC接続」ボタンをクリック
2. ブラウザの USB デバイス選択ダイアログが表示
3. PaSoRi を選択して接続（初回のみ）
4. 以降はカードタッチで自動的に UID を読取
5. UID → API に送信 → 出勤/退勤を記録
```

## 技術スタック（admin と統一）

| 要素 | 選定 | 理由 |
|------|------|------|
| フレームワーク | React 19 + Vite | admin と同じ構成 |
| ルーティング | TanStack Router | admin と同じ |
| サーバー状態 | TanStack React Query | admin と同じ |
| クライアント状態 | Zustand | admin と同じ |
| スタイリング | TailwindCSS 4 + CVA | admin と同じ |
| UI コンポーネント | Radix UI | admin と同じ |
| バリデーション | Zod | admin・backend と共通 |
| NFC リーダー | `rc_s380_driver` (WebUSB) | ブラウザから PaSoRi 直接操作 |
| バックエンド | Hono (既存 index.ts を拡張) | 追加のワーカー不要 |
| DB | Turso (既存インスタンス) | テーブル追加のみ |

## モノレポ構成の変更

```
koutoudai-yugata-naika-clinic/
├── frontend/          # 患者向けサイト (Astro) ← 既存
├── backend/           # API (Hono + Cloudflare Workers) ← 拡張
│   └── src/
│       ├── index.ts   # 既存ルート + タイムカードルート追加
│       └── routes/
│           └── timecard.ts   # タイムカード API ルート（新規）
├── admin/             # 予約管理画面 (React SPA) ← 既存
├── timecard/          # タイムカード画面 (React SPA) ← 新規
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── router.ts
│   │   ├── api/
│   │   │   └── timecard.ts       # API クライアント
│   │   ├── hooks/
│   │   │   └── useNfcReader.ts   # WebUSB + PaSoRi UID 読取フック
│   │   ├── routes/
│   │   │   ├── __root.tsx        # ルートレイアウト
│   │   │   ├── index.tsx         # 打刻画面（メイン）
│   │   │   ├── history.tsx       # 出退勤履歴
│   │   │   └── admin.tsx         # スタッフ管理 + CSV エクスポート
│   │   ├── components/
│   │   │   └── ui/               # 共通 UI コンポーネント
│   │   ├── stores/
│   │   │   └── auth.ts           # 認証状態
│   │   └── lib/
│   │       └── utils.ts
│   ├── index.html
│   ├── vite.config.ts
│   ├── package.json
│   ├── tsconfig.json
│   └── tailwind.config.ts
└── pnpm-workspace.yaml  # timecard を追加
```

## DB スキーマ（Turso に追加）

```sql
CREATE TABLE IF NOT EXISTS staff (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    card_uid TEXT UNIQUE NOT NULL,      -- NFC カードの UID
    is_active INTEGER DEFAULT 1,        -- 有効/無効フラグ
    created_at TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS timecard_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_id INTEGER NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('in', 'out')),
    timestamp TEXT DEFAULT (datetime('now', 'localtime')),
    FOREIGN KEY (staff_id) REFERENCES staff(id)
);

CREATE INDEX IF NOT EXISTS idx_timecard_records_staff_id ON timecard_records(staff_id);
CREATE INDEX IF NOT EXISTS idx_timecard_records_timestamp ON timecard_records(timestamp);
```

## API エンドポイント（backend に追加）

### 打刻系

| メソッド | パス | 説明 |
|---------|------|------|
| `POST` | `/api/timecard/punch` | 打刻（UID で本人特定 → 出勤/退勤を自動判定） |
| `GET` | `/api/timecard/today` | 今日の全スタッフ出退勤一覧 |
| `GET` | `/api/timecard/history?month=2026-03` | 月次の出退勤履歴 |
| `GET` | `/api/timecard/export?month=2026-03` | 月次 CSV ダウンロード |

### スタッフ管理（Admin API Key 認証）

| メソッド | パス | 説明 |
|---------|------|------|
| `GET` | `/api/timecard/staff` | スタッフ一覧 |
| `POST` | `/api/timecard/staff` | スタッフ登録（名前 + カード UID） |
| `PUT` | `/api/timecard/staff/:id` | スタッフ更新 |
| `DELETE` | `/api/timecard/staff/:id` | スタッフ削除（論理削除） |

### リクエスト/レスポンス例

**打刻:**
```jsonc
// POST /api/timecard/punch
// Request
{ "card_uid": "04A3B2C1D5E6F7" }

// Response (成功)
{
  "staff_name": "田村",
  "type": "in",
  "timestamp": "2026-03-20 09:02:00",
  "message": "田村さん 出勤 09:02"
}

// Response (5分以内の重複)
{
  "error": "duplicate",
  "message": "5分以内の連続打刻のため無視しました"
}

// Response (未登録カード)
{
  "error": "unknown_card",
  "message": "未登録のカードです"
}
```

## 画面設計

### 1. 打刻画面（メイン: `/timecard/`）
- 大きな「NFC接続」ボタン → WebUSB でリーダー接続
- 接続後は「カードをタッチしてください」と表示し、タッチ待ちループ
- 打刻成功時に大きく結果表示（「田村さん 出勤 09:02」）
- 画面下部に今日の打刻履歴をリアルタイム表示（30秒ごと自動更新）
- WebUSB 非対応の場合はフォールバック: UID 手入力フォーム

### 2. 履歴画面（`/timecard/history`）
- 月選択 → その月の全打刻データをテーブル表示
- スタッフ別フィルタ

### 3. 管理画面（`/timecard/admin`）
- Admin API Key でアクセス制御（入力 → localStorage で保持）
- スタッフ登録: 名前入力 → NFC カードタッチで UID 取得 → 登録
- スタッフ一覧・編集・無効化
- CSV エクスポートボタン

## 出勤/退勤 自動判定ロジック（サーバーサイド）

```
当日の最新レコードを確認:
  - レコードなし → 出勤 (in)
  - 最新が in   → 退勤 (out)
  - 最新が out  → 出勤 (in)  ※連続シフト対応

5分以内の重複打刻 → 無視（誤タッチ防止）
```

## useNfcReader フック設計

```typescript
// 使い方イメージ
const { isConnected, connect, lastUid, error } = useNfcReader({
  onCardRead: (uid: string) => {
    // API に打刻リクエスト送信
    punchMutation.mutate({ card_uid: uid });
  },
  pollingInterval: 500, // 500ms ごとにカード検出
});
```

内部動作:
1. `connect()` → `navigator.usb.requestDevice()` でPaSoRi選択
2. `rc_s380_driver` でデバイスを開く
3. ポーリングループでカード検出 → UID 読取
4. `onCardRead` コールバックを呼出
5. コンポーネントアンマウント時に自動クリーンアップ

## 認証方式

| 操作 | 認証 |
|------|------|
| 打刻 | NFC カード UID（本人確認） |
| 今日の一覧閲覧 | なし（院内利用前提） |
| スタッフ管理・CSV エクスポート | Admin API Key（既存の仕組みを流用） |

## デプロイ

### GitHub Pages
- `vite.config.ts` の `base` を `/koutoudai-yugata-naika-clinic/timecard/` に設定
- GitHub Actions の deploy.yml に timecard ビルドステップ追加

### Backend
- `backend/src/routes/timecard.ts` に API 実装
- `backend/src/index.ts` にマウント
- `wrangler deploy` で既存と一緒にデプロイ

### DB
- `backend/scripts/setup-timecard-db.js` でテーブル作成

### CORS
- 既存の CORS 設定に timecard のオリジンは含まれている（同じ GitHub Pages ドメイン）

## 実装ステップ

### Step 1: バックエンド API
1. `backend/src/routes/timecard.ts` にルート実装
2. `backend/src/index.ts` にマウント
3. `backend/scripts/setup-timecard-db.js` でテーブル作成
4. ローカルで動作確認

### Step 2: フロントエンド（timecard SPA）
1. Vite + React プロジェクト初期化（admin をベースにスキャフォールド）
2. `useNfcReader` フック実装（WebUSB + rc_s380_driver）
3. API クライアント実装
4. 打刻画面（NFC タッチ UI）
5. 履歴画面
6. 管理画面（スタッフ CRUD + CSV エクスポート）

### Step 3: デプロイ設定
1. `pnpm-workspace.yaml` に timecard 追加
2. GitHub Actions に timecard ビルドステップ追加

## 注意事項
- WebUSB は HTTPS 必須（GitHub Pages なら OK、localhost 開発も OK）
- 初回接続時にブラウザのデバイス選択ダイアログが出る（ユーザー操作必須＝セキュリティ要件）
- Chrome 推奨（Safari/Firefox は WebUSB 未対応 → フォールバック UI）
