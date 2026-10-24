import type { CSSProperties } from "react";
import {
  POSTAL_BOX,
  formatPostalCode,
  getSize,
  postalDigits,
  toVertical,
  type PrintSettings,
  type Recipient,
  type Sender,
} from "@/lib/envelope";

const PT_TO_MM = 0.3528;

// 縦書きの組み方。英字も立てて組み、数字は toVertical で漢数字か全角相当にする
const vertical: CSSProperties = {
  writingMode: "vertical-rl",
  textOrientation: "upright",
  whiteSpace: "nowrap",
};

const mincho = '"Yu Mincho", "YuMincho", "BIZ UDMincho", "Hiragino Mincho ProN", serif';

interface SheetProps {
  settings: PrintSettings;
  children: React.ReactNode;
}

/** 封筒1枚ぶんの用紙。実寸（mm）で組み、印刷時は1枚1ページになる */
function Sheet({ settings, children }: SheetProps) {
  const size = getSize(settings.sizeId);
  return (
    <div
      className="envelope-sheet relative overflow-hidden bg-white text-black"
      style={{ width: `${size.width}mm`, height: `${size.height}mm`, fontFamily: mincho }}
    >
      <div
        className="absolute inset-0"
        style={{ transform: `translate(${settings.offsetX}mm, ${settings.offsetY}mm)` }}
      >
        {children}
      </div>
    </div>
  );
}

function PostalCode({ code, settings }: { code: string; settings: PrintSettings }) {
  const size = getSize(settings.sizeId);
  const digits = postalDigits(code);

  if (!settings.postalBoxes) {
    return digits ? (
      <div
        className="absolute"
        style={{ top: "12mm", right: "10mm", fontSize: `${size.addressFontPt}pt`, letterSpacing: "0.05em" }}
      >
        〒{formatPostalCode(code)}
      </div>
    ) : null;
  }

  return (
    <>
      {POSTAL_BOX.boxes.map((box, i) => (
        <div
          key={i}
          className="absolute flex items-center justify-center"
          style={{
            left: `${size.width - box.fromRight + settings.postalOffsetX}mm`,
            top: `${POSTAL_BOX.top + settings.postalOffsetY}mm`,
            width: `${box.width}mm`,
            height: `${POSTAL_BOX.height}mm`,
            border: settings.drawPostalBoxes ? "0.3mm solid #e60012" : undefined,
            fontFamily: 'Arial, "Helvetica Neue", sans-serif',
            fontSize: "5.6mm",
            lineHeight: 1,
          }}
        >
          {digits[i] ?? ""}
        </div>
      ))}
    </>
  );
}

