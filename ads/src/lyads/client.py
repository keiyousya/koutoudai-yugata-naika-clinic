"""LINEヤフー広告 API クライアント。

検索広告APIとディスプレイ広告APIはホストが違うだけで、認証・リクエスト形式・
レスポンス封筒（errors / rid / rval）は共通なので1つのクラスで両方を扱う。

  検索広告   : https://ads-search.yahooapis.jp/api/v20/<Service>/<method>
  ディスプレイ: https://ads-display.yahooapis.jp/api/v20/<Service>/<method>

全エンドポイントが POST + JSON。認証は OAuth2（Bearer）で、アクセストークンは
リフレッシュトークンから都度取得する（有効期限が短いため保存しない）。

リクエストボディの accountId とは別に、ヘッダー `x-z-base-account-id` が全
エンドポイントで必須（OpenAPI仕様で required: true）。ここにはルートMCCの
アカウントIDを入れる。ボディ側の accountId が「操作対象の広告アカウント」なのに対し、
こちらは「どの権限系統から操作するか」を示す。
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any, Literal

import click
import requests
from dotenv import load_dotenv

# .../ads/  （pyproject や .env が置かれる場所）
ROOT = Path(__file__).resolve().parents[2]

API_VERSION = "v20"
HOSTS = {
    "search": "https://ads-search.yahooapis.jp",
    "display": "https://ads-display.yahooapis.jp",
}
TOKEN_URL = "https://biz-oauth.yahoo.co.jp/oauth/v1/token"
AUTHORIZE_URL = "https://biz-oauth.yahoo.co.jp/oauth/v1/authorize"
SCOPE = "yahooads"

Product = Literal["search", "display"]


class LyAdsError(click.ClickException):
    """APIがエラー封筒を返したときの例外。"""

    def __init__(self, service: str, method: str, errors: list[dict[str, Any]], rid: str | None):
        self.errors = errors
        lines = [f"{service}/{method} がエラーを返しました（rid={rid or '-'}）:"]
        for e in errors:
            code = e.get("code", "?")
            msg = e.get("message", "")
            detail = "; ".join(
                f"{d.get('requestKey', '')}={d.get('requestValue', '')}".strip("=")
                for d in (e.get("details") or [])
            )
            lines.append(f"  [{code}] {msg}" + (f" ({detail})" if detail else ""))
        super().__init__("\n".join(lines))


def _env(key: str) -> str | None:
    load_dotenv(ROOT / ".env")
    return os.getenv(key)


def resolve_account_id(account_id: str | int | None, product: Product, test: bool = False) -> int:
    """操作対象アカウントIDを決定する（--account-id > 環境変数）。

    検索広告とディスプレイ広告はアカウントIDが別物なので、product ごとに既定値を持つ。
    test=True なら本番環境上のテストアカウント（配信も審査もされない）を使う。
    """
    prefix = "LYADS_TEST" if test else "LYADS"
    key = f"{prefix}_SEARCH_ACCOUNT_ID" if product == "search" else f"{prefix}_DISPLAY_ACCOUNT_ID"
    value = account_id or _env(key)
    if not value:
        raise click.ClickException(
            f"操作対象アカウントIDが未指定です。"
            f"--account-id を渡すか .env の {key} を設定してください。"
        )
    try:
        return int(str(value).strip())
    except ValueError:
        raise click.ClickException(f"アカウントIDが数値ではありません: {value}") from None


def resolve_base_account_id() -> int:
    """x-z-base-account-id に載せるルートMCCのIDを返す。"""
    value = _env("LYADS_BASE_ACCOUNT_ID")
    if not value:
        raise click.ClickException(
            "LYADS_BASE_ACCOUNT_ID（ルートMCCのアカウントID）が .env に設定されていません。\n"
            "全APIコールでヘッダー x-z-base-account-id として必須です。"
        )
    try:
        return int(str(value).strip())
    except ValueError:
        raise click.ClickException(f"LYADS_BASE_ACCOUNT_ID が数値ではありません: {value}") from None


def fetch_access_token() -> str:
    """リフレッシュトークンからアクセストークンを取得する。"""
    missing = [
        k
        for k in ("LYADS_CLIENT_ID", "LYADS_CLIENT_SECRET", "LYADS_REFRESH_TOKEN")
        if not _env(k)
    ]
    if missing:
        raise click.ClickException(
            "認証情報が不足しています: "
            + ", ".join(missing)
            + "\n.env.example を .env にコピーして埋めてください（手順は README.md）。"
        )

    resp = requests.post(
        TOKEN_URL,
        data={
            "grant_type": "refresh_token",
            "client_id": _env("LYADS_CLIENT_ID"),
            "client_secret": _env("LYADS_CLIENT_SECRET"),
            "refresh_token": _env("LYADS_REFRESH_TOKEN"),
        },
        timeout=30,
    )
    if resp.status_code != 200:
        raise click.ClickException(
            f"アクセストークンの取得に失敗しました（HTTP {resp.status_code}）: {resp.text}\n"
            "リフレッシュトークンが失効している可能性があります。"
            "`python scripts/lyads_refresh_token.py` で再発行してください。"
        )
    return resp.json()["access_token"]


class LyAdsClient:
    """検索広告 / ディスプレイ広告 API の薄いラッパ。"""

    def __init__(self, product: Product = "search", access_token: str | None = None):
        self.product = product
        self.base_url = f"{HOSTS[product]}/api/{API_VERSION}"
        self._token = access_token
        self._base_account_id: int | None = None
        self._session = requests.Session()

    @property
    def token(self) -> str:
        if self._token is None:
            self._token = fetch_access_token()
        return self._token

    @property
    def base_account_id(self) -> int:
        if self._base_account_id is None:
            self._base_account_id = resolve_base_account_id()
        return self._base_account_id

    def _headers(self) -> dict[str, str]:
        return {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json; charset=UTF-8",
            # 全エンドポイントで必須。ルートMCCのID
            "x-z-base-account-id": str(self.base_account_id),
        }

    def call(self, service: str, method: str, payload: dict[str, Any]) -> Any:
        """<Service>/<method> を叩いて rval を返す。errors が返ったら例外にする。"""
        resp = self._session.post(
            f"{self.base_url}/{service}/{method}",
            json=payload,
            headers=self._headers(),
            timeout=120,
        )

        # 認証エラーや障害時は封筒すら返らないことがあるので先に判定する
        try:
            body = resp.json()
        except ValueError:
            raise click.ClickException(
                f"{service}/{method} が JSON 以外を返しました（HTTP {resp.status_code}）: "
                f"{resp.text[:500]}"
            ) from None

        if body.get("errors"):
            raise LyAdsError(service, method, body["errors"], body.get("rid"))
        resp.raise_for_status()
        return body.get("rval")

    def download(self, service: str, method: str, payload: dict[str, Any]) -> bytes:
        """CSV等のバイナリを返すエンドポイント用（ReportDefinitionService/download）。"""
        resp = self._session.post(
            f"{self.base_url}/{service}/{method}",
            json=payload,
            headers=self._headers(),
            timeout=300,
        )
        # 失敗時のみ JSON のエラー封筒が返る
        if resp.headers.get("Content-Type", "").startswith("application/json"):
            body = resp.json()
            if body.get("errors"):
                raise LyAdsError(service, method, body["errors"], body.get("rid"))
        resp.raise_for_status()
        return resp.content


def values_of(rval: Any) -> list[dict[str, Any]]:
    """get / mutate のレスポンスから values 配列を取り出す。

    get は Page（totalNumEntries + values）、mutate は ReturnValue（values）を返すが
    どちらも values を持つので同じ扱いにする。
    """
    if not rval:
        return []
    return rval.get("values") or []
