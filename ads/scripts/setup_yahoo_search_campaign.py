"""LINEヤフー広告（検索広告）のキャンペーンを一括セットアップする。

Google広告側のキャンペーン構成を踏襲して、Yahoo検索広告に以下を作成する:
  1. キャンペーン（クリック数の最大化、日予算2,000円）
  2. 広告グループ
  3. RSA広告（見出し13本 / 説明文4本）
  4. ポジティブキーワード（部分一致25語）
  5. 除外キーワード（広告グループ / キャンペーン）
  6. ターゲティング（半径4km + 配信スケジュール）

使い方:
  cd ads && source .venv/bin/activate
  python scripts/setup_yahoo_search_campaign.py          # 本番
  python scripts/setup_yahoo_search_campaign.py --test    # テストアカウント
  python scripts/setup_yahoo_search_campaign.py --dry-run # API呼び出しなし
"""

from __future__ import annotations

import argparse
import json
import sys
from typing import Any

# ads/ ディレクトリの src をパスに入れる
sys.path.insert(0, str(__file__ and __import__("pathlib").Path(__file__).resolve().parents[1] / "src"))

from lyads.client import LyAdsClient, resolve_account_id, values_of

# ────────────────────────────────────────
# 設定値
# ────────────────────────────────────────

CAMPAIGN_NAME = "検索_内科_全日"
AD_GROUP_NAME = "内科・夜間・休日"
AD_NAME = "RSA_内科_v1"
DAILY_BUDGET = 2000  # 円
BID_CEILING = 100  # 上限CPC（円）。0 = 上限なし
FINAL_URL = "https://koutoudai-yugata-naika.clinic/"

# 半径ターゲティング（勾当台公園付近 4km）
# Yahoo API は microDegrees（1/1,000,000 度）を使う
LAT = 38.267511
LNG = 140.868655
LAT_MICRO = int(LAT * 1_000_000)  # 38267511
LNG_MICRO = int(LNG * 1_000_000)  # 140868655
RADIUS_KM = 4

# RSA 見出し（13本、Google広告と同一）
HEADLINES = [
    "仙台で夜21時まで診療",
    "土日も診療している内科",
    "勾当台公園駅から徒歩2分",
    "仙台市青葉区の内科クリニック",
    "夜間の発熱外来に対応",
    "平日夜17時から21時まで診療",
    "急な発熱・風邪症状にも",
    "土日も夜まで診療",
    "LINEで30秒かんたん予約",
    "会社帰りに寄れる内科",
    "健康診断の再検査もOK",
    "仙台の夜間・休日 内科",
    "発熱・咳・のどの痛みに",
]

# RSA 説明文（4本、Google広告と同一）
DESCRIPTIONS = [
    "仙台市青葉区の内科クリニック。平日夜21時まで、土日も診療しています。",
    "勾当台公園駅から徒歩2分。発熱、風邪症状、体調不良から健康診断の再検査まで幅広く対応。",
    "当院へのご来院は便利なLINE予約がおすすめです。公式アカウントのトークから30秒で完了。",
    "仙台で夜間・休日に対応できる発熱外来をお探しの方へ。お仕事帰りにもお気軽にご相談ください。",
]

# ポジティブキーワード（部分一致25語、Google広告と同一）
POSITIVE_KEYWORDS = [
    "内科 夜間",
    "休日 病院",
    "内科 日曜日",
    "土日 病院",
    "日曜 病院",
    "病院 近く",
    "日曜日 病院",
    "クリニック 予約",
    "内科 病院",
    "病院 内科",
    "夜間 内科",
    "病院 日曜日",
    "病院 夜",
    "夜 病院",
    "内科 開業",
    "日曜日 内科",
    "病院 日曜",
    "病院 内科 日曜日",
    "内科 夜",
    "インフルエンザ 日曜日 病院",
    "土日 内科",
    "日曜日 病院 内科",
    "発熱 日曜日 病院",
    "日曜日 病院 コロナ",
    "日曜日 やってる 内科 仙台",
]

