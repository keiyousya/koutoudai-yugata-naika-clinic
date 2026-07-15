---
name: google-ads-api-v24-notes
description: Google Ads API v24の落とし穴（campaign.end_date廃止、リフレッシュトークン失効しやすい）
metadata:
  type: reference
---

google-ads ディレクトリのCLIが使う Google Ads API は **v24**（google-ads 31.x）。ハマりどころ:

- `campaign.start_date` / `campaign.end_date` は**存在しない**。v24では
  `campaign.start_date_time` / `campaign.end_date_time`（`YYYY-MM-DD HH:MM:SS` 文字列、
  空文字 = 終了日なし）。旧記事のGAQLをそのまま使うと `UNRECOGNIZED_FIELD` で落ちる。
- 終了日の**解除**は空文字を代入するだけでは効かない。`protobuf_helpers.field_mask()` は
  空文字を差分と見なさずマスクから落とすため、`FieldMask(paths=["end_date_time"])` を
  明示的に組む必要がある。`gads campaign end-date --clear` はこの方式で実装済み。
- `GoogleAdsFieldService` への照会に **FROM句は書けない**（`SELECT name, data_type WHERE
  name LIKE 'campaign.%date%'` の形）。フィールド名を調べたいときに使える。
- リフレッシュトークンが `invalid_grant: Token has been expired or revoked` で失効しやすい。
  復旧は `python scripts/regen_refresh_token.py`（ブラウザ承認が必要なので人間が実行する）。
  承認ページを途中で閉じるとローカルサーバーがポートを掴んだまま残るので、再実行前に
  プロセスをkillすること。

**How to apply:** GAQLを書く前にフィールド名を疑う。日付まわりは特に。
