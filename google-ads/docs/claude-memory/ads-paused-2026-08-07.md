---
name: ads-paused-2026-08-07
description: 2026-08-07に予約満床のため広告をPAUSED。8/8午前に手動でENABLEDへ戻す必要あり
metadata:
  type: project
---

2026-08-07（金）16時台、**予約枠が埋まったため**オーナー判断で稼働キャンペーン
「2026年06月リスティング広告」（campaign_id `<CAMPAIGN_ID>`）を PAUSED にした。
当日の消化は 839円 / 242imp / 13クリック / CV0 の時点で停止（日予算1,800円なので約960円を節約）。

**2026-08-08（土）の午前中までに手動で再開が必要**（土日の配信は12:00開始）:

```
gads budget status --campaign-id <CAMPAIGN_ID> --state ENABLED --yes
```

オーナーは「明日の朝に声をかける」方式を選択（自動再開は仕込んでいない）。再開したらこの記憶は削除する。

**Why:** 満床なのに配信すると予約できない患者のクリックに費用が出るだけ。休診と違い1日だけなので
終了日方式（[[clinic-ad-schedule-ops]] 参照）ではなく PAUSE/ENABLE で対応した。

**How to apply:** 「広告戻して」と言われたら上記コマンド一発。満床による当日停止は今後も起こりうる
パターンなので、同じ手順（PAUSE → 翌朝ENABLE）を使う。実行前にリフレッシュトークン失効を疑うこと
（[[google-ads-api-v24-notes]]）。