# 広告グループレベル除外キーワード（フレーズ一致、Google広告と同一）
NEGATIVE_KEYWORDS_ADGROUP = [
    "オープン",
    "センター",
    "大学病院",
    "厚生病院",
    "徳洲会",
    "ジェイコー",
    "みやざき内科",
    "はじめのクリニック",
    "上杉病院",
]

# キャンペーンレベル除外キーワード（フレーズ一致、Google広告と同一）
NEGATIVE_KEYWORDS_CAMPAIGN = [
    "訪問 診療",
    "jcho",
    "jcho 仙台 病院",
]

# 配信スケジュール（Google広告側に揃える）
# 1キャンペーンなので平日・土日を統合。入札調整は後から個別に設定可能
SCHEDULE = [
    # 平日: 12:00-13:00 / 13:00-14:00 / 16:00-20:30
    {"dayOfWeek": "MONDAY",    "startHour": 12, "startMinute": "ZERO", "endHour": 14, "endMinute": "ZERO", "bidMultiplier": 1.0},
    {"dayOfWeek": "MONDAY",    "startHour": 16, "startMinute": "ZERO", "endHour": 20, "endMinute": "THIRTY", "bidMultiplier": 1.0},
    # 火曜は休診 → スケジュールなし
    {"dayOfWeek": "WEDNESDAY", "startHour": 12, "startMinute": "ZERO", "endHour": 14, "endMinute": "ZERO", "bidMultiplier": 1.0},
    {"dayOfWeek": "WEDNESDAY", "startHour": 16, "startMinute": "ZERO", "endHour": 20, "endMinute": "THIRTY", "bidMultiplier": 1.0},
    {"dayOfWeek": "THURSDAY",  "startHour": 12, "startMinute": "ZERO", "endHour": 14, "endMinute": "ZERO", "bidMultiplier": 1.0},
    {"dayOfWeek": "THURSDAY",  "startHour": 16, "startMinute": "ZERO", "endHour": 20, "endMinute": "THIRTY", "bidMultiplier": 1.0},
    {"dayOfWeek": "FRIDAY",    "startHour": 12, "startMinute": "ZERO", "endHour": 14, "endMinute": "ZERO", "bidMultiplier": 1.0},
    {"dayOfWeek": "FRIDAY",    "startHour": 16, "startMinute": "ZERO", "endHour": 20, "endMinute": "THIRTY", "bidMultiplier": 1.0},
    # 土日: 12:00-20:30
    {"dayOfWeek": "SATURDAY",  "startHour": 12, "startMinute": "ZERO", "endHour": 20, "endMinute": "THIRTY", "bidMultiplier": 1.0},
    {"dayOfWeek": "SUNDAY",    "startHour": 12, "startMinute": "ZERO", "endHour": 20, "endMinute": "THIRTY", "bidMultiplier": 1.0},
]


def pp(label: str, data: Any) -> None:
    print(f"\n{'=' * 60}")
    print(f"  {label}")
    print(f"{'=' * 60}")
    print(json.dumps(data, ensure_ascii=False, indent=2))


def extract_id(rval: Any, id_key: str) -> int:
    """mutate レスポンスから生成されたIDを取り出す。"""
    vals = values_of(rval)
    if not vals:
        raise RuntimeError(f"レスポンスに values がありません: {rval}")
    # values[0] の中身はサービスによって構造が違うので、再帰的に探す
    def _find(d: Any) -> int | None:
        if isinstance(d, dict):
            if id_key in d:
                return d[id_key]
            for v in d.values():
                r = _find(v)
                if r is not None:
                    return r
        if isinstance(d, list):
            for item in d:
                r = _find(item)
                if r is not None:
                    return r
        return None
    found = _find(vals[0])
    if found is None:
        raise RuntimeError(f"{id_key} が見つかりません: {json.dumps(vals[0], ensure_ascii=False)}")
    return int(found)


