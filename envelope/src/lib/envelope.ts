// 封筒のサイズ・差出人・縦書き用の文字変換

export type EnvelopeSizeId = "chou3" | "chou4";

export interface EnvelopeSize {
  id: EnvelopeSizeId;
  label: string;
  /** mm（縦長に置いたときの幅・高さ） */
  width: number;
  height: number;
  /** 宛名の基準の文字サイズ（pt） */
  nameFontPt: number;
  addressFontPt: number;
}

// HL-L8430CDW のドライバに定形サイズとして登録されているものだけ。
// 角形2号（幅240mm）は多目的トレイの最大幅 215.9mm を超えるので通らない
export const ENVELOPE_SIZES: EnvelopeSize[] = [
  { id: "chou3", label: "長形3号（120×235mm・A4三つ折り）", width: 120, height: 235, nameFontPt: 26, addressFontPt: 14 },
  { id: "chou4", label: "長形4号（90×205mm・B5三つ折り）", width: 90, height: 205, nameFontPt: 22, addressFontPt: 12 },
];

export const HONORIFICS = ["様", "御中", "先生", "殿", "侍史", "御侍史", ""] as const;
export type Honorific = (typeof HONORIFICS)[number];

export interface Recipient {
  id: string;
  postalCode: string;
  address1: string;
  address2: string;
  company: string;
  department: string;
  name: string;
  honorific: Honorific;
  /** 外脇付け（親展・請求書在中など）。赤枠で左側に入れる */
  note: string;
}

export interface Sender {
  postalCode: string;
  address1: string;
  address2: string;
  name: string;
  tel: string;
}

export type SenderPosition = "front" | "back" | "none";

export interface PrintSettings {
  sizeId: EnvelopeSizeId;
  senderPosition: SenderPosition;
  /** 数字を漢数字にする（縦書きで読みやすい） */
  kanjiNumerals: boolean;
  /** 郵便番号枠に合わせて印字する。枠のない封筒なら false で「〒」付きの文字にする */
  postalBoxes: boolean;
  /** 位置合わせ用に郵便番号枠も印刷する（普通紙に試し刷りして封筒と重ねる） */
  drawPostalBoxes: boolean;
  /** 郵便番号の位置の微調整（mm、右・下がプラス） */
  postalOffsetX: number;
  postalOffsetY: number;
  /** 全体の位置の微調整（mm、右・下がプラス）。プリンタの給紙のずれを吸収する */
  offsetX: number;
  offsetY: number;
}

export const DEFAULT_SENDER: Sender = {
  postalCode: "980-0803",
  address1: "仙台市青葉区国分町3-8-1",
  address2: "勾当台ビル4F",
  name: "勾当台夕方内科クリニック",
  tel: "022-393-8689",
};

export const DEFAULT_SETTINGS: PrintSettings = {
  sizeId: "chou3",
  senderPosition: "front",
  kanjiNumerals: true,
  postalBoxes: true,
  drawPostalBoxes: false,
  postalOffsetX: 0,
  postalOffsetY: 0,
  offsetX: 0,
  offsetY: 0,
};

export function emptyRecipient(): Recipient {
  return {
    id: crypto.randomUUID(),
    postalCode: "",
    address1: "",
    address2: "",
    company: "",
    department: "",
    name: "",
    honorific: "様",
    note: "",
  };
}

export function getSize(id: EnvelopeSizeId): EnvelopeSize {
  return ENVELOPE_SIZES.find((s) => s.id === id) ?? ENVELOPE_SIZES[0];
}

/** 郵便番号から数字7桁だけを取り出す */
export function postalDigits(code: string): string {
  return toHalfWidth(code).replace(/\D/g, "").slice(0, 7);
}

export function formatPostalCode(code: string): string {
  const d = postalDigits(code);
  return d.length > 3 ? `${d.slice(0, 3)}-${d.slice(3)}` : d;
}

function toHalfWidth(s: string): string {
  return s.replace(/[０-９Ａ-Ｚａ-ｚ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
}

const KANJI_DIGITS = "〇一二三四五六七八九";

/**
 * 縦書き用に整える。text-orientation: upright で組むので英字はそのまま立つが、
 * ハイフンは横棒のままになるので長音符にする
 */
export function toVertical(s: string, kanjiNumerals: boolean): string {
  let out = toHalfWidth(s).replace(/[-‐－−–—ｰ]/g, "ー");
  if (kanjiNumerals) {
    out = out.replace(/[0-9]/g, (d) => KANJI_DIGITS[Number(d)]);
  }
  return out;
}

/**
 * 郵便番号枠の位置（封筒の右上角からの距離、mm）。
 * 日本郵便の定形封筒の枠（はがきと同じ寸法）: 上端から12mm、高さ8mm、
 * 上3桁は幅5.7mm・7.0mm間隔、下4桁は幅5.0mm・6.8mm間隔
 */
export const POSTAL_BOX = {
  top: 12,
  height: 8,
  boxes: [
    ...[0, 1, 2].map((i) => ({ fromRight: 55.7 - 7.0 * i, width: 5.7 })),
    ...[0, 1, 2, 3].map((i) => ({ fromRight: 34.2 - 6.8 * i, width: 5.0 })),
  ],
};

/** 郵便番号から住所を引く（zipcloud。CORS可） */
export async function lookupAddress(code: string): Promise<string | null> {
  const d = postalDigits(code);
  if (d.length !== 7) return null;
  const res = await fetch(`https://zipcloud.ibsnet.co.jp/api/search?zipcode=${d}`);
  if (!res.ok) return null;
  const json = (await res.json()) as {
    results: { address1: string; address2: string; address3: string }[] | null;
  };
  const r = json.results?.[0];
  return r ? `${r.address1}${r.address2}${r.address3}` : null;
}
