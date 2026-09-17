"""インフル予防接種の広告グループを既存の平日・土日キャンペーンに追加する。

広告グループは PAUSED で作成し、RSA・キーワード・除外KWもまとめて設定する。
既存の内科広告グループには「予防接種」「ワクチン」を除外KWとして追加し、
予防接種系の検索をインフルグループに寄せる。

冪等: 同名の広告グループが既にある場合はスキップする。

使い方:
    PYTHONPATH=src python scripts/create_flu_vaccine_ad_group.py
    PYTHONPATH=src python scripts/create_flu_vaccine_ad_group.py --yes
"""

from __future__ import annotations

import click
from rich.console import Console
from rich.table import Table

from gads.client import load_client, mutate_with_exemption, resolve_customer_id

console = Console()

# --- 設定 ---

CAMPAIGNS = {
    "weekday": {"id": "24122528062", "name": "検索_内科_平日（月水木金）"},
    "weekend": {"id": "23956443999", "name": "検索_内科_土日"},
}

EXISTING_AD_GROUPS = {
    "weekday": "199129629796",  # 平日 広告グループ
    "weekend": "200411111929",  # 広告グループ 1 個
}

AD_GROUP_NAME = "インフル予防接種"
FINAL_URL = "https://koutoudai-yugata-naika.clinic/flu-vaccine/"

KEYWORDS = [
    "インフルエンザ 予防接種",
    "インフルエンザ ワクチン",
    "インフル 予防接種",
    "インフル ワクチン",
]

NEGATIVE_KEYWORDS = [
    # 調べもの系
    "症状",
    "潜伏期間",
    "効果 期間",
    "治療",
    # 対象年齢外（13歳以上のみ）
    "子供",
    "小児",
    "幼児",
    "赤ちゃん",
]

# 既存内科グループに追加する除外KW（予防接種の検索を新グループへ寄せる）
NAIKA_NEGATIVE_KEYWORDS = [
    "予防接種",
    "ワクチン",
]

HEADLINES = [
    "インフルエンザ予防接種 3,300円",
    "平日夜21時まで接種可",
    "土日も接種できます",
    "予約なしでも接種OK",
    "勾当台公園駅すぐ",
]

DESCRIPTIONS = [
    "インフルエンザ予防接種を実施中。平日夜21時・土日も対応。予約なしOK。",
    "13歳以上対象。高齢者定期接種（自己負担1,500円）にも対応。",
]


def _find_existing_ag(client, cid: str, campaign_id: str, name: str) -> str | None:
    """同名の広告グループが既にあれば ID を返す。"""
    svc = client.get_service("GoogleAdsService")
    rows = list(
        svc.search(
            customer_id=cid,
            query=f"""
                SELECT ad_group.id, ad_group.name
                FROM ad_group
                WHERE campaign.id = {campaign_id}
                  AND ad_group.name = '{name}'
            """,
        )
    )
    return str(rows[0].ad_group.id) if rows else None


def _create_ad_group(client, cid: str, campaign_id: str) -> str:
    """広告グループを PAUSED で作成し、ID を返す。"""
    ag_service = client.get_service("AdGroupService")
    campaign_service = client.get_service("CampaignService")
    op = client.get_type("AdGroupOperation")
    ag = op.create
    ag.name = AD_GROUP_NAME
    ag.campaign = campaign_service.campaign_path(cid, campaign_id)
    ag.type_ = client.enums.AdGroupTypeEnum.SEARCH_STANDARD
    ag.status = client.enums.AdGroupStatusEnum.PAUSED
    result = ag_service.mutate_ad_groups(customer_id=cid, operations=[op])
    return result.results[0].resource_name.split("/")[-1]


def _add_keywords(client, cid: str, ag_id: str, keywords: list[str], negative: bool) -> int:
    """キーワードをまとめて追加する。"""
    ag_service = client.get_service("AdGroupService")
    criterion_service = client.get_service("AdGroupCriterionService")
    operations = []
    for text in keywords:
        op = client.get_type("AdGroupCriterionOperation")
        criterion = op.create
        criterion.ad_group = ag_service.ad_group_path(cid, ag_id)
        criterion.keyword.text = text
        criterion.keyword.match_type = client.enums.KeywordMatchTypeEnum.PHRASE
        criterion.negative = negative
        if not negative:
            criterion.status = client.enums.AdGroupCriterionStatusEnum.ENABLED
        operations.append(op)
    criterion_service.mutate_ad_group_criteria(customer_id=cid, operations=operations)
    return len(operations)


