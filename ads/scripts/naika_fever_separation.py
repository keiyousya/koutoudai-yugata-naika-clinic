"""内科キャンペーン（平日・土日）を「一般外来専用」に切り替える / 元に戻す。

インフル流行期に発熱外来と一般外来をがっちり分ける運用（2026-09-23〜）用。
発熱外来の時間帯（平日19〜21時・土日17〜21時）には広告を出さず、一般外来の時間帯だけ
発熱訴求を外した広告を絞って出す。

    apply   : 変更前の状態をスナップショットに保存してから切り替える
    restore : スナップショットから元の状態（発熱も含めた運用）に戻す

apply でやること（キャンペーンの ON/OFF は触らない）:
  - 配信時間を一般外来の終了（平日19時・土日17時）で打ち切る（それより前の傾斜は維持）
  - 日予算・上限CPCを下げる
  - 発熱系キーワード（発熱/コロナ/インフル を含む）を PAUSED
  - 内科広告グループに発熱系の除外KWを追加
  - 発熱訴求の RSA を PAUSED にし、一般内科向け RSA を新規作成
  - キャンペーン内のインフル予防接種グループを PAUSED（専用キャンペーンへ移管）

削除はせず停止にとどめるので、restore で完全に戻せる。

使い方:
    PYTHONPATH=src .venv/bin/python scripts/naika_fever_separation.py apply
    PYTHONPATH=src .venv/bin/python scripts/naika_fever_separation.py restore
"""

from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

import click
from google.protobuf import field_mask_pb2
from rich.console import Console

from gads.client import load_client, mutate_with_exemption, resolve_customer_id

console = Console()

SNAPSHOT = Path(__file__).resolve().parents[1] / "docs/snapshots/naika-before-fever-separation.json"

CAMPAIGNS = {
    "24122528062": {  # 検索_内科_平日（月水木金）
        "naika_ad_group": "199129629796",
        "flu_ad_group": "202754209360",
        "cutoff_hour": 19,
    },
    "23956443999": {  # 検索_内科_土日
        "naika_ad_group": "200411111929",
        "flu_ad_group": "198980235334",
        "cutoff_hour": 17,
    },
}

NEW_BUDGET_YEN = 1000
NEW_CPC_CEILING_YEN = 70

FEVER_KEYWORD_MARKERS = ["発熱", "コロナ", "インフル"]
FEVER_NEGATIVES = ["発熱", "熱", "コロナ", "インフル", "インフルエンザ", "風邪", "咳"]

FINAL_URL = "https://koutoudai-yugata-naika.clinic/"
HEADLINES = [
    "仙台市青葉区の内科クリニック",
    "勾当台公園駅から徒歩2分",
    "平日17時から診療",
    "土日は14時から診療",
    "会社帰りに寄れる内科",
    "健康診断の再検査もOK",
    "高血圧・糖尿病のご相談",
    "生活習慣病の継続治療",
    "コレステロールが高い方へ",
    "LINEで30秒かんたん予約",
    "一般内科は平日17〜19時",
    "土日の一般内科は14〜17時",
]
DESCRIPTIONS = [
    "仙台市青葉区の内科クリニック。一般内科は平日17〜19時、土日14〜17時です。",
    "健康診断の再検査、高血圧・糖尿病など生活習慣病のご相談・継続治療に対応しています。",
    "当院へのご来院は便利なLINE予約がおすすめです。公式アカウントのトークから30秒で完了。",
    "発熱・風邪症状の方は発熱外来の時間帯（平日19〜21時・土日17〜21時）にお越しください。",
]

MINUTE = {"ZERO": 0, "FIFTEEN": 15, "THIRTY": 30, "FORTY_FIVE": 45}
MINUTE_ENUM = {0: "ZERO", 15: "FIFTEEN", 30: "THIRTY", 45: "FORTY_FIVE"}


