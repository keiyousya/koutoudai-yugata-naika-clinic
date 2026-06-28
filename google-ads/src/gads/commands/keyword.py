"""キーワード管理コマンド（一覧・追加・除外）。"""

from __future__ import annotations

import click
from rich.console import Console
from rich.table import Table

from ..client import load_client, resolve_customer_id

console = Console()


@click.group()
def keyword() -> None:
    """キーワードの一覧・追加・除外を行う。"""


@keyword.command("list")
@click.option("--ad-group-id", default=None, help="絞り込む広告グループID。")
@click.option("--customer-id", default=None, help="操作対象アカウントID（未指定時は.env）。")
def list_keywords(ad_group_id: str | None, customer_id: str | None) -> None:
    """登録済みキーワードを一覧表示する。"""
    client = load_client()
    cid = resolve_customer_id(customer_id)

    where = "WHERE ad_group_criterion.type = KEYWORD"
    if ad_group_id:
        where += f" AND ad_group.id = {ad_group_id}"
    query = f"""
        SELECT
          ad_group.name,
          ad_group_criterion.criterion_id,
          ad_group_criterion.keyword.text,
          ad_group_criterion.keyword.match_type,
          ad_group_criterion.status,
          ad_group_criterion.negative
        FROM ad_group_criterion
        {where}
        ORDER BY ad_group.name
    """
    ga_service = client.get_service("GoogleAdsService")
    rows = list(ga_service.search(customer_id=cid, query=query))
    if not rows:
        console.print("[yellow]キーワードが見つかりませんでした。[/yellow]")
        return

    table = Table(show_header=True, header_style="bold cyan")
    for h in ("広告グループ", "ID", "キーワード", "マッチ", "状態", "除外"):
        table.add_column(h)
    for r in rows:
        c = r.ad_group_criterion
        table.add_row(
            r.ad_group.name,
            str(c.criterion_id),
            c.keyword.text,
            c.keyword.match_type.name,
            c.status.name,
            "✓" if c.negative else "",
        )
    console.print(table)


@keyword.command("add")
@click.option("--ad-group-id", required=True, help="追加先の広告グループID。")
@click.option("--text", required=True, help="キーワード文字列。")
@click.option(
    "--match",
    type=click.Choice(["EXACT", "PHRASE", "BROAD"]),
    default="PHRASE",
    show_default=True,
    help="マッチタイプ。",
)
@click.option("--negative", is_flag=True, help="除外キーワードとして追加する。")
@click.option("--customer-id", default=None, help="操作対象アカウントID（未指定時は.env）。")
def add_keyword(
    ad_group_id: str,
    text: str,
    match: str,
    negative: bool,
    customer_id: str | None,
) -> None:
    """キーワード（または除外キーワード）を追加する。"""
    client = load_client()
    cid = resolve_customer_id(customer_id)

    ag_service = client.get_service("AdGroupService")
    criterion_service = client.get_service("AdGroupCriterionService")
    operation = client.get_type("AdGroupCriterionOperation")
    criterion = operation.create
    criterion.ad_group = ag_service.ad_group_path(cid, ad_group_id)
    criterion.keyword.text = text
    criterion.keyword.match_type = client.enums.KeywordMatchTypeEnum[match]
    criterion.negative = negative
    if not negative:
        criterion.status = client.enums.AdGroupCriterionStatusEnum.ENABLED

    response = criterion_service.mutate_ad_group_criteria(
        customer_id=cid, operations=[operation]
    )
    kind = "除外キーワード" if negative else "キーワード"
    console.print(
        f"[green]✓ {kind}「{text}」({match}) を追加しました。[/green]\n"
        f"[dim]{response.results[0].resource_name}[/dim]"
    )


@keyword.command("remove")
@click.option("--ad-group-id", required=True, help="対象の広告グループID。")
@click.option("--criterion-id", required=True, help="削除するキーワードのcriterion_id。")
@click.option("--customer-id", default=None, help="操作対象アカウントID（未指定時は.env）。")
@click.option("--yes", is_flag=True, help="確認をスキップする。")
def remove_keyword(
    ad_group_id: str, criterion_id: str, customer_id: str | None, yes: bool
) -> None:
    """キーワードを削除する。"""
    client = load_client()
    cid = resolve_customer_id(customer_id)

    if not yes:
        click.confirm(f"キーワード {criterion_id} を削除しますか？", abort=True)

    criterion_service = client.get_service("AdGroupCriterionService")
    operation = client.get_type("AdGroupCriterionOperation")
    operation.remove = criterion_service.ad_group_criterion_path(
        cid, ad_group_id, criterion_id
    )
    criterion_service.mutate_ad_group_criteria(customer_id=cid, operations=[operation])
    console.print("[green]✓ キーワードを削除しました。[/green]")
