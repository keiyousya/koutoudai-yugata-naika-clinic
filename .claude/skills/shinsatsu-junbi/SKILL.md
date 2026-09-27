---
name: shinsatsu-junbi
description: 電子カルテ（helix）で、当日予約の患者の診察前準備をChrome操作で行う。問診・過去カルテ・検査結果を読んで医師に要点を報告し、診察前メモ入りの下書きカルテ（必要なら生活習慣病の療養計画書）を作成・保存する。「今日の予約一覧を開いて診療準備して」「次 814」のように頼まれたときに使う。
argument-hint: "[カルテ番号（例: 852）]"
---

# 診察前準備・下書きカルテ作成（helix 電子カルテ）

対象: $ARGUMENTS

医師（田村慧人）から**カルテ番号を1人ずつ指定**されるので、その患者だけ準備する。
**全員分をまとめて読まない**（2026-09-27 に「全員分は見なくていい　指定した人だけ」と言われた）。
臨床判断は医師がする。提案は提案と明示し、医師の返事をもらってから A／P に書く。

画面操作・JS の細かい癖（編集モードの入り方、paste での入力、置き換え、傷病名ダイアログ、PDF の見方、切断時の対応）は `/karte` スキルと共通。そちらも読む。

## 対象画面

受付一覧（当日）:

```
https://koutoudai-yugata-naika.helix.keiyousya.com/reservations?page=1&pageSize=20&sortBy=preferred_time&sortDirection=asc&dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD&status=scheduled,arrived,awaiting_consultation,in_consultation,billing_confirmed,paid,cancelled
```

- 最初に `tabs_context_mcp` → 受付一覧を開く。タブは1枚で患者を順に回る
- 番号を言われたら、API で予約を引いてからカルテを開く

## 1. 予約と問診を API で取る

helix のページ上で `javascript_tool` から読む（読み取り専用）。

```js
const r = await fetch('https://api.procyon.helix.keiyousya.com/koutoudai-yugata-naika/v1/reservations?page=1&pageSize=50&dateFrom=YYYY-MM-DD&dateTo=YYYY-MM-DD&sortBy=preferred_time&sortDirection=asc&status=scheduled,arrived,awaiting_consultation,in_consultation,billing_confirmed,paid,cancelled',{credentials:'include'}).then(r=>r.json());
const o = r.reservations.find(x => x.externalLinkageId === '000852');  // カルテ番号は6桁ゼロ埋め
```

- 使う項目: `preferredTime`・氏名・`age`・`gender`・`patientCode`（カルテID）・`patientId`（病名API用）・`visitType`（first／return／self_pay）・`consultationSlotName`・`hasInsurance`・`questionnaire`
- `questionnaire` の中身は予約の種類で違う
  - 初診: `chiefComplaint`・`duration`・`pastIllnesses`・`currentMedications`・`allergies`・`additionalNotes`
  - 再診: `visitPurpose`（検査結果確認／その他 など）・`conditionChange`
  - 自費枠（アフターピル等）: `q_xxxx` のようなキーで来る
- `hasInsurance:false` の初診は、受付で保険証を確認するよう報告に書く
- 傷病名: `/patients/<patientId>/diseases`（`displayName`・`startDate`・`isMain`）

## 2. カルテを読む

カルテ: `https://koutoudai-yugata-naika.helix.keiyousya.com/medical-records/<patientCode>?openInsurance=false&openReservation=false`

- `get_page_text` は空で返ることがある。JS で `document.body.innerText` の「診療記録一覧」〜「新しい診療記録を作成」の間を切り出して `window.__rec` に入れ、2000 文字ずつ読む
- 看護記録（受付シート：体温・血圧・備考）、医師記録（前回の＃・現病歴・O・A・P）、LINE送信（医師が患者に送った連絡）まで目を通す

### 検査結果（外注の PDF）

- 検査結果は**記録に添付された PDF**（O 欄のサムネイル）にある。「検査結果」ボタンは未実装なので押さない
- サムネイルをクリックすると小さいビューアが開き、中の `iframe` に PDF の URL が入る
- 読むには、その `src` に `#toolbar=0&navpanes=0&zoom=60` を付けた**新しい iframe 要素**を `position:fixed; inset:0` で全画面に置き、スクリーンショット＋`zoom` で読む
  - 既存 iframe の `src` のハッシュだけ変えても再読込されない。消して作り直す
  - 全画面のビューア内はスクロールも `Page_Down` も効かなかった。zoom=60 なら2ページとも1画面に収まる
- 読み終えたら複製した iframe を消し、小さいビューアも右上の × で閉じる
- 採血時刻と最終食事時刻（受付シート）を突き合わせて、空腹時か随時かを書く

## 3. 医師に報告する

型:

```
**松坂 優里（000839・40歳女性）16:40 初診**
- 主訴：…（問診より）
- 既往歴・内服・アレルギー：…（未記入なら「問診では空欄」）
- 保険：未登録 → 受付で確認／自費なら料金
- 前回の記録（再診）：＃・経過・O・A/P の要点
- 検査結果：異常値を表で。基準内の項目はまとめて「異常なし」

**当日確認すること**（提案）
**検査の候補**（提案）
**傷病名の整理案**：疑い病名の転帰（中止）・追加・主病
```