def _create_rsa(client, cid: str, ag_id: str) -> str:
    """RSA を作成し、resource_name を返す。"""
    ag_service = client.get_service("AdGroupService")
    aga_service = client.get_service("AdGroupAdService")
    op = client.get_type("AdGroupAdOperation")
    aga = op.create
    aga.ad_group = ag_service.ad_group_path(cid, ag_id)
    aga.status = client.enums.AdGroupAdStatusEnum.ENABLED

    ad_obj = aga.ad
    ad_obj.final_urls.append(FINAL_URL)
    rsa = ad_obj.responsive_search_ad
    for text in HEADLINES:
        asset = client.get_type("AdTextAsset")
        asset.text = text
        rsa.headlines.append(asset)
    for text in DESCRIPTIONS:
        asset = client.get_type("AdTextAsset")
        asset.text = text
        rsa.descriptions.append(asset)
    rsa.path1 = "flu-vaccine"

    response, _ = mutate_with_exemption(
        aga_service.mutate_ad_group_ads, cid, op, request_exemption=True
    )
    return response.results[0].resource_name


@click.command()
@click.option("--customer-id", default=None, help="操作対象アカウントID（未指定時は.env）。")
@click.option("--yes", is_flag=True, help="確認をスキップする。")
def main(customer_id: str | None, yes: bool) -> None:
    client = load_client()
    cid = resolve_customer_id(customer_id)

    # --- プレビュー ---
    table = Table(title="インフル予防接種 広告グループ作成計画", show_lines=True)
    table.add_column("キャンペーン")
    table.add_column("操作")
    for label, camp in CAMPAIGNS.items():
        existing = _find_existing_ag(client, cid, camp["id"], AD_GROUP_NAME)
        if existing:
            table.add_row(camp["name"], f"[yellow]スキップ（既存 ag_id={existing}）[/yellow]")
        else:
            table.add_row(
                camp["name"],
                f"[green]作成[/green] PAUSED\n"
                f"  KW: {', '.join(KEYWORDS)}\n"
                f"  除外KW: {', '.join(NEGATIVE_KEYWORDS)}\n"
                f"  RSA: 見出し{len(HEADLINES)} / 説明{len(DESCRIPTIONS)}",
            )
    console.print(table)
    console.print(
        f"\n既存内科グループに除外KW追加: {', '.join(NAIKA_NEGATIVE_KEYWORDS)}"
    )

    if not yes:
        click.confirm("\n実行しますか？", abort=True)

    # --- 広告グループ作成 ---
    created_groups: dict[str, str] = {}
    for label, camp in CAMPAIGNS.items():
        existing = _find_existing_ag(client, cid, camp["id"], AD_GROUP_NAME)
        if existing:
            console.print(f"[yellow]⏭ {camp['name']}: 既存 ag_id={existing}[/yellow]")
            created_groups[label] = existing
            continue

        ag_id = _create_ad_group(client, cid, camp["id"])
        console.print(f"[green]✓ {camp['name']}: 広告グループ作成 ag_id={ag_id}[/green]")

        # キーワード追加
        n = _add_keywords(client, cid, ag_id, KEYWORDS, negative=False)
        console.print(f"  KW {n}件追加")

        # 除外KW追加
        n = _add_keywords(client, cid, ag_id, NEGATIVE_KEYWORDS, negative=True)
        console.print(f"  除外KW {n}件追加")

        # RSA作成
        rsa_rn = _create_rsa(client, cid, ag_id)
        console.print(f"  RSA作成: {rsa_rn}")

        created_groups[label] = ag_id

    # --- 既存内科グループに除外KW追加 ---
    for label, ag_id in EXISTING_AD_GROUPS.items():
        n = _add_keywords(client, cid, ag_id, NAIKA_NEGATIVE_KEYWORDS, negative=True)
        console.print(
            f"[green]✓ 既存内科グループ({label} ag_id={ag_id}): 除外KW {n}件追加[/green]"
        )

    # --- 結果サマリ ---
    console.print("\n[bold green]完了[/bold green]")
    for label, ag_id in created_groups.items():
        console.print(f"  {CAMPAIGNS[label]['name']}: ag_id={ag_id}")
    console.print(
        "\n[dim]広告グループは PAUSED で作成済み。"
        "UIで広告文を確認後、有効化してください。[/dim]"
    )


if __name__ == "__main__":
    main()
