---
name: lyads-criterion-api-notes
description: LINEヤフー広告APIのcriterion系サービスの癖。setの Require. の正体は campaignId 欠落だった。
metadata:
  node_type: memory
  type: reference
---

`lyads keyword`（2026-08-20に追加）を実装したときに判明したAPIの癖。

## 除外キーワードは CampaignCriterionService

キャンペーン単位の除外は `CampaignCriterionService/add` に
`use: "NEGATIVE"` + `criterion: {criterionType: "KEYWORD", keyword: {text, keywordMatchType}}`。
既に同じテキストがあると `Exists same text with match type.` で**その1件だけスキップ**され、
他は成功する（部分成功するので values ごとに errors を見ること）。**再実行しても安全。**

## AdGroupCriterionService/get は `use` が必須

省略すると `[0001] Invalid Request. (use=must not be null)`。`BIDDABLE` か `NEGATIVE` を渡す。
配信キーワードの状態は `biddableAdGroupCriterion.userStatus` の中にあり、
`adGroupCriterion` 直下ではない。

## ⭐ AdGroupCriterionService/set の `Require.` の正体は **campaignId の欠落**

2026-08-22に判明。`set` の operand には **`campaignId` が必須**。無いと、どのフィールドが
足りないのか一切示さない `[0001] Require.` だけが返る（`field` も空）。

通る最小構成:

```json
{
  "accountId": <ACCOUNT_ID>, "campaignId": <CAMPAIGN_ID>, "adGroupId": <AD_GROUP_ID>,
  "criterion": {"criterionId": <CRITERION_ID>, "criterionType": "KEYWORD",
                "keyword": {"text": "...", "keywordMatchType": "BROAD"}},
  "use": "BIDDABLE",
  "biddableAdGroupCriterion": {"userStatus": "PAUSED"}
}
```

`criterion` を `{criterionId}` だけに削ると再び `Require.` になるので、**text と
keywordMatchType も現在値を丸ごと送り直す**必要がある。

**⚠️ これまで「マッチタイプは set で変更できない」と記録していたが、その根拠は崩れた。**
`lyads keyword match` が `Require.` で失敗していたのは campaignId を送っていなかったためで、
マッチタイプ固有の制約とは限らない。**未検証**（実キーワードを書き換えることになるので試していない）。
試すならテストアカウント（`--test`）で先に確認すること。

## 配信キーワードの停止は `lyads keyword pause` / `enable`

2026-08-22に追加。`userStatus` を `PAUSED` / `ACTIVE` に切り替えるだけなので、
remove と違って **criterionId と実績を残したまま戻せる**。criterionId を渡すだけで
adGroupId / campaignId / text / マッチタイプは自動で引く。

## 地域ターゲティングの「関心のある地域」

`campaign.settings[].geoTargetTypeSetting.positiveGeoTargetType` が既定で `DONT_CARE`
＝所在地**または**関心のある地域。半径指定を入れていても圏外の地名を含む検索に出るのはこれが理由。
`LOCATION_OF_PRESENCE` にすると所在地のみになる（`lyads campaign geo-target` で変更可能。
2026-08-20に検索_内科_全日へ適用済み）。

**How to apply:** 除外キーワードの追加は再実行しても壊れないので、クエリレポートを見て
気づいたぶんを継ぎ足していけばよい。関連: [[clinic-ad-schedule-ops]] [[ads-cli-two-command-layout]]