def _search(client, cid: str, query: str):
    return list(client.get_service("GoogleAdsService").search(customer_id=cid, query=query))


def _take_snapshot(client, cid: str) -> dict:
    snap: dict = {"taken_at": datetime.now().isoformat(timespec="seconds"), "campaigns": {}}
    for camp_id, conf in CAMPAIGNS.items():
        row = _search(
            client,
            cid,
            f"""SELECT campaign.name, campaign.status, campaign.campaign_budget,
                       campaign.target_spend.cpc_bid_ceiling_micros, campaign_budget.amount_micros
                FROM campaign WHERE campaign.id = {camp_id}""",
        )[0]
        schedule = [
            {
                "day": r.campaign_criterion.ad_schedule.day_of_week.name,
                "start": [r.campaign_criterion.ad_schedule.start_hour,
                          MINUTE[r.campaign_criterion.ad_schedule.start_minute.name]],
                "end": [r.campaign_criterion.ad_schedule.end_hour,
                        MINUTE[r.campaign_criterion.ad_schedule.end_minute.name]],
                "modifier": round(r.campaign_criterion.bid_modifier or 1.0, 4),
            }
            for r in _search(
                client,
                cid,
                f"""SELECT campaign.status, campaign_criterion.ad_schedule.day_of_week,
                           campaign_criterion.ad_schedule.start_hour, campaign_criterion.ad_schedule.start_minute,
                           campaign_criterion.ad_schedule.end_hour, campaign_criterion.ad_schedule.end_minute,
                           campaign_criterion.bid_modifier
                    FROM campaign_criterion
                    WHERE campaign.id = {camp_id} AND campaign_criterion.type = 'AD_SCHEDULE'""",
            )
        ]
        ag_ids = f"({conf['naika_ad_group']}, {conf['flu_ad_group']})"
        ad_groups = {
            str(r.ad_group.id): r.ad_group.status.name
            for r in _search(
                client, cid,
                f"SELECT ad_group.id, ad_group.status FROM ad_group WHERE ad_group.id IN {ag_ids}",
            )
        }
        keywords = {
            r.ad_group_criterion.resource_name: {
                "text": r.ad_group_criterion.keyword.text,
                "status": r.ad_group_criterion.status.name,
            }
            for r in _search(
                client,
                cid,
                f"""SELECT ad_group_criterion.resource_name, ad_group_criterion.keyword.text,
                           ad_group_criterion.status
                    FROM ad_group_criterion
                    WHERE ad_group.id = {conf['naika_ad_group']}
                      AND ad_group_criterion.type = 'KEYWORD'
                      AND ad_group_criterion.negative = FALSE
                      AND ad_group_criterion.status != 'REMOVED'""",
            )
        }
        ads = {
            r.ad_group_ad.resource_name: r.ad_group_ad.status.name
            for r in _search(
                client,
                cid,
                f"""SELECT ad_group_ad.resource_name, ad_group_ad.status FROM ad_group_ad
                    WHERE ad_group.id = {conf['naika_ad_group']} AND ad_group_ad.status != 'REMOVED'""",
            )
        }
        snap["campaigns"][camp_id] = {
            "name": row.campaign.name,
            "budget_resource": row.campaign.campaign_budget,
            "budget_micros": row.campaign_budget.amount_micros,
            "cpc_ceiling_micros": row.campaign.target_spend.cpc_bid_ceiling_micros,
            "schedule": schedule,
            "ad_groups": ad_groups,
            "keywords": keywords,
            "ads": ads,
        }
    return snap


# --- mutate helpers ---

def _set_budget(client, cid: str, budget_rn: str, micros: int) -> None:
    op = client.get_type("CampaignBudgetOperation")
    op.update.resource_name = budget_rn
    op.update.amount_micros = micros
    op.update_mask.CopyFrom(field_mask_pb2.FieldMask(paths=["amount_micros"]))
    client.get_service("CampaignBudgetService").mutate_campaign_budgets(customer_id=cid, operations=[op])


