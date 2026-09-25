"""発熱外来の専用キャンペーン（平日・土日）を PAUSED で作成する。

2026-09-23 に内科キャンペーンを一般外来専用（発熱系KWは除外、平日〜19時・土日〜17時）にしたので、
発熱外来の時間帯（平日19〜21時・土日17〜21時、最終受付20:50）は別キャンペーンで出す。

設計:
  - 配信は発熱外来の開始1時間前から 20:30 まで。当日の発熱外来枠を探す人を拾い、最終受付に間に合わない時間は出さない
  - KWは2系統。発熱意図が明確な語はフレーズ一致、実績でCVが出ていた時間帯系（夜 病院・日曜 内科 等）は部分一致
    （8/17〜9/22、発熱の患者は「発熱」系KWより時間帯系の部分一致から入っていた）
  - 内科キャンペーンと同じ中心・半径・共有除外リスト（競合名・対象外検索語）
  - 除外オーディエンスは付けない。健康系KWとオーディエンス指定の組み合わせは
    HEALTH_IN_PERSONALIZED_ADS で弾かれる（2026-09-25、「発熱 クリニック」で確認）
  - 満席で電話を断る日があったので日予算は小さく始める（キャパの話が出たらCV/CPAは判断材料にしない）

冪等: 同名キャンペーンが既にあればスキップする。

使い方:
    PYTHONPATH=src .venv/bin/python scripts/create_fever_campaigns.py
"""

from __future__ import annotations

import unicodedata

import click
from rich.console import Console

from gads.client import load_client, mutate_with_exemption, resolve_customer_id

console = Console()

LAT_MICRO, LNG_MICRO, RADIUS_KM = 38267511, 140868655, 6.0
LANGUAGE_JAPANESE = "languageConstants/1005"
SHARED_NEGATIVE_LISTS = ["競合医療機関名", "対象外検索語"]

# 内科キャンペーンから流用（発熱外来は夜なので「夜9時まで診療」も付ける）
ASSETS = {
    "SITELINK": ["421195739216", "421195739222"],
    "CALLOUT": ["421300632634", "421195725641", "421195739237", "421195739243"],
    "BUSINESS_NAME": ["337626786330"],
    "BUSINESS_LOGO": ["392547406874"],
    "CALL": ["421195677632"],
}

FINAL_URL = "https://koutoudai-yugata-naika.clinic/"

FEVER_KEYWORDS = [  # フレーズ一致
    "発熱外来",
    "発熱 病院",
    "発熱 内科",
    "発熱 クリニック",
    "熱 病院",
    "インフルエンザ 検査",
    "インフル 検査",
    "コロナ 検査",
    "咳 病院",
    "風邪 病院",
]
NEGATIVE_KEYWORDS = [  # フレーズ一致
    "予防接種", "ワクチン", "潜伏期間", "市販",
    "子供", "小児", "幼児", "赤ちゃん",
    "勾当台夕方内科", "夕方内科",  # 指名検索は広告なしでも来る（初日に費用の33%を使った）
]

COMMON_DESCRIPTIONS = [
    "一般診療と時間帯・診療スペースを分けて対応。インフルエンザ・新型コロナの迅速検査を実施。",
    "当院へのご来院は便利なLINE予約がおすすめです。公式アカウントのトークから30秒で完了。",
    "受診歴がなくても受診できます。勾当台公園駅から徒歩2分。お仕事帰りにもどうぞ。",
]
COMMON_HEADLINES = [
    "インフル・コロナ迅速検査",
    "受診歴がなくても受診OK",
    "勾当台公園駅から徒歩2分",
    "LINEで30秒かんたん予約",
    "発熱・咳・のどの痛みに",
    "一般外来と時間・部屋を分離",
    "最終受付20時50分",
]

CAMPAIGNS = [
    {
        "name": "検索_発熱外来_平日（月水木金）",
        "budget_yen": 1500,
        "cpc_ceiling_yen": 100,
        "schedule": [(d, 18, 0, 20, 30) for d in ("MONDAY", "WEDNESDAY", "THURSDAY", "FRIDAY")],
        "time_keywords": ["夜 病院", "病院 夜", "内科 夜", "内科 夜間"],  # 部分一致
        "headlines": [
            "仙台の発熱外来 夜21時まで",
            "発熱外来 平日19〜21時",
            "仕事帰りに受診できます",
        ],
        "description": "発熱・咳・のどの痛みの方の発熱外来。平日19〜21時（最終受付20時50分）。",
    },
    {
        "name": "検索_発熱外来_土日",
        "budget_yen": 3000,
        "cpc_ceiling_yen": 100,
        "schedule": [(d, 16, 0, 20, 30) for d in ("SATURDAY", "SUNDAY")],
        "time_keywords": [
            "夜 病院", "病院 夜", "内科 夜",
            "日曜 病院", "日曜日 病院", "内科 日曜日", "土曜 病院", "土曜 内科",
            "仙台 内科 土日", "日曜日 やっ てる 内科 仙台",
        ],
        "headlines": [
            "仙台の発熱外来 土日も診療",
            "発熱外来 土日17〜21時",
            "土日の夜も受診できます",
        ],
        "description": "発熱・咳・のどの痛みの方の発熱外来。土日17〜21時（最終受付20時50分）。",
    },
]


