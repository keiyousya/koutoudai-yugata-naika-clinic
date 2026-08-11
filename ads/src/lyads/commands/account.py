"""アカウント一覧。API疎通の最初の確認に使う。"""

from __future__ import annotations

import click
from rich.console import Console
from rich.table import Table

from ..client import LyAdsClient, values_of

console = Console()


@click.group()
def account() -> None:
    """アカウントの確認。"""


@account.command("list")
@click.option(
    "--product",
    type=click.Choice(["search", "display"]),
    default="search",
    help="どちらのAPIに問い合わせるか（既定: search）",
)
def list_accounts(product: str) -> None:
    """ビジネスIDが権限を持つアカウントを一覧する。

    accountId を必要としないので、認証が通っているかの疎通確認にちょうどよい。
    """
    client = LyAdsClient(product=product)
    rval = client.call(
        "BaseAccountService",
        "get",
        {
            # リクエスト側の include* は TRUE/FALSE ではなく専用の列挙値。
            # includeTestAccount は既定が EXCLUDE_TEST なので明示しないとテスト用が出ない。
            "includeMccAccount": "ALL",
            "includeTestAccount": "ALL",
            "numberResults": 100,
            "startIndex": 1,
        },
    )

    rows = [v.get("account") or {} for v in values_of(rval)]
    if not rows:
        console.print("[yellow]アカウントが見つかりませんでした。[/yellow]")
        return

    table = Table(title=f"LINEヤフー広告 アカウント一覧（{product}）")
    table.add_column("アカウントID", justify="right")
    table.add_column("アカウント名")
    table.add_column("状態")
    table.add_column("種別")
    for a in rows:
        kind = []
        if a.get("isRootMccAccount") == "TRUE":
            kind.append("ルートMCC")
        elif a.get("isMccAccount") == "TRUE":
            kind.append("MCC")
        if a.get("isTestAccount") == "TRUE":
            kind.append("テスト")
        table.add_row(
            str(a.get("accountId", "")),
            a.get("accountName", ""),
            a.get("accountStatus", ""),
            "/".join(kind) or "広告アカウント",
        )
    console.print(table)
