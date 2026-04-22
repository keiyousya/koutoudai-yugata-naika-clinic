# シフト管理システム設計書

## 概要

クリニックスタッフの**シフト希望提出**から**シフト組み**、**確定シフトの公開**までを一貫して扱う Web アプリ。
既存モノレポ構成・インフラ（Cloudflare Workers + Turso + GitHub Pages）に乗せ、`timecard` と同じ流儀で実装する。

シフト組み作業は基本的にローカルの Claude Code などの AI に任せる前提とし、
GUI に加えて **CLI からも一通りの操作が可能** な設計とする。

## 用語と前提条件

| 項目 | 内容 |
|------|------|
| 職種 | 看護師 (`nurse`) / 事務 (`clerk`) の 2 種類のみ |
| 1 日の枠 | 17:00–21:00 の 1 シフトのみ。1 日あたり「看護師 1 名 + 事務 1 名」が定員 |
| 事務の不足許容 | 事務は現状 1 名のみのため、事務なし・看護師 1 名のみの日が発生してもよい |
| 営業曜日 | 月・火・祝日は休診、それ以外（水・木・金・土）は営業（日曜・第5週などの個別運用は今後検討） |
| 例外日 | 営業曜日であっても臨時休診、休診曜日であっても臨時診療を「単発」で登録可能 |
| シフト作成単位 | 1 か月 |
| 提出締切 | 対象月の前月 1 日（例: 6 月分は 5/1 締切）。締切後は希望提出 API がロックされる |
| スタッフ認証 | スタッフセレクタ + パスコード（入職時に伝えた本人の電話番号下 4 桁） |
| 管理者認証 | 既存 `ADMIN_API_KEY` を流用（GUI/CLI 共通） |
| 公平性ルール | MVP では未実装。将来「月の出勤目標日数」「連勤上限」などの拡張余地を残す |

## アーキテクチャ

```
┌─────────────────────────────────────────────────────────┐
│  shift (React SPA)                                      │
│  https://keiyousya.github.io/.../shift/                 │
│                                                         │
│  - スタッフ画面（希望提出 / 確定シフト閲覧）             │
│  - 管理画面（スタッフ管理 / 営業日 / 希望閲覧 / 編集）   │
└──────────────────┬──────────────────────────────────────┘
                   │ HTTPS
                   ▼
┌─────────────────────────────────────────────────────────┐
│  shift-cli (Node CLI、ローカル実行)                      │
│  - シフト希望の取得（JSON / 表形式）                     │
│  - 営業日カレンダーの取得                                │
│  - 確定シフトの保存・公開                                │
│  - AI（Claude Code 等）から呼び出してシフト組みに使用    │
└──────────────────┬──────────────────────────────────────┘
                   │ HTTPS
                   ▼
┌─────────────────────────────────────────────────────────┐
│  backend (Hono on Cloudflare Workers)                   │
│  wrangler.shift.toml で **シフト専用 Worker** を新設     │
│  /api/shift/*                                           │
└──────────────────┬──────────────────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────────────────┐
│  Turso (SQLite)                                         │
│  既存 DB に shift_* テーブルを追加                       │
└─────────────────────────────────────────────────────────┘
```

### Worker を専用化する理由

- `timecard` と同様に責務分離を行い、片方の障害が他方に波及しないようにする
- Cloudflare の secrets / レート制限などをアプリ単位で独立管理できる
- `wrangler.shift.toml` を `backend/` に追加し、`src/index.ts` を共有しつつ
  `vars` / secrets だけを差し替える既存パターンを踏襲

## モノレポ構成の変更

