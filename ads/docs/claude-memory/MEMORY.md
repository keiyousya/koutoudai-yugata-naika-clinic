# Memory Index

- [アフターピル広告は日本で不承認確定](afterpill-google-ads-not-approvable.md) — 検索広告は構造的に不可、再試行せずSEO+一般広告に集中
- [クリニックの配信時間運用と設定変更履歴](clinic-ad-schedule-ops.md) — 診療:平日17-21/土日14-21/火休診・祝休、最終受付20:45。広告は平日/土日でキャンペーン分割済み。8/17にCPC上限100円統一・半径6km・ディスプレイOFF、8/20に平日から日曜系KWを停止
- [記憶のgitミラー運用](memory-git-mirror.md) — 記憶はrepo docs/claude-memoryにID伏せでミラー。更新時は両方同期
- [オンライン診療ページは8月まで非公開ゲート](online-medical-page-gated-until-aug.md) — 完成済だが2026-08公開予定でパスワードゲート中。公開時の解除箇所一覧あり
- [Google Ads API v24の落とし穴](google-ads-api-v24-notes.md) — campaign.end_dateは廃止（end_date_time）、解除はFieldMask明示、トークン失効しやすい
- [7月広告パフォーマンス実績](july-2026-ads-performance.md) — CPA158円/CV168件だが中身は全て「経路案内」。LINE友だち追加ベースの8月CPAと比較不可
- [Google Ads CLI セットアップ手順](ads-env-setup-procedure.md) — OAuthクライアント作成→.env→refresh token取得の全手順
- [procyon広告分析APIエンドポイント](procyon-ad-metrics-api.md) — listing-performanceで予約数・LINE友だち追加を取得。予約数はキャンセル込み・全流入込みで鈍い指標。lineFollowGoogleAdsCountが0件の不具合あり(helix#1745)
- [広告CV計測の2系統構成](ads-conversion-tracking-architecture.md) — HP側gtag/ytagとprocyon側acquisition_sourceは別物。Google・ヤフー両媒体のタグ値と設置場所。Astroのdefine:varsでgtagが40日間発火せずCV0件だった
- [広告の採算前提](ads-unit-economics.md) — 単価5,000円・再診率10%・キャパ20人。8/17に粗利率70%と判明し損益分岐CPAは3,850円。CV目標変更後の実測は1,240〜3,651円で余裕は薄い
- [LINEヤフー広告の導入状況](lineyahoo-ads-setup.md) — LINE広告は日本で終了(API新規受付終了済)。ヤフー面は LINEヤフー広告 で。API利用申請〜疎通確認まで2026-08-11に完了。テストアカウントあり
- [広告CLIは ads/ の2コマンド構成](ads-cli-two-command-layout.md) — google-ads/ → ads/ に改名。gads(Google) と lyads(LINEヤフー) が同居
- [キャンペーン個別のCV目標がアカウント既定を上書きする](campaign-conversion-goal-override.md) — CV0に見えたら目標設定を疑う。gads campaign goals で診断
- [LINEヤフー広告APIのcriterion系の癖](lyads-criterion-api-notes.md) — 除外KWは再実行安全、マッチタイプはsetで変更不可、地域はDONT_CAREが既定
- [LINEヤフー広告のID一覧と再取得場所](lineyahoo-ads-ids.md) — 開設メールはGmailに無い。管理ツールUIから取り直す
- [ads の venv が壊れるのはパス移動が原因](ads-venv-editable-path-breakage.md) — venv 再構築ではなく `uv pip install -e .` で直る
- [予約数の読み方の落とし穴](reservation-count-reading-traps.md) — 「今週少ない」はだいたい時刻・週末未到来・前日が突出、の3つ
