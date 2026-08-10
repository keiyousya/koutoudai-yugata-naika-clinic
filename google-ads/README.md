# google-ads — Google 広告運用CLI

勾当台夕方内科クリニックの Google 広告を CLI から操作するためのツール。
Google 公式 Python ライブラリ（`google-ads`）を利用する。

できること:

- **レポート取得** — キャンペーン / 広告グループ / キーワードの成果（費用・クリック・CV等）を GAQL で取得、表示または CSV 出力
- **予算・入札の変更** — 日予算の変更、キャンペーンの ON/OFF 切り替え
- **キーワード管理** — 一覧・追加（除外キーワード含む）・削除

> このディレクトリは `shift-cli` などと違い pnpm workspace には含めない（Python 独立環境）。

## セットアップ

### 1. Python 環境

`uv` 推奨（未導入なら `brew install uv`）:

```bash
cd google-ads
uv venv
uv pip install -e .
```

`venv` でも可:

```bash
cd google-ads
python3 -m venv .venv && source .venv/bin/activate
pip install -e .
```

インストールすると `gads` コマンドが使えるようになる。

### 2. 認証情報の準備

`.env.example` を `.env` にコピーして各値を埋める（`.env` はコミットされない）:

```bash
cp .env.example .env
```

必要な値の取得元:

| 変数 | 取得元 |
|------|--------|
| `GOOGLE_ADS_DEVELOPER_TOKEN` | [Google Ads > ツール > API センター](https://ads.google.com/aw/apicenter)（MCCアカウントで発行） |
| `GOOGLE_ADS_CLIENT_ID` / `GOOGLE_ADS_CLIENT_SECRET` | [Google Cloud Console](https://console.cloud.google.com/apis/credentials) で OAuth2 クライアント（デスクトップアプリ）を作成 |
| `GOOGLE_ADS_REFRESH_TOKEN` | 上記クライアントで OAuth フローを通して発行（下記参照） |
| `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | 操作元のログインアカウント（MCC）ID。ハイフンなし10桁 |
| `GOOGLE_ADS_CUSTOMER_ID` | 操作対象アカウントID。ハイフンなし10桁 |

> yaml で管理したい場合は `google-ads.yaml.example` を `google-ads.yaml` にコピーして埋める。
> `google-ads.yaml` が存在する場合は `.env` より優先される。

#### リフレッシュトークンの発行

公式リポジトリの生成スクリプトが手軽:

```bash
# client_id / client_secret を控えた上で
curl -O https://raw.githubusercontent.com/googleads/google-ads-python/main/examples/authentication/generate_user_credentials.py
python generate_user_credentials.py --client_secrets_path=/path/to/client_secret.json
```

ブラウザで承認すると refresh token が表示されるので `.env` に貼る。

### 3. 動作確認

```bash
gads --help
gads report --preset campaign --date-range LAST_7_DAYS
```

## 使い方

### レポート取得

```bash
# キャンペーン別（直近30日）
gads report --preset campaign

# キーワード別を直近7日でCSV保存
gads report --preset keyword --date-range LAST_7_DAYS --csv > out/keywords.csv

# 任意のGAQLを直接実行
gads report --query "SELECT campaign.name, metrics.clicks FROM campaign WHERE segments.date DURING TODAY"
```

プリセット: `campaign` / `ad_group` / `keyword`。費用は micros から円に換算して表示する。

### 予算・入札の変更

```bash
# 日予算を3000円に変更
gads budget set --campaign-id 1234567890 --amount 3000

# キャンペーンを停止 / 再開
gads budget status --campaign-id 1234567890 --state PAUSED
gads budget status --campaign-id 1234567890 --state ENABLED
```

変更系は実行前に確認プロンプトが出る（`--yes` でスキップ）。

### 休診期間の配信停止

休診が事前に分かっている場合は、配信終了日を入れておくと当日の操作が要らない。
終了日の翌日から自動で配信が止まる。

```bash
# 7/15まで配信し、7/16から自動停止
gads campaign end-date --campaign-id 1234567890 --date 2026-07-15

# 休診明けに終了日を解除して配信再開
gads campaign end-date --campaign-id 1234567890 --clear
```

> 終了日を過ぎたキャンペーンは status が ENABLED のままでも配信されない（UI上は「終了」表示）。
> `--clear` で終了日を外すと再開する。

### キーワード管理

```bash
# 一覧
gads keyword list
gads keyword list --ad-group-id 9876543210

# 追加（フレーズ一致）
gads keyword add --ad-group-id 9876543210 --text "夕方 内科 仙台" --match PHRASE

# 除外キーワード追加
gads keyword add --ad-group-id 9876543210 --text "求人" --negative

# 削除
gads keyword remove --ad-group-id 9876543210 --criterion-id 111222333
```

全コマンド共通で `--customer-id` を渡すと `.env` の既定アカウントを上書きできる。

## 構成

```
google-ads/
├── README.md
├── pyproject.toml            # 依存と gads コマンド定義
├── .env.example              # 認証情報の雛形
├── google-ads.yaml.example   # 公式ライブラリ設定の雛形（任意）
└── src/gads/
    ├── client.py             # GoogleAdsClient 初期化の共通化
    ├── cli.py                # エントリポイント
    └── commands/
        ├── report.py         # レポート取得
        ├── budget.py         # 予算・入札・ON/OFF
        └── keyword.py        # キーワード管理
```
