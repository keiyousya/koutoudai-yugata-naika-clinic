# claude-memory（運用メモのミラー）

Claude Code のプロジェクト記憶（`~/.claude/projects/.../memory/`）を git 管理するためのミラー。
ローカルのみだと端末故障や他PC共有で失われるため、ここにバックアップする。

> ⚠️ このリポジトリは **PUBLIC**。広告アカウントID / campaign_id / ad_group_id などの
> 具体値は `<ACCOUNT_ID>` 等の**プレースホルダーに伏せて**ある。実IDは Claude のローカル記憶側
> （`.claude/.../memory`）にのみ保持する。認証情報（開発者トークン等）は `.env`（`.gitignore`済）にあり、ここには含まれない。

## 更新の運用

ローカル記憶を書き換えたら、IDを伏せてこのディレクトリにも反映してコミットする。
