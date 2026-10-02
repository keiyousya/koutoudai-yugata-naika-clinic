"""求人（受付事務）の検索キャンペーンを PAUSED で作成する。

Instagram広告（9/28〜）は採用ページの閲覧は取れても応募が0件だった。
仕事を探して検索している人に出すため、検索広告を足す（2026-10-02）。

成果は /thanks（応募フォーム送信後の遷移先）の表示で測る。コンバージョン
「求人応募フォーム送信」は内科などのCV数に混ざらないよう副次にしてあるので、
実績は「すべてのコンバージョン」列で見る。入札はクリック数最大化なので影響しない。

内科キャンペーンとの違い:
- 通勤圏から応募が来るので半径を 6km → 10km に広げる
- 求職者はいつでも検索するので配信時間を絞らない
- 患者の除外オーディエンスは付けない（患者が応募者になってもよい）
- 診療案内のアセット（サイトリンク・コールアウト・電話）は求人と関係ないので付けない

冪等: 同名キャンペーンが既にあればスキップする。

使い方:
    PYTHONPATH=src .venv/bin/python scripts/create_recruit_campaign.py
"""

from __future__ import annotations

import unicodedata

import click
from rich.console import Console

from gads.client import load_client, mutate_with_exemption, resolve_customer_id

console = Console()

CAMPAIGN_NAME = "検索_求人_受付事務"
BUDGET_YEN = 1000
CPC_CEILING_YEN = 150

LAT_MICRO, LNG_MICRO, RADIUS_KM = 38267511, 140868655, 10.0
LANGUAGE_JAPANESE = "languageConstants/1005"

ASSETS = {
    "BUSINESS_NAME": ["337626786330"],
    "BUSINESS_LOGO": ["392547406874"],
}

FINAL_URL = "https://koutoudai-yugata-naika.clinic/recruit/"
# 地域は配信エリアで絞っているので、KWに「仙台」は入れない（フレーズ一致で「仙台 医療事務 パート」も拾う）
KEYWORDS = [
    "医療事務 パート",
    "医療事務 アルバイト",
    "医療事務 バイト",
    "医療事務 求人",
    "クリニック 受付 パート",
    "クリニック 受付 バイト",
    "クリニック 受付 求人",
    "病院 受付 バイト",
    "病院 受付 パート",
    "受付 バイト 夕方",
    "勾当台 バイト",
    "勾当台 パート",
]
# 資格の勉強・派遣・正社員・職業情報の検索を除く
NEGATIVE_KEYWORDS = [
    "資格", "講座", "通信", "独学", "試験", "検定", "難易度", "勉強",
    "派遣", "正社員", "在宅", "志望動機", "きつい", "辞めたい",
    "年収", "給料", "平均", "とは", "ユーキャン", "ニチイ", "ソラスト",
]
HEADLINES = [
    "医療事務パート 時給1,300円",
    "クリニック受付スタッフ募集",
    "勾当台公園駅 徒歩2分",
    "週1日〜・夕方4時間からOK",
    "平日17時〜21時の勤務",
    "土日は14時〜21時の勤務",
    "学生・Wワーク歓迎",
    "医療事務の経験者歓迎",
    "交通費支給 月2万円まで",
    "勾当台夕方内科クリニック",
    "応募はWebフォームから",
]
DESCRIPTIONS = [
    "勾当台の内科クリニックで受付事務を募集。受付・会計・レセプト業務。時給1,300円。",
    "平日17〜21時・土日14〜21時のうち週1〜4日。交通費支給（月2万円まで）。",
    "勾当台公園駅から徒歩2分。仕事帰りや授業の後に働けます。学生・Wワーク歓迎。",
]


def _width(text: str) -> int:
    """Google広告の文字数（全角は2、半角は1）。"""
    return sum(2 if unicodedata.east_asian_width(ch) in "WFA" else 1 for ch in text)


def _check_lengths() -> None:
    errors = [f"見出し {_width(t)}/30: {t}" for t in HEADLINES if _width(t) > 30]
    errors += [f"説明文 {_width(t)}/90: {t}" for t in DESCRIPTIONS if _width(t) > 90]
    if errors:
        raise click.ClickException("文字数オーバー:\n" + "\n".join(errors))


def _search(client, cid: str, query: str):
    return list(client.get_service("GoogleAdsService").search(customer_id=cid, query=query))


@click.command()
@click.option("--yes", is_flag=True, help="確認をスキップする。")
def main(yes: bool) -> None:
    _check_lengths()
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
    console.print(f"  日予算 {BUDGET_YEN:,}円 / クリック数最大化・上限CPC {CPC_CEILING_YEN}円 / 半径{RADIUS_KM:.0f}km / 終日配信")
    console.print(f"  KW: {', '.join(KEYWORDS)}")
    if not yes:
        click.confirm("作成しますか？", abort=True)

    bop = client.get_type("CampaignBudgetOperation")
    bop.create.name = f"{CAMPAIGN_NAME} 予算"
    bop.create.amount_micros = BUDGET_YEN * 1_000_000
    bop.create.delivery_method = client.enums.BudgetDeliveryMethodEnum.STANDARD
    bop.create.explicitly_shared = False
    budget_rn = client.get_service("CampaignBudgetService").mutate_campaign_budgets(
        customer_id=cid, operations=[bop]
    ).results[0].resource_name

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
    client.get_service("CampaignCriterionService").mutate_campaign_criteria(customer_id=cid, operations=ops)
    console.print("  地域・言語を設定")

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

    agop = client.get_type("AdGroupOperation")
    agop.create.name = "受付事務"
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
    rsa.path1 = "recruit"
    resp, exempted = mutate_with_exemption(
        client.get_service("AdGroupAdService").mutate_ad_group_ads, cid, op, request_exemption=True
    )
    console.print(f"  RSA作成: {resp.results[0].resource_name}" + (f"（例外申請: {exempted}）" if exempted else ""))
    console.print(f"\n[bold green]完了[/bold green] campaign_id={camp_id}（PAUSED）")


if __name__ == "__main__":
    main()
