"""キャンペーンの配信スケジュールを入札調整つきで丸ごと張り替える。

`gads campaign schedule` は bid_modifier の指定と既存スロットの削除に対応していないため、
時間帯ごとに傾斜（入札調整）をかけたいときはこちらを使う。

既存スロットの remove と新規スロットの create を **単一リクエストにまとめて** 送るので、
適用は原子的。スケジュールが一瞬消えて終日配信になる事故が起きない。

使い方:
    python scripts/set_ad_schedule_gradient.py --campaign-id 1234567890 \
        --slot SATURDAY,12:00,13:00,0.7 \
        --slot SATURDAY,13:00,16:00,0.9

`--slot` の書式は `曜日,開始,終了,入札調整`。分は 00/15/30/45 のみ。
入札調整は上限CPCへの乗率（1.0 = 等倍、0.7 = -30%、1.3 = +30%）。
"""

from __future__ import annotations

import click
from rich.console import Console
from rich.table import Table

from gads.client import load_client, resolve_customer_id

console = Console()

MINUTE_ENUM = {"00": "ZERO", "15": "FIFTEEN", "30": "THIRTY", "45": "FORTY_FIVE"}


def _parse_slot(raw: str) -> dict:
    parts = [p.strip() for p in raw.split(",")]
    if len(parts) != 4:
        raise click.BadParameter(f"書式は 曜日,開始,終了,入札調整 です: {raw!r}")
    day, start, end, modifier = parts

    def _time(value: str) -> tuple[int, str]:
        if ":" not in value:
            raise click.BadParameter(f"時刻は HH:MM 形式で指定してください: {value!r}")
        hh, mm = value.split(":", 1)
        if mm not in MINUTE_ENUM:
            raise click.BadParameter(f"分は 00/15/30/45 のみ指定できます: {value!r}")
        return int(hh), MINUTE_ENUM[mm]

    sh, sm = _time(start)
    eh, em = _time(end)
    return {
        "day": day.upper(),
        "sh": sh,
        "sm": sm,
        "eh": eh,
        "em": em,
        "modifier": float(modifier),
        "label": f"{day.upper()} {start}-{end}",
    }


@click.command()
@click.option("--campaign-id", required=True, help="対象キャンペーンID。")
@click.option(
    "--slot",
    "slots",
    multiple=True,
    required=True,
    help="曜日,開始,終了,入札調整（例 SATURDAY,17:00,20:30,1.3）。複数指定可。",
)
@click.option("--customer-id", default=None, help="操作対象アカウントID（未指定時は.env）。")
@click.option("--yes", is_flag=True, help="確認をスキップする。")
def main(campaign_id: str, slots: tuple[str, ...], customer_id: str | None, yes: bool) -> None:
    client = load_client()
    cid = resolve_customer_id(customer_id)
    parsed = [_parse_slot(s) for s in slots]

    ga_service = client.get_service("GoogleAdsService")
    rows = list(
        ga_service.search(
            customer_id=cid,
            query=f"""
                SELECT campaign.name,
                       campaign_criterion.resource_name,
                       campaign_criterion.ad_schedule.day_of_week,
                       campaign_criterion.ad_schedule.start_hour,
                       campaign_criterion.ad_schedule.start_minute,
                       campaign_criterion.ad_schedule.end_hour,
                       campaign_criterion.ad_schedule.end_minute,
                       campaign_criterion.bid_modifier
                FROM campaign_criterion
                WHERE campaign.id = {campaign_id}
                  AND campaign_criterion.type = 'AD_SCHEDULE'
            """,
        )
    )

    table = Table(title="配信スケジュールの張り替え", show_lines=False)
    table.add_column("区分")
    table.add_column("枠")
    table.add_column("入札調整", justify="right")
    for r in rows:
        s = r.campaign_criterion.ad_schedule
        sm = s.start_minute.name.replace("ZERO", "00").replace("THIRTY", "30")
        em = s.end_minute.name.replace("ZERO", "00").replace("THIRTY", "30")
        modifier = r.campaign_criterion.bid_modifier
        table.add_row(
            "[red]削除[/red]",
            f"{s.day_of_week.name} {s.start_hour}:{sm}-{s.end_hour}:{em}",
            f"×{modifier:.2f}" if modifier else "×1.00",
        )
    for p in parsed:
        table.add_row("[green]作成[/green]", p["label"], f"×{p['modifier']:.2f}")
    console.print(table)
    if rows:
        console.print(f"対象キャンペーン: [bold]{rows[0].campaign.name}[/bold]")

    if not yes:
        click.confirm("張り替えますか？", abort=True)

    operations = []
    for r in rows:
        op = client.get_type("CampaignCriterionOperation")
        op.remove = r.campaign_criterion.resource_name
        operations.append(op)

    campaign_service = client.get_service("CampaignService")
    campaign_rn = campaign_service.campaign_path(cid, campaign_id)
    for p in parsed:
        op = client.get_type("CampaignCriterionOperation")
        cc = op.create
        cc.campaign = campaign_rn
        cc.ad_schedule.day_of_week = client.enums.DayOfWeekEnum[p["day"]]
        cc.ad_schedule.start_hour = p["sh"]
        cc.ad_schedule.start_minute = client.enums.MinuteOfHourEnum[p["sm"]]
        cc.ad_schedule.end_hour = p["eh"]
        cc.ad_schedule.end_minute = client.enums.MinuteOfHourEnum[p["em"]]
        cc.bid_modifier = p["modifier"]
        operations.append(op)

    # remove と create を1リクエストにまとめる＝原子的に適用される。
    crit_service = client.get_service("CampaignCriterionService")
    response = crit_service.mutate_campaign_criteria(customer_id=cid, operations=operations)
    console.print(
        f"[green]完了[/green]: 削除 {len(rows)}件 / 作成 {len(parsed)}件 "
        f"（計 {len(response.results)} 操作）"
    )


if __name__ == "__main__":
    main()
