"""LINEヤフー広告APIのリフレッシュトークンを発行する。

前提: LINEヤフー広告の管理ツールでアプリケーション登録を済ませ、
client_id / client_secret を .env に入れてあること。
リダイレクトURIは登録時に `oob` を指定しておく。

使い方:
    python scripts/lyads_refresh_token.py            # 認可URLを表示して対話で受け取る
    python scripts/lyads_refresh_token.py <認可コード>  # コードを引数で渡す

引数なしで実行すると認可URLを表示する。ブラウザで承認して認可コードを取得したら、
同じコマンドにコードを付けて再実行する。標準入力が使えない環境（非対話シェル）でも
こちらの2段構えなら通る。

得られた refresh_token を .env の LYADS_REFRESH_TOKEN に貼る。
"""

from __future__ import annotations

import os
import sys
import webbrowser
from pathlib import Path
from urllib.parse import urlencode

import requests
from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
AUTHORIZE_URL = "https://biz-oauth.yahoo.co.jp/oauth/v1/authorize"
TOKEN_URL = "https://biz-oauth.yahoo.co.jp/oauth/v1/token"
REDIRECT_URI = "oob"  # アプリケーション登録時のリダイレクトURIと一致させる


def main() -> int:
    load_dotenv(ROOT / ".env")
    client_id = os.getenv("LYADS_CLIENT_ID")
    client_secret = os.getenv("LYADS_CLIENT_SECRET")
    if not (client_id and client_secret):
        print(
            "LYADS_CLIENT_ID / LYADS_CLIENT_SECRET が .env にありません。\n"
            "広告管理ツールでアプリケーション登録して発行した値を入れてください。",
            file=sys.stderr,
        )
        return 1

    # 認可コードの有効期限は10分しかないので、取得したらすぐ交換する
    code = sys.argv[1].strip() if len(sys.argv) > 1 else ""

    if not code:
        url = f"{AUTHORIZE_URL}?" + urlencode(
            {
                "response_type": "code",
                "client_id": client_id,
                "redirect_uri": REDIRECT_URI,
                "scope": "yahooads",
                # state は CSRF 対策用。oob なので固定値でも実害はないが形式上必要
                "state": "lyads-cli",
            }
        )
        print("以下のURLをブラウザで開いて承認してください:\n")
        print(url + "\n")
        webbrowser.open(url)

        if sys.stdin.isatty():
            code = input("表示された認可コードを貼り付けてください: ").strip()
        else:
            # 非対話シェルでは入力を待てないので、引数で渡し直してもらう
            print(
                "承認後、表示された認可コードを引数に付けて再実行してください:\n"
                "  python scripts/lyads_refresh_token.py <認可コード>",
                file=sys.stderr,
            )
            return 2

    if not code:
        print("認可コードが空です。", file=sys.stderr)
        return 1

    resp = requests.post(
        TOKEN_URL,
        data={
            "grant_type": "authorization_code",
            "client_id": client_id,
            "client_secret": client_secret,
            "redirect_uri": REDIRECT_URI,
            "code": code,
        },
        timeout=30,
    )
    if resp.status_code != 200:
        print(f"トークン取得に失敗しました（HTTP {resp.status_code}）: {resp.text}", file=sys.stderr)
        return 1

    payload = resp.json()
    token = payload["refresh_token"]

    # トークンを標準出力に出すと、ログや伏せ字処理を挟んだ拍子に失いやすい。
    # 認可コードは1回限りなので取り直しになる。直接 .env に書き込む。
    env_path = ROOT / ".env"
    if env_path.exists():
        lines = env_path.read_text(encoding="utf-8").splitlines(keepends=True)
        for i, line in enumerate(lines):
            if line.startswith("LYADS_REFRESH_TOKEN="):
                lines[i] = f"LYADS_REFRESH_TOKEN={token}\n"
                break
        else:
            lines.append(f"LYADS_REFRESH_TOKEN={token}\n")
        env_path.write_text("".join(lines), encoding="utf-8")
        print(f"\n.env の LYADS_REFRESH_TOKEN を更新しました（{len(token)}文字）。")
    else:
        print("\n.env が見つかりません。以下を手動で設定してください:\n")
        print(f"LYADS_REFRESH_TOKEN={token}")

    print(f"（access_token は {payload.get('expires_in', '?')} 秒で失効するので保存不要）")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
