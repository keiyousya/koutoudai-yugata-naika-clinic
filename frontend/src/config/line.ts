// LINE友だち追加URL
// 通常の友だち追加URL（オーガニック流入）
export const LINE_ADD_FRIEND_URL = "https://lin.ee/o8VUXOX";

// Google広告経由用の友だち追加URL（LINE公式アカウントで発行した経路別URL）
// gclid 付きでアクセスされた場合にこちらへ差し替える（広告効果測定用）
export const LINE_ADD_FRIEND_URL_AD = "https://lin.ee/u6iGqFj";

// Google広告のコンバージョン計測タグ。
// LINE友だち追加ボタンのクリックを「LINE友だち追加」コンバージョンとして計測する。
// 友だち追加の完了はLINEアプリ内で起きるためサイトからは観測できないので、
// ボタンのクリック（＝追加の意思）をコンバージョンとして数える。実際の追加数は
// LINE公式アカウントの経路別URL（u6iGqFj）の友だち数で答え合わせできる。
// 値は `gads conversion create` で発行されたもの。
export const GOOGLE_ADS_TAG_ID = "AW-17984414455";
export const LINE_CONVERSION_SEND_TO = "AW-17984414455/C3GbCNSDn8ccEPfF0f9C";

// LINEヤフー広告（検索広告）のコンバージョン計測。
// Google側と同じLINE友だち追加ボタンのクリックを計測する。
// サイトジェネラルタグ（ytag.js）はアカウント共通なので値を持たず、
// アカウント固有なのはこの2つだけ。`lyads conversion tag` で再表示できる。
export const YAHOO_CONVERSION_ID = "1001408947";
export const YAHOO_CONVERSION_LABEL = "qpA3CPiE0d8cEKjp0rtE";
