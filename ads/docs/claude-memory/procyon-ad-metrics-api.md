---
name: procyon-ad-metrics-api
description: procyon診療システムの広告分析用公開エンドポイント。予約完了数・LINE友だち追加を時間帯×週単位で取得。
metadata: 
  node_type: memory
  type: reference
  originSessionId: 61d606ec-8eb5-41fd-8338-dbb35e06da2b
  modified: 2026-08-10T07:13:58.906Z
---

procyon (helix) の診療システムに広告パフォーマンス分析用の公開エンドポイントがある。

**エンドポイント（2026-08-10のサーバー移行でパスにクリニックのスラッグが入った）:**

```
GET https://api.procyon.helix.keiyousya.com/koutoudai-yugata-naika/v1/ad-metrics/listing-performance?from=YYYY-MM-DD&to=YYYY-MM-DD
```

**⚠️ 旧パス `/v1/ad-metrics/...`（スラッグなし）は404を返す。** しかも中身はS3の `<Error><Code>NoSuchKey>` というXMLなので、APIの認証エラーやサーバー障害と紛らわしい。**404が返ったらまずパスのスラッグを疑う。** APIキーは移行後も同じものが通る。

**認証:** APIキーをヘッダーに付与。キーは `ads/.env` の `PROCYON_API_KEY`（gitignore済）。

```bash
export $(grep PROCYON_API_KEY .env)
curl -H "X-API-Key: $PROCYON_API_KEY" "https://api.procyon.helix.keiyousya.com/koutoudai-yugata-naika/v1/ad-metrics/listing-performance?from=2026-08-01&to=2026-08-01"
```

※ `PK='...' curl -H "X-API-Key: $PK"` と書くと $PK がコマンド実行前に展開されて空になり401になる。`export` してから使う。

**公開されているのはこの1本だけ。** `/ad-metrics/settings` と `/settings/api-key`(POST/PUT) は管理画面用でBearer認証（キー発行・ローテーション）。**予約枠の空き状況を取るエンドポイントは存在しない。**

**レスポンス:** ISO週×時間帯(JST)のバケット。データがある組み合わせのみ返る。

- `reservationCount` — 対面診療の予約完了数
- `lineFollowCount` / `lineFollowGoogleAdsCount` / `lineFollowOrganicCount` / `lineFollowUnknownCount`

**⚠️ reservationCount の正体（実装 `procyon/src/modules/ad_metrics/internal/usecase/query/get_listing_performance.go` で確認）:**

```sql
FROM procyon.reservation_orders
WHERE created_at >= $1 AND created_at < $2 AND consultation_type = 'in_person'
```

- **created_atベース** — 予約が作成された時刻であって、診療枠の時刻ではない
- **キャンセル含む**
- **流入元でフィルタしていない** — 広告経由も自然検索もリピーターも全部入る

つまり広告のCV数ではなく「その日に作成された対面予約の総数」。**広告の増分を測る指標としては鈍い**ので、単日の前後比較で効果を判定しないこと。

**既知の問題:** `lineFollowGoogleAdsCount` が常に0件（helix#1745）。集計バグではなく `line_users.acquisition_source` がそもそも記録されていないのが原因で、実データは全件 `unknown`。**これが直ればLINE友だち追加を広告CVとして直接測れるようになる**ので、広告の効果測定精度を上げたいならここが一番効く。

**曜日別に見たいとき:** バケットはISO週×時間帯で**曜日が分離できない**。回避策として `from` と `to` に同じ日付を入れて1日ずつ取得し、曜日ごとに組み直す。

**How to apply:** Google Ads APIのデータ（費用・クリック・CPC）と突合して時間帯別の「広告費シェア vs 予約シェア」を出すのに使う（[[clinic-ad-schedule-ops]]）。Google側のCV（ローカルアクション-経路）は振れ幅が大きく当てにならないので、判断はこちらで行う。
