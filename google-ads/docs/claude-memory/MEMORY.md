# Memory Index

- [アフターピル広告は日本で不承認確定](afterpill-google-ads-not-approvable.md) — 検索広告は構造的に不可、再試行せずSEO+一般広告に集中
- [クリニックの配信時間運用](clinic-ad-schedule-ops.md) — 診療:平日17-21/土日14-21/火休診・祝休、最終受付20:45。現行の広告配信は実態とズレあり要調整
- [記憶のgitミラー運用](memory-git-mirror.md) — 記憶はrepo docs/claude-memoryにID伏せでミラー。更新時は両方同期
- [オンライン診療ページは8月まで非公開ゲート](online-medical-page-gated-until-aug.md) — 完成済だが2026-08公開予定でパスワードゲート中。公開時の解除箇所一覧あり
- [夏季休診2026の広告停止→再開完了](summer-closure-2026-ads-paused.md) — 7/16〜7/31休診で停止、7/30に--clearで再開済み
- [Google Ads API v24の落とし穴](google-ads-api-v24-notes.md) — campaign.end_dateは廃止（end_date_time）、解除はFieldMask明示、トークン失効しやすい
- [7月広告パフォーマンス実績](july-2026-ads-performance.md) — CPA158円(6月570円から大幅改善)、CV168件/13日稼働。設定変更不要
- [Google Ads CLI セットアップ手順](ads-env-setup-procedure.md) — OAuthクライアント作成→.env→refresh token取得の全手順
- [procyon広告分析APIエンドポイント](procyon-ad-metrics-api.md) — listing-performanceで予約数・LINE友だち追加を取得。lineFollowGoogleAdsCountが0件の不具合あり(helix#1745)
