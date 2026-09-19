---
name: gads-token-regen-from-claude
description: gads が invalid_grant で失敗したら、Claude が再認証スクリプトをバックグラウンド起動すれば直る
metadata: 
  node_type: memory
  type: reference
  originSessionId: 517f217c-9a31-4964-81d0-9f8fe8b6b990
  modified: 2026-09-16T08:03:22.113Z
---

`gads` が `RefreshError: invalid_grant` で失敗したら、refresh token の期限切れ（2026-09-16に発生）。

`ads/.venv/Scripts/python.exe scripts/regen_refresh_token.py` を Bash の run_in_background で起動する。ブラウザが開くので、ユーザーに承認してもらう。完了すると `.env` が自動更新され、そのまま再取得できる。ユーザーに手動実行を頼む必要はない。

**Why:** 2026-09-16、Google広告の数字を取れないまま報告したら、「googleをちゃんと取ってほしい」と言われた。
**How to apply:** 認証エラーが出たら、Googleの数字を抜いて報告しない。その場で上記を起動し、承認を待ってから取り直す。