/** 宛名面 */
export function EnvelopeFront({
  recipient,
  sender,
  settings,
}: {
  recipient: Recipient;
  sender: Sender;
  settings: PrintSettings;
}) {
  const size = getSize(settings.sizeId);
  const k = size.height / 235; // 長3を基準に縦方向の位置を縮める
  const v = (s: string) => toVertical(s, settings.kanjiNumerals);

  // 個人名がなければ部署名、それもなければ会社名を主役（大きい字）にする
  const main = recipient.name || recipient.department || recipient.company;
  const subs = recipient.name
    ? [recipient.company, recipient.department]
    : recipient.department
      ? [recipient.company]
      : [];

  // 長い名前は下端（差出人の上あたり）に収まるよう字を小さくする
  const nameTop = 45 * k;
  const nameBottom = 22 * k;
  const nameChars = [...main].length + (recipient.honorific ? [...recipient.honorific].length + 0.5 : 0);
  const fitPt = (size.height - nameTop - nameBottom) / (nameChars * 1.15) / PT_TO_MM;
  const namePt = Math.min(size.nameFontPt, fitPt);

  return (
    <Sheet settings={settings}>
      <PostalCode code={recipient.postalCode} settings={settings} />

      {/* 住所（右端）と会社名・部署名 */}
      <div
        className="absolute"
        style={{
          ...vertical,
          top: `${30 * k}mm`,
          right: "10mm",
          height: `${size.height - 30 * k - nameBottom}mm`,
          fontSize: `${size.addressFontPt}pt`,
          lineHeight: 1.5,
          letterSpacing: "0.05em",
        }}
      >
        <p>{v(recipient.address1)}</p>
        {recipient.address2 && <p style={{ paddingTop: "2em" }}>{v(recipient.address2)}</p>}
        {subs.filter(Boolean).map((s, i) => (
          // 病院名・診療科は住所より一回り大きくする
          <p
            key={i}
            style={{
              fontSize: "1.25em",
              paddingTop: `${(i + 1) * 1.2}em`,
              marginRight: i === 0 ? "0.4em" : 0,
            }}
          >
            {v(s)}
          </p>
        ))}
      </div>

      {/* 宛名（中央） */}
      <div
        className="absolute"
        style={{
          ...vertical,
          top: `${nameTop}mm`,
          left: "50%",
          transform: "translateX(-50%)",
          fontSize: `${namePt}pt`,
          fontWeight: 600,
          letterSpacing: "0.15em",
          lineHeight: 1,
        }}
      >
        {v(main)}
        {recipient.honorific && <span style={{ paddingTop: "0.5em" }}>{recipient.honorific}</span>}
      </div>

      {/* 外脇付け（親展・紹介状在中など）。宛名の左に置く。差出人が表の下部に印刷済みの封筒でもかぶらないよう、常に差出人欄より上にする */}
      {recipient.note && (
        <div
          className="absolute"
          style={{
            ...vertical,
            bottom: `${98 * k}mm`,
            left: `${14 * (size.width / 120)}mm`,
            padding: "1.5mm 1mm",
            border: "0.4mm solid #e60012",
            color: "#e60012",
            fontSize: `${size.addressFontPt * ([...recipient.note].length > 6 ? 0.85 : 1)}pt`,
            fontWeight: 600,
            letterSpacing: "0.2em",
            lineHeight: 1,
          }}
        >
          {v(recipient.note)}
        </div>
      )}

      {settings.senderPosition === "front" && (
        <SenderBlock sender={sender} settings={settings} style={{ left: "8mm", bottom: `${12 * k}mm` }} />
      )}
    </Sheet>
  );
}

/** 裏面（差出人だけ）。中央の継ぎ目の左に下揃えで入れる */
export function EnvelopeBack({ sender, settings }: { sender: Sender; settings: PrintSettings }) {
  const size = getSize(settings.sizeId);
  const k = size.height / 235;
  return (
    <Sheet settings={settings}>
      <SenderBlock
        sender={sender}
        settings={settings}
        large
        style={{ right: `${size.width / 2 + 3}mm`, bottom: `${20 * k}mm` }}
      />
    </Sheet>
  );
}

function SenderBlock({
  sender,
  settings,
  large = false,
  style,
}: {
  sender: Sender;
  settings: PrintSettings;
  large?: boolean;
  style: CSSProperties;
}) {
  const size = getSize(settings.sizeId);
  const k = size.height / 235;
  const v = (s: string) => toVertical(s, settings.kanjiNumerals);
  const basePt = (large ? 10 : 8.5) * (size.width / 120);

  return (
    <div
      className="absolute"
      style={{
        ...vertical,
        ...style,
        height: `${(large ? 95 : 80) * k}mm`,
        fontSize: `${basePt}pt`,
        lineHeight: 1.6,
        letterSpacing: "0.05em",
      }}
    >
      {/* 住所は上から、名前と電話は下揃え */}
      {sender.postalCode && <p>〒{v(formatPostalCode(sender.postalCode))}</p>}
      <p style={{ paddingTop: "1em" }}>{v(sender.address1)}</p>
      {sender.address2 && <p style={{ paddingTop: "2em" }}>{v(sender.address2)}</p>}
      <p style={{ textAlign: "end", fontSize: "1.45em", fontWeight: 600, marginRight: "0.3em" }}>{v(sender.name)}</p>
      {sender.tel && <p style={{ textAlign: "end" }}>電話　{v(sender.tel)}</p>}
    </div>
  );
}
