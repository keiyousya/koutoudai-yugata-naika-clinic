"""対象外の診療科・地名・サービスを除外キーワードリストに追加し、キャンペーンに紐付ける。

add_competitor_negatives.py と同じ共有リスト方式。冪等（再実行で重複しない）。

使い方:
    python scripts/add_category_negatives.py --campaign-id 23956443999 --campaign-id 24122528062
"""

from __future__ import annotations

import click
from rich.console import Console

from gads.client import load_client, resolve_customer_id

console = Console()

LIST_NAME = "対象外検索語"

# 他科（一般内科で対応しない専門科）・圏外地名・対応外サービス
NEGATIVE_KEYWORDS = [
    # 他科
    "耳鼻科",
    "小児科",
    "整形外科",
    "外科",
    # 圏外地名
    "大河原",
    # 対応外サービス
    "夜間 救急",
    "健康 診断",
    "健康診断",
    "健診",
]


def find_or_create_shared_set(client, cid: str) -> str:
    """除外キーワードリストを取得（なければ作成）してリソース名を返す。"""
    ga_service = client.get_service("GoogleAdsService")
    rows = list(
        ga_service.search(
            customer_id=cid,
            query=(
                "SELECT shared_set.resource_name, shared_set.name "
                "FROM shared_set "
                "WHERE shared_set.type = NEGATIVE_KEYWORDS "
                "AND shared_set.status = ENABLED"
            ),
        )
    )
    for row in rows:
        if row.shared_set.name == LIST_NAME:
            console.print(f"既存のリストを再利用: [cyan]{LIST_NAME}[/cyan]")
            return row.shared_set.resource_name

    service = client.get_service("SharedSetService")
    operation = client.get_type("SharedSetOperation")
    shared_set = operation.create
    shared_set.name = LIST_NAME
    shared_set.type_ = client.enums.SharedSetTypeEnum.NEGATIVE_KEYWORDS
    response = service.mutate_shared_sets(customer_id=cid, operations=[operation])
    resource_name = response.results[0].resource_name
    console.print(f"[green]リストを作成しました[/green]: {LIST_NAME}")
    return resource_name


def add_criteria(client, cid: str, shared_set: str) -> int:
    """未登録の語だけをリストへ追加し、追加件数を返す。"""
    ga_service = client.get_service("GoogleAdsService")
    existing = {
        row.shared_criterion.keyword.text
        for row in ga_service.search(
            customer_id=cid,
            query=(
                "SELECT shared_criterion.keyword.text FROM shared_criterion "
                f"WHERE shared_set.resource_name = '{shared_set}'"
            ),
        )
    }
    todo = [n for n in NEGATIVE_KEYWORDS if n not in existing]
    if not todo:
        console.print("[yellow]追加すべき語はありません（すべて登録済み）。[/yellow]")
        return 0

    service = client.get_service("SharedCriterionService")
    operations = []
    for name in todo:
        operation = client.get_type("SharedCriterionOperation")
        criterion = operation.create
        criterion.shared_set = shared_set
        criterion.keyword.text = name
        criterion.keyword.match_type = client.enums.KeywordMatchTypeEnum.PHRASE
        operations.append(operation)

    service.mutate_shared_criteria(customer_id=cid, operations=operations)
    console.print(f"[green]{len(todo)}件を追加しました。[/green]")
    return len(todo)


def attach_to_campaigns(client, cid: str, shared_set: str, campaign_ids: tuple[str, ...]) -> None:
    """リストをキャンペーンへ紐付ける（既に紐付いていればスキップ）。"""
    ga_service = client.get_service("GoogleAdsService")
    attached = {
        row.campaign.id
        for row in ga_service.search(
            customer_id=cid,
            query=(
                "SELECT campaign.id FROM campaign_shared_set "
                f"WHERE shared_set.resource_name = '{shared_set}'"
            ),
        )
    }

    service = client.get_service("CampaignSharedSetService")
    operations = []
    for campaign_id in campaign_ids:
        if int(campaign_id) in attached:
            console.print(f"  campaign {campaign_id}: 紐付け済み")
            continue
        operation = client.get_type("CampaignSharedSetOperation")
        link = operation.create
        link.campaign = client.get_service("CampaignService").campaign_path(cid, campaign_id)
        link.shared_set = shared_set
        operations.append(operation)

    if operations:
        service.mutate_campaign_shared_sets(customer_id=cid, operations=operations)
        console.print(f"[green]{len(operations)}件のキャンペーンへ紐付けました。[/green]")


@click.command()
@click.option("--campaign-id", "campaign_ids", multiple=True, required=True, help="紐付け先キャンペーンID（複数可）。")
@click.option("--customer-id", default=None, help="操作対象アカウントID（未指定時は.env）。")
@click.option("--yes", is_flag=True, help="確認をスキップする。")
def main(campaign_ids: tuple[str, ...], customer_id: str | None, yes: bool) -> None:
    client = load_client()
    cid = resolve_customer_id(customer_id)

    console.print(f"除外キーワードリスト [bold]{LIST_NAME}[/bold] に {len(NEGATIVE_KEYWORDS)} 件（フレーズ一致）")
    console.print(f"紐付け先キャンペーン: {', '.join(campaign_ids)}")
    if not yes:
        click.confirm("実行しますか？", abort=True)

    shared_set = find_or_create_shared_set(client, cid)
    add_criteria(client, cid, shared_set)
    attach_to_campaigns(client, cid, shared_set, campaign_ids)


if __name__ == "__main__":
    main()
