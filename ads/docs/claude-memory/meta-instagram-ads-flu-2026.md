---
name: meta-instagram-ads-flu-2026
description: 2026-09-28にInstagram広告（インフル予防接種）を初出稿。設定内容と広告マネージャ操作の落とし穴
metadata:
  node_type: memory
  type: project
  originSessionId: fd0ba7cc-a80f-4941-9663-1ec0c2c36f18
  modified: 2026-09-28T04:28:59.460Z
---

2026-09-28 に Meta広告マネージャ（広告アカウント <META_AD_ACCOUNT_ID>）でInstagram広告を初めて自前で出稿した。それ以前は求人投稿の「宣伝」3件のみ。

- キャンペーン「インフル予防接種2026_トラフィック」/ 広告セット「仙台中心部5km_18-64歳」/ 広告「平日19時・土日OK_画像」
- トラフィック目的・LPV最適化（ピクセル無しでも可と表示）、日予算1,000円、終了日なし
- 勾当台公園+3mi（整数マイルのみ）、18〜64歳ハード制限（Advantage+オーディエンスを外した）、Instagramのみ（Messenger/Threads外し、除外配置への5%配分もオフ）
- 画像は `instagram/flu-vaccine.html` から書き出した2枚。メディアごとの配置設定で feed→フィード/発見、story→ストーリーズ/リール に割当
- Advantage+ クリエイティブの自動加工は「関連コメント」以外すべてオフ
- リンク先 HP /flu-vaccine に utm_source=instagram&utm_medium=paid_social&utm_campaign=flu_vaccine_2026

**追記 2026-09-28（求人広告・支払い）**
- 求人広告も出稿: キャンペーン「スタッフ募集2026_トラフィック」/ 広告「クリニック事務募集_画像」。日1,000円・勾当台+3mi・18歳以上(上限なし)・IGフィード/ストーリーズ/リール（発見タブは「FBフィード必須」で選べず）。画像は instagram/recruit-ad.html、リンク先 /recruit (utm_campaign=recruit_2026)。本文から「昇給あり」は削除指示あり、「Wワーク歓迎」表記
- 前払い残高0円で全広告が「支払いエラー」停止していた → 後払い（自動支払い）に切替。現在 Visa（既存の確認済みカード） が既定
- JCBは前払いでは「未対応カード」、後払いでは入力できたが「確認コードを送信できません」(INACTIONABLE_RISK_DISABLED)。Metaサポートにメールで問い合わせ済み（本文欄は編集不可で定型文のみ送信）。返信が来たらJCBの件を説明する
- 広告マネージャで「複数広告主の広告」が既定オンのことがある→オフにする。配置設定中に画面がずれて「A/Bテスト」にチェックが入った（予算が半分に割れる）ので、クリックは ref 指定で

- 9/28夕: 2枚目のVisaの確認を完了（警告解消）。JCBは登録済みだがメイン化時の残高支払いが2回Failed（1回目は「CVV invalid」）→支払い期限切れになったので未払い259円を既定Visaで支払い、両広告Active。JCBはカード会社側で海外ネット決済が止まっている可能性。サポートの返信は定型文（支払い方法を確認せよ）のみ

**Why:** 次回の効果確認・追加出稿時に前提を再調査しないため。

**How to apply:**
- 金額などの入力欄は三連クリックで選択されず値が追記される（日予算が 20,001,000円 になった）。必ず cmd+a → 入力 → 表示で確認
- 画像アップロードは file input が DOM に無い。HTMLInputElement.prototype.click を一時的に差し替えて input を捕まえ、終わったら戻す。アップロード元はセッションで読めるパス（scratchpad等）のみ
- 複数画像を選ぶと自動で切り抜き/AI拡張版が付く→「その他の縦横比」で外し、Customize media で配置を割り当てる
- 公開時に「#1357045 システムエラー」が出たが、再読み込み後 Review and publish で再公開して成功。二重作成は無かった
- 本文はクリニックのInstagram投稿の文体（冒頭「・」「勾当台夕方内科クリニックです🌙」、【】見出し、絵文字箇条書き、締め🌙）に合わせる。ユーザー指定
- 手順と落とし穴の詳細は `.claude/skills/instagram-ads/SKILL.md` にまとめた
- 関連: [[ads-unit-economics]] [[ads-conversion-tracking-architecture]]
