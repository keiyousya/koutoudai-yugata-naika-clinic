"""インフル予防接種の広告グループに、高齢者定期接種（65歳以上1,500円）の訴求を追加する。

やること:
1. 既存RSAの見出しに定期接種の訴求を追加（既にある見出しは維持）
2. 定期接種を探している人向けのキーワードを追加（フレーズ一致）

`create_flu_vaccine_ad_group.py` の続き。除外KWに「無料 / 助成 / 高齢者」を入れていないので、
このグループで定期接種の検索を受けられる。

冪等: 既に入っている見出し・キーワードはスキップする。

使い方:
    PYTHONPATH=src python scripts/add_flu_teiki_assets.py
    PYTHONPATH=src python scripts/add_flu_teiki_assets.py --yes
"""

from __future__ import annotations

import click
from google.protobuf import field_mask_pb2
from rich.console import Console

from gads.client import load_client, mutate_with_exemption, resolve_customer_id

console = Console()

# create_flu_vaccine_ad_group.py で作成した広告グループ
AD_GROUP_IDS = {
    "weekday": "202754209360",  # 検索_内科_平日（月水木金）
    "weekend": "198980235334",  # 検索_内科_土日
}

# 追加する見出し（30文字以内）
ADD_HEADLINES = [
    "65歳以上は1,500円",
    "仙台市の助成対象です",
]

# 追加するキーワード（フレーズ一致。地域は半径6kmで絞っているので地名は付けない）
ADD_KEYWORDS = [
    "高齢者 インフルエンザ 予防接種",
    "インフルエンザ 予防接種 助成",
]


def _fetch_rsa(client, cid: str, ad_group_id: str):
    """広告グループのRSAを1件返す（resource_name と現在の見出し）。"""
    svc = client.get_service("GoogleAdsService")
    rows = list(
        svc.search(
            customer_id=cid,
            query=f"""
                SELECT ad_group_ad.ad.resource_name,
                       ad_group_ad.ad.responsive_search_ad.headlines
                FROM ad_group_ad
                WHERE ad_group.id = {ad_group_id}
                  AND ad_group_ad.status != 'REMOVED'
                  AND ad_group_ad.ad.type = 'RESPONSIVE_SEARCH_AD'
            """,
        )
    )
    if not rows:
        return None, []
    ad = rows[0].ad_group_ad.ad
    return ad.resource_name, list(ad.responsive_search_ad.headlines)


def _existing_keywords(client, cid: str, ad_group_id: str) -> set[str]:
    svc = client.get_service("GoogleAdsService")
    rows = svc.search(
        customer_id=cid,
        query=f"""
            SELECT ad_group_criterion.keyword.text
            FROM ad_group_criterion
            WHERE ad_group.id = {ad_group_id}
              AND ad_group_criterion.type = 'KEYWORD'
              AND ad_group_criterion.negative = FALSE
              AND ad_group_criterion.status != 'REMOVED'
        """,
    )
    return {r.ad_group_criterion.keyword.text for r in rows}


def _update_headlines(client, cid: str, resource_name: str, current) -> int:
    """RSAの見出しに ADD_HEADLINES を追加する。追加した件数を返す。"""
    have = {h.text for h in current}
    todo = [t for t in ADD_HEADLINES if t not in have]
    if not todo:
        return 0

    ad_service = client.get_service("AdService")
    op = client.get_type("AdOperation")
    ad = op.update
    ad.resource_name = resource_name
    for h in current:
        ad.responsive_search_ad.headlines.append(h)
    for text in todo:
        asset = client.get_type("AdTextAsset")
        asset.text = text
        ad.responsive_search_ad.headlines.append(asset)
    op.update_mask.CopyFrom(
        field_mask_pb2.FieldMask(paths=["responsive_search_ad.headlines"])
    )
    mutate_with_exemption(
        ad_service.mutate_ads, cid, op, request_exemption=False
    )
    return len(todo)


def _add_keywords(client, cid: str, ad_group_id: str, have: set[str]) -> int:
    todo = [t for t in ADD_KEYWORDS if t not in have]
    if not todo:
        return 0

    svc = client.get_service("AdGroupCriterionService")
    ag_service = client.get_service("AdGroupService")
    ops = []
    for text in todo:
        op = client.get_type("AdGroupCriterionOperation")
        c = op.create
        c.ad_group = ag_service.ad_group_path(cid, ad_group_id)
        c.status = client.enums.AdGroupCriterionStatusEnum.ENABLED
        c.keyword.text = text
        c.keyword.match_type = client.enums.KeywordMatchTypeEnum.PHRASE
        ops.append(op)
    svc.mutate_ad_group_criteria(customer_id=cid, operations=ops)
    return len(todo)


@click.command()
@click.option("--customer-id", default=None, help="操作対象アカウントID")
@click.option("--yes", is_flag=True, help="確認プロンプトをスキップ")
def main(customer_id: str | None, yes: bool) -> None:
    # load_client() が .env を読み込むので、先に呼ぶ
    client = load_client()
    cid = resolve_customer_id(customer_id)

    console.print("[bold]追加する見出し[/bold]")
    for t in ADD_HEADLINES:
        console.print(f"  ・{t}")
    console.print("[bold]追加するキーワード（フレーズ一致）[/bold]")
    for t in ADD_KEYWORDS:
        console.print(f"  ・{t}")

    if not yes and not click.confirm("\n上記を2つの広告グループに追加しますか？"):
        console.print("[yellow]中止しました[/yellow]")
        return

    for label, ag_id in AD_GROUP_IDS.items():
        resource_name, headlines = _fetch_rsa(client, cid, ag_id)
        if resource_name is None:
            console.print(f"[red]{label}: RSAが見つかりません（ag={ag_id}）[/red]")
            continue
        n_head = _update_headlines(client, cid, resource_name, headlines)
        n_kw = _add_keywords(client, cid, ag_id, _existing_keywords(client, cid, ag_id))
        console.print(f"[green]{label}[/green] ag={ag_id} 見出し+{n_head} キーワード+{n_kw}")

    console.print(
        "\n[dim]見出しは審査に数時間かかる場合がある。"
        "反映後は search_term_view で助成系クエリの拾い方を確認する。[/dim]"
    )


if __name__ == "__main__":
    main()
