---
name: ads-review
description: 勾当台夕方内科クリニックのリスティング広告（Google。LINEヤフーは2026-09-24に廃止）の成績の振り返りと、配信スケジュール・配信状態の確認をまとめて行う。「昨日と今日の広告パフォーマンスを振り返って」「広告どう？」「配信が止まってないか見て」「配信スケジュール確認して」「明日の配信設定大丈夫？」と頼まれたときに使う。procyonの実予約と突合し、予算/入札/ポリシーのどれがボトルネックかまで切り分け、「今日だけ」の設定の戻し忘れも拾う。
argument-hint: "[対象期間や気になっている点（省略時は昨日と今日。「スケジュールだけ」も可）]"
---

# 広告パフォーマンスの振り返りと配信スケジュールの確認

依頼内容: $ARGUMENTS

通常は**成績の振り返り（手順1〜4）と配信設定の確認（手順1.5）を両方やる**。
「スケジュールだけ」「設定だけ」と言われたら手順1.5と6だけでよい。

## 前提

- **LINEヤフー広告は2026-09-24に廃止**（キャンペーンは停止のまま残してある）。振り返りはGoogleだけでよく、ヤフーの再開・改善は提案しない。以下のヤフーの手順は再開時のために残している
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

### LINEヤフー（2026-09-24に廃止。通常は見なくてよい）

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

## 1.5 配信設定・スケジュールの確認

成績とは別に、**いまの設定がどうなっているか**と**戻し忘れがないか**を見る。

診療時間: 月水木金 17:00-21:00（一般内科は〜19時、以降は発熱外来）／ 火 休診 ／ 土日 14:00-21:00（一般内科14-17時、発熱外来17-21時）／ 祝日休診 ／ 最終受付 20:50
（正は `ads/docs/claude-memory/clinic-ad-schedule-ops.md` 冒頭。食い違ったらそちらを優先）

### データ（3本とも実行する）

キャンペーンの状態・日予算・上限CPC:

```bash
./.venv/Scripts/gads.exe report --csv --query "SELECT campaign.id, campaign.name, campaign.status, campaign.primary_status, campaign_budget.amount_micros, campaign.target_spend.cpc_bid_ceiling_micros FROM campaign WHERE campaign.status != 'REMOVED' ORDER BY campaign.name"
```

配信スケジュール:

```bash
./.venv/Scripts/gads.exe report --csv --query "SELECT campaign.name, campaign_criterion.ad_schedule.day_of_week, campaign_criterion.ad_schedule.start_hour, campaign_criterion.ad_schedule.start_minute, campaign_criterion.ad_schedule.end_hour, campaign_criterion.ad_schedule.end_minute, campaign_criterion.bid_modifier FROM campaign_criterion WHERE campaign_criterion.type = 'AD_SCHEDULE' AND campaign.status != 'REMOVED' ORDER BY campaign.name"
```

直近の変更（記録漏れの検出用。運用メモに無い変更があれば報告する）:

```bash
./.venv/Scripts/gads.exe report --csv --query "SELECT change_event.change_date_time, change_event.change_resource_type, change_event.resource_change_operation, change_event.changed_fields, change_event.client_type, campaign.name FROM change_event WHERE change_event.change_date_time DURING LAST_7_DAYS ORDER BY change_event.change_date_time DESC LIMIT 100"
```

enum は数値で返るので読み替える:

| 項目 | 値 |
|---|---|
| `status` | 2=ENABLED / 3=PAUSED / 4=REMOVED |
| `primary_status` | 2=ELIGIBLE / 3=PAUSED / 5=ENDED / 6=PENDING / 7=MISCONFIGURED / **8=LIMITED** / **9=LEARNING** / 10=NOT_ELIGIBLE |
| `day_of_week` | 2=月 / 3=火 / 4=水 / 5=木 / 6=金 / 7=土 / 8=日 |
| `start_minute` / `end_minute` | 2=:00 / 3=:15 / 4=:30 / 5=:45 |
| `amount_micros` / `cpc_bid_ceiling_micros` | ÷1,000,000 で円 |
| `bid_modifier` | 浮動小数の誤差が出る（0.6999… → ×0.70 と表記） |
| `change_resource_type` | 5=CAMPAIGN / 6=CAMPAIGN_BUDGET / 8=CAMPAIGN_CRITERION（スケジュール・除外KW等）/ 3=AD_GROUP / 4=AD_GROUP_CRITERION / 2=AD |
| `resource_change_operation` | 2=CREATE / 3=UPDATE / 4=REMOVE（スケジュール張り替えは REMOVE+CREATE が同時刻に並ぶ） |
| `client_type` | 2=管理画面 / 6=API（Claude経由）/ 9=おすすめの自動適用 |