def _width(text: str) -> int:
    return sum(2 if unicodedata.east_asian_width(ch) in "FWA" else 1 for ch in text)


def _check_lengths() -> None:
    errors = []
    for conf in CAMPAIGNS:
        for h in COMMON_HEADLINES + conf["headlines"]:
            if _width(h) > 30:
                errors.append(f"見出し超過({_width(h)}): {h}")
        for d in COMMON_DESCRIPTIONS + [conf["description"]]:
            if _width(d) > 90:
                errors.append(f"説明文超過({_width(d)}): {d}")
    if errors:
        raise click.ClickException("\n".join(errors))


def _search(client, cid: str, query: str):
    return list(client.get_service("GoogleAdsService").search(customer_id=cid, query=query))


def _create(client, cid: str, conf: dict, shared_sets: dict[str, str]) -> None:
    name = conf["name"]

    bop = client.get_type("CampaignBudgetOperation")
    bop.create.name = f"{name} 予算"
    bop.create.amount_micros = conf["budget_yen"] * 1_000_000
    bop.create.delivery_method = client.enums.BudgetDeliveryMethodEnum.STANDARD
    bop.create.explicitly_shared = False
    budget_rn = client.get_service("CampaignBudgetService").mutate_campaign_budgets(
        customer_id=cid, operations=[bop]
    ).results[0].resource_name

    cop = client.get_type("CampaignOperation")
    c = cop.create
    c.name = name
    c.advertising_channel_type = client.enums.AdvertisingChannelTypeEnum.SEARCH
    c.status = client.enums.CampaignStatusEnum.PAUSED
    c.contains_eu_political_advertising = (
        client.enums.EuPoliticalAdvertisingStatusEnum.DOES_NOT_CONTAIN_EU_POLITICAL_ADVERTISING
    )
    c.campaign_budget = budget_rn
    c.target_spend.cpc_bid_ceiling_micros = conf["cpc_ceiling_yen"] * 1_000_000
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
    console.print(f"[green]✓ {name}[/green] id={camp_rn.split('/')[-1]}")
    try:
        _fill(client, cid, conf, camp_rn, shared_sets)
    except Exception:
        # 半端なキャンペーンを残すと冪等チェックで次回スキップされるので消してから落とす
        rop = client.get_type("CampaignOperation")
        rop.remove = camp_rn
        client.get_service("CampaignService").mutate_campaigns(customer_id=cid, operations=[rop])
        console.print(f"[red]失敗したため {name} を削除しました[/red]")
        raise


