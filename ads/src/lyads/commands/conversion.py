"""コンバージョン測定タグの作成と取得。

LINEヤフー広告のコンバージョン測定は ConversionTrackerService で完結する。
作成すると `webConversion.advancedSnippet`（リニューアル版のタグ）がレスポンスに
入って返るので、それをそのままサイトに貼る。

  add  → コンバージョン測定を作成して、貼り付け用のタグを表示する
  list → 既存のコンバージョン測定を一覧する（計測数も見える）
  tag  → 既存のコンバージョン測定のタグを再表示する

注意: 検索広告とディスプレイ広告はアカウントが別なので、コンバージョン測定も
それぞれのアカウントに作る必要がある（タグも別物）。
"""

from __future__ import annotations

import click
from rich.console import Console
from rich.panel import Panel
from rich.syntax import Syntax
from rich.table import Table

from ..client import LyAdsClient, resolve_account_id, values_of

console = Console()

# ADD時に指定できるカテゴリ。仕様上の enum から、リクエストで指定できない
# LEAD と UNKNOWN を除いてある（LEAD は「ADDまたはSET時、指定できません」）。
CATEGORIES = [
    "DEFAULT",
    "PAGE_VIEW",
    "PURCHASE",
    "SIGNUP",
    "DOWNLOAD",
    "ADD_TO_CART",
    "BEGIN_CHECKOUT",
    "SUBSCRIBE_PAID",
    "PHONE_CALL_LEAD",
    "SUBMIT_LEAD_FORM",
    "BOOK_APPOINTMENT",
    "REQUEST_QUOTE",
    "GET_DIRECTIONS",
    "OUTBOUND_CLICK",
    "CONTACT",
    "ENGAGEMENT",
    "STORE_VISIT",
    "STORE_SALE",
    "QUALIFIED_LEAD",
    "CONVERTED_LEAD",
]

product_option = click.option(
    "--product",
    type=click.Choice(["search", "display"]),
    default="search",
    help="検索広告 / ディスプレイ広告のどちらを操作するか（既定: search）",
)
account_option = click.option(
    "--account-id",
    default=None,
    help="操作対象アカウントID（未指定なら .env の LYADS_*_ACCOUNT_ID）",
)
test_option = click.option(
    "--test",
    is_flag=True,
    help="テストアカウントを使う（配信も審査もされないので動作確認向き）",
)


@click.group()
def conversion() -> None:
    """コンバージョン測定タグの作成と取得。"""


def _fetch(client: LyAdsClient, account_id: int, tracker_ids: list[int] | None = None) -> list[dict]:
    selector: dict = {"accountId": account_id, "numberResults": 500, "startIndex": 1}
    if tracker_ids:
        selector["conversionTrackerIds"] = tracker_ids
    rval = client.call("ConversionTrackerService", "get", selector)
    return [v.get("conversionTracker") or {} for v in values_of(rval)]


def _print_snippet(tracker: dict) -> None:
    """貼り付け用のタグを表示する。"""
    name = tracker.get("conversionTrackerName", "")
    tid = tracker.get("conversionTrackerId", "")
    snippet = (tracker.get("webConversion") or {}).get("advancedSnippet")
    if not snippet:
        console.print(
            f"[yellow]{name}（ID {tid}）には advancedSnippet がありません"
            "（ウェブ以外のコンバージョン測定の可能性があります）。[/yellow]"
        )
        return
    console.print(
        Panel(
            Syntax(snippet.strip(), "html", word_wrap=True, theme="ansi_dark"),
            title=f"{name}（ID {tid}）のコンバージョン測定タグ",
            border_style="green",
        )
    )


@conversion.command("list")
@product_option
@account_option
@test_option
def list_conversions(product: str, account_id: str | None, test: bool) -> None:
    """コンバージョン測定を一覧する。"""
    aid = resolve_account_id(account_id, product, test)
    rows = _fetch(LyAdsClient(product=product), aid)
    if not rows:
        console.print("[yellow]コンバージョン測定がまだありません。[/yellow]")
        return

    table = Table(title=f"コンバージョン測定一覧（{product} / account {aid}）")
    table.add_column("ID", justify="right")
    table.add_column("名前")
    table.add_column("目的")
    table.add_column("状態")
    table.add_column("計測方法")
    table.add_column("計測期間", justify="right")
    table.add_column("CV数", justify="right")
    table.add_column("直近CV")
    for t in rows:
        counting = {"ONE_PER_CLICK": "ユニーク", "MANY_PER_CLICK": "総数"}.get(
            t.get("conversionCountingType", ""), t.get("conversionCountingType", "")
        )
        period = t.get("measurementPeriod")
        table.add_row(
            str(t.get("conversionTrackerId", "")),
            t.get("conversionTrackerName", ""),
            t.get("category", ""),
            t.get("status", ""),
            counting,
            f"{period}日" if period is not None else "",
            str(t.get("allConversions") if t.get("allConversions") is not None else "-"),
            t.get("mostRecentConversionDate") or "-",
        )
    console.print(table)
    console.print(
        "[dim]タグの中身は `lyads conversion tag --conversion-id <ID>` で表示できます。[/dim]"
    )


