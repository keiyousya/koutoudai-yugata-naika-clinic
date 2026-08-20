# ads — リスティング広告運用CLI

勾当台夕方内科クリニックのリスティング広告を CLI から操作するためのツール。
媒体ごとに2つのコマンドを提供する。

| コマンド | 媒体 | 実装 |
|---------|------|------|
| `gads` | Google 広告 | 公式 Python ライブラリ（`google-ads`） |
| `lyads` | LINEヤフー広告（旧 Yahoo!広告） | LINEヤフー広告 API v20 を直接叩く（REST/JSON） |

1プロジェクト2コマンドにしているのは、診療時間・損益分岐CPA・CV計測の前提といった
運用知見（`docs/claude-memory/`）が媒体横断で共通だから。媒体ごとにプロジェクトを
分けると、この知見の置き場が毎回宙に浮く。

> このディレクトリは `shift-cli` などと違い pnpm workspace には含めない（Python 独立環境）。

## セットアップ

### 1. Python 環境

`uv` 推奨（未導入なら `brew install uv`）:

```bash
cd ads
uv venv
uv pip install -e .
```

`venv` でも可:

```bash
cd ads
python3 -m venv .venv && source .venv/bin/activate
pip install -e .
```

インストールすると `gads` と `lyads` の両コマンドが使えるようになる。

### 2. 認証情報の準備

`.env.example` を `.env` にコピーして各値を埋める（`.env` はコミットされない）:

```bash
cp .env.example .env
```

#### Google 広告（`gads`）