- 最後に「下書きカルテとして保存しましょうか？」と聞く。以後「ドラフトカルテを」「カルテに残しておいて」と言われたら作る
- 医師から質問されたら（紹介基準、診断書の書き方、鑑別と方針など）Web で一次資料を当たり、出典を付けて答える。自治体・提出先の様式は PDF を落として `Read` で読む（WebFetch はバイナリ PDF を読めない）
- 自費の診断書は **5,500円（税込）**。自費診療には病名を登録しない

## 4. 下書きカルテを作る

右パネルは開いた時点で「新しい診療記録を作成」（初診時記録・診療日＝今日）になっている。

| 受診 | カルテ種別 | 入力欄（`[contenteditable=true]` の順） |
|---|---|---|
| 初診 | 初診時記録（既定） | ＃／主訴／現病歴／既往歴／内服／アレルギー／家族歴／S／O／A／P／備考（12個） |
| 再診 | SOAP | ＃／S／O／A／P／備考（6個） |

- SOAP への切り替え: 1つ目の `<select>` にネイティブ setter で `019d0f2c-ceea-7c1d-bb6f-934fc26d8b60::1` を入れて `change`。欄が6個になったことを確かめる
- 書き込む前に確認: 見出しが「診療記録を編集」でない（＝新規）、欄が全部空、診療日が今日
- 入力は空欄への `ClipboardEvent('paste')`（`text/html` の `<p>` 1行ずつ）。`type` は漢字が化けるので使わない
- 保存は「カルテを作成」→「カルテを作成しました」を確認 → 一覧側の記録を読み直して全文が入ったか確かめる

### 何を書くか

- 問診から転記した欄には `（Web問診より）`、未確認なら `（未確認）` を付ける
- **備考の1行目は `【診療前メモ　未診察】`**。続けて ■確認事項／■検査候補／■鑑別（参考・未診察）／■方針案 など、報告した内容を箇条書きで
  - 基準や様式を引いたときは、名称・年版・数値を備考に写しておく（例: 仙台市CKD病診連携事業 紹介基準（2023）の①〜⑤）
- 医師が口頭でくれた情報（採血結果、方針）は O／A／P に書く。もらっていない A／P は空欄のまま
- ＃・家族歴・S・O（初診）は診察後の欄なので、情報がなければ空けておく
- 処方区分は触らない（未選択か既定値のまま。報告で「診察後に選んで」と伝える）

### あとから追記するとき

- 記録本文の要素に JS で `mousedown/mouseup/click` ×2 と `dblclick` を送る → 見出し「診療記録を編集」を確認
- 備考の既存の行を `querySelectorAll('p')` で読んでおき、`selectAllChildren` → `execCommand('delete')` → 全文を paste し直す。行数が合っているか確かめてから「カルテを更新」
- 版が上がったこと（01版 → 02版）と追記部分の全文を確認する

## 5. 生活習慣病 療養計画書（頼まれたとき）

左サイドバー「文書」→「療養計画書」→「新規作成」。

- **主病は 糖尿病／高血圧症／脂質異常症 のどれか**。病名から自動でチェックが入るが、**「〜の疑い」でも付く**（2026-09-27、糖尿病の疑い で糖尿病に ✓ が入っていた）。必ず見直す
- 傷病名の主病（★）が肥満症などのままだと療養計画書と食い違う。主病の付け替えを医師に確認する（勝手に変えない）
- 作る前に、継続管理（生活習慣病管理料）の方針か確かめる。「来年の健診で確認」などなら計画書はそぐわない
- 入力の癖
  - チェックボックスは隠し `input[type=checkbox]` の直前にある `button` を `.click()`。`input.checked` で確認
  - テキスト・textarea・select はネイティブ value setter ＋ `input`／`change`
  - 目標欄の値（68.0 など）は placeholder。空なので自分で入れる
  - 採血日: 「採血日を選択」ボタン → `button[aria-label*="2026年9月19日"]` を `.click()` → `2026年09月19日` が入ったか確認
  - 栄養状態の select 値: `good`（良好）／`malnutritionRisk`（低栄養の恐れ）／`obesity`（肥満）
- 「作成」→「療養計画書を作成しました」、一覧に「初回・発行済み」で出る。**初回は患者の署名が要る**ので、印刷して署名をもらうよう報告に書く

## 6. 傷病名

- 整理案（疑い病名の転帰を中止、追加、主病）は報告で出して、**医師の OK をもらってから** `/karte` スキルの手順で入力する
- 転帰日・開始日は診療日（当日）

## 終わったら

- 1人ごとに「何を作って保存したか（版まで）」「空けてある欄」「保留していること」を報告し、次の番号を待つ
- カルテのタブは開いたままでよい（医師がそのまま診察に使う）