def _fill(client, cid: str, conf: dict, camp_rn: str, shared_sets: dict[str, str]) -> None:

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
    minute = {0: "ZERO", 15: "FIFTEEN", 30: "THIRTY", 45: "FORTY_FIVE"}
    for day, sh, sm, eh, em in conf["schedule"]:
        op = client.get_type("CampaignCriterionOperation")
        op.create.campaign = camp_rn
        s = op.create.ad_schedule
        s.day_of_week = client.enums.DayOfWeekEnum[day]
        s.start_hour, s.end_hour = sh, eh
        s.start_minute = client.enums.MinuteOfHourEnum[minute[sm]]
        s.end_minute = client.enums.MinuteOfHourEnum[minute[em]]
        ops.append(op)
    client.get_service("CampaignCriterionService").mutate_campaign_criteria(customer_id=cid, operations=ops)

    ops = []
    for set_rn in shared_sets.values():
        op = client.get_type("CampaignSharedSetOperation")
        op.create.campaign = camp_rn
        op.create.shared_set = set_rn
        ops.append(op)
    client.get_service("CampaignSharedSetService").mutate_campaign_shared_sets(customer_id=cid, operations=ops)

    ops = []
    for field, ids in ASSETS.items():
        for asset_id in ids:
            op = client.get_type("CampaignAssetOperation")
            op.create.campaign = camp_rn
            op.create.asset = f"customers/{cid}/assets/{asset_id}"
            op.create.field_type = client.enums.AssetFieldTypeEnum[field]
            ops.append(op)
    client.get_service("CampaignAssetService").mutate_campaign_assets(customer_id=cid, operations=ops)
    console.print("  地域・言語・配信時間・共有除外リスト・アセットを設定")

    agop = client.get_type("AdGroupOperation")
    agop.create.name = "発熱外来"
    agop.create.campaign = camp_rn
    agop.create.type_ = client.enums.AdGroupTypeEnum.SEARCH_STANDARD
    agop.create.status = client.enums.AdGroupStatusEnum.ENABLED
    ag_rn = client.get_service("AdGroupService").mutate_ad_groups(
        customer_id=cid, operations=[agop]
    ).results[0].resource_name

    match = client.enums.KeywordMatchTypeEnum
    rows = (
        [(k, match.PHRASE, False) for k in FEVER_KEYWORDS]
        + [(k, match.BROAD, False) for k in conf["time_keywords"]]
        + [(k, match.PHRASE, True) for k in NEGATIVE_KEYWORDS]
    )
    # 健康系の語はポリシー審査に掛かることがあるので1件ずつ送り、弾かれたら例外申請する
    exempted_kws = []
    for text, match_type, negative in rows:
        op = client.get_type("AdGroupCriterionOperation")
        op.create.ad_group = ag_rn
        op.create.keyword.text = text
        op.create.keyword.match_type = match_type
        op.create.negative = negative
        _, exempted = mutate_with_exemption(
            client.get_service("AdGroupCriterionService").mutate_ad_group_criteria, cid, op,
            request_exemption=True,
        )
        if exempted:
            exempted_kws.append(f"{text}（{', '.join(exempted)}）")
    if exempted_kws:
        console.print(f"  [yellow]例外申請したKW: {' / '.join(exempted_kws)}[/yellow]")
    console.print(
        f"  KW フレーズ{len(FEVER_KEYWORDS)} / 部分一致{len(conf['time_keywords'])} / 除外{len(NEGATIVE_KEYWORDS)}"
    )

    op = client.get_type("AdGroupAdOperation")
    op.create.ad_group = ag_rn
    op.create.status = client.enums.AdGroupAdStatusEnum.ENABLED
    op.create.ad.final_urls.append(FINAL_URL)
    rsa = op.create.ad.responsive_search_ad
    for text in conf["headlines"] + COMMON_HEADLINES:
        a = client.get_type("AdTextAsset")
        a.text = text
        rsa.headlines.append(a)
    for text in [conf["description"]] + COMMON_DESCRIPTIONS:
        a = client.get_type("AdTextAsset")
        a.text = text
        rsa.descriptions.append(a)
    rsa.path1 = "発熱外来"
    resp, exempted = mutate_with_exemption(
        client.get_service("AdGroupAdService").mutate_ad_group_ads, cid, op, request_exemption=True
    )
    console.print(f"  RSA作成: {resp.results[0].resource_name}" + (f"（例外申請: {exempted}）" if exempted else ""))


@click.command()
@click.option("--yes", is_flag=True, help="確認をスキップする。")
def main(yes: bool) -> None:
    _check_lengths()
    client = load_client()
    cid = resolve_customer_id(None)

    shared_sets = {
        r.shared_set.name: r.shared_set.resource_name
        for r in _search(
            client, cid,
            "SELECT shared_set.name, shared_set.resource_name FROM shared_set "
            "WHERE shared_set.type = 'NEGATIVE_KEYWORDS' AND shared_set.status = 'ENABLED'",
        )
        if r.shared_set.name in SHARED_NEGATIVE_LISTS
    }
    missing = set(SHARED_NEGATIVE_LISTS) - set(shared_sets)
    if missing:
        raise click.ClickException(f"共有除外リストが見つからない: {missing}")

    todo = []
    for conf in CAMPAIGNS:
        existing = _search(
            client, cid,
            f"SELECT campaign.id FROM campaign WHERE campaign.name = '{conf['name']}' AND campaign.status != 'REMOVED'",
        )
        if existing:
            console.print(f"[yellow]既存: {conf['name']} (id={existing[0].campaign.id})。スキップします。[/yellow]")
            continue
        todo.append(conf)
        console.print(f"[bold]{conf['name']}[/bold] を PAUSED で作成")
        console.print(f"  日予算 {conf['budget_yen']:,}円 / 上限CPC {conf['cpc_ceiling_yen']}円 / 半径{RADIUS_KM:.0f}km")
        console.print("  配信: " + ", ".join(f"{d[:3]} {sh}:{sm:02d}-{eh}:{em:02d}" for d, sh, sm, eh, em in conf["schedule"]))
    if not todo:
        return
    if not yes:
        click.confirm("作成しますか？", abort=True)

    for conf in todo:
        _create(client, cid, conf, shared_sets)
    console.print("\n[bold green]完了[/bold green]（すべて PAUSED）")


if __name__ == "__main__":
    main()