```
koutoudai-yugata-naika-clinic/
├── backend/
│   ├── src/
│   │   ├── index.ts                # 既存 + shift ルートをマウント
│   │   └── routes/
│   │       ├── timecard.ts         # 既存
│   │       └── shift.ts            # 新規
│   ├── scripts/
│   │   └── setup-shift-db.js       # 新規（テーブル作成）
│   ├── wrangler.toml               # 既存（予約API）
│   ├── wrangler.timecard.toml      # 既存
│   └── wrangler.shift.toml         # 新規
├── shift/                          # 新規（React SPA）
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── router.ts
│   │   ├── api/shift.ts
│   │   ├── routes/
│   │   │   ├── __root.tsx
│   │   │   ├── index.tsx           # スタッフログイン
│   │   │   ├── request.tsx         # 希望提出
│   │   │   ├── view.tsx            # 確定シフト閲覧
│   │   │   └── admin/              # 管理画面
│   │   │       ├── index.tsx
│   │   │       ├── staff.tsx
│   │   │       ├── calendar.tsx
│   │   │       ├── requests.tsx
│   │   │       └── editor.tsx
│   │   ├── stores/auth.ts
│   │   ├── components/ui/
│   │   └── lib/
│   ├── index.html
│   ├── vite.config.ts
│   ├── package.json
│   └── tsconfig.json
├── shift-cli/                      # 新規（Node CLI）
│   ├── src/
│   │   ├── index.ts                # commander エントリ
│   │   └── commands/
│   │       ├── requests.ts
│   │       ├── calendar.ts
│   │       └── assignments.ts
│   ├── package.json
│   └── tsconfig.json
└── pnpm-workspace.yaml             # shift, shift-cli を追加
```

## DB スキーマ（Turso 既存 DB に追加）

```sql
-- スタッフマスタ（シフト専用）
-- timecard.staff とは別建てとし、職種・パスコードを保持する
CREATE TABLE IF NOT EXISTS shift_staff (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    role TEXT NOT NULL CHECK(role IN ('nurse', 'clerk')),
    passcode_hash TEXT NOT NULL,           -- 電話下4桁の SHA-256（端末越しに平文を扱わない）
    is_active INTEGER NOT NULL DEFAULT 1,
    sort_order INTEGER NOT NULL DEFAULT 0, -- セレクタ表示順
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_shift_staff_role ON shift_staff(role);

-- 営業日例外（単発の臨時休診 / 臨時診療）
-- 通常の曜日マスタはアプリ側で「月火祝日休、それ以外営業」を判定
CREATE TABLE IF NOT EXISTS shift_calendar_overrides (
    date TEXT PRIMARY KEY,                 -- YYYY-MM-DD
    is_open INTEGER NOT NULL,              -- 1=臨時診療, 0=臨時休診
    note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- 月ごとの提出締切ロック（管理者が必要に応じて手動でロック解除可能）
CREATE TABLE IF NOT EXISTS shift_periods (
    month TEXT PRIMARY KEY,                -- YYYY-MM
    submission_locked_at TEXT,             -- ロック時刻（NULL = 未ロック）
    published_at TEXT,                     -- 公開時刻（NULL = 未公開）
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- スタッフからのシフト希望
-- 1 日 = 1 レコード。希望が出ていない日は availability=未提出 とみなす
CREATE TABLE IF NOT EXISTS shift_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    staff_id INTEGER NOT NULL REFERENCES shift_staff(id),
    date TEXT NOT NULL,                    -- YYYY-MM-DD
    availability TEXT NOT NULL CHECK(availability IN ('available', 'unavailable')),
    note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (staff_id, date)
);
CREATE INDEX IF NOT EXISTS idx_shift_requests_date ON shift_requests(date);
CREATE INDEX IF NOT EXISTS idx_shift_requests_staff ON shift_requests(staff_id);

-- 確定シフト（管理者 or CLI が書き込む）
-- (date, role) で 1 名のユニーク制約。事務は欠員可
CREATE TABLE IF NOT EXISTS shift_assignments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,                    -- YYYY-MM-DD
    role TEXT NOT NULL CHECK(role IN ('nurse', 'clerk')),
    staff_id INTEGER NOT NULL REFERENCES shift_staff(id),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (date, role)
);
CREATE INDEX IF NOT EXISTS idx_shift_assignments_date ON shift_assignments(date);
```

### スキーマ設計メモ

- `shift_staff` は `timecard.staff` とは別建て。timecard 側はカード UID 中心、shift 側は本人認証（パスコード）と職種が中心で、責務が異なる。将来統合する余地は残すが MVP では分離。
- 「未提出」状態を別テーブルで持たず「レコードなし=未提出」と表現することで、提出途中の保存・上書きを単純化。
- `shift_assignments` は 1 行 = 1 (date, role) 割当て。事務が空の日は単に行が無い状態。