@conversion.command("tag")
@product_option
@account_option
@click.option("--conversion-id", type=int, default=None, help="対象のコンバージョン測定ID（未指定なら全件）")
@test_option
def show_tag(product: str, account_id: str | None, conversion_id: int | None, test: bool) -> None:
    """コンバージョン測定タグ（サイトに貼るスニペット）を表示する。"""
    aid = resolve_account_id(account_id, product, test)
    rows = _fetch(
        LyAdsClient(product=product), aid, [conversion_id] if conversion_id else None
    )
    if not rows:
        console.print("[yellow]該当するコンバージョン測定がありません。[/yellow]")
        return
    for t in rows:
        _print_snippet(t)


@conversion.command("add")
@product_option
@account_option
@click.option("--name", required=True, help="コンバージョン測定の名前（管理画面に出る）")
@click.option(
    "--category",
    type=click.Choice(CATEGORIES),
    default="CONTACT",
    help="コンバージョン測定の目的（既定: CONTACT）",
)
@click.option(
    "--counting",
    type=click.Choice(["ONE_PER_CLICK", "MANY_PER_CLICK"]),
    default="ONE_PER_CLICK",
    help="ユニーク(ONE_PER_CLICK) か 総数(MANY_PER_CLICK) か（既定: ユニーク）",
)
@click.option(
    "--period",
    type=click.IntRange(7, 90),
    default=30,
    help="コンバージョン計測期間（日、7〜90。既定: 30）",
)
@click.option(
    "--revenue",
    type=int,
    default=None,
    help="1コンバージョンあたりの売上金額（円）。レポートに売上として出る",
)
@click.option(
    "--exclude-from-bidding",
    is_flag=True,
    help="自動入札の最適化対象から外す（既定は対象に含める）",
)
@click.option("--yes", is_flag=True, help="確認プロンプトをスキップ")
@test_option
def add_conversion(
    product: str,
    account_id: str | None,
    name: str,
    category: str,
    counting: str,
    period: int,
    revenue: int | None,
    exclude_from_bidding: bool,
    yes: bool,
    test: bool,
) -> None:
    """ウェブサイト用のコンバージョン測定を作成し、貼り付け用のタグを表示する。"""
    aid = resolve_account_id(account_id, product, test)

    operand: dict = {
        "conversionTrackerName": name,
        "conversionTrackerType": "WEB_CONVERSION",
        "category": category,
        # status は ADD時に必須
        "status": "ENABLED",
        "conversionCountingType": counting,
        "measurementPeriod": period,
        "excludeFromBidding": "TRUE" if exclude_from_bidding else "FALSE",
        # conversionTrackerType が WEB_CONVERSION のとき webConversion は必須。
        # advancedSnippet はリクエストでは無視され、レスポンスに入って返る。
        "webConversion": {
            "markupLanguage": "HTML",
            "trackingCodeType": "WEBPAGE",
        },
    }
    if revenue is not None:
        # 仕様上 string
        operand["userRevenueValue"] = str(revenue)

    if not yes:
        click.confirm(
            f"{product} アカウント {aid} にコンバージョン測定「{name}」"
            f"（目的: {category} / {counting} / {period}日）を作成します。よろしいですか？",
            abort=True,
        )

    client = LyAdsClient(product=product)
    rval = client.call(
        "ConversionTrackerService", "add", {"accountId": aid, "operand": [operand]}
    )
    values = values_of(rval)
    for v in values:
        if v.get("errors"):
            raise click.ClickException(
                "作成が拒否されました: "
                + "; ".join(e.get("message", "") for e in v["errors"])
            )
    if not values:
        raise click.ClickException("作成結果が返りませんでした。")

    created = [
        (v.get("conversionTracker") or {}).get("conversionTrackerId") for v in values
    ]
    console.print(f"[green]作成しました（ID {', '.join(str(i) for i in created)}）。[/green]")

    # advancedSnippet は ADD のレスポンスには入らず、GET で取り直すと返る。
    for t in _fetch(client, aid, [i for i in created if i]):
        _print_snippet(t)