def _set_cpc_ceiling(client, cid: str, camp_id: str, micros: int) -> None:
    op = client.get_type("CampaignOperation")
    op.update.resource_name = client.get_service("CampaignService").campaign_path(cid, camp_id)
    op.update.target_spend.cpc_bid_ceiling_micros = micros
    op.update_mask.CopyFrom(field_mask_pb2.FieldMask(paths=["target_spend.cpc_bid_ceiling_micros"]))
    client.get_service("CampaignService").mutate_campaigns(customer_id=cid, operations=[op])


def _replace_schedule(client, cid: str, camp_id: str, slots: list[dict]) -> None:
    """既存スロットの remove と新規 create を1リクエストで送る（原子的）。"""
    existing = _search(
        client, cid,
        f"""SELECT campaign.status, campaign_criterion.resource_name FROM campaign_criterion
            WHERE campaign.id = {camp_id} AND campaign_criterion.type = 'AD_SCHEDULE'""",
    )
    ops = []
    for r in existing:
        op = client.get_type("CampaignCriterionOperation")
        op.remove = r.campaign_criterion.resource_name
        ops.append(op)
    camp_rn = client.get_service("CampaignService").campaign_path(cid, camp_id)
    for s in slots:
        op = client.get_type("CampaignCriterionOperation")
        cc = op.create
        cc.campaign = camp_rn
        cc.ad_schedule.day_of_week = client.enums.DayOfWeekEnum[s["day"]]
        cc.ad_schedule.start_hour = s["start"][0]
        cc.ad_schedule.start_minute = client.enums.MinuteOfHourEnum[MINUTE_ENUM[s["start"][1]]]
        cc.ad_schedule.end_hour = s["end"][0]
        cc.ad_schedule.end_minute = client.enums.MinuteOfHourEnum[MINUTE_ENUM[s["end"][1]]]
        cc.bid_modifier = s["modifier"]
        ops.append(op)
    client.get_service("CampaignCriterionService").mutate_campaign_criteria(customer_id=cid, operations=ops)


def _truncate_schedule(slots: list[dict], cutoff_hour: int) -> list[dict]:
    out = []
    for s in slots:
        if (s["start"][0], s["start"][1]) >= (cutoff_hour, 0):
            continue
        end = s["end"] if (s["end"][0], s["end"][1]) <= (cutoff_hour, 0) else [cutoff_hour, 0]
        out.append({**s, "end": end})
    return out


def _set_statuses(client, cid: str, service: str, op_type: str, enum, items: dict[str, str]) -> None:
    if not items:
        return
    ops = []
    for rn, status in items.items():
        op = client.get_type(op_type)
        op.update.resource_name = rn
        op.update.status = enum[status]
        op.update_mask.CopyFrom(field_mask_pb2.FieldMask(paths=["status"]))
        ops.append(op)
    svc = client.get_service(service)
    fn = {
        "AdGroupService": "mutate_ad_groups",
        "AdGroupCriterionService": "mutate_ad_group_criteria",
        "AdGroupAdService": "mutate_ad_group_ads",
    }[service]
    getattr(svc, fn)(customer_id=cid, operations=ops)


def _add_negatives(client, cid: str, ag_id: str, words: list[str]) -> list[str]:
    ag_rn = client.get_service("AdGroupService").ad_group_path(cid, ag_id)
    existing = {
        r.ad_group_criterion.keyword.text
        for r in _search(
            client, cid,
            f"""SELECT ad_group_criterion.keyword.text FROM ad_group_criterion
                WHERE ad_group.id = {ag_id} AND ad_group_criterion.negative = TRUE
                  AND ad_group_criterion.status != 'REMOVED'""",
        )
    }
    ops = []
    for w in words:
        if w in existing:
            continue
        op = client.get_type("AdGroupCriterionOperation")
        op.create.ad_group = ag_rn
        op.create.keyword.text = w
        op.create.keyword.match_type = client.enums.KeywordMatchTypeEnum.PHRASE
        op.create.negative = True
        ops.append(op)
    if not ops:
        return []
    res = client.get_service("AdGroupCriterionService").mutate_ad_group_criteria(customer_id=cid, operations=ops)
    return [r.resource_name for r in res.results]


