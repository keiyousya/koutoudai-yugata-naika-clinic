---
name: ads-env-setup-procedure
description: Google Ads CLI(.env)のセットアップ手順。OAuthクライアント作成からレポート取得まで。
metadata:
  type: reference
---

新しい端末で `gads` CLI を使えるようにする手順:

**1. Python環境の構築:**

```bash
cd google-ads
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
```

**2. .env の作成:**

```bash
cp .env.example .env
```

以下の値を埋める:

| キー | 取得元 |
|------|--------|
| `GOOGLE_ADS_DEVELOPER_TOKEN` | MCC(管理者)アカウント > ツール > API Center |
| `GOOGLE_ADS_CLIENT_ID` | Google Cloud Console (`yugata-naika-ads` プロジェクト) > 認証情報 > OAuthクライアントID |
| `GOOGLE_ADS_CLIENT_SECRET` | 同上（紛失時は「シークレットを追加」で新規発行。既存シークレットの値は再表示不可） |
| `GOOGLE_ADS_CUSTOMER_ID` | Google Ads画面右上のアカウント番号（ハイフン除去） |
| `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | 単一アカウント運用なら`CUSTOMER_ID`と同じ |
| `GOOGLE_ADS_USE_PROTO_PLUS` | `True` 固定 |
| `GOOGLE_ADS_REFRESH_TOKEN` | 次の手順3で自動設定 |

**3. リフレッシュトークンの取得:**

```bash
python scripts/regen_refresh_token.py
```

ブラウザが開くので広告アカウントのGoogleアカウントで承認。`.env`の`REFRESH_TOKEN`が自動更新される。

**4. 疎通確認:**

```bash
gads report --preset campaign --date-range LAST_7_DAYS
```

**注意:**
- GCPプロジェクトは `yugata-naika-ads` (project-0a3e8a6e-708a-4829-9ba)
- OAuthクライアントは端末ごとに別々に作成可能（developer tokenは共通）
- Client Secretは発行時にしか確認できない。紛失したら新しいシークレットを追加する
- API Centerは通常アカウントにはなく、MCC(管理者アカウント)からのみ確認可能
- `gcloud` CLI ではOAuthクライアントのシークレット取得・作成は不可（Cloud Console UI限定）

**How to apply:** 新端末セットアップ時やトークン失効時にこの手順を参照。
