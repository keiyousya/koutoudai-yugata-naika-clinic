---
name: turso-cli-in-wsl
description: turso CLI はWindowsネイティブ版が無く、WSL内の ~/.turso/turso にインストール済み。backend/.dev.vars の再生成手順。
metadata:
  type: project
---

turso CLI はWindowsネイティブ版が無いため、WSL内 `~/.turso/turso` にインストールしてある（2026-08-21時点）。アカウント: tamurakeito。`turso auth login` はWSLにブラウザが無く失敗するので `--headless` を使い、表示された `turso config set token "<JWT>"` を実行する。

`backend/.dev.vars` はgit管理外で、リポジトリを移動・再クローンすると失われる。無い場合APIは全て500（`LibsqlError: URL_INVALID: The URL 'undefined'`）。再生成:

```bash
URL=$(wsl bash -lc "~/.turso/turso db show koutoudai-clinic --url" | tr -d '\r')
TOKEN=$(wsl bash -lc "~/.turso/turso db tokens create koutoudai-clinic" | tr -d '\r')
printf 'TURSO_URL=%s\nTURSO_AUTH_TOKEN=%s\n' "$URL" "$TOKEN" > backend/.dev.vars
```

`ADMIN_API_KEY` はローカルでは不要（未設定なら `backend/src/routes/inventory.ts` 等の adminAuth が `if (!validApiKey) return next()` で認証をスキップする）。
