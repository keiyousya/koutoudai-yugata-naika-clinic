"""インフル予防接種の専用キャンペーンを PAUSED で作成する。

内科キャンペーン内の広告グループ方式（create_flu_vaccine_ad_group.py）では、
配信時間と日予算を内科と共有してしまう。発熱外来と一般外来を分ける運用（2026-09-23〜）では
予防接種も一般外来の時間帯に来てほしいので、配信時間を独立させるため専用キャンペーンにする。

採算: 任意接種 3,300円 − ワクチン 1,250円 − 人件費等 約400円 ≒ 1,650円が損益分岐CPA。
上限CPC 100円なら クリック→接種 6% で損益分岐。在庫は返品可なので採算内で取れるだけ取る。

冪等: 同名キャンペーンが既にあればスキップする。

使い方:
    PYTHONPATH=src .venv/bin/python scripts/create_flu_vaccine_campaign.py
"""

from __future__ import annotations

import click
from rich.console import Console

from gads.client import load_client, mutate_with_exemption, resolve_customer_id

console = Console()

CAMPAIGN_NAME = "検索_インフル予防接種_全日"
BUDGET_YEN = 2000
CPC_CEILING_YEN = 100

# 内科キャンペーンと同じ中心・半径・言語・除外オーディエンス
LAT_MICRO, LNG_MICRO, RADIUS_KM = 38267511, 140868655, 6.0
LANGUAGE_JAPANESE = "languageConstants/1005"
EXCLUDED_USER_LIST = "userLists/9334645108"

# 一般外来の終了時刻で止める（発熱外来の時間帯に健康な人を呼ばない）
SCHEDULE = [(day, 11, 19) for day in ("MONDAY", "WEDNESDAY", "THURSDAY", "FRIDAY")] + [
    (day, 11, 17) for day in ("SATURDAY", "SUNDAY")
]

# 内科キャンペーンから流用するアセット（「夜9時まで診療」は予防接種の案内と矛盾するので除く）
ASSETS = {
    "SITELINK": ["421195739216", "421195739222"],
    "CALLOUT": ["421195725641", "421195739237", "421195739243"],
    "BUSINESS_NAME": ["337626786330"],
    "BUSINESS_LOGO": ["392547406874"],
    "CALL": ["421195677632"],
}

FINAL_URL = "https://koutoudai-yugata-naika.clinic/flu-vaccine/"
KEYWORDS = [
    "インフルエンザ 予防接種",
    "インフルエンザ ワクチン",
    "インフル 予防接種",
    "インフル ワクチン",
    "インフルエンザ 注射",
    "インフル 注射",
    "インフルエンザ 予防接種 助成",
    "高齢者 インフルエンザ 予防接種",
]
NEGATIVE_KEYWORDS = [
    "症状", "潜伏期間", "効果 期間", "治療",
    "子供", "小児", "幼児", "赤ちゃん", "フルミスト",
]
HEADLINES = [
    "インフルエンザ予防接種 3,300円",
    "65歳以上は1,500円",
    "仙台市の助成対象です",
    "当日のLINE予約もOK",
    "勾当台公園駅すぐ",
    "平日17〜19時に接種",
    "土日は14〜17時に接種",
    "会社帰りに接種できます",
    "LINEで30秒かんたん予約",
]
DESCRIPTIONS = [
    "インフルエンザ予防接種を実施中。平日17〜19時、土日14〜17時。LINEで当日予約もできます。",
    "13歳以上対象。高齢者定期接種（自己負担1,500円）にも対応。",
]


def _search(client, cid: str, query: str):
    return list(client.get_service("GoogleAdsService").search(customer_id=cid, query=query))


