---
name: dev-server-process-cleanup
description: pnpm dev:* を停止してもconcurrently配下のvite/wranglerが生き残るため、再起動前にプロセスツリーをkillする必要がある。
metadata:
  type: project
---

Windows環境で `pnpm dev:inventory` などを停止しても、`concurrently` 配下の vite / wrangler の子プロセスが残る。旧wranglerが同じポート(8791)にLISTENしたまま古い環境変数でリクエストに応答するため、`.dev.vars` を直しても500が続くという紛らわしい状態になる。

再起動前に必ずプロセスツリーごと落とす:

```bash
netstat -ano | grep LISTENING | grep -E ":(5177|8791)"   # 残存確認
taskkill //PID <root-pid> //T //F                          # ツリーごと
```

`Get-CimInstance Win32_Process -Filter "Name='node.exe'"` で CreationDate を見ると新旧のツリーを見分けられる。関連: [[turso-cli-in-wsl]]
