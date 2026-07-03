---
name: memory-git-mirror
description: Claudeのローカル記憶はrepo内docs/claude-memoryにミラーしてgit管理している。更新時は両方を同期。
metadata:
  type: feedback
---

ユーザーはClaudeのローカル記憶(`~/.claude/.../memory/`)を失いたくないので、リポジトリ `keiyousya/koutoudai-yugata-naika-clinic`（**PUBLIC**）の `google-ads/docs/claude-memory/` にミラーしてgit管理している（2026-07-04開始）。

**Why:** ローカル記憶は端末依存で、故障・他PC共有で失われる。git管理でバックアップ＆版管理する。

**How to apply:** ローカル記憶(MEMORY.md や各メモ)を新規作成・更新したら、`google-ads/docs/claude-memory/` の同名ファイルにも反映してコミット＆push すること。ただしリポジトリはPUBLICなので、**広告アカウントID / campaign_id / ad_group_id 等の実値は必ず `<ACCOUNT_ID>` 等のプレースホルダーに伏せる**（実IDはローカル記憶側のみ保持）。コミット前に実IDの残存を grep で確認する。認証情報は `.env`(gitignore済)にありrepoには含めない。将来ID入りのまま管理したくなったら専用private repoへ移す選択肢もある。
