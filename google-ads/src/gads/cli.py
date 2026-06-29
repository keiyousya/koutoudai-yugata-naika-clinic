"""gads コマンドのエントリポイント。"""

from __future__ import annotations

import click

from .commands import ad, budget, campaign, conversion, keyword, report


@click.group()
@click.version_option(package_name="gads", message="gads %(version)s")
def cli() -> None:
    """勾当台夕方内科クリニックの Google 広告運用CLI。"""


cli.add_command(report.report)
cli.add_command(budget.budget)
cli.add_command(keyword.keyword)
cli.add_command(conversion.conversion)
cli.add_command(campaign.campaign)
cli.add_command(ad.ad)


if __name__ == "__main__":
    cli()
