---
name: ads-review
description: 勾当台夕方内科クリニックのリスティング広告（Google / LINEヤフー）の成績を振り返る。「昨日と今日の広告パフォーマンスを振り返って」「広告どう？」「配信が止まってないか見て」と頼まれたときに使う。procyonの実予約と突合し、予算/入札/ポリシーのどれがボトルネックかまで切り分ける。
argument-hint: "[対象期間や気になっている点（省略時は昨日と今日）]"
---

# 広告パフォーマンスの振り返り

依頼内容: $ARGUMENTS

## 前提

- CLI は `ads/` の `gads`（Google）と `lyads`（LINEヤフー）。実行は **`ads/.venv/Scripts/` 直下のexe**を使う
- Bash から叩くときは先に `export PYTHONIOENCODING=utf-8`（日本語が化ける）
- `gads` が `ModuleNotFoundError` / `uv trampoline failed` で落ちたら venv の editable パス切れ。
  `cd ads && VIRTUAL_ENV="$(pwd)/.venv" uv pip install -e .` で数秒で直る（再構築不要）
- `RefreshError: invalid_grant` なら `ads/.venv/Scripts/python.exe scripts/regen_refresh_token.py` を
  **run_in_background で起動**し、ユーザーにブラウザ承認してもらう。**Googleの数字を抜いたまま報告しない**
- 表形式の出力は列が省略されるので、**必ず `--csv` を付ける**

## 1. データを取る

### Google（キャンペーン日次）

```bash
cd ads && export PYTHONIOENCODING=utf-8
./.venv/Scripts/gads.exe report --csv --query "SELECT segments.date, campaign.name, metrics.impressions, metrics.clicks, metrics.ctr, metrics.average_cpc, metrics.cost_micros, metrics.conversions FROM campaign WHERE segments.date BETWEEN 'YYYY-MM-DD' AND 'YYYY-MM-DD' ORDER BY segments.date"
```

時間帯別（配信が途中で止まっていないかの確認に必須）:

```bash
./.venv/Scripts/gads.exe report --csv --query "SELECT segments.date, segments.hour, campaign.name, ad_group.name, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM ad_group WHERE segments.date BETWEEN '...' AND '...' ORDER BY segments.date, segments.hour"
```

キーワード別:

```bash
./.venv/Scripts/gads.exe report --csv --query "SELECT ad_group.name, ad_group_criterion.keyword.text, ad_group_criterion.keyword.match_type, metrics.impressions, metrics.clicks, metrics.ctr, metrics.cost_micros, metrics.conversions FROM keyword_view WHERE segments.date BETWEEN '...' AND '...' AND metrics.impressions > 0 ORDER BY metrics.cost_micros DESC"
```

> GAQLの癖: `segments.date` に `IN` は使えない（`=` / `BETWEEN` / `DURING` のみ）。
> `campaign.start_date` / `campaign.end_date` は存在しない（v24で廃止、`end_date_time`）。
> `change_event` は**30日より前を指定するとエラー**。`DURING LAST_14_DAYS` か明示的な `BETWEEN` を使う。

### LINEヤフー

```bash
./.venv/Scripts/lyads.exe report --preset campaign --date-range YESTERDAY --csv
./.venv/Scripts/lyads.exe report --preset keyword  --date-range TODAY     --csv
```

プリセットは `campaign` / `adgroup` / `keyword` / `query`。日付は `TODAY` / `YESTERDAY` /
`LAST_7_DAYS` 等の固定レンジのみで、任意日付は指定できない。
**キーワードレポートには配信していない「おすすめ広告」キャンペーンの0行が大量に混ざる**ので、
`検索_内科_全日` かつ表示>0 で絞ること。

### procyon（実予約）

```bash
export $(grep '^PROCYON_API_KEY=' .env)
curl -s -H "X-API-Key: $PROCYON_API_KEY" "https://api.procyon.helix.keiyousya.com/koutoudai-yugata-naika/v1/ad-metrics/listing-performance?from=YYYY-MM-DD&to=YYYY-MM-DD"
```

**曜日を分離できないので、`from`と`to`に同じ日付を入れて1日ずつ取る。**
`reservationCount` は created_at ベース・キャンセル込み・全流入込み。広告の増分指標ではない。

## 2. 読み方の落とし穴（報告の前に必ず潰す）

