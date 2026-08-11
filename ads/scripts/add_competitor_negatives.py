"""競合医療機関名の除外キーワードリストを作成し、指定キャンペーンに紐付ける。

広告グループ単位で除外を積むと、キャンペーンが増えるたびに同じ作業が必要になる。
共有の除外キーワードリスト（SharedSet）にまとめておけば、以後は紐付けるだけで済む。
Google 広告のUI（ツール > 除外キーワードリスト）からも編集できる。

すでに同名のリストがある場合は再利用し、未登録の語だけを追加する（冪等）。

使い方:
    python scripts/add_competitor_negatives.py --campaign-id 23956443999 --campaign-id 24122528062
"""

from __future__ import annotations

import click
from rich.console import Console

from gads.client import load_client, resolve_customer_id

console = Console()

LIST_NAME = "競合医療機関名"

# 直近30日の検索語句から抽出した、固有名詞を含む他院・他施設名。
# 一般的な診療科名（呼吸器内科・消化器内科など）は意図的に含めない。
# 自院に近い地名（一番町・国分町）は単独では使わず、施設名として成立する形にしている。
COMPETITOR_NAMES = [
    "あやし内科",
    "あらまち内科",
    "おおしお内科",
    "おおひら内科",
    "かとう内科",
    "クレアクリニック",
    "じえいこー",
    "シリウス",
    "たかはし内科",
    "たんぽぽクリニック",
    "なかやま医院",
    "ひむろ",
    "はじめの内科",
    "ファミリークリニック",
    "五十嵐内科",
    "五橋",
    "佐藤医院",
    "佐藤病院",
    "南光台",
    "卸町",
    "国分町病院",
    "宮城中央",
    "宮崎クリニック",
    "富谷",
    "小野よしあき",
    "岡部クリニック",
    "広瀬病院",
    "日赤",
    "柏木クリニック",
    "桜ヶ丘",
    "桜井内科",
    "青空クリニック",
    "青葉なかやま",
    "青葉通り一番町内科",
    "高柳内科",
    "鈎取",
    "長命ヶ丘",
    "長町",
    "仙台一番町健診",
    "仙台内視鏡",
    "仙台消化器内視鏡",
    "薬科大",
    "ゆうこ内科",
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
    todo = [n for n in COMPETITOR_NAMES if n not in existing]
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

    console.print(f"除外キーワードリスト [bold]{LIST_NAME}[/bold] に {len(COMPETITOR_NAMES)} 件（フレーズ一致）")
    console.print(f"紐付け先キャンペーン: {', '.join(campaign_ids)}")
    if not yes:
        click.confirm("実行しますか？", abort=True)

    shared_set = find_or_create_shared_set(client, cid)
    add_criteria(client, cid, shared_set)
    attach_to_campaigns(client, cid, shared_set, campaign_ids)


if __name__ == "__main__":
    main()
