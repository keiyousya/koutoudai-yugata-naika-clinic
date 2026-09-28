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

**Why:** 次回の効果確認・追加出稿時に前提を再調査しないため。

**How to apply:**
- 金額などの入力欄は三連クリックで選択されず値が追記される（日予算が 20,001,000円 になった）。必ず cmd+a → 入力 → 表示で確認
- 画像アップロードは file input が DOM に無い。HTMLInputElement.prototype.click を一時的に差し替えて input を捕まえ、終わったら戻す。アップロード元はセッションで読めるパス（scratchpad等）のみ
- 複数画像を選ぶと自動で切り抜き/AI拡張版が付く→「その他の縦横比」で外し、Customize media で配置を割り当てる
- 公開時に「#1357045 システムエラー」が出たが、再読み込み後 Review and publish で再公開して成功。二重作成は無かった
- 本文はクリニックのInstagram投稿の文体（冒頭「・」「勾当台夕方内科クリニックです🌙」、【】見出し、絵文字箇条書き、締め🌙）に合わせる。ユーザー指定
- 関連: [[ads-unit-economics]] [[ads-conversion-tracking-architecture]]