| 変数 | 取得元 |
|------|--------|
| `GOOGLE_ADS_DEVELOPER_TOKEN` | [Google Ads > ツール > API センター](https://ads.google.com/aw/apicenter)（MCCアカウントで発行） |
| `GOOGLE_ADS_CLIENT_ID` / `GOOGLE_ADS_CLIENT_SECRET` | [Google Cloud Console](https://console.cloud.google.com/apis/credentials) で OAuth2 クライアント（デスクトップアプリ）を作成 |
| `GOOGLE_ADS_REFRESH_TOKEN` | 上記クライアントで OAuth フローを通して発行（下記参照） |
| `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | 操作元のログインアカウント（MCC）ID。ハイフンなし10桁 |
| `GOOGLE_ADS_CUSTOMER_ID` | 操作対象アカウントID。ハイフンなし10桁 |

> yaml で管理したい場合は `google-ads.yaml.example` を `google-ads.yaml` にコピーして埋める。
> `google-ads.yaml` が存在する場合は `.env` より優先される。

リフレッシュトークンの発行は公式リポジトリの生成スクリプトが手軽:

```bash
# client_id / client_secret を控えた上で
curl -O https://raw.githubusercontent.com/googleads/google-ads-python/main/examples/authentication/generate_user_credentials.py
python generate_user_credentials.py --client_secrets_path=/path/to/client_secret.json
```

ブラウザで承認すると refresh token が表示されるので `.env` に貼る。

#### LINEヤフー広告（`lyads`）

| 変数 | 取得元 |
|------|--------|
| `LYADS_CLIENT_ID` / `LYADS_CLIENT_SECRET` | [広告管理ツール](https://ads.yahoo.co.jp/) のアプリケーション登録で発行（**API利用申請の承認後**） |
| `LYADS_REFRESH_TOKEN` | `python scripts/lyads_refresh_token.py` で発行 |
| `LYADS_SEARCH_ACCOUNT_ID` | 検索広告のアカウントID（アカウント開設完了メールに記載） |
| `LYADS_DISPLAY_ACCOUNT_ID` | ディスプレイ広告（運用型）のアカウントID（同上） |
| `LYADS_BASE_ACCOUNT_ID` | ルートMCCのID。全APIコールで必須（下記） |
| `LYADS_TEST_*_ACCOUNT_ID` | テストアカウントID（API登録完了メールに記載）。`--test` で使う |

> **`x-z-base-account-id` は全エンドポイントで必須のヘッダー**（OpenAPI仕様で `required: true`）。
> ここにはルートMCCのIDを入れる。リクエストボディの `accountId` が「操作対象の広告アカウント」
> なのに対し、こちらは「どの権限系統から操作するか」を示すもので、別物。忘れると全コールが弾かれる。

前提として **API利用申請** が必要（申請 → 承認まで数日〜1週間）。
法人管理権限を持つビジネスIDでログインして申請する。

```bash
# 承認後、client_id / client_secret を .env に入れてから
python scripts/lyads_refresh_token.py
```

ブラウザで承認 → 表示された認可コードを貼り付けると refresh token が出る。
認可コードの有効期限は10分なので、ブラウザを開いたらすぐ貼る。
アクセストークンは1時間で失効するが、コマンド実行のたびに自動で取り直すので保存不要。

### 3. 動作確認

```bash
gads --help
gads report --preset campaign --date-range LAST_7_DAYS

lyads --help
lyads account list   # accountId 不要なので認証の疎通確認に使える
```

## 使い方（`gads` / Google 広告）

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

# 一時停止 / 再開（remove と違って戻せるので、様子を見たいときはこちら）
gads keyword pause  --ad-group-id 9876543210 --criterion-id 111222333 --criterion-id 444555666
gads keyword enable --ad-group-id 9876543210 --criterion-id 111222333
```

全コマンド共通で `--customer-id` を渡すと `.env` の既定アカウントを上書きできる。

## 使い方（`lyads` / LINEヤフー広告）

全コマンド共通で `--product search|display` で媒体を切り替える（既定は `search`）。
アカウントIDは媒体ごとに別物なので、`--account-id` 未指定なら `.env` の
`LYADS_SEARCH_ACCOUNT_ID` / `LYADS_DISPLAY_ACCOUNT_ID` がそれぞれ使われる。

```bash
# 権限を持つアカウント一覧（accountId 不要 = 認証の疎通確認向き）
lyads account list

# キャンペーン一覧
lyads campaign list
lyads campaign list --product display

# 日予算を3000円に（Google と違い micros ではなく円をそのまま渡す）
lyads campaign budget --campaign-id 1234567 --amount 3000

# 停止 / 再開（Google の ENABLED ではなく ACTIVE）
lyads campaign status --campaign-id 1234567 --state PAUSED
lyads campaign status --campaign-id 1234567 --state ACTIVE

# 休診期間の配信停止（gads と同じ考え方）
lyads campaign end-date --campaign-id 1234567 --date 2026-08-15
lyads campaign end-date --campaign-id 1234567 --clear

# レポート
lyads report --preset campaign --date-range LAST_30_DAYS
lyads report --preset query --date-range LAST_7_DAYS --csv > out/queries.csv

# キーワードと除外キーワード
lyads keyword list --campaign-id 1234567              # 配信キーワード（マッチタイプ付き）
lyads keyword list --negative --campaign-id 1234567   # キャンペーンの除外キーワード
lyads keyword add-negative --campaign-id 1234567 --text 眼科 --text 皮膚科
lyads keyword remove-negative --campaign-id 1234567 --criterion-id 135798995

# 地域ターゲティングを「所在地のみ」に絞る（既定の DONT_CARE は圏外にも出る）
lyads campaign geo-target --campaign-id 1234567 --positive LOCATION_OF_PRESENCE

# コンバージョン測定
lyads conversion list
lyads conversion add --name "LINE友だち追加" --category CONTACT
lyads conversion tag --conversion-id 1234567   # 貼り付け用タグを再表示
```

プリセット: `campaign` / `adgroup` / `keyword` / `query`。

> **除外キーワードの追加は再実行しても安全。** 既にあるものは
> `Exists same text with match type.` でその1件だけスキップされ、残りは追加される。
>
> **マッチタイプは変更できない。** `AdGroupCriterionService/set` が `Require.` で拒否するため、
> `lyads keyword match` は現時点では通らない。変えるなら remove → add で入れ直すことになり、
> criterionId とキーワードの実績は引き継がれない。

### コンバージョン測定タグ

`lyads conversion add` で作成すると、貼り付け用のタグ（`advancedSnippet`）が表示される。
サイトへの設置は2段構え:

1. **サイトジェネラルタグ** — 全ページの `<head>` のなるべく上。アカウント固有の値を持たない
   共通タグなので、`frontend/src/layouts/Layout.astro` に直書きしてある
2. **コンバージョン測定タグ** — `yahoo_conversion_id` / `yahoo_conversion_label` が
   アカウント固有。`frontend/src/config/line.ts` に定数として置き、LINE友だち追加ボタンの
   クリックで `ytag()` を呼ぶ

`advancedSnippet` は **ADD のレスポンスには入らず GET で取り直すと返る**（`add` は内部で
取り直している）。`type` は検索広告が `yss_conversion`、ディスプレイ広告が `yjad_conversion`
で、アカウントが別なのでタグも別物になる。

現在の設定（検索広告。IDは `lyads conversion list` で確認）:

| 項目 | 値 |
|---|---|
| 名前 | LINE友だち追加 |
| 目的 | `CONTACT`（連絡先） |
| 計測方法 | `ONE_PER_CLICK`（ユニーク） |
| 計測期間 | 30日 |
| 自動入札 | 対象に含める |

なお `category` の `LEAD` は enum に存在するが **ADD / SET では指定できない**（GET専用）。

### テストアカウント

`--test` を付けると本番環境上のテストアカウントを叩く。**入稿物は配信も審査もされない**ので、
実弾を撃たずに動作確認できる。

```bash
lyads campaign list --test
lyads report --preset campaign --test
```

制約: 配信実績は返らない（レポートは形式と項目の確認のみ）、広告管理ツールからは操作不可、
QPS は本番と別枠でカウントされる。

### gads との違い

同じ「リスティング広告CLI」でも API の作りが違うので、操作感を揃えきれない部分がある:

| | gads（Google） | lyads（LINEヤフー） |
|---|---|---|
| クエリ | GAQL で任意のクエリを投げられる | レポートタイプ + フィールド指定の固定形式 |
| レポート取得 | 同期。叩けばその場で返る | **非同期ジョブ**（add → ポーリング → download）。数十秒かかる |
| 金額 | micros（100万分の1） | 円そのまま |
| 配信状態 | `ENABLED` / `PAUSED` | `ACTIVE` / `PAUSED` |
| 終了日の解除 | FieldMask で明示的にクリア | `20371231`（＝終了日なしの既定値）に戻す |
| アカウントID | 全媒体共通の10桁 | 検索広告とディスプレイ広告で別ID |

`lyads report` は非同期ジョブの3ステップを1コマンドに畳んでいるので、
体感は `gads report` と同じだが完了まで待つぶん遅い。

## 構成

```
ads/
├── README.md
├── pyproject.toml            # 依存と gads / lyads コマンド定義
├── .env.example              # 両媒体の認証情報の雛形
├── google-ads.yaml.example   # google-ads ライブラリ設定の雛形（任意）
├── docs/claude-memory/       # 媒体横断の運用知見（診療時間・損益分岐CPA・CV計測）
├── scripts/
│   ├── lyads_refresh_token.py    # LINEヤフー広告のリフレッシュトークン発行
│   ├── regen_refresh_token.py    # Google 広告のリフレッシュトークン再発行
│   ├── set_cpc_ceiling.py
│   └── add_competitor_negatives.py
└── src/
    ├── gads/                 # Google 広告
    │   ├── client.py         # GoogleAdsClient 初期化の共通化
    │   ├── cli.py            # エントリポイント
    │   └── commands/         # report / budget / keyword / campaign / ad / conversion
    └── lyads/                # LINEヤフー広告
        ├── client.py         # OAuth2 + POST/JSON の薄いラッパ、エラー封筒の解釈
        ├── cli.py            # エントリポイント
        └── commands/
            ├── account.py    # アカウント一覧（疎通確認）
            ├── campaign.py   # 一覧・予算・ON/OFF・終了日
            ├── conversion.py # コンバージョン測定の作成とタグ取得
            └── report.py     # 非同期レポートジョブ
```

`src/gads` と `src/lyads` に共通コードは今のところ置いていない。
損益分岐CPAの計算やレポート整形を両媒体で使い回す段になったら `src/common/` を切る。

## 参考

- [LINEヤフー広告 API リファレンス](https://ads-developers.yahoo.co.jp/reference/)
- [検索広告API OpenAPI 仕様（GitHub）](https://github.com/yahoojp-marketing/ads-search-api-documents)
- [ディスプレイ広告API OpenAPI 仕様（GitHub）](https://github.com/yahoojp-marketing/ads-display-api-documents)
- [レポートタイプごとのフィールド一覧](https://github.com/yahoojp-marketing/ads-search-api-documents/tree/master/reports/v20/jp)
