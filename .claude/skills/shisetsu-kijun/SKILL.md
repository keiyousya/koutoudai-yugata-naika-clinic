---
name: shisetsu-kijun
description: 東北厚生局のHPで、当院（医療機関コード 5119874）の施設基準の受理状況・失効・届出受理医療機関名簿をChrome操作で確認する。「施設基準が受理されたか確認して」「うちの施設基準の届出状況を調べて」と頼まれたときに使う。
argument-hint: "[確認したい施設基準や期間（省略時は全件）]"
---

# 施設基準の受理状況確認（東北厚生局）

依頼内容: $ARGUMENTS

## 前提

- 当院: **勾当台夕方内科クリニック / 医療機関コード 5119874**（名簿上の住所は 仙台市青葉区国分町３丁目８－１勾当台ビル４０１号室）
- R7.8.1 算定開始分以降、受理番号の郵送通知は無い。**厚生局HPの掲載が唯一の受理通知**
- kouseikyoku.mhlw.go.jp は Bash(curl) / WebFetch からは名前解決できない。**Chrome（claude-in-chrome）で操作する**
- PDF はダウンロード不要。同一オリジンのHTMLページ上で JS から fetch し、pdf.js で読む（下記）

## 見る場所

| 資料 | URL | 内容・更新 |
|---|---|---|
| 施設基準の受理状況 | https://kouseikyoku.mhlw.go.jp/tohoku/gyomu/gyomu/hoken_kikan/kijun_jurijoukyou.html | 期間ごとの「新規・変更」「失効」PDF。**毎月20日・月末**に掲載。受付から掲載まで約1か月 |
| 届出受理医療機関名簿（全体） | https://kouseikyoku.mhlw.go.jp/tohoku/gyomu/gyomu/hoken_kikan/documents/201805koushin.html | 県別・月1回の時点スナップショット（「令和X年X月1日現在」）。宮城医科は700ページ超 |
| 略称一覧 | 受理状況ページ内「略称一覧（令和8年度報酬改定）」 | （外医ＤＸ３）等の正式名称 |

PDF のファイル名規則（リンクは毎回ページから取り直すこと）:
- 受理状況: `shinki_04miyagi_ika_YYYYMMDD.pdf`（新規・変更）、`jitai_04miyagi_ika_YYYYMMDD.pdf`（失効）
- 名簿: `shisetsu-04miyagi-ika-rXXYY.pdf`

## 手順

1. `tabs_context_mcp` → 受理状況ページへ `navigate`
2. **受理状況PDFを一括検索**（ページ上で `javascript_tool` 実行）。医科の新規・変更／失効の全PDFから 5119874 の行を抜き出す:

   ```js
   const lib = await import('https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.min.mjs');
   lib.GlobalWorkerOptions.workerSrc = 'https://cdn.jsdelivr.net/npm/pdfjs-dist@4.10.38/build/pdf.worker.min.mjs';
   const urls = [...new Set([...document.querySelectorAll('main a')].map(a => a.href).filter(h => /miyagi_ika/.test(h)))];
   const out = [];
   for (const u of urls) {
     const doc = await lib.getDocument({ data: await (await fetch(u)).arrayBuffer() }).promise;
     let txt = '';
     for (let i = 1; i <= doc.numPages; i++) txt += (await (await doc.getPage(i)).getTextContent()).items.map(x => x.str).join(' ') + ' ';
     const i = txt.indexOf('5119874');
     if (i < 0) { out.push(u.split('/').pop() + ': no hit'); continue; }
     const m = txt.slice(i + 7).search(/\s5\d{6}\s/); // 次の医療機関コードまで
     out.push(u.split('/').pop() + ': ' + txt.slice(i, i + 7 + (m < 0 ? 600 : m)));
   }
   out.join('\n')
   ```

   受理状況PDFは「コード → 名称 → 住所 → 施設基準名 → 受理番号 → 算定開始年月日」の順でテキストが素直に並ぶ。出力が長くて切れたら `urls.slice(n)` で分割する。

3. **名簿で全体を確認**（任意。受理状況ページには直近1年分程度しか載らないため、それ以前の届出も含めた全件を見たいとき）
   - 名簿ページへ移動し、宮城県「医科」PDF の URL を取得して同様に読み込む
   - **注意: 名簿PDFは横向きレイアウトで、テキスト順に読むと隣の医療機関の受理番号と取り違える**。座標で列を拾うこと:

   ```js
   // doc = 名簿PDF。5119874 を含むページで
   const items = (await page.getTextContent()).items.map(x => [Math.round(x.transform[4]), Math.round(x.transform[5]), x.str]);
   const code = items.find(x => x[2].includes('5119874'));
   // 1医療機関 = x が code[0] から次の医療機関の x まで（約50px幅）の縦列
   items.filter(x => x[0] >= code[0] - 5 && x[0] < code[0] + 45).sort((a, b) => a[0] - b[0] || b[1] - a[1])
   ```

   - 名簿は「X月1日現在」時点なので、それ以降に受理された分は受理状況PDFの方にしか無い

## 報告のしかた

- 受理済み施設基準を表にする: 施設基準名 / 受理番号 / 算定開始日 / 掲載日（どの回のPDFか）
- 失効リストへの掲載有無を明記する
- 届け出たのにまだ載っていないものがあれば、掲載タイミング（20日・月末、約1か月遅れ）を踏まえて「次回掲載見込み」か「要問い合わせ」かを書く
- 名簿上の登録情報（住所・電話番号）に実態との食い違いがあれば指摘する
- 問い合わせ先は東北厚生局 宮城事務所（各データの問い合わせは県事務所へ）
- 確認できた受理番号・算定開始日は `shisetsu-kijun/README.md` の台帳と各基準の README に反映する
  （施設基準の管理は `shisetsu-kijun/` に集約している）
