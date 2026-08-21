---
name: lineyahoo-ads-setup
description: LINE広告は日本で終了するのでLINEヤフー広告(旧Yahoo!広告)を使う。アカウント開設済・API利用申請は未提出
metadata: 
  node_type: memory
  type: project
  originSessionId: 6481b813-ddef-4e1b-b573-03b910f879c6
  modified: 2026-08-11T04:29:21.157Z
---

ヤフー面への出稿は **LINEヤフー広告（旧Yahoo!広告）** で行う。`LINE広告`（LINE Ads Platform）は選択肢にならない。

**なぜLINE広告が不可:** 日本国内でのLINE広告の提供が終了する。LINE広告APIの新規申請受付は2025-12-25で終了済（今から申請しても取れない）、API自体も2027年3月末で提供終了。台湾・タイのみ継続。LINE面（トークリスト/LINE NEWS/スタンプショップ等）への配信は、LINEヤフー広告の**ディスプレイ広告（運用型）**でカバーされる。

**アカウント状態（2026-08-08 開設完了）:**
- ビジネスID: `<BUSINESS_ID>`（法人管理権限あり）
- ルートMCC: `<ROOT_MCC_ID>`
- 検索広告: `<SEARCH_ACCOUNT_ID>`
- ディスプレイ広告（運用型）: `<DISPLAY_ACCOUNT_ID>`
- ビジネスマネージャーの組織接続: 検索・ディスプレイとも承認済

**API利用申請: 2026-08-11 提出 → 約1時間で承認**（「数日〜1週間」という一般情報より遥かに速い）。契約種別「広告主」、運営サイトURL `https://koutoudai-yugata-naika.clinic` で申請。

**テストアカウント**（API登録完了メールで払い出された。本番環境上だが配信も審査もされない）:
- 検索広告: `<TEST_SEARCH_ACCOUNT_ID>`
- ディスプレイ広告: `<TEST_DISPLAY_ACCOUNT_ID>`

**申請の入口（探しにくいので注意）:** デベロッパーサイトではなく**広告管理ツールの中**。`ads.yahoo.co.jp` でルートMCCを選択 → 画面右上「ツール」→「LINEヤフー広告 API お申し込み」（直URL: `ads.yahoo.co.jp/manager/#/<ROOT_MCC_ID>/mcc/<ROOT_MCC_ID>/apiSignup`）。ウィンドウ幅が狭いと「ツール」が画面外に出て見つからない。

**セットアップ完了: 2026-08-11。** アプリケーション名「lyads 広告運用CLI」、リダイレクトURI `oob`、スコープ「検索広告／ディスプレイ広告」で登録。refresh token 取得済、`lyads account list` / `campaign list` / `report` の疎通確認まで完了。**アカウント開設からAPI疎通まで同日中に完了した。**

**手順（再構築時の参考）:** ①[ビジネスツールアクセスマネージャー](https://btam.line.biz/?layout=otp) で「参加する」→ API管理ツールの権限グループに参加（**これを先にやらないとAPI管理ツールを開けない**） ②[API管理ツール](https://connect-business.yahoo.co.jp/cooperation/) でアプリケーション登録（**リダイレクトURIは `oob`**）→ client_id/secret 発行 ③`python scripts/lyads_refresh_token.py` でrefresh token取得 ④`lyads account list --test` で疎通確認。

**クレジットカード登録: 2026-08-11 完了。コンバージョン測定タグも同日設置**（詳細は [[ads-conversion-tracking-architecture]]）。**検索広告キャンペーン「検索_内科_全日」も作成済で配信中**（2026-08-21時点で直近30日 214クリック / 13,787円 / CV6 / CPA 2,298円）。ID実値は [[lineyahoo-ads-ids]]。

**キャンペーン特典（開設メール記載、要エントリー）:** ディスプレイ広告10万円分の広告費プレゼント、検索広告Amazonギフト券1万円分。どちらも配信開始前のエントリーが必須。

**How to apply:** ヤフー/LINE面への出稿を検討する話が出たら、LINE広告ではなくLINEヤフー広告で考える。CLIは [[ads-cli-two-command-layout]] の `lyads`。採算判断は [[ads-unit-economics]] の損益分岐CPAをそのまま使う（媒体共通）。配信時間は [[clinic-ad-schedule-ops]] と揃える。
