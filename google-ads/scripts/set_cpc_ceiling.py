"""TARGET_SPEND キャンペーンの上限クリック単価（cpc_bid_ceiling）を変更する。

`gads budget set` は日予算しか触れないため、入札の上限だけを変えたいとき用。

使い方:
    python scripts/set_cpc_ceiling.py --campaign-id 24122528062 --cpc 100
"""

from __future__ import annotations

import click
from google.protobuf import field_mask_pb2
from rich.console import Console

from gads.client import load_client, resolve_customer_id

console = Console()


@click.command()
@click.option("--campaign-id", required=True, help="対象キャンペーンID。")
@click.option("--cpc", required=True, type=float, help="新しい上限クリック単価（円）。")
@click.option("--customer-id", default=None, help="操作対象アカウントID（未指定時は.env）。")
@click.option("--yes", is_flag=True, help="確認をスキップする。")
def main(campaign_id: str, cpc: float, customer_id: str | None, yes: bool) -> None:
    client = load_client()
    cid = resolve_customer_id(customer_id)

    ga_service = client.get_service("GoogleAdsService")
    query = f"""
        SELECT campaign.name,
               campaign.resource_name,
               campaign.bidding_strategy_type,
               campaign.target_spend.cpc_bid_ceiling_micros
        FROM campaign
        WHERE campaign.id = {campaign_id}
    """
    rows = list(ga_service.search(customer_id=cid, query=query))
    if not rows:
        raise click.ClickException(f"キャンペーン {campaign_id} が見つかりません。")

    row = rows[0]
    strategy = row.campaign.bidding_strategy_type.name
    if strategy != "TARGET_SPEND":
        raise click.ClickException(
            f"入札戦略が TARGET_SPEND ではありません（{strategy}）。"
            "このスクリプトは上限CPCを持つ TARGET_SPEND 専用。"
        )

    current = row.campaign.target_spend.cpc_bid_ceiling_micros / 1_000_000
    new_micros = int(round(cpc * 1_000_000))

    console.print(
        f"[bold]{row.campaign.name}[/bold] の上限CPC: "
        f"{current:,.0f}円 → [green]{cpc:,.0f}円[/green]"
    )
    if not yes:
        click.confirm("変更しますか？", abort=True)

    campaign_service = client.get_service("CampaignService")
    operation = client.get_type("CampaignOperation")
    updated = operation.update
    updated.resource_name = row.campaign.resource_name
    updated.target_spend.cpc_bid_ceiling_micros = new_micros
    # target_spend は他フィールドを持たないので、変更したいパスだけを明示する。
    operation.update_mask.CopyFrom(
        field_mask_pb2.FieldMask(paths=["target_spend.cpc_bid_ceiling_micros"])
    )

    response = campaign_service.mutate_campaigns(customer_id=cid, operations=[operation])
    console.print(f"[green]更新しました[/green]: {response.results[0].resource_name}")


if __name__ == "__main__":
    main()