## API 設計（`/api/shift/*`、Hono）

### 認証ミドルウェア

| 種別 | 識別ヘッダ | 用途 |
|------|------------|------|
| `staffAuth` | `X-Staff-Id` + `X-Staff-Passcode` | スタッフ本人操作（自分の希望提出 / 確定シフト閲覧） |
| `adminAuth` | `X-Admin-API-Key` | 管理画面 + CLI（既存 `ADMIN_API_KEY` を流用） |

`staffAuth` はリクエスト都度サーバー側で `passcode_hash` と照合。クッキー / セッションは持たず、SPA 側はログイン時にスタッフ ID + パスコード平文を `sessionStorage` に保持して各リクエストで送る方式（タイムカード同様の軽量運用）。

### エンドポイント一覧

#### 公開・スタッフ向け

| メソッド | パス | 認証 | 説明 |
|---------|------|------|------|
| `GET` | `/api/shift/staff` | なし | セレクタ用に有効スタッフ一覧（id, name, role）を返す |
| `POST` | `/api/shift/auth/login` | なし | スタッフ ID + パスコードで照合、成功なら 200 |
| `GET` | `/api/shift/calendar?month=YYYY-MM` | なし | 指定月の営業日カレンダー（曜日ロジック + overrides を反映） |
| `GET` | `/api/shift/periods/:month` | なし | 提出締切ロック状況、公開状況を返す |
| `GET` | `/api/shift/requests/me?month=YYYY-MM` | staffAuth | 自分の希望一覧 |
| `PUT` | `/api/shift/requests/me` | staffAuth | 自分の希望を一括上書き（締切後は 423 Locked） |
| `GET` | `/api/shift/assignments?month=YYYY-MM` | staffAuth | 公開済みの確定シフトを取得（未公開なら 404） |

#### 管理者・CLI 向け

| メソッド | パス | 認証 | 説明 |
|---------|------|------|------|
| `GET` | `/api/shift/admin/staff` | adminAuth | スタッフ一覧（無効含む） |
| `POST` | `/api/shift/admin/staff` | adminAuth | スタッフ登録（name, role, passcode） |
| `PUT` | `/api/shift/admin/staff/:id` | adminAuth | スタッフ更新（パスコード再設定可） |
| `DELETE` | `/api/shift/admin/staff/:id` | adminAuth | スタッフ無効化（論理削除） |
| `GET` | `/api/shift/admin/calendar/overrides` | adminAuth | 例外日一覧 |
| `POST` | `/api/shift/admin/calendar/overrides` | adminAuth | 例外日（臨時休診/臨時診療）を追加 |
| `DELETE` | `/api/shift/admin/calendar/overrides/:date` | adminAuth | 例外日削除 |
| `GET` | `/api/shift/admin/requests?month=YYYY-MM` | adminAuth | 全スタッフの希望をマトリクスで返す |
| `POST` | `/api/shift/admin/periods/:month/lock` | adminAuth | 提出を手動ロック |
| `DELETE` | `/api/shift/admin/periods/:month/lock` | adminAuth | ロック解除 |
| `GET` | `/api/shift/admin/assignments?month=YYYY-MM` | adminAuth | 確定シフト（未公開含む）を取得 |
| `PUT` | `/api/shift/admin/assignments?month=YYYY-MM` | adminAuth | 確定シフトを月単位で一括上書き |
| `POST` | `/api/shift/admin/periods/:month/publish` | adminAuth | 公開（`published_at` を立てる） |
| `DELETE` | `/api/shift/admin/periods/:month/publish` | adminAuth | 公開取り下げ |

### バリデーション

