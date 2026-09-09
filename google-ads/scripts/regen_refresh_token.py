"""Google Ads OAuth リフレッシュトークン再生成スクリプト。"""

import os
from dotenv import load_dotenv
from google_auth_oauthlib.flow import InstalledAppFlow

load_dotenv()

SCOPES = ["https://www.googleapis.com/auth/adwords"]

client_config = {
    "installed": {
        "client_id": os.environ["GOOGLE_ADS_CLIENT_ID"],
        "client_secret": os.environ["GOOGLE_ADS_CLIENT_SECRET"],
        "auth_uri": "https://accounts.google.com/o/oauth2/auth",
        "token_uri": "https://oauth2.googleapis.com/token",
    }
}

flow = InstalledAppFlow.from_client_config(client_config, scopes=SCOPES)
credentials = flow.run_local_server(port=0)

print(f"\n✅ 新しいリフレッシュトークン:\n{credentials.refresh_token}")
print("\n↑ このトークンを .env の GOOGLE_ADS_REFRESH_TOKEN に貼り付けてください。")
