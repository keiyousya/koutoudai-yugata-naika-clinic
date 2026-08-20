"""キーワードの一覧と、キャンペーン単位の除外キーワード管理。

除外キーワードは `CampaignCriterionService` に `use: "NEGATIVE"` の criterion として
登録する。広告グループ単位の除外もあるが、他科・競合指名・調べもの系はキャンペーン
全体で弾きたいので、こちらはキャンペーン単位に寄せている。

`AdGroupCriterionService/get` は `use` が必須（省略すると
「Invalid Request. (use=must not be null)」で弾かれる）。
"""

from __future__ import annotations

import click
from rich.console import Console
from rich.table import Table

from ..client import LyAdsClient, resolve_account_id, values_of

console = Console()

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
def keyword() -> None:
    """キーワードの一覧と除外キーワードの管理。"""


def _get_negatives(
    client: LyAdsClient, account_id: int, campaign_id: int | None
) -> list[dict]:
    selector: dict = {"accountId": account_id, "numberResults": 500, "startIndex": 1}
    if campaign_id:
        selector["campaignIds"] = [campaign_id]
    rval = client.call("CampaignCriterionService", "get", selector)
    rows = [v.get("campaignCriterion") or {} for v in values_of(rval)]
    return [r for r in rows if r.get("use") == "NEGATIVE"]


@keyword.command("list")
@product_option
@account_option
@click.option("--campaign-id", default=None, type=int, help="絞り込むキャンペーンID")
@click.option("--ad-group-id", default=None, type=int, help="絞り込む広告グループID")
@click.option("--negative", is_flag=True, help="キャンペーンの除外キーワードを表示する")
@test_option
def list_keywords(
    product: str,
    account_id: str | None,
    campaign_id: int | None,
    ad_group_id: int | None,
    negative: bool,
    test: bool,
) -> None:
    """配信キーワード、または除外キーワードを一覧する。"""
    aid = resolve_account_id(account_id, product, test)
    client = LyAdsClient(product=product)

    if negative:
        rows = _get_negatives(client, aid, campaign_id)
        if not rows:
            console.print("[yellow]除外キーワードがありません。[/yellow]")
            return
        table = Table(title=f"除外キーワード（{product} / account {aid}）")
        table.add_column("criterionId", justify="right")
        table.add_column("キャンペーン")
        table.add_column("キーワード")
        table.add_column("マッチ")
        for r in rows:
            c = r.get("criterion") or {}
            kw = c.get("keyword") or {}
            table.add_row(
                str(c.get("criterionId", "")),
                r.get("campaignName", ""),
                kw.get("text", ""),
                kw.get("keywordMatchType", ""),
            )
        console.print(table)
        return

    selector: dict = {
        "accountId": aid,
        "numberResults": 500,
        "startIndex": 1,
        # get では use が必須。省略すると Invalid Request で弾かれる
        "use": "BIDDABLE",
    }
    if campaign_id:
        selector["campaignIds"] = [campaign_id]
    if ad_group_id:
        selector["adGroupIds"] = [ad_group_id]
    rval = client.call("AdGroupCriterionService", "get", selector)
    rows = [v.get("adGroupCriterion") or {} for v in values_of(rval)]
    if not rows:
        console.print("[yellow]キーワードがありません。[/yellow]")
        return

    table = Table(title=f"キーワード一覧（{product} / account {aid}）")
    table.add_column("criterionId", justify="right")
    table.add_column("広告グループ")
    table.add_column("キーワード")
    table.add_column("マッチ")
    table.add_column("状態")
    for r in rows:
        c = r.get("criterion") or {}
        kw = c.get("keyword") or {}
        table.add_row(
            str(c.get("criterionId", "")),
            r.get("adGroupName", ""),
            kw.get("text", ""),
            kw.get("keywordMatchType", ""),
            r.get("userStatus", ""),
        )
    console.print(table)


@keyword.command("add-negative")
@product_option
@account_option
@click.option("--campaign-id", required=True, type=int, help="対象キャンペーンID")
@click.option(
    "--text",
    "texts",
    required=True,
    multiple=True,
    help="除外キーワード（複数指定可）",
)
@click.option(
    "--match",
    type=click.Choice(["EXACT", "PHRASE"]),
    default="PHRASE",
    show_default=True,
    help="マッチタイプ",
)
@click.option("--yes", is_flag=True, help="確認プロンプトをスキップ")
@test_option
def add_negative(
    product: str,
    account_id: str | None,
    campaign_id: int,
    texts: tuple[str, ...],
    match: str,
    yes: bool,
    test: bool,
) -> None:
    """キャンペーン単位の除外キーワードを追加する。"""
    aid = resolve_account_id(account_id, product, test)
    if not yes:
        click.confirm(
            f"キャンペーン {campaign_id} に除外キーワードを{len(texts)}件"
            f"（{match}）追加します。よろしいですか？",
            abort=True,
        )

    operand = [
        {
            "accountId": aid,
            "campaignId": campaign_id,
            "criterion": {
                "criterionType": "KEYWORD",
                "keyword": {"text": t, "keywordMatchType": match},
            },
            "use": "NEGATIVE",
        }
        for t in texts
    ]
    rval = LyAdsClient(product=product).call(
        "CampaignCriterionService", "add", {"accountId": aid, "operand": operand}
    )

    added, failed = 0, []
    for v in values_of(rval):
        if v.get("errors"):
            failed.append("; ".join(e.get("message", "") for e in v["errors"]))
        else:
            added += 1
    console.print(f"[green]✓ 除外キーワードを{added}件追加しました。[/green]")
    for message in failed:
        console.print(f"[yellow]スキップ: {message}[/yellow]")


