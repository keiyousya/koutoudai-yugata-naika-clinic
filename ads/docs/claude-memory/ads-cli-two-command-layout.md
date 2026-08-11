---
name: ads-cli-two-command-layout
description: 広告CLIは google-ads/ から ads/ に改名し1プロジェクト2コマンド(gads/lyads)構成にした
metadata: 
  node_type: memory
  type: project
  originSessionId: 6481b813-ddef-4e1b-b573-03b910f879c6
  modified: 2026-08-10T15:52:53.316Z
---

広告運用CLIのディレクトリを `google-ads/` → **`ads/`** に改名し、1つのPythonプロジェクトに2コマンドを同居させる構成にした（2026-08-11）。

- `gads` = Google 広告（`src/gads/`、公式 google-ads ライブラリ）
- `lyads` = LINEヤフー広告（`src/lyads/`、API v20 を requests で直接叩く）
- `pyproject.toml` の `name` は `ads`。`click.version_option(package_name="ads")` を両CLIで使う
- venv は1つ（`ads/.venv`）、`.env` も1つに両媒体の認証情報を集約

**Why:** 媒体ごとにプロジェクトを割らなかったのは、`docs/claude-memory/` の運用知見（診療時間・損益分岐CPA・CV計測の2系統構成）が媒体横断で共通だから。分けると知見の置き場が毎回宙に浮く。共通コード用の `src/common/` はまだ作っていない（実体が無いうちは空パッケージを置かない）。

**lyads の実装メモ（gadsとの差分）:** レポートは非同期ジョブ（ReportDefinitionService の add → ポーリング → download）で数十秒かかる。金額はmicrosでなく円そのまま。配信状態は ENABLED でなく `ACTIVE`。終了日の解除は FieldMask ではなく `20371231`（終了日なしの既定値）に戻す。アカウントIDは検索広告とディスプレイ広告で別物。OpenAPI仕様が GitHub `yahoojp-marketing/ads-search-api-documents` に公開されている。

**ハマりどころ: `x-z-base-account-id` ヘッダーが全エンドポイントで必須**（OpenAPI仕様で `required: true`）。値はルートMCCのID。リクエストボディの `accountId`（操作対象の広告アカウント）とは別物で、こちらは「どの権限系統から操作するか」を示す。仕様書のトップページやサンプルREADMEを読まないと存在に気づかず、実装すると全コールが弾かれる。`.env` の `LYADS_BASE_ACCOUNT_ID` に持たせて `client._headers()` で常時付与している。

**ハマりどころ2: リクエスト側の `include*` 系は TRUE/FALSE ではない。** `BaseAccountService/get` の `includeMccAccount` は `ALL`/`ONLY_MCC`/`ONLY_ROOT_MCC`/`ONLY_ADS_ACCOUNT`、`includeTestAccount` は `ALL`/`ONLY_TEST`/`EXCLUDE_TEST`（既定 `EXCLUDE_TEST` なのでテスト用アカウントを出すには明示が必要）。紛らわしいのは**レスポンス側**の `isMccAccount`/`isTestAccount` は `TRUE`/`FALSE` 文字列であること。同じ概念でもリクエストとレスポンスで列挙体系が違う。

**`--test` フラグ**でテストアカウントに切り替わる（`LYADS_TEST_*_ACCOUNT_ID`）。本番環境上だが配信も審査もされないので実弾を撃たずに検証できる。ただし配信実績は返らずレポートは形式確認のみ、広告管理ツールからは操作不可、QPSは本番と別枠。

**How to apply:** 広告CLIを触るときは `ads/` を見る（`google-ads/` はもう無い）。新媒体を足すときも `src/<媒体>/` を増やす方針で、プロジェクトは割らない。前提は [[lineyahoo-ads-setup]]。
