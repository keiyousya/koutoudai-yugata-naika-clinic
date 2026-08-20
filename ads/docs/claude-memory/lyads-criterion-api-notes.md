---
name: lyads-criterion-api-notes
description: LINEヤフー広告APIのcriterion系サービスの癖。除外キーワードの入れ方とマッチタイプ変更不可の件。
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

## ⚠️ マッチタイプは set で変更できない

`AdGroupCriterionService/set` に `keywordMatchType` を渡すと `[0001] Require.` で拒否される。
`criterion.text` を足しても `biddableAdGroupCriterion` を足しても同じ。**Google広告と同様に
マッチタイプは不変**とみなすのが妥当で、変えるなら remove → add で入れ直すしかない
（criterionId が変わり、キーワードの実績も引き継がれない）。
`lyads keyword match` は仕様変更に備えて残してあるが、現時点では通らない。

## 地域ターゲティングの「関心のある地域」

`campaign.settings[].geoTargetTypeSetting.positiveGeoTargetType` が既定で `DONT_CARE`
＝所在地**または**関心のある地域。半径指定を入れていても圏外の地名を含む検索に出るのはこれが理由。
`LOCATION_OF_PRESENCE` にすると所在地のみになる（`lyads campaign geo-target` で変更可能。
2026-08-20に検索_内科_全日へ適用済み）。

**How to apply:** 除外キーワードの追加は再実行しても壊れないので、クエリレポートを見て
気づいたぶんを継ぎ足していけばよい。関連: [[clinic-ad-schedule-ops]] [[ads-cli-two-command-layout]]
