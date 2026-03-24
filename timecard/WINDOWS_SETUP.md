# Windows セットアップ手順（NFC カードリーダー）

Windows では OS がカードリーダーのドライバーを自動で掴むため、WebUSB からアクセスできません。
以下の手順でドライバーを WinUSB に置換してください。

## 手順

1. PaSoRi（RC-S300 / RC-S380）を PC に接続する
2. [Zadig](https://zadig.akeo.ie/) をダウンロードして起動
3. メニューの **Options → List All Devices** にチェック
4. ドロップダウンから **Sony RC-S300** または **RC-S380** を選択
5. 置換先ドライバーが **WinUSB** になっていることを確認
6. **Replace Driver** をクリック

※ RC-S300 でインターフェースが複数表示される場合は、すべてに対して WinUSB を適用してください。

## 置換後

Chrome でタイムカード画面を開き、NFC 接続ボタンを押してカードをかざせば読み取れます。
