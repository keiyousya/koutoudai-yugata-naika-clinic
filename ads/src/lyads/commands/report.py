"""レポート取得。

LINEヤフー広告のレポートは Google の GAQL と違い非同期ジョブ方式:
  ReportDefinitionService/add      → ジョブ作成（reportJobId が返る）
  ReportDefinitionService/get      → ジョブの状態を確認（WAIT/IN_PROGRESS/COMPLETED/FAILED）
  ReportDefinitionService/download → COMPLETED になったら CSV を取得
このコマンドは3つを1コマンドに畳んで、完了までポーリングしてから出力する。
"""

from __future__ import annotations

import csv
import io
import sys
import time

import click
from rich.console import Console
from rich.table import Table

from ..client import LyAdsClient, resolve_account_id, values_of

console = Console()

# レポートタイプごとの既定フィールド。フィールド名は公式のフィールド一覧に準拠。
# https://github.com/yahoojp-marketing/ads-search-api-documents/tree/master/reports/v20/jp
COMMON_METRICS = [
    "IMPS",
    "CLICKS",
    "CLICK_RATE",
    "COST",
    "AVG_CPC",
    "CONVERSIONS",
    "CONV_RATE",
    "COST_PER_CONV",
]
PRESETS = {
    "campaign": ("CAMPAIGN", ["CAMPAIGN_NAME", "CAMPAIGN_ID", *COMMON_METRICS]),
    "adgroup": ("ADGROUP", ["CAMPAIGN_NAME", "ADGROUP_NAME", *COMMON_METRICS]),
    "keyword": ("KEYWORDS", ["CAMPAIGN_NAME", "ADGROUP_NAME", "KEYWORD", *COMMON_METRICS]),
    "query": ("SEARCH_QUERY", ["CAMPAIGN_NAME", "ADGROUP_NAME", "KEYWORD", "SEARCH_QUERY", *COMMON_METRICS]),
}

DATE_RANGES = [
    "TODAY",
    "YESTERDAY",
    "LAST_7_DAYS",
    "LAST_WEEK",
    "LAST_14_DAYS",
    "LAST_30_DAYS",
    "THIS_MONTH",
    "THIS_MONTH_EXCEPT_TODAY",
    "LAST_MONTH",
    "ALL_TIME",
]


@click.command()
@click.option(
    "--preset",
    type=click.Choice(list(PRESETS)),
    default="campaign",
    help="レポートの粒度（既定: campaign）",
)
@click.option(
    "--date-range",
    type=click.Choice(DATE_RANGES),
    default="LAST_30_DAYS",
    help="集計期間（既定: LAST_30_DAYS）",
)
@click.option(
    "--product",
    type=click.Choice(["search", "display"]),
    default="search",
    help="検索広告 / ディスプレイ広告（既定: search）",
)
@click.option("--account-id", default=None, help="対象アカウントID（未指定なら .env）")
@click.option("--csv", "as_csv", is_flag=True, help="整形せず生CSVを標準出力に流す")
@click.option("--timeout", default=300, help="ジョブ完了を待つ上限秒数（既定: 300）")
@click.option(
    "--test",
    is_flag=True,
    help="テストアカウントを使う（配信実績は返らず、形式と項目の確認だけできる）",
)
def report(
    preset: str,
    date_range: str,
    product: str,
    account_id: str | None,
    as_csv: bool,
    timeout: int,
    test: bool,
) -> None:
    """成果レポートを取得する。"""
    aid = resolve_account_id(account_id, product, test)
    report_type, fields = PRESETS[preset]
    client = LyAdsClient(product=product)

    job_id = _create_job(client, aid, report_type, fields, date_range)
    _wait_for_job(client, aid, job_id, timeout)
    body = client.download(
        "ReportDefinitionService",
        "download",
        {"accountId": aid, "reportJobId": job_id},
    )

    text = body.decode("utf-8-sig")
    if as_csv:
        sys.stdout.write(text)
        return
    _render(text, title=f"{preset}（{date_range} / account {aid}）")


def _create_job(client: LyAdsClient, account_id: int, report_type: str, fields: list[str], date_range: str) -> int:
    rval = client.call(
        "ReportDefinitionService",
        "add",
        {
            "accountId": account_id,
            "operand": [
                {
                    # ジョブ名は一覧で判別できればよいので用途がわかる名前にする
                    "reportName": f"lyads {report_type} {date_range}",
                    "reportType": report_type,
                    "reportDateRangeType": date_range,
                    "fields": fields,
                    "reportDownloadFormat": "CSV",
                    "reportDownloadEncode": "UTF8",
                    "reportCompressType": "NONE",
                    "reportLanguage": "JA",
                    # 集計行とヘッダ行の扱いを揃えておかないとパースが崩れる
                    "reportSkipColumnHeader": "FALSE",
                    "reportSkipReportSummary": "TRUE",
                    "reportIncludeDeleted": "FALSE",
                }
            ],
        },
    )
    values = values_of(rval)
    if not values:
        raise click.ClickException("レポートジョブの作成に失敗しました（レスポンスが空です）。")
    definition = values[0].get("reportDefinition") or {}
    job_id = definition.get("reportJobId")
    if job_id is None:
        raise click.ClickException(f"reportJobId が返りませんでした: {values[0]}")
    return int(job_id)


def _wait_for_job(client: LyAdsClient, account_id: int, job_id: int, timeout: int) -> None:
    deadline = time.monotonic() + timeout
    interval = 2.0
    with console.status(f"レポート生成中（jobId={job_id}）..."):
        while True:
            rval = client.call(
                "ReportDefinitionService",
                "get",
                {"accountId": account_id, "reportJobIds": [job_id], "numberResults": 1, "startIndex": 1},
            )
            values = values_of(rval)
            definition = (values[0].get("reportDefinition") if values else None) or {}
            status = definition.get("reportJobStatus")

            if status == "COMPLETED":
                return
            if status == "FAILED":
                raise click.ClickException(
                    "レポート生成に失敗しました: " + str(definition.get("reportJobErrorDetail", ""))
                )
            if time.monotonic() >= deadline:
                raise click.ClickException(
                    f"レポートが {timeout} 秒以内に完了しませんでした（status={status}）。"
                    f"--timeout を伸ばすか、時間をおいて再実行してください。"
                )
            time.sleep(interval)
            interval = min(interval * 1.5, 15.0)  # 長引くジョブでポーリングを詰めすぎない


def _render(text: str, title: str) -> None:
    rows = list(csv.reader(io.StringIO(text)))
    if not rows:
        console.print("[yellow]データがありませんでした。[/yellow]")
        return

    header, *body = rows
    table = Table(title=title)
    for col in header:
        table.add_column(col, overflow="fold")
    for row in body:
        table.add_row(*row)
    console.print(table)