def _create_rsa(client, cid: str, ag_id: str) -> str:
    op = client.get_type("AdGroupAdOperation")
    aga = op.create
    aga.ad_group = client.get_service("AdGroupService").ad_group_path(cid, ag_id)
    aga.status = client.enums.AdGroupAdStatusEnum.ENABLED
    aga.ad.final_urls.append(FINAL_URL)
    rsa = aga.ad.responsive_search_ad
    for text in HEADLINES:
        a = client.get_type("AdTextAsset")
        a.text = text
        rsa.headlines.append(a)
    for text in DESCRIPTIONS:
        a = client.get_type("AdTextAsset")
        a.text = text
        rsa.descriptions.append(a)
    resp, _ = mutate_with_exemption(
        client.get_service("AdGroupAdService").mutate_ad_group_ads, cid, op, request_exemption=True
    )
    return resp.results[0].resource_name


@click.group()
def cli() -> None:
    pass


@cli.command()
@click.option("--yes", is_flag=True, help="確認をスキップする。")
def apply(yes: bool) -> None:
    """一般外来専用に切り替える。"""
    client = load_client()
    cid = resolve_customer_id(None)
    if SNAPSHOT.exists():
        raise click.ClickException(f"スナップショットが既にあります（適用済み？）: {SNAPSHOT}")

    snap = _take_snapshot(client, cid)
    for camp_id, s in snap["campaigns"].items():
        conf = CAMPAIGNS[camp_id]
        fever = [k["text"] for k in s["keywords"].values()
                 if k["status"] == "ENABLED" and any(m in k["text"] for m in FEVER_KEYWORD_MARKERS)]
        console.print(f"[bold]{s['name']}[/bold]")
        console.print(f"  日予算 {s['budget_micros'] / 1e6:,.0f} → {NEW_BUDGET_YEN:,}円 / "
                      f"上限CPC {s['cpc_ceiling_micros'] / 1e6:,.0f} → {NEW_CPC_CEILING_YEN}円")
        console.print(f"  配信時間を {conf['cutoff_hour']}:00 で打ち切り")
        console.print(f"  停止する発熱系KW: {', '.join(fever) or 'なし'}")
        console.print(f"  追加する除外KW: {', '.join(FEVER_NEGATIVES)}")
        console.print(f"  停止する広告: {len([a for a in s['ads'].values() if a == 'ENABLED'])}件 → 一般内科RSAを新規作成")
        console.print(f"  インフル予防接種グループ {conf['flu_ad_group']} を停止")
    if not yes:
        click.confirm("\n切り替えますか？", abort=True)

    SNAPSHOT.parent.mkdir(parents=True, exist_ok=True)
    SNAPSHOT.write_text(json.dumps(snap, ensure_ascii=False, indent=2), encoding="utf-8")
    console.print(f"[dim]スナップショット保存: {SNAPSHOT}[/dim]")

    applied: dict = {}
    agc = client.enums.AdGroupCriterionStatusEnum
    for camp_id, s in snap["campaigns"].items():
        conf = CAMPAIGNS[camp_id]
        _set_budget(client, cid, s["budget_resource"], NEW_BUDGET_YEN * 1_000_000)
        _set_cpc_ceiling(client, cid, camp_id, NEW_CPC_CEILING_YEN * 1_000_000)
        _replace_schedule(client, cid, camp_id, _truncate_schedule(s["schedule"], conf["cutoff_hour"]))
        _set_statuses(
            client, cid, "AdGroupCriterionService", "AdGroupCriterionOperation", agc,
            {rn: "PAUSED" for rn, k in s["keywords"].items()
             if k["status"] == "ENABLED" and any(m in k["text"] for m in FEVER_KEYWORD_MARKERS)},
        )
        negatives = _add_negatives(client, cid, conf["naika_ad_group"], FEVER_NEGATIVES)
        new_ad = _create_rsa(client, cid, conf["naika_ad_group"])
        _set_statuses(
            client, cid, "AdGroupAdService", "AdGroupAdOperation", client.enums.AdGroupAdStatusEnum,
            {rn: "PAUSED" for rn, st in s["ads"].items() if st == "ENABLED"},
        )
        _set_statuses(
            client, cid, "AdGroupService", "AdGroupOperation", client.enums.AdGroupStatusEnum,
            {client.get_service("AdGroupService").ad_group_path(cid, conf["flu_ad_group"]): "PAUSED"},
        )
        applied[camp_id] = {"added_negatives": negatives, "new_ads": [new_ad]}
        console.print(f"[green]✓ {s['name']}[/green] 新RSA: {new_ad}")

    snap["applied"] = applied
    SNAPSHOT.write_text(json.dumps(snap, ensure_ascii=False, indent=2), encoding="utf-8")
    console.print("[bold green]完了[/bold green]（キャンペーンは停止のまま。有効化は gads budget status で）")


