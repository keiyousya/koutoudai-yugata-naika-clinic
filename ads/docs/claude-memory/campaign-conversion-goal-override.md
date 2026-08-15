---
name: campaign-conversion-goal-override
description: キャンペーン個別のコンバージョン目標がアカウント既定を上書きし、CV0に見える罠。2026-08-16に土日キャンペーンを修正済み。
metadata: 
  node_type: memory
  type: project
  originSessionId: 14206ceb-a17f-463f-a6df-639a54b4022e
  modified: 2026-08-15T18:46:36.182Z
---

Google広告のコンバージョン目標には2層ある。**キャンペーン個別（`campaign_conversion_goal`）が
アカウント既定（`customer_conversion_goal`）を上書きする。**

2026-08-16に発覚：`検索_内科_土日` だけ個別上書きで既定と**反転**していた。

| 目標 | アカウント既定 | 土日（修正前） |
|---|---|---|
| SUBMIT_LEAD_FORM（LINE友だち追加） | 主要 | 副次 |
| PHONE_CALL_LEAD（Calls from ads） | 主要 | 副次 |
| GET_DIRECTIONS（経路案内） | 副次 | 主要 |

**症状:** 8/15は103クリック・6,820円で `conversions` が0件。実際はLINE10件・電話3件
取れていて実CPAは525円だった。`biddable=False` の目標は `conversions` 列に計上されず、
`all_conversions` にだけ残る。**「CV0なのにクリックはある」を見たら、まず目標設定を疑う。**

**さらに重要:** 両キャンペーンとも入札が MAXIMIZE_CONVERSIONS（tCPA未設定）。
計上対象＝入札の最適化対象なので、土日は経路案内を最大化する方向に学習していた。
集計の見え方だけの問題ではない。

**診断・修正コマンド**（2026-08-16に `src/gads/commands/campaign.py` へ追加）:

```bash
gads campaign goals                          # 全キャンペーンを既定と比較、差分に ! が付く
gads campaign sync-goals --campaign-id XXX   # アカウント既定に揃える（確認プロンプトあり）
```

**過去データは遡って再計上されない。** 修正直後に8/15を引き直しても `conversions` は0.0のまま
（`all_conversions` はLINE10・電話3）。目標変更をまたいだ期間を比較するときは
`metrics.all_conversions` をコンバージョンアクション別に見ること。

修正後は全キャンペーンが既定と一致。経路案内を副次にしても計測は止まらず
`all_conversions` で追える。合算にすると件数の多い経路案内（8/12で24件 vs LINE4件）に
入札が引っ張られるので、既定どおり副次が正しい。

**How to apply:** 月次でCV数が不自然に動いたら `gads campaign goals` を先に叩く。
キャンペーンを新規作成したときも既定とズレていないか確認する。
指標の連続性については [[july-2026-ads-performance]] の追記も併せて読むこと。
前提は [[ads-conversion-tracking-architecture]] と [[ads-unit-economics]]。