@click.command()
@click.option("--yes", is_flag=True, help="確認をスキップする。")
def main(yes: bool) -> None:
    client = load_client()
    cid = resolve_customer_id(None)

    existing = _search(
        client, cid,
        f"SELECT campaign.id FROM campaign WHERE campaign.name = '{CAMPAIGN_NAME}' AND campaign.status != 'REMOVED'",
    )
    if existing:
        console.print(f"[yellow]既存: {CAMPAIGN_NAME} (id={existing[0].campaign.id})。スキップします。[/yellow]")
        return

    console.print(f"[bold]{CAMPAIGN_NAME}[/bold] を PAUSED で作成")
    console.print(f"  日予算 {BUDGET_YEN:,}円 / クリック数最大化・上限CPC {CPC_CEILING_YEN}円 / 半径{RADIUS_KM:.0f}km")
    console.print("  配信: " + ", ".join(f"{d[:3]} {s}-{e}" for d, s, e in SCHEDULE))
    console.print(f"  KW: {', '.join(KEYWORDS)}")
    if not yes:
        click.confirm("作成しますか？", abort=True)

    # 予算
    bop = client.get_type("CampaignBudgetOperation")
    bop.create.name = f"{CAMPAIGN_NAME} 予算"
    bop.create.amount_micros = BUDGET_YEN * 1_000_000
    bop.create.delivery_method = client.enums.BudgetDeliveryMethodEnum.STANDARD
    bop.create.explicitly_shared = False
    budget_rn = client.get_service("CampaignBudgetService").mutate_campaign_budgets(
        customer_id=cid, operations=[bop]
    ).results[0].resource_name

    # キャンペーン（内科と同じ: 検索＋検索パートナー / 所在地のみ / クリック数最大化）
    cop = client.get_type("CampaignOperation")
    c = cop.create
    c.name = CAMPAIGN_NAME
    c.advertising_channel_type = client.enums.AdvertisingChannelTypeEnum.SEARCH
    c.status = client.enums.CampaignStatusEnum.PAUSED
    c.contains_eu_political_advertising = (
        client.enums.EuPoliticalAdvertisingStatusEnum.DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING
    )
    c.campaign_budget = budget_rn
    c.target_spend.cpc_bid_ceiling_micros = CPC_CEILING_YEN * 1_000_000
    c.network_settings.target_google_search = True
    c.network_settings.target_search_network = True
    c.network_settings.target_content_network = False
    c.network_settings.target_partner_search_network = False
    c.geo_target_type_setting.positive_geo_target_type = (
        client.enums.PositiveGeoTargetTypeEnum.PRESENCE
    )
    camp_rn = client.get_service("CampaignService").mutate_campaigns(
        customer_id=cid, operations=[cop]
    ).results[0].resource_name
    camp_id = camp_rn.split("/")[-1]
    console.print(f"[green]✓ キャンペーン作成[/green] id={camp_id}")

    # 地域・言語・除外オーディエンス・配信時間
    ops = []
    op = client.get_type("CampaignCriterionOperation")
    op.create.campaign = camp_rn
    op.create.proximity.geo_point.latitude_in_micro_degrees = LAT_MICRO
    op.create.proximity.geo_point.longitude_in_micro_degrees = LNG_MICRO
    op.create.proximity.radius = RADIUS_KM
    op.create.proximity.radius_units = client.enums.ProximityRadiusUnitsEnum.KILOMETERS
    ops.append(op)
    op = client.get_type("CampaignCriterionOperation")
    op.create.campaign = camp_rn
    op.create.language.language_constant = LANGUAGE_JAPANESE
    ops.append(op)
    op = client.get_type("CampaignCriterionOperation")
    op.create.campaign = camp_rn
    op.create.negative = True
    op.create.user_list.user_list = f"customers/{cid}/{EXCLUDED_USER_LIST}"
    ops.append(op)
    for day, start, end in SCHEDULE:
        op = client.get_type("CampaignCriterionOperation")
        op.create.campaign = camp_rn
        s = op.create.ad_schedule
        s.day_of_week = client.enums.DayOfWeekEnum[day]
        s.start_hour, s.end_hour = start, end
        s.start_minute = client.enums.MinuteOfHourEnum.ZERO
        s.end_minute = client.enums.MinuteOfHourEnum.ZERO
        ops.append(op)
    client.get_service("CampaignCriterionService").mutate_campaign_criteria(customer_id=cid, operations=ops)
    console.print("  地域・言語・除外オーディエンス・配信時間を設定")

    # アセット
    ops = []
    for field, ids in ASSETS.items():
        for asset_id in ids:
            op = client.get_type("CampaignAssetOperation")
            op.create.campaign = camp_rn
            op.create.asset = f"customers/{cid}/assets/{asset_id}"
            op.create.field_type = client.enums.AssetFieldTypeEnum[field]
            ops.append(op)
    client.get_service("CampaignAssetService").mutate_campaign_assets(customer_id=cid, operations=ops)
    console.print(f"  アセット {len(ops)}件を紐付け")

    # 広告グループ
    agop = client.get_type("AdGroupOperation")
    agop.create.name = "インフル予防接種"
    agop.create.campaign = camp_rn
    agop.create.type_ = client.enums.AdGroupTypeEnum.SEARCH_STANDARD
    agop.create.status = client.enums.AdGroupStatusEnum.ENABLED
    ag_rn = client.get_service("AdGroupService").mutate_ad_groups(
        customer_id=cid, operations=[agop]
    ).results[0].resource_name

    ops = []
    for text, negative in [(k, False) for k in KEYWORDS] + [(k, True) for k in NEGATIVE_KEYWORDS]:
        op = client.get_type("AdGroupCriterionOperation")
        op.create.ad_group = ag_rn
        op.create.keyword.text = text
        op.create.keyword.match_type = client.enums.KeywordMatchTypeEnum.PHRASE
        op.create.negative = negative
        ops.append(op)
    client.get_service("AdGroupCriterionService").mutate_ad_group_criteria(customer_id=cid, operations=ops)
    console.print(f"  KW {len(KEYWORDS)}件 / 除外KW {len(NEGATIVE_KEYWORDS)}件")

    op = client.get_type("AdGroupAdOperation")
    op.create.ad_group = ag_rn
    op.create.status = client.enums.AdGroupAdStatusEnum.ENABLED
    op.create.ad.final_urls.append(FINAL_URL)
    rsa = op.create.ad.responsive_search_ad
    for text in HEADLINES:
        a = client.get_type("AdTextAsset")
        a.text = text
        rsa.headlines.append(a)
    for text in DESCRIPTIONS:
        a = client.get_type("AdTextAsset")
        a.text = text
        rsa.descriptions.append(a)
    rsa.path1 = "flu-vaccine"
    resp, exempted = mutate_with_exemption(
        client.get_service("AdGroupAdService").mutate_ad_group_ads, cid, op, request_exemption=True
    )
    console.print(f"  RSA作成: {resp.results[0].resource_name}" + (f"（例外申請: {exempted}）" if exempted else ""))
    console.print(f"\n[bold green]完了[/bold green] campaign_id={camp_id}（PAUSED）")


if __name__ == "__main__":
    main()
