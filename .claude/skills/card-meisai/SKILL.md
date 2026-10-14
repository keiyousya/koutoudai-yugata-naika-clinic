---
name: card-meisai
description: 七十七カード（加盟店）のクレジット・電子マネー売上のお振込明細を、JCB Link と七十七カード加盟店インターネットサービス（Vpass/Visa）からChrome操作で取得し、HLプリンタで印刷する。「77カードの明細を印刷して」「カードの振込明細出して」と頼まれたときに使う。
---

# 77カード 振込明細の印刷

当院のカード決済の入金明細は2系統ある。**両方印刷する**。

| 系統 | サイト | 中身 |
|------|--------|------|
| JCB Link | https://www.jcblink.jcb.co.jp/ （支払先番号 156941145） | JCB・AMEX・電子マネー・QUICPay・PayPay等 |
| 七十七カード 加盟店インターネットサービス | https://www3.vpass.ne.jp/kamei/top/index.jsp?cc=043 （代表加盟店番号 96203114） | Visa/Mastercard |

ログインはChromeの自動入力で埋まるが、**ログインボタンはユーザーに押してもらう**。

## 1. JCB Link

1. ホームの「最新の振込情報」→「詳細」（振込情報詳細画面）
2. 「振込情報PDF」→ `~/Downloads/payment_notification-156941145_YYYY-MM-DD_0100.pdf` に保存される（2ページ）

## 2. 七十七カード（Visa）

1. 「お振込金額照会」→ 締め日をプルダウンで選んで「照会」（既定は最新）
2. 「印刷用ページを表示」→ 別タブで `index_prt.html` が開く
3. Chromeの印刷ダイアログはツールから操作できないので、そのタブでHTMLを保存してローカルのheadless ChromeでPDF化する:

   ```js
   const d=document.documentElement.cloneNode(true); d.querySelectorAll('script').forEach(s=>s.remove());
   const b=document.createElement('base'); b.href=location.href; d.querySelector('head').prepend(b);
   const st=document.createElement('style');
   st.textContent='@page{size:A4 landscape;margin:8mm} *{-webkit-print-color-adjust:exact;print-color-adjust:exact} [id^="claude-"]{display:none !important}';
   d.querySelector('head').append(st);
   const a=document.createElement('a'); a.href=URL.createObjectURL(new Blob(['<!doctype html>'+d.outerHTML],{type:'text/html'}));
   a.download='77card-visa-furikomi-YYYYMMDD.html'; a.click();
   ```

   `[id^="claude-"]` は Claude in Chrome のオーバーレイ（枠の光・カーソル・下部バー）を消すため。忘れると印刷に写り込む。

   ```bash
   "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless=new --disable-gpu \
     --user-data-dir=<scratchpad>/prof --no-pdf-header-footer \
     --print-to-pdf=<scratchpad>/visa.pdf "file://$HOME/Downloads/77card-visa-furikomi-YYYYMMDD.html"
   ```

## 3. 印刷

印刷前に `sips -s format png X.pdf --out X.png` で1ページ目を目視確認してから:

```bash
lpr -P Brother_HL_L8430CDW -o media=A4 <JCBのPDF> <visa.pdf>
lpstat -o Brother_HL_L8430CDW   # 空になれば完了
```

関連: 税理士（オルタス）の請求書の印刷は `/ortus-seikyusho`。
