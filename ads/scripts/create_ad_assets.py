"""広告表示オプション（サイトリンク・コールアウト・電話番号）を作成し、キャンペーンに紐付ける。

使い方:
    python scripts/create_ad_assets.py --campaign-id 23956443999 --campaign-id 24122528062
"""

from __future__ import annotations

import click
from rich.console import Console

from gads.client import load_client, resolve_customer_id

console = Console()

BASE_URL = "https://koutoudai-yugata-naika.clinic"

SITELINKS = [
    {
        "name": "LINE予約",
        "link_text": "LINE予約はこちら",
        "description1": "24時間いつでも予約OK",
        "description2": "LINEで簡単に予約できます",
        "url": f"{BASE_URL}/availability/",
    },
    {
        "name": "診療時間・アクセス",
        "link_text": "診療時間・アクセス",
        "description1": "平日17-21時 土日14-21時",
        "description2": "勾当台公園駅すぐ",
        "url": f"{BASE_URL}/guide/",
    },
    {
        "name": "医師紹介",
        "link_text": "医師紹介",
        "description1": "総合内科専門医が診療",
        "description2": "丁寧にお話を伺います",
        "url": f"{BASE_URL}/doctor/",
    },
]

CALLOUTS = [
    "夜9時まで診療",
    "土日も診療",
    "当日予約OK",
    "勾当台公園駅すぐ",
]

PHONE_NUMBER = "022-393-8689"


def create_assets(client, cid: str) -> dict[str, list[str]]:
    """アセットを作成し、タイプ別のリソース名リストを返す。"""
    asset_service = client.get_service("AssetService")
    operations = []
    asset_types = []  # 対応する field_type を記録

    # サイトリンク
    for sl in SITELINKS:
        op = client.get_type("AssetOperation")
        a = op.create
        a.name = sl["name"]
        a.sitelink_asset.link_text = sl["link_text"]
        a.sitelink_asset.description1 = sl["description1"]
        a.sitelink_asset.description2 = sl["description2"]
        a.final_urls.append(sl["url"])
        operations.append(op)
        asset_types.append("SITELINK")

    # コールアウト
    for text in CALLOUTS:
        op = client.get_type("AssetOperation")
        a = op.create
        a.name = text
        a.callout_asset.callout_text = text
        operations.append(op)
        asset_types.append("CALLOUT")

    # 電話番号
    op = client.get_type("AssetOperation")
    a = op.create
    a.name = "電話番号"
    a.call_asset.phone_number = PHONE_NUMBER
    a.call_asset.country_code = "JP"
    operations.append(op)
    asset_types.append("CALL")

    response = asset_service.mutate_assets(customer_id=cid, operations=operations)

    result: dict[str, list[str]] = {}
    for i, res in enumerate(response.results):
        ft = asset_types[i]
        result.setdefault(ft, []).append(res.resource_name)
        console.print(f"  [green]作成[/green] {ft}: {res.resource_name}")

    return result


def link_to_campaigns(
    client, cid: str, assets: dict[str, list[str]], campaign_ids: tuple[str, ...]
) -> None:
    """アセットをキャンペーンに紐付ける。"""
    campaign_asset_service = client.get_service("CampaignAssetService")
    campaign_service = client.get_service("CampaignService")

    operations = []
    for campaign_id in campaign_ids:
        campaign_rn = campaign_service.campaign_path(cid, campaign_id)
        for field_type, resource_names in assets.items():
            for asset_rn in resource_names:
                op = client.get_type("CampaignAssetOperation")
                ca = op.create
                ca.asset = asset_rn
                ca.campaign = campaign_rn
                ca.field_type = client.enums.AssetFieldTypeEnum[field_type]
                operations.append(op)

    campaign_asset_service.mutate_campaign_assets(customer_id=cid, operations=operations)
    console.print(
        f"[green]{len(operations)}件のアセットリンクを作成しました"
        f"（{len(campaign_ids)}キャンペーン）。[/green]"
    )


@click.command()
@click.option(
    "--campaign-id", "campaign_ids", multiple=True, required=True,
    help="紐付け先キャンペーンID（複数可）。",
)
@click.option("--customer-id", default=None, help="操作対象アカウントID（未指定時は.env）。")
@click.option("--yes", is_flag=True, help="確認をスキップする。")
def main(campaign_ids: tuple[str, ...], customer_id: str | None, yes: bool) -> None:
    client = load_client()
    cid = resolve_customer_id(customer_id)

    console.print("[bold]作成するアセット:[/bold]")
    console.print(f"  サイトリンク: {len(SITELINKS)}件")
    console.print(f"  コールアウト: {len(CALLOUTS)}件")
    console.print(f"  電話番号: {PHONE_NUMBER}")
    console.print(f"  紐付け先: {', '.join(campaign_ids)}")

    if not yes:
        click.confirm("実行しますか？", abort=True)

    console.print("\n[bold]アセット作成中...[/bold]")
    assets = create_assets(client, cid)

    console.print("\n[bold]キャンペーンに紐付け中...[/bold]")
    link_to_campaigns(client, cid, assets, campaign_ids)


if __name__ == "__main__":
    main()