- `primary_status=8 (LIMITED)` は BIRTH_CONTROL ポリシー由来の**既知状態**。異常として扱わない
- スケジュールが**1行も無いキャンペーンは終日配信**になる。ENABLED なのにスケジュールが無ければ要注意として報告する
- 実効上限CPC = 上限CPC × bid_modifier

### 表にする

キャンペーンごとに、曜日を「月水木金」「土日」のようにまとめる:

| キャンペーン | 状態 | 日予算 | 上限CPC | 曜日 | 時間帯（入札調整） |
|---|---|---|---|---|---|

続けて、**今日と次の診療日**について時間軸で「何時にどのキャンペーンが出ているか」を並べる
（例: 土曜 11:00 インフル開始 → 12:00 内科_土日 → 13:30 発熱外来_土日 → 16:30 内科_土日終了 → 20:30 発熱外来終了 → 23:00 インフル終了）。
PAUSED のキャンペーンは「スケジュール上は出る枠だが停止中」と分けて書く。

### 突き合わせる

`clinic-ad-schedule-ops.md` の「設定変更履歴」の**直近2週間分**を読み、次を確認する:

1. **戻し忘れ**: 「今日だけ」「今夜だけ」「〜までに戻す」「〜前に確認」と書かれた項目で、期日が今日以前または次の配信開始前のもの。
   現状がまだ一時設定のままなら、**期日と戻す値を添えて真っ先に報告する**
2. **記録との不一致**: 履歴の最終状態と API の現状（状態・予算・CPC・スケジュール）が食い違っていないか。
   食い違っていたら change_event で誰がいつ変えたか（`client_type`）を添える
3. **診療時間との整合**: 内科系は一般外来の時間、発熱外来系は発熱外来の時間に合わせた設計（配信開始は受付の少し前、終了は最終受付20:50に間に合う20:30まで）。
   火曜・祝日に出る枠が無いか。**次の診療日が祝日なら、その日に出る枠を止める必要があるか確認する**
4. **期限切れの評価**: 「評価: 〇/〇に〜」の期日を過ぎたものがあればリマインドする

⚠️ 「満席なので止めた」系の停止は、**CV/CPA を根拠に再開を勧めない**。再開するかはオーナー判断として聞くだけにする。

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
- 配信スケジュール/入札傾斜: `scripts/set_ad_schedule_gradient.py --campaign-id <ID> --slot 曜日,開始,終了,入札調整 ...`
  （remove+createを原子的に適用。**指定したスロットで丸ごと張り替える**ので、変えない曜日・枠も全部 `--slot` に書く。曜日は `MONDAY`〜`SUNDAY`）
- 有効化／停止: `gads budget status --campaign-id <ID> --state ENABLED|PAUSED --yes`
- ヤフー上限CPC: `lyads campaign bid-ceiling --campaign-id <ID> --cpc <円>`

**原則:**
- **一度に1つだけ動かす。** 同時に触ると効果を切り分けられない
- 変更は必ずオーナーに確認してから実行する
- 適用時刻を記録し、**その日の集計で判断しない**（途中で条件が変わるため）
- 実行したら手順1.5のクエリで反映を確かめ、`ads/docs/claude-memory/clinic-ad-schedule-ops.md` の「設定変更履歴」に
  **時刻・指示・変更前後の値・戻す期日（あれば）**を追記する

## 6. 報告の形

次の順で出す:

1. **要対応**（戻し忘れ・記録との不一致・祝日の枠・ENABLEDなのにスケジュール無し）。無ければ「要対応なし」と一行
2. 成績: 昨日（確定値）と今日（暫定値）を分け、キャンペーン単位の表 → 目についた異常
3. 配信設定の一覧表と、今日／次の診療日のタイムライン
4. 提案

提案には必ず**評価のタイミングと比較対象**を添える。期限切れのまま放置されている再評価
（`clinic-ad-schedule-ops.md` の「期限切れのまま残っている再評価」）があれば毎回リマインドする。
