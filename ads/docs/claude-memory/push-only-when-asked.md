---
name: push-only-when-asked
description: HP等の修正はコミットまでに留め、pushはユーザーの指示でまとめて行う
metadata:
  node_type: memory
  type: feedback
  originSessionId: 35340332-c434-4545-ab16-bb1b40228e31
  modified: 2026-09-25T06:49:49.321Z
---

修正のたびに git push しない。コミットまでで止め、push はユーザーが「pushして」と言ったときにまとめて行う。

**Why:** 2026-09-25、コロナワクチンページの細かい修正ごとにpush→デプロイしようとして止められた（「プッシュはまとめて行うから」）。main への push は GitHub Actions で本番HPに即反映されるため。

**How to apply:** 一度 push の許可をもらっても、それはその回だけのもの。以降の修正はコミットして「未pushのコミットがN件」と報告する。
