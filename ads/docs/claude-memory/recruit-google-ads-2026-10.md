---
name: recruit-google-ads-2026-10
description: 2026-10-02に求人（受付事務）のGoogle検索広告を開始。応募CVは副次なので「すべてのコンバージョン」列で見る
metadata:
  type: project
---

Instagram求人広告（9/28〜）でLPV約245・応募0件だったため、2026-10-02 16時台にGoogle検索広告「検索_求人_受付事務」(campaign_id=24306703188) を開始した。

- 日1,000円・クリック数最大化・上限CPC150円・勾当台半径10km・終日。KW12個フレーズ一致、リンク先 /recruit/。作成は `ads/scripts/create_recruit_campaign.py`
- 成果: /thanks 表示で CV「求人応募フォーム送信」(id 7813380925, 副次) を送信。主要にすると内科等のCV数に混ざるので副次にしてある → **Conversions列ではなく all_conversions で見る**
- 求人フォームの応募通知は web3forms → さくらメール（件名「【求人応募】勾当台夕方内科クリニック」）。広告前の最後の応募は9/25

**Why:** 10/7頃にInstagram求人広告と並べて続行/停止を判断する予定。
**How to apply:** 振り返り時は gads の all_conversions と、さくらメールの応募通知件数を突き合わせる。関連: [[meta-instagram-ads-flu-2026]]
