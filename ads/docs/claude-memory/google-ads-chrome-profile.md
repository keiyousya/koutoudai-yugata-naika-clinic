---
name: google-ads-chrome-profile
description: Google広告の管理画面は「クリニック用」Chromeプロファイルからしか開けない。既定のプロファイルでは別MCCしか見えない。
metadata: 
  node_type: memory
  type: reference
  originSessionId: e6c69d42-c48c-46cd-9d7a-09f57bbb4d39
  modified: 2026-09-19T07:12:00.413Z
---

**クリニックのGoogle広告アカウント <ACCOUNT_ID> は、普段使いのChromeプロファイルからは開けない。**

| | 既定のプロファイル | クリニック用プロファイル |
|---|---|---|
| ログインアカウント | <DEFAULT_GOOGLE_ACCOUNT> | <CLINIC_GOOGLE_ACCOUNT> |
| 見えるアカウント | 慧陽社MCC <OTHER_MCC_ID> / <OTHER_ACCOUNT_ID> | **<ACCOUNT_ID>** / 勾当台夕方内科クリニック管理MCC <CLINIC_MCC_ID> |

`ads/.env` の `GOOGLE_ADS_LOGIN_CUSTOMER_ID=<CLINIC_MCC_ID>` が後者のMCC。既定プロファイルは
このMCCに権限が無いので、`authuser=` を付けてもアカウント選択画面に <ACCOUNT_ID> が出てこない。

## 手順（2026-09-19に確立）

1. `list_connected_browsers` で接続中の拡張機能を見る。**「クリニック用」という名前のものが正しい**
2. 別のものが選ばれていたら `switch_browser` を呼ぶ → ユーザーがクリニック用Chromeで「接続」を押す
   （`select_browser` に deviceId を渡してもよい）
3. `navigate` で `https://ads.google.com/aw/campaigns` → アカウント選択で <ACCOUNT_ID> をクリック
4. 以後のURLには `?ocid=<OCID>&__c=<C_PARAM>&authuser=0` が付く。直リンクにはこれを使う

拡張機能は Chrome ウェブストアの
https://chromewebstore.google.com/detail/claude/fcoeoabgfenejglbffodgkkbkcdhcgfn から入れる。
プロファイルごとにインストールとサインインが必要。

## 注意

- `https://ads.google.com/aw/policymanager` は **404**。ポリシーマネージャーへ直リンクしない
- 予算シミュレーションのダイアログには「適用」ボタンがある。**見るだけのときは必ず「キャンセル」**
  （上限CPCが書き換わる）
- ウィンドウが狭いとステータス列が見切れる。`resize_window` で 1680x1050 にしてから読む

**How to apply:** Google広告の管理画面を見る用事が出たら、まず `list_connected_browsers` で
「クリニック用」かを確認する。ただし**変更履歴・ポリシー状態・各種メトリクスはAPI（`gads`）で足りる**ので、
ブラウザが要るのは予算シミュレーションなどAPIに無い画面だけ。関連: [[google-ads-bottleneck-diagnosis]]
