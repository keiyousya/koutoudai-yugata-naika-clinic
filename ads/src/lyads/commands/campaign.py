"""キャンペーンの一覧・予算変更・ON/OFF・終了日設定。

gads と操作感を揃えてある（gads campaign / gads budget 相当）。
"""

from __future__ import annotations

import click
from rich.console import Console
from rich.table import Table

from ..client import LyAdsClient, resolve_account_id, values_of

console = Console()

# endDate を「終了日なし」に戻すときの番兵。ADD時のデフォルト値と同じ。
NO_END_DATE = "20371231"

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
def campaign() -> None:
    """キャンペーンの確認と変更。"""


def _fetch(client: LyAdsClient, account_id: int, campaign_ids: list[int] | None = None) -> list[dict]:
    selector: dict = {"accountId": account_id, "numberResults": 500, "startIndex": 1}
    if campaign_ids:
        selector["campaignIds"] = campaign_ids
    rval = client.call("CampaignService", "get", selector)
    return [v.get("campaign") or {} for v in values_of(rval)]


@campaign.command("list")
@product_option
@account_option
@test_option
def list_campaigns(product: str, account_id: str | None, test: bool) -> None:
    """キャンペーンを一覧する。"""
    aid = resolve_account_id(account_id, product, test)
    rows = _fetch(LyAdsClient(product=product), aid)
    if not rows:
        console.print("[yellow]キャンペーンがありません。[/yellow]")
        return

    table = Table(title=f"キャンペーン一覧（{product} / account {aid}）")
    table.add_column("キャンペーンID", justify="right")
    table.add_column("キャンペーン名")
    table.add_column("状態")
    table.add_column("配信状況")
    table.add_column("日予算", justify="right")
    table.add_column("終了日")
    for c in rows:
        budget = (c.get("budget") or {}).get("amount")
        end = c.get("endDate") or ""
        table.add_row(
            str(c.get("campaignId", "")),
            c.get("campaignName", ""),
            c.get("userStatus", ""),
            c.get("servingStatus", ""),
            f"{budget:,}円" if budget is not None else "共有予算",
            "—" if end == NO_END_DATE else end,
        )
    console.print(table)


def _set(client: LyAdsClient, account_id: int, operand: dict, summary: str, yes: bool) -> None:
    """CampaignService/set を確認プロンプト付きで実行する。"""
    if not yes:
        click.confirm(summary, abort=True)
    rval = client.call(
        "CampaignService",
        "set",
        {"accountId": account_id, "operand": [operand]},
    )
    values = values_of(rval)
    # 部分成功があり得るので、値ごとのエラーも拾う
    for v in values:
        if v.get("errors"):
            raise click.ClickException(
                "変更が拒否されました: "
                + "; ".join(e.get("message", "") for e in v["errors"])
            )
    console.print("[green]変更しました。[/green]")


@campaign.command("budget")
@product_option
@account_option
@click.option("--campaign-id", required=True, type=int, help="対象キャンペーンID")
@click.option("--amount", required=True, type=int, help="日予算（円）")
@click.option("--yes", is_flag=True, help="確認プロンプトをスキップ")
@test_option
def set_budget(
    product: str, account_id: str | None, campaign_id: int, amount: int, yes: bool, test: bool
) -> None:
    """日予算を変更する。

    Google 広告と違い micros ではなく円をそのまま渡す。
    """
    aid = resolve_account_id(account_id, product, test)
    _set(
        LyAdsClient(product=product),
        aid,
        {"campaignId": campaign_id, "budget": {"amount": amount}},
        f"キャンペーン {campaign_id} の日予算を {amount:,}円 に変更します。よろしいですか？",
        yes,
    )


@campaign.command("status")
@product_option
@account_option
@click.option("--campaign-id", required=True, type=int, help="対象キャンペーンID")
@click.option("--state", required=True, type=click.Choice(["ACTIVE", "PAUSED"]), help="配信状態")
@click.option("--yes", is_flag=True, help="確認プロンプトをスキップ")
@test_option
def set_status(
    product: str, account_id: str | None, campaign_id: int, state: str, yes: bool, test: bool
) -> None:
    """キャンペーンを停止 / 再開する。"""
    aid = resolve_account_id(account_id, product, test)
    _set(
        LyAdsClient(product=product),
        aid,
        {"campaignId": campaign_id, "userStatus": state},
        f"キャンペーン {campaign_id} を {state} にします。よろしいですか？",
        yes,
    )


@campaign.command("end-date")
@product_option
@account_option
@click.option("--campaign-id", required=True, type=int, help="対象キャンペーンID")
@click.option("--date", "date_", default=None, help="配信終了日（YYYY-MM-DD または YYYYMMDD）")
@click.option("--clear", is_flag=True, help="終了日を解除して配信を再開する")
@click.option("--yes", is_flag=True, help="確認プロンプトをスキップ")
@test_option
def set_end_date(
    product: str,
    account_id: str | None,
    campaign_id: int,
    date_: str | None,
    clear: bool,
    yes: bool,
    test: bool,
) -> None:
    """休診期間に合わせて配信終了日を入れる / 外す。

    終了日の翌日から自動で配信が止まるので、休診当日の操作が要らなくなる。
    解除は終了日を 20371231（＝終了日なしの既定値）に戻すことで行う。
    """
    if clear == bool(date_):
        raise click.ClickException("--date か --clear のどちらか一方を指定してください。")

    aid = resolve_account_id(account_id, product, test)
    value = NO_END_DATE if clear else date_.replace("-", "")
    if len(value) != 8 or not value.isdigit():
        raise click.ClickException(f"日付は YYYY-MM-DD 形式で指定してください: {date_}")

    summary = (
        f"キャンペーン {campaign_id} の終了日を解除して配信を再開します。よろしいですか？"
        if clear
        else f"キャンペーン {campaign_id} を {value} で配信終了にします。よろしいですか？"
    )
    _set(LyAdsClient(product=product), aid, {"campaignId": campaign_id, "endDate": value}, summary, yes)


@campaign.command("geo-target")
@product_option
@account_option
@click.option("--campaign-id", required=True, type=int, help="対象キャンペーンID")
@click.option(
    "--positive",
    required=True,
    type=click.Choice(["LOCATION_OF_PRESENCE", "DONT_CARE"]),
    help="配信対象地域の解釈。LOCATION_OF_PRESENCE=所在地のみ / DONT_CARE=所在地または関心のある地域",
)
@click.option("--yes", is_flag=True, help="確認プロンプトをスキップ")
@test_option
def set_geo_target(
    product: str,
    account_id: str | None,
    campaign_id: int,
    positive: str,
    yes: bool,
    test: bool,
) -> None:
    """地域ターゲティングを「所在地のみ」に絞る / 「関心のある地域」も含める。

    既定の DONT_CARE は圏外の利用者にも配信されうる。半径指定をしていても
    圏外の地名を含む検索に出てしまうのはこの設定が理由。
    """
    aid = resolve_account_id(account_id, product, test)
    label = "所在地のみ" if positive == "LOCATION_OF_PRESENCE" else "所在地または関心のある地域"
    _set(
        LyAdsClient(product=product),
        aid,
        {
            "campaignId": campaign_id,
            "settings": [
                {
                    "settingType": "GEO_TARGET_TYPE_SETTING",
                    "geoTargetTypeSetting": {
                        "positiveGeoTargetType": positive,
                        "negativeGeoTargetType": "LOCATION_OF_PRESENCE",
                    },
                }
            ],
        },
        f"キャンペーン {campaign_id} の地域ターゲティングを「{label}」にします。よろしいですか？",
        yes,
    )