- `availability` は `available` / `unavailable` のみ
- `role` は `nurse` / `clerk` のみ
- `date` は ISO 形式 (`YYYY-MM-DD`) に正規化、月またぎ更新は禁止（`PUT requests/me` は month を必須クエリ）
- 確定シフト保存時のサーバー側チェック：
  - 同一 (date, role) の重複
  - 該当スタッフの role と一致しているか
  - 該当日の `availability='unavailable'` のスタッフを割り当てていないか（警告レベル、`?force=1` で上書き可）
  - 営業日でない日に割り当てていないか（同上）

### 締切判定ロジック（サーバー側）

```
締切日時 = 対象月の「前月 1 日 00:00 (Asia/Tokyo)」
shift_periods.submission_locked_at が設定されていればその時刻
現在時刻 >= 締切 → 提出系 API は 423 Locked を返す
```

## CLI (`shift-cli`)

### 設計方針

- ローカルの Claude Code 等から呼ぶことを想定し、**stdout は機械可読 (JSON) を既定**、`--pretty` で人間向け表形式に切り替え
- 認証情報は環境変数（`SHIFT_API_BASE`, `SHIFT_ADMIN_API_KEY`）で渡す
- すべて `/api/shift/admin/*` を叩く薄いラッパー
- `commander` + `zod`（既存スタックと統一）

### コマンド一覧

```
# スタッフ
shift-cli staff list
shift-cli staff add --name 山田 --role nurse --passcode 1234
shift-cli staff update <id> [--name ...] [--role ...] [--passcode ...] [--active true|false]

# 営業日カレンダー
shift-cli calendar show --month 2026-06
shift-cli calendar override add --date 2026-06-15 --closed --note "院長学会"
shift-cli calendar override add --date 2026-06-22 --open  --note "臨時診療"
shift-cli calendar override remove --date 2026-06-15

# 希望
shift-cli requests show --month 2026-06              # マトリクス JSON
shift-cli requests export --month 2026-06 --format csv

# 締切
shift-cli period lock   --month 2026-06
shift-cli period unlock --month 2026-06

# 確定シフト
shift-cli assignments show     --month 2026-06
shift-cli assignments validate --month 2026-06       # 制約チェックのみ実行
shift-cli assignments apply    --month 2026-06 --file ./assignments-2026-06.json
shift-cli assignments publish  --month 2026-06
shift-cli assignments unpublish --month 2026-06
```

### 入力 JSON フォーマット例（`assignments apply`）

```json
{
  "month": "2026-06",
  "assignments": [
    { "date": "2026-06-04", "role": "nurse", "staff_id": 1 },
    { "date": "2026-06-04", "role": "clerk", "staff_id": 5 },
    { "date": "2026-06-05", "role": "nurse", "staff_id": 2 }
  ]
}
```

### 想定する AI ワークフロー

```
1. shift-cli calendar show     --month 2026-06 > calendar.json
2. shift-cli requests show     --month 2026-06 > requests.json
3. （ローカル Claude Code 等が calendar.json + requests.json を読み割当案を生成）
4. shift-cli assignments validate --month 2026-06 < draft.json
5. shift-cli assignments apply    --month 2026-06 --file draft.json
6. shift-cli assignments publish  --month 2026-06
```

## 画面設計（`shift/`）

### スタッフ向け

#### 1. ログイン (`/`)
- セレクタで自分の名前を選択（`GET /api/shift/staff`）
- 4 桁パスコード入力 → `POST /api/shift/auth/login`
- 成功時に `sessionStorage` に `{staffId, passcode}` を保持し `/request` へ遷移

#### 2. 希望提出 (`/request`)
- 月ナビゲーション（既定: 提出可能な最も先の月）
- カレンダー表示。各日のセルに `○` / `×` のトグル
  - 休診日はグレーアウト・操作不可（営業日カレンダー由来）
  - 臨時休診も同様にロック
- 上部に「締切: 2026-05-01 まで」表示。締切後はリードオンリーモード
- 一括「全営業日 ○」ボタン

#### 3. 確定シフト閲覧 (`/view`)
- 月ナビゲーション
- 公開済みなら全スタッフのカレンダー表示
- 未公開なら「シフトはまだ公開されていません」と表示

### 管理者向け（`/admin/*`）

- アクセス時に `X-Admin-API-Key` をプロンプト入力 → `localStorage` 保持（既存 timecard 流用）

