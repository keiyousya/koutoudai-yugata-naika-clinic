---
name: lineyahoo-ads-ids
description: LINEヤフー広告の各種IDと、失った場合のUI上の再取得場所（実値はローカル記憶側）
metadata:
  type: reference
---

LINEヤフー広告（`lyads`）のID一覧（実値はローカル記憶側のみ）。**開設メール類は 普段使いの Gmail には無い**
（別アドレス宛だった）ので、失ったらメール検索ではなく管理ツールUIから取り直す。

| .env キー | 値 | UI上の再取得場所 |
|---|---|---|
| `LYADS_BASE_ACCOUNT_ID`（ルートMCC） | <ROOT_MCC_ID> | ads.yahoo.co.jp のURL `#/<MCC>/mcc/<MCC>/...` |
| `LYADS_SEARCH_ACCOUNT_ID` | <SEARCH_ACCOUNT_ID> | 広告管理ツール > パフォーマンスデータ > 検索広告 の「アカウントID」列 |
| `LYADS_DISPLAY_ACCOUNT_ID` | <DISPLAY_ACCOUNT_ID> | 同上・ディスプレイ広告タブ |
| `LYADS_TEST_SEARCH_ACCOUNT_ID` | <TEST_SEARCH_ACCOUNT_ID> | API管理ツール > テストアカウント |
| `LYADS_TEST_DISPLAY_ACCOUNT_ID` | <TEST_DISPLAY_ACCOUNT_ID> | 同上 |

ビジネスID: `<BUSINESS_ID>`。広告配信用アカウント名は検索・ディスプレイとも
「勾当台夕方内科クリニック【広告配信用】」。

`LYADS_CLIENT_ID` / `LYADS_CLIENT_SECRET` は
[API管理ツール](https://connect-business.yahoo.co.jp/cooperation/) > 登録アプリケーション
（アプリ名「lyads 広告運用CLI」）。**Google と違いシークレットは「表示」で何度でも再確認できる**ので、
紛失しても再発行は不要。リフレッシュトークンは
`python scripts/lyads_refresh_token.py <認可コード>` で取り直す（認可コードの有効期限10分）。

**How to apply:** 新端末セットアップやトークン失効時に参照。ID類が埋まれば
`lyads account list` が疎通確認になる。関連: [[ads-venv-editable-path-breakage]]