@cli.command()
@click.option("--yes", is_flag=True, help="確認をスキップする。")
def restore(yes: bool) -> None:
    """スナップショットから元の運用（発熱も含めた内科広告）に戻す。"""
    client = load_client()
    cid = resolve_customer_id(None)
    if not SNAPSHOT.exists():
        raise click.ClickException(f"スナップショットがありません: {SNAPSHOT}")
    snap = json.loads(SNAPSHOT.read_text(encoding="utf-8"))
    console.print(f"スナップショット（{snap['taken_at']}）の状態に戻します。")
    if not yes:
        click.confirm("戻しますか？", abort=True)

    for camp_id, s in snap["campaigns"].items():
        applied = snap.get("applied", {}).get(camp_id, {})
        _set_budget(client, cid, s["budget_resource"], s["budget_micros"])
        _set_cpc_ceiling(client, cid, camp_id, s["cpc_ceiling_micros"])
        _replace_schedule(client, cid, camp_id, s["schedule"])
        _set_statuses(client, cid, "AdGroupCriterionService", "AdGroupCriterionOperation",
                      client.enums.AdGroupCriterionStatusEnum,
                      {rn: k["status"] for rn, k in s["keywords"].items()})
        if applied.get("added_negatives"):
            ops = []
            for rn in applied["added_negatives"]:
                op = client.get_type("AdGroupCriterionOperation")
                op.remove = rn
                ops.append(op)
            client.get_service("AdGroupCriterionService").mutate_ad_group_criteria(customer_id=cid, operations=ops)
        ads = dict(s["ads"])
        ads.update({rn: "PAUSED" for rn in applied.get("new_ads", [])})
        _set_statuses(client, cid, "AdGroupAdService", "AdGroupAdOperation",
                      client.enums.AdGroupAdStatusEnum, ads)
        _set_statuses(
            client, cid, "AdGroupService", "AdGroupOperation", client.enums.AdGroupStatusEnum,
            {client.get_service("AdGroupService").ad_group_path(cid, ag): st
             for ag, st in s["ad_groups"].items()},
        )
        console.print(f"[green]✓ {s['name']}[/green] を戻しました")

    done = SNAPSHOT.with_name(SNAPSHOT.stem + f".restored-{datetime.now():%Y%m%d%H%M}.json")
    SNAPSHOT.rename(done)
    console.print(f"[dim]スナップショットは {done.name} に退避しました。キャンペーンの ON/OFF は触っていません。[/dim]")


if __name__ == "__main__":
    cli()
