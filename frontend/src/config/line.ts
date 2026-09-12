// LINE友だち追加URL
// 友だち追加URL（lin.ee）ではなくLIFF URLを使う。lin.ee はLIFFを経由しないため
// procyon が流入元（line_users.acquisition_source）を記録できず、ad-metrics の
// lineFollowGoogleAdsCount が常に0件になる。?source= を procyon-line が読んで記録する。
// 未フォローのユーザーにはLIFF起動前に友だち追加画面が出る（LIFFの友だち追加オプション: Aggressive）。
// LIFFアプリは環境ごとに別物。ローカルはSTGを向ける（.env.development）
const LIFF_ID = import.meta.env.PUBLIC_LIFF_ID || "2009473908-qpttVFi9";

// liff.line.me はユニバーサルリンク頼みで、LINEが「どの環境で開かれるか保証しない」と
// 明言している。実機ではアプリが開かずWebログイン画面に落ちた。line.me/R/app は
// LINEのリダイレクタ経由で確実にアプリが開く（procyonのQRコード連携も同形式）。
// 追加のクエリは liff.state に入れると liff.init() がエンドポイントへ引き渡す。
const liffUrl = (source: string) =>
  `https://line.me/R/app/${LIFF_ID}?liff.state=${encodeURIComponent(`/?source=${source}`)}`;

// 通常の友だち追加URL（オーガニック流入）
export const LINE_ADD_FRIEND_URL = liffUrl("organic");

// 広告経由用の友だち追加URL。着地時のクリックIDで媒体を判定して差し替える
// （Google広告は gclid、ヤフー広告は yclid を自動付与する）
export const LINE_ADD_FRIEND_URL_GOOGLE_AD = liffUrl("google_ads");
export const LINE_ADD_FRIEND_URL_YAHOO_AD = liffUrl("yahoo_ads");

// Google広告のコンバージョン計測タグ。
// LINE友だち追加ボタンのクリックを「LINE友だち追加」コンバージョンとして計測する。
// 友だち追加の完了はLINEアプリ内で起きるためサイトからは観測できないので、
// ボタンのクリック（＝追加の意思）をコンバージョンとして数える。実際の追加数は
// procyon の ad-metrics（lineFollowGoogleAdsCount）で答え合わせできる。
// 値は `gads conversion create` で発行されたもの。
export const GOOGLE_ADS_TAG_ID = "AW-17984414455";
export const LINE_CONVERSION_SEND_TO = "AW-17984414455/C3GbCNSDn8ccEPfF0f9C";

// LINEヤフー広告（検索広告）のコンバージョン計測。
// Google側と同じLINE友だち追加ボタンのクリックを計測する。
// サイトジェネラルタグ（ytag.js）はアカウント共通なので値を持たず、
// アカウント固有なのはこの2つだけ。`lyads conversion tag` で再表示できる。
export const YAHOO_CONVERSION_ID = "1001408947";
export const YAHOO_CONVERSION_LABEL = "qpA3CPiE0d8cEKjp0rtE";