@keyword.command("remove-negative")
@product_option
@account_option
@click.option("--campaign-id", required=True, type=int, help="対象キャンペーンID")
@click.option(
    "--criterion-id",
    "criterion_ids",
    required=True,
    multiple=True,
    type=int,
    help="削除する除外キーワードの criterionId（複数指定可）",
)
@click.option("--yes", is_flag=True, help="確認プロンプトをスキップ")
@test_option
def remove_negative(
    product: str,
    account_id: str | None,
    campaign_id: int,
    criterion_ids: tuple[int, ...],
    yes: bool,
    test: bool,
) -> None:
    """キャンペーン単位の除外キーワードを削除する。"""
    aid = resolve_account_id(account_id, product, test)
    if not yes:
        click.confirm(
            f"除外キーワードを{len(criterion_ids)}件削除します。よろしいですか？", abort=True
        )

    operand = [
        {"accountId": aid, "campaignId": campaign_id, "criterion": {"criterionId": cid}}
        for cid in criterion_ids
    ]
    LyAdsClient(product=product).call(
        "CampaignCriterionService", "remove", {"accountId": aid, "operand": operand}
    )
    console.print(f"[green]✓ 除外キーワードを{len(criterion_ids)}件削除しました。[/green]")


@keyword.command("match")
@product_option
@account_option
@click.option("--ad-group-id", required=True, type=int, help="対象広告グループID")
@click.option(
    "--criterion-id",
    "criterion_ids",
    required=True,
    multiple=True,
    type=int,
    help="変更するキーワードの criterionId（複数指定可）",
)
@click.option(
    "--to",
    "match",
    required=True,
    type=click.Choice(["EXACT", "PHRASE", "BROAD"]),
    help="変更後のマッチタイプ",
)
@click.option("--yes", is_flag=True, help="確認プロンプトをスキップ")
@test_option
def set_match(
    product: str,
    account_id: str | None,
    ad_group_id: int,
    criterion_ids: tuple[int, ...],
    match: str,
    yes: bool,
    test: bool,
) -> None:
    """配信キーワードのマッチタイプを変更する。

    ⚠️ 2026-08-20 時点で **このコマンドは通らない**。AdGroupCriterionService/set は
    keywordMatchType の変更を受け付けず、`[0001] Require.` を返す（criterion に text を
    足しても、biddableAdGroupCriterion を足しても同じ）。Google 広告と同様に
    マッチタイプは不変とみなすのが妥当で、変えるなら remove → add で入れ直すしかない。
    その場合 criterionId が変わり、キーワードの実績も引き継がれない。

    仕様が変わったとき用に呼び出し自体は残してある。
    """
    aid = resolve_account_id(account_id, product, test)
    if not yes:
        click.confirm(
            f"{len(criterion_ids)}件のキーワードを {match} に変更します。よろしいですか？",
            abort=True,
        )

    client = LyAdsClient(product=product)

    # set は keyword.text も必須（text を省くと "Require." で拒否される）ので、
    # 現在のテキストを引いてから送る。
    rval = client.call(
        "AdGroupCriterionService",
        "get",
        {
            "accountId": aid,
            "adGroupIds": [ad_group_id],
            "use": "BIDDABLE",
            "numberResults": 500,
            "startIndex": 1,
        },
    )
    texts: dict[int, str] = {}
    for v in values_of(rval):
        c = (v.get("adGroupCriterion") or {}).get("criterion") or {}
        if c.get("criterionId") is not None:
            texts[int(c["criterionId"])] = (c.get("keyword") or {}).get("text", "")

    missing = [cid for cid in criterion_ids if cid not in texts]
    if missing:
        raise click.ClickException(
            "広告グループ内に見つからない criterionId があります: "
            + ", ".join(str(m) for m in missing)
        )

    operand = [
        {
            "accountId": aid,
            "adGroupId": ad_group_id,
            "criterion": {
                "criterionId": cid,
                "criterionType": "KEYWORD",
                "keyword": {"text": texts[cid], "keywordMatchType": match},
            },
            "use": "BIDDABLE",
            "biddableAdGroupCriterion": {"userStatus": "ACTIVE"},
        }
        for cid in criterion_ids
    ]
    rval = client.call(
        "AdGroupCriterionService", "set", {"accountId": aid, "operand": operand}
    )

    changed, failed = 0, []
    for v in values_of(rval):
        if v.get("errors"):
            failed.append("; ".join(e.get("message", "") for e in v["errors"]))
        else:
            changed += 1
    console.print(f"[green]✓ {changed}件を {match} に変更しました。[/green]")
    for message in failed:
        console.print(f"[yellow]失敗: {message}[/yellow]")
