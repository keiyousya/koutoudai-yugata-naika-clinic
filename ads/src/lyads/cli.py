"""lyads コマンドのエントリポイント。"""

from __future__ import annotations

import click

from .commands import account, campaign, conversion, keyword, report


@click.group()
@click.version_option(package_name="ads", message="lyads %(version)s")
def cli() -> None:
    """勾当台夕方内科クリニックの LINEヤフー広告運用CLI。"""


cli.add_command(account.account)
cli.add_command(campaign.campaign)
cli.add_command(conversion.conversion)
cli.add_command(keyword.keyword)
cli.add_command(report.report)


if __name__ == "__main__":
    cli()