| 罠 | 対処 |
|---|---|
| **当日データは直近1〜2時間が大幅に過少** | 「直近2時間は未確定」と断る。**確定済みの時間帯どうしで比較する**。落ち込みを根拠に設定を変えない |
| 当日の IS 系メトリクス | 全て空（0.0が返る）。当日は使わない |
| 15時前の予約数 | 終日の1〜2割。判断材料にならない |
| **満席の日のCV数・CPA** | **断った電話もCVに乗る**（CV定義はLINE友だち追加＋電話）。満席の日ほどCPAは良く見える。**キャパの話が出たらCV/CPAは判断材料から外す** |
| 週の途中での週次比較 | 土日が突出するので必ず負ける。同じ曜日範囲で比べる |
| 2026年9月前半 | **休診期間（9/14再開）。比較対象にしない。** 前週比ではなく8月の同じ曜日と比べる |
| CV数・CPAの時系列比較 | 2026-08中旬にCV基準を変更（経路→LINE+電話）。それ以前とは比較不可 |

## 3. ボトルネックの切り分け

「配信が少ない/止まった」を**予算のせいにしない**。当院は一貫して上限CPC（広告ランク）が制約で、
予算は余っている。順番はこう:

1. **同じ予算のまま過去に何円まで出た日があるか**を先に引く。日次費用が日予算の何%かだけで判断しない
2. `metrics.search_rank_lost_impression_share` と `search_budget_lost_impression_share` の**比**を見る
   （平日はランク60〜64% vs 予算28%）。⚠️ **時間別に割ると使えない**（全時間帯で横ばいのモデル推定値）
3. `campaign.primary_status` / `primary_status_reasons` を見る。`HAS_ADS_LIMITED_BY_POLICY` は
   BIRTH_CONTROL 由来の**既知状態**なので、落ち込みの原因として新たに疑わない
4. `change_event` で実際の変更有無を確認（管理画面の変更履歴と完全に一致するのでブラウザは不要）
5. それでも決まらなければ管理画面の**予算シミュレーション**で「必要な入札単価」を見る。
   これが上限CPCを超えていたら入札がボトルネック → [[google-ads-chrome-profile]] の手順で開く

詳細と過去の誤診記録は `ads/docs/claude-memory/google-ads-bottleneck-diagnosis.md`。

## 4. 採算の物差し

- **損益分岐CPA = 3,850円**（単価5,000円 × 来院1.1回 × 粗利率70%）
- 平日キャパは1日20人。取りこぼしを拾いすぎると断ることになるので枠の埋まり具合も見る
- ⚠️ **枠が埋まっているときは採算計算をしない。** オーナーが「予約いっぱい」「止めていいかも」と言ったら、
  数字で止め方を再検討させずに**止める**。枠の空きはAPIからは見えない（procyonは created_at ベース）ので、
  現場の「いっぱい」が一次情報。CPAが損益分岐を下回っていても**続ける根拠にはならない**
  （2026-09-20にこれで¥13,128を無駄にした。[[full-day-ads-cv-metric-trap]]）
- 止め方: `gads budget status --campaign-id <ID> --state PAUSED --yes`。即時・可逆。
  **満席が理由なら上限CPCの小刻みな引き下げでは足りない**（同日2回下げても配信は続く）
- **ROASは追わない**（保険診療で単価が固定）。判断は損益分岐CPAで行う
- Google側のCVはLINE友だち追加＋電話。実予約とは別物なので、**そう明示してから出す**

## 5. 変更を打つとき

- 上限CPC: `./.venv/Scripts/python.exe scripts/set_cpc_ceiling.py --campaign-id <ID> --cpc <円> --yes`
- 日予算: `gads budget set --campaign-id <ID> --amount <円>`
- 配信スケジュール/入札傾斜: `scripts/set_ad_schedule_gradient.py`（remove+createを原子的に適用）
- ヤフー上限CPC: `lyads campaign bid-ceiling --campaign-id <ID> --cpc <円>`

**原則:**
- **一度に1つだけ動かす。** 同時に触ると効果を切り分けられない
- 変更は必ずオーナーに確認してから実行する
- 適用時刻を記録し、**その日の集計で判断しない**（途中で条件が変わるため）
- 実行したら `ads/docs/claude-memory/clinic-ad-schedule-ops.md` の「設定変更履歴」に追記する

## 6. 報告の形

昨日（確定値）と今日（暫定値）を分け、キャンペーン単位の表 → 目についた異常 → 提案、の順で出す。
提案には必ず**評価のタイミングと比較対象**を添える。期限切れのまま放置されている再評価
（`clinic-ad-schedule-ops.md` の「期限切れのまま残っている再評価」）があれば毎回リマインドする。
