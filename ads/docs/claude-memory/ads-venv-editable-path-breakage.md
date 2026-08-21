---
name: ads-venv-editable-path-breakage
description: リポジトリを別パスへ移すと ads/.venv の editable install が壊れ gads/lyads が起動しない
metadata:
  type: project
---

`ads/.venv` は uv 製で、editable install の参照先を**絶対パスで**持つ
（`.venv/Lib/site-packages/_editable_impl_ads.pth`）。リポジトリを移動・コピーすると
このパスが旧場所を指したままになり、`gads.exe` が
`error: uv trampoline failed to canonicalize script path` で落ちる。
`.venv/Scripts/python.exe` 自体は動くので Python 環境の問題と誤診しやすい。

直し方（venv 作り直しは不要、数秒で済む）:

```bash
cd ads && VIRTUAL_ENV="$(pwd)/.venv" uv pip install -e .
```

2026-08-21 に `Desktop\koutoudai-yugata-naika-clinic` → `Desktop\repositories\koutoudai-yugata-naika-clinic`
へ移動していた件で発生。`.env` は移設されていたので認証情報は無事だった
（ただし LYADS_* と PROCYON_API_KEY は空のまま）。

**Why:** 「新しいマシンだから作り直し」と判断すると venv 再構築や OAuth 再取得まで
やり直しかねないが、実際はパス参照の張り替えだけで済む。

**How to apply:** `gads` / `lyads` が起動しない、または `ModuleNotFoundError: No module named 'gads'`
が出たら、まず `_editable_impl_ads.pth` の中身が現在のリポジトリパスと一致するか見る。

出力が文字化けするときは PowerShell 側で
`$env:PYTHONIOENCODING='utf-8'; [Console]::OutputEncoding=[Text.Encoding]::UTF8` を先に流す。
