---
name: procyon-ad-metrics-api
description: procyon診療システムの広告分析用公開エンドポイント。予約完了数・LINE友だち追加を時間帯×週単位で取得。
metadata:
  type: reference
---

procyon (helix) の診療システムに広告パフォーマンス分析用の公開エンドポイントがある。

**エンドポイント:**

```
GET https://api.procyon.helix.keiyousya.com/v1/ad-metrics/listing-performance?from=YYYY-MM-DD&to=YYYY-MM-DD
```

**認証:** APIキーをヘッダーに付与

```bash
curl -H "X-API-Key: <API_KEY>" "https://api.procyon.helix.keiyousya.com/v1/ad-metrics/listing-performance?from=2026-07-01&to=2026-07-31"
```

**レスポンス:** ISO週×時間帯のバケットで以下を返す:
- `reservationCount` — 対面診療の予約完了数（PR helix#1608で対面限定に変更済み）
- `lineFollowCount` — LINE友だち追加数
- `lineFollowGoogleAdsCount` — うちGoogle Ads経由
- `lineFollowOrganicCount` — うち自然検索経由
- `lineFollowUnknownCount` — ソース不明

**既知の問題:** `lineFollowGoogleAdsCount` が常に0件（helix#1745で追跡中）。

**APIキー管理:** procyon管理画面のAPIキー設定から発行・ローテーション可能。
エンドポイントの実装: `procyon/src/modules/ad_metrics/`

**How to apply:** Google Ads APIのデータ（費用・クリック・CPC）と突合することで、
広告費に対する実予約数ベースのROI分析が可能。Google AdsのCV数と予約数の乖離チェックにも使う。