def main() -> None:
    parser = argparse.ArgumentParser(description="Yahoo検索広告キャンペーンをセットアップ")
    parser.add_argument("--test", action="store_true", help="テストアカウントを使う")
    parser.add_argument("--dry-run", action="store_true", help="API呼び出しをせずペイロードだけ表示")
    parser.add_argument("--paused", action="store_true", help="キャンペーンを一時停止状態で作成（審査確認用）")
    args = parser.parse_args()

    aid = resolve_account_id(None, "search", test=args.test)
    client = LyAdsClient(product="search")
    user_status = "PAUSED" if args.paused else "ACTIVE"

    print(f"対象アカウント: {aid} ({'テスト' if args.test else '本番'})")
    print(f"キャンペーン状態: {user_status}")

    # ── 1. キャンペーン作成 ──
    campaign_payload = {
        "accountId": aid,
        "operand": [{
            "campaignName": CAMPAIGN_NAME,
            "userStatus": user_status,
            "startDate": "20260811",
            "endDate": "20371231",
            "budget": {"amount": DAILY_BUDGET},
            "biddingStrategyConfiguration": {
                "biddingScheme": {
                    "biddingStrategyType": "MAXIMIZE_CLICKS",
                    "maximizeClicksBiddingScheme": {
                        "bidCeiling": BID_CEILING,
                    },
                },
            },
        }],
    }
    pp("1. キャンペーン作成", campaign_payload)
    if args.dry_run:
        campaign_id = 99999999
    else:
        rval = client.call("CampaignService", "add", campaign_payload)
        campaign_id = extract_id(rval, "campaignId")
    print(f"  → campaignId: {campaign_id}")

    # ── 2. 広告グループ作成 ──
    adgroup_payload = {
        "accountId": aid,
        "operand": [{
            "campaignId": campaign_id,
            "adGroupName": AD_GROUP_NAME,
            "userStatus": "ACTIVE",
        }],
    }
    pp("2. 広告グループ作成", adgroup_payload)
    if args.dry_run:
        adgroup_id = 88888888
    else:
        rval = client.call("AdGroupService", "add", adgroup_payload)
        adgroup_id = extract_id(rval, "adGroupId")
    print(f"  → adGroupId: {adgroup_id}")

    # ── 3. RSA広告作成 ──
    ad_payload = {
        "accountId": aid,
        "operand": [{
            "campaignId": campaign_id,
            "adGroupId": adgroup_id,
            "adName": AD_NAME,
            "userStatus": "ACTIVE",
            "ad": {
                "adType": "RESPONSIVE_SEARCH_AD",
                "finalUrl": FINAL_URL,
                "responsiveSearchAd": {
                    "headlines": [{"text": h} for h in HEADLINES],
                    "descriptions": [{"text": d} for d in DESCRIPTIONS],
                },
            },
        }],
    }
    pp("3. RSA広告作成", ad_payload)
    if args.dry_run:
        ad_id = 77777777
    else:
        rval = client.call("AdGroupAdService", "add", ad_payload)
        ad_id = extract_id(rval, "adId")
    print(f"  → adId: {ad_id}")

    # ── 4. ポジティブキーワード追加 ──
    kw_operands = [
        {
            "campaignId": campaign_id,
            "adGroupId": adgroup_id,
            "use": "BIDDABLE",
            "biddableAdGroupCriterion": {
                "userStatus": "ACTIVE",
            },
            "criterion": {
                "criterionType": "KEYWORD",
                "keyword": {
                    "text": kw,
                    "keywordMatchType": "BROAD",
                },
            },
        }
        for kw in POSITIVE_KEYWORDS
    ]
    kw_payload = {"accountId": aid, "operand": kw_operands}
    pp(f"4. ポジティブキーワード追加（{len(POSITIVE_KEYWORDS)}語）", {"count": len(kw_operands), "sample": kw_operands[:3]})
    if not args.dry_run:
        rval = client.call("AdGroupCriterionService", "add", kw_payload)
        print(f"  → {len(values_of(rval))} 件追加")
    else:
        print(f"  → (dry-run) {len(kw_operands)} 件")

    # ── 5. 除外キーワード追加（広告グループレベル） ──
    neg_ag_operands = [
        {
            "campaignId": campaign_id,
            "adGroupId": adgroup_id,
            "use": "NEGATIVE",
            "criterion": {
                "criterionType": "KEYWORD",
                "keyword": {
                    "text": kw,
                    "keywordMatchType": "PHRASE",
                },
            },
        }
        for kw in NEGATIVE_KEYWORDS_ADGROUP
    ]
    neg_ag_payload = {"accountId": aid, "operand": neg_ag_operands}
    pp(f"5. 除外キーワード（広告グループ、{len(NEGATIVE_KEYWORDS_ADGROUP)}語）", {"count": len(neg_ag_operands), "sample": neg_ag_operands[:3]})
    if not args.dry_run:
        rval = client.call("AdGroupCriterionService", "add", neg_ag_payload)
        print(f"  → {len(values_of(rval))} 件追加")
    else:
        print(f"  → (dry-run) {len(neg_ag_operands)} 件")

    # ── 6. 除外キーワード追加（キャンペーンレベル） ──
    neg_cp_operands = [
        {
            "campaignId": campaign_id,
            "use": "NEGATIVE",
            "criterion": {
                "criterionType": "KEYWORD",
                "keyword": {
                    "text": kw,
                    "keywordMatchType": "PHRASE",
                },
            },
        }
        for kw in NEGATIVE_KEYWORDS_CAMPAIGN
    ]
    neg_cp_payload = {"accountId": aid, "operand": neg_cp_operands}
    pp(f"6. 除外キーワード（キャンペーン、{len(NEGATIVE_KEYWORDS_CAMPAIGN)}語）", {"count": len(neg_cp_operands)})
    if not args.dry_run:
        rval = client.call("CampaignCriterionService", "add", neg_cp_payload)
        print(f"  → {len(values_of(rval))} 件追加")
    else:
        print(f"  → (dry-run) {len(neg_cp_operands)} 件")

    # ── 7. ターゲティング: 半径4km ──
    radius_payload = {
        "accountId": aid,
        "operand": [{
            "accountId": aid,
            "campaignId": campaign_id,
            "bidMultiplier": 1.0,
            "target": {
                "targetType": "RADIUS",
                "radiusTarget": {
                    "latitudeInMicroDegrees": LAT_MICRO,
                    "longitudeInMicroDegrees": LNG_MICRO,
                    "radius": RADIUS_KM,
                    "description": f"勾当台公園付近 {RADIUS_KM}km圏内",
                },
            },
        }],
    }
    pp("7. 半径ターゲティング", radius_payload)
    if not args.dry_run:
        rval = client.call("CampaignTargetService", "add", radius_payload)
        print(f"  → 設定完了")
    else:
        print(f"  → (dry-run)")

    # ── 8. ターゲティング: 配信スケジュール ──
    schedule_operands = [
        {
            "accountId": aid,
            "campaignId": campaign_id,
            "bidMultiplier": s["bidMultiplier"],
            "target": {
                "targetType": "SCHEDULE",
                "scheduleTarget": {
                    "dayOfWeek": s["dayOfWeek"],
                    "startHour": s["startHour"],
                    "startMinute": s["startMinute"],
                    "endHour": s["endHour"],
                    "endMinute": s["endMinute"],
                },
            },
        }
        for s in SCHEDULE
    ]
    schedule_payload = {"accountId": aid, "operand": schedule_operands}
    pp(f"8. 配信スケジュール（{len(SCHEDULE)}枠）", {"count": len(schedule_operands), "sample": schedule_operands[:2]})
    if not args.dry_run:
        rval = client.call("CampaignTargetService", "add", schedule_payload)
        print(f"  → {len(values_of(rval))} 枠設定完了")
    else:
        print(f"  → (dry-run) {len(schedule_operands)} 枠")

    # ── 完了 ──
    print(f"\n{'=' * 60}")
    print("  セットアップ完了！")
    print(f"{'=' * 60}")
    print(f"  キャンペーンID: {campaign_id}")
    print(f"  広告グループID: {adgroup_id}")
    print(f"  広告ID:         {ad_id}")
    print(f"  状態:           {user_status}")
    if user_status == "PAUSED":
        print(f"\n  配信を開始するには:")
        print(f"  lyads campaign status --campaign-id {campaign_id} --state ACTIVE")


if __name__ == "__main__":
    main()