#### スタッフ管理 (`/admin/staff`)
- 一覧、追加、編集、無効化
- パスコード再設定 UI

#### 営業日 (`/admin/calendar`)
- 既定ロジック（月火祝日休診）の説明 + 例外日の追加 / 削除

#### 希望集計 (`/admin/requests?month=YYYY-MM`)
- 縦軸: 日付、横軸: スタッフ。○ / × / 未提出 を色分け表示
- 提出ロック / アンロックボタン

#### シフト編集 (`/admin/editor?month=YYYY-MM`)
- 縦軸: 日付、横軸: 看護師 / 事務の 2 セル
- 各セルでスタッフをドロップダウン選択
- バリデーション結果（不可日割当・休診日割当・職種不一致）をリアルタイム表示
- 「保存（下書き）」「公開」「公開取り下げ」ボタン

## 既定休診ロジック

```ts
function isOpenByDefault(date: Date): boolean {
  const day = date.getDay(); // 0=日 ... 6=土
  if (day === 1 || day === 2) return false;        // 月火休診
  if (isJapaneseHoliday(date)) return false;       // 祝日休診
  return true;
}

function isOpen(date: Date, overrides: Map<string, boolean>): boolean {
  const key = formatYmd(date);
  if (overrides.has(key)) return overrides.get(key)!;
  return isOpenByDefault(date);
}
```

`isJapaneseHoliday` は軽量な JP 祝日ライブラリ（`@holiday-jp/holiday_jp` など）を採用予定。

## デプロイ

### Backend

- `backend/wrangler.shift.toml` を新規作成（`name = "koutoudai-shift-api"`）
- `pnpm deploy:shift-api` を `package.json` に追加
- secrets:
  - `wrangler secret put TURSO_URL --config wrangler.shift.toml`
  - `wrangler secret put TURSO_AUTH_TOKEN --config wrangler.shift.toml`
  - `wrangler secret put ADMIN_API_KEY --config wrangler.shift.toml`

### Frontend

- `vite.config.ts` の `base` を `/koutoudai-yugata-naika-clinic/shift/` に設定
- `.github/workflows/deploy.yml` に `shift` のビルド + アーティファクト配置を追加

### CLI

- `pnpm --filter shift-cli build` で `dist/` 生成
- ローカルでは `pnpm shift-cli ...` で実行（`package.json` の `bin` に登録）

## セキュリティ・運用上の注意

- パスコードは平文 DB 保存しない（SHA-256 ハッシュ）。総当たり攻撃対策として
  `POST /auth/login` にレート制限を追加（Cloudflare の Rate Limiting Rules、または KV カウンタ）
- 管理者 API は既存 `ADMIN_API_KEY` を共有するため、漏洩時は予約 / タイムカード共々ローテーション必要。将来は鍵を分けることを検討
- スタッフ ID + パスコードを `sessionStorage` に保持する方式は院内利用前提。共用端末では明示的にログアウトが必要
- 提出締切は前月 1 日 0 時 (Asia/Tokyo) を絶対基準とし、Worker 側で TZ を明示

## 実装ステップ（issue 単位）

1. `shift/` プロジェクト初期化（Vite + React + TS、admin/timecard と同等のスタック）
2. DB マイグレーション（`backend/scripts/setup-shift-db.js`）
3. Backend 共通基盤（`backend/wrangler.shift.toml`、`backend/src/routes/shift.ts` の骨格、認証ミドルウェア）
4. Backend: スタッフ管理 API + 認証 API
5. Backend: 営業日カレンダー API
6. Backend: 希望提出 API（締切ロック含む）
7. Backend: 確定シフト API（公開・取下げ含む）
8. CLI (`shift-cli/`) の実装
9. Frontend: ログイン画面 + 希望提出画面
10. Frontend: 確定シフト閲覧画面
11. Frontend: 管理画面（スタッフ管理 / 営業日 / 希望集計 / シフト編集）
12. デプロイ整備（wrangler.shift.toml、GitHub Actions、ドキュメント）

各ステップは単独でレビュー可能な PR にできる粒度を目安とする。
