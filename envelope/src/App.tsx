import { useEffect, useState } from "react";
import { BookUser, Mail, Plus, Printer, Save, Search, Trash2 } from "lucide-react";
import { EnvelopeBack, EnvelopeFront } from "@/components/Envelope";
import {
  DEFAULT_SENDER,
  DEFAULT_SETTINGS,
  ENVELOPE_SIZES,
  HONORIFICS,
  emptyRecipient,
  getSize,
  lookupAddress,
  postalDigits,
  type EnvelopeSizeId,
  type Honorific,
  type PrintSettings,
  type Recipient,
  type Sender,
  type SenderPosition,
} from "@/lib/envelope";
import { useStoredArray, useStoredObject } from "@/lib/storage";
import { cn } from "@/lib/utils";

const NOTE_SUGGESTIONS = [
  "紹介状在中",
  "診療情報提供書在中",
  "親展",
  "検査結果在中",
  "請求書在中",
  "書類在中",
  "重要書類在中",
];

type PrintJob = { kind: "front"; recipients: Recipient[] } | { kind: "back"; count: number };

export function App() {
  const [book, setBook] = useStoredArray<Recipient>("book");
  const [sender, setSender] = useStoredObject<Sender>("sender", DEFAULT_SENDER);
  const [settings, setSettings] = useStoredObject<PrintSettings>("settings", DEFAULT_SETTINGS);
  const [draft, setDraft] = useState<Recipient>(emptyRecipient);
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [backCount, setBackCount] = useState(1);
  const [job, setJob] = useState<PrintJob | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);

  const size = getSize(settings.sizeId);
  const inBook = book.some((r) => r.id === draft.id);
  const checkedRecipients = book.filter((r) => checked.has(r.id));

  // 印刷用の DOM を描いてから印刷ダイアログを開き、閉じたら片付ける
  useEffect(() => {
    if (!job) return;
    // 裏面に差出人を刷るときは、直前に刷った宛名面と同じ枚数にしておく
    if (job.kind === "front") setBackCount(job.recipients.length);
    const done = () => setJob(null);
    window.addEventListener("afterprint", done, { once: true });
    window.print();
    return () => window.removeEventListener("afterprint", done);
  }, [job]);

  const update = (patch: Partial<Recipient>) => setDraft((d) => ({ ...d, ...patch }));
  const updateSettings = (patch: Partial<PrintSettings>) => setSettings((s) => ({ ...s, ...patch }));

  const fillAddress = async (code: string) => {
    setLookupError(null);
    try {
      const address = await lookupAddress(code);
      if (address) update({ address1: address });
      else setLookupError("該当する住所が見つかりませんでした");
    } catch {
      setLookupError("住所を検索できませんでした（ネット接続を確認）");
    }
  };

  const saveToBook = () => {
    setBook((b) => (inBook ? b.map((r) => (r.id === draft.id ? draft : r)) : [...b, draft]));
  };

  const removeFromBook = (id: string) => {
    setBook((b) => b.filter((r) => r.id !== id));
    setChecked((c) => {
      const next = new Set(c);
      next.delete(id);
      return next;
    });
  };

  const toggleChecked = (id: string) =>
    setChecked((c) => {
      const next = new Set(c);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const draftEmpty = !draft.name && !draft.company && !draft.department;

  return (
    <>
      <style>{`@page { size: ${size.width}mm ${size.height}mm; margin: 0; }`}</style>

      <main className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-[1fr_auto] print:hidden">
        <div className="flex min-w-0 flex-col gap-5">
          <header className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-primary">
              <Mail className="size-5 text-primary-foreground" />
            </div>
            <div>
              <h1 className="text-lg font-bold">封筒印刷</h1>
              <p className="text-xs text-muted-foreground">HL-L8430CDW（多目的トレイ）で封筒に宛名を縦書きで印刷します</p>
            </div>
          </header>

          {/* 差出人の有無。封筒によって印刷済みのものとそうでないものがあるので、毎回目に入る一番上に置く */}
          <Section title="使う封筒">
            <div className="grid gap-2 sm:grid-cols-3">
              {(
                [
                  ["none", "差出人が印刷済みの封筒", "宛名だけ印刷する"],
                  ["front", "無地の封筒（表に差出人）", "宛名面の左下に差出人も入れる"],
                  ["back", "無地の封筒（裏に差出人）", "宛名面のあと、裏返して別に印刷する"],
                ] as [SenderPosition, string, string][]
              ).map(([value, label, description]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => updateSettings({ senderPosition: value })}
                  className={cn(
                    "rounded-lg border p-3 text-left transition",
                    settings.senderPosition === value
                      ? "border-primary bg-primary text-primary-foreground"
                      : "bg-background hover:bg-muted"
                  )}
                >
                  <div className="text-sm font-medium">{label}</div>
                  <div
                    className={cn(
                      "text-xs",
                      settings.senderPosition === value ? "text-primary-foreground/80" : "text-muted-foreground"
                    )}
                  >
                    {description}
                  </div>
                </button>
              ))}
            </div>
            {settings.senderPosition === "back" && (
              <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted p-3 text-sm">
                <span>宛名面を刷ったあと、封筒を裏返してセットし直して</span>
                <input
                  type="number"
                  min={1}
                  className={cn(inputClass, "w-20")}
                  value={backCount}
                  onChange={(e) => setBackCount(Math.max(1, Number(e.target.value) || 1))}
                />
                <span>枚</span>
                <Button onClick={() => setJob({ kind: "back", count: backCount })}>
                  <Printer className="size-4" />
                  裏面を印刷
                </Button>
              </div>
            )}
          </Section>

          {/* 宛先 */}
          <Section title="宛先">
            <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
              <Field label="郵便番号">
                <div className="flex gap-1">
                  <input
                    className={inputClass}
                    value={draft.postalCode}
                    inputMode="numeric"
                    placeholder="980-0803"
                    onChange={(e) => {
                      update({ postalCode: e.target.value });
                      if (postalDigits(e.target.value).length === 7 && !draft.address1) fillAddress(e.target.value);
                    }}
                  />
                  <button
                    type="button"
                    title="郵便番号から住所を入れる"
                    onClick={() => fillAddress(draft.postalCode)}
                    className="shrink-0 rounded-md border bg-background px-2 hover:bg-muted"
                  >
                    <Search className="size-4" />
                  </button>
                </div>
              </Field>
              <Field label="住所" hint={lookupError ?? undefined}>
                <input
                  className={inputClass}
                  value={draft.address1}
                  placeholder="仙台市青葉区国分町3-8-1"
                  onChange={(e) => update({ address1: e.target.value })}
                />
              </Field>
            </div>
            <Field label="建物名・部屋番号（2行目）">
              <input
                className={inputClass}
                value={draft.address2}
                placeholder="勾当台ビル4F"
                onChange={(e) => update({ address2: e.target.value })}
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="会社・病院名">
                <input className={inputClass} value={draft.company} onChange={(e) => update({ company: e.target.value })} />
              </Field>
              <Field label="部署・役職">
                <input
                  className={inputClass}
                  value={draft.department}
                  onChange={(e) => update({ department: e.target.value })}
                />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
              <Field label="氏名（空欄なら部署名か会社名を大きく入れる）">
                <input
                  className={inputClass}
                  value={draft.name}
                  placeholder="山田　太郎"
                  onChange={(e) => update({ name: e.target.value })}
                />
              </Field>
              <Field label="敬称">
                <select
                  className={inputClass}
                  value={draft.honorific}
                  onChange={(e) => update({ honorific: e.target.value as Honorific })}
                >
                  {HONORIFICS.map((h) => (
                    <option key={h} value={h}>
                      {h || "（なし）"}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="外脇付け（赤枠で左に入れる）">
              <input
                className={inputClass}
                value={draft.note}
                placeholder="紹介状在中・親展など（自由に入力も可）"
                onChange={(e) => update({ note: e.target.value })}
              />
            </Field>
            <div className="-mt-1 flex flex-wrap gap-1.5">
              {NOTE_SUGGESTIONS.map((n) => (
                <button
                  key={n}
                  type="button"
                  onClick={() => update({ note: draft.note === n ? "" : n })}
                  className={cn(
                    "rounded-full border px-2.5 py-0.5 text-xs transition",
                    draft.note === n
                      ? "border-[#e60012] bg-[#e60012] text-white"
                      : "bg-background text-muted-foreground hover:bg-muted"
                  )}
                >
                  {n}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              <Button primary disabled={draftEmpty} onClick={() => setJob({ kind: "front", recipients: [draft] })}>
                <Printer className="size-4" />
                この宛先を印刷
              </Button>
              <Button disabled={draftEmpty} onClick={saveToBook}>
                <Save className="size-4" />
                {inBook ? "宛先帳を更新" : "宛先帳に保存"}
              </Button>
              <Button onClick={() => setDraft(emptyRecipient())}>
                <Plus className="size-4" />
                新しい宛先
              </Button>
            </div>
          </Section>

          {/* 宛先帳 */}
          <Section
            title="宛先帳"
            icon={<BookUser className="size-4" />}
            note="このPCのブラウザにだけ保存されます"
          >
            {book.length === 0 ? (
              <p className="text-sm text-muted-foreground">よく送る宛先は「宛先帳に保存」で登録できます。</p>
            ) : (
              <ul className="divide-y rounded-md border">
                {book.map((r) => (
                  <li
                    key={r.id}
                    className={cn("flex items-center gap-3 px-3 py-2 text-sm", r.id === draft.id && "bg-muted")}
                  >
                    <input
                      type="checkbox"
                      className="size-4"
                      checked={checked.has(r.id)}
                      onChange={() => toggleChecked(r.id)}
                    />
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setDraft(r)}>
                      <div className="truncate font-medium">
                        {[r.company, r.department, r.name].filter(Boolean).join("　")}
                        {r.honorific && <span className="text-muted-foreground">　{r.honorific}</span>}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        〒{r.postalCode}　{r.address1}
                        {r.address2}
                      </div>
                    </button>
                    <button
                      type="button"
                      title="宛先帳から消す"
                      onClick={() => removeFromBook(r.id)}
                      className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {book.length > 0 && (
              <div>
                <Button
                  primary
                  disabled={checkedRecipients.length === 0}
                  onClick={() => setJob({ kind: "front", recipients: checkedRecipients })}
                >
                  <Printer className="size-4" />
                  チェックした宛先をまとめて印刷（{checkedRecipients.length}枚）
                </Button>
              </div>
            )}
          </Section>

          {/* 印刷設定 */}
          <Section title="印刷設定">
            <Field label="封筒">
              <select
                className={inputClass}
                value={settings.sizeId}
                onChange={(e) => updateSettings({ sizeId: e.target.value as EnvelopeSizeId })}
              >
                {ENVELOPE_SIZES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </Field>
            <div className="flex flex-col gap-2 text-sm">
              <Check
                checked={settings.kanjiNumerals}
                onChange={(v) => updateSettings({ kanjiNumerals: v })}
                label="住所の数字を漢数字にする（3-8-1 → 三ー八ー一）"
              />
              <Check
                checked={settings.postalBoxes}
                onChange={(v) => updateSettings({ postalBoxes: v })}
                label="郵便番号を枠に合わせて入れる（枠のない封筒ならオフ）"
              />
              {settings.postalBoxes && (
                <Check
                  checked={settings.drawPostalBoxes}
                  onChange={(v) => updateSettings({ drawPostalBoxes: v })}
                  label="郵便番号枠も印刷する（普通紙に試し刷りして封筒と重ね、位置を合わせる用）"
                />
              )}
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <NumberField
                label="全体 →右（mm）"
                value={settings.offsetX}
                onChange={(v) => updateSettings({ offsetX: v })}
              />
              <NumberField
                label="全体 ↓下（mm）"
                value={settings.offsetY}
                onChange={(v) => updateSettings({ offsetY: v })}
              />
              <NumberField
                label="郵便番号 →右（mm）"
                value={settings.postalOffsetX}
                onChange={(v) => updateSettings({ postalOffsetX: v })}
              />
              <NumberField
                label="郵便番号 ↓下（mm）"
                value={settings.postalOffsetY}
                onChange={(v) => updateSettings({ postalOffsetY: v })}
              />
            </div>
          </Section>

          {/* 差出人 */}
          <Section title="差出人">
            <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
              <Field label="郵便番号">
                <input
                  className={inputClass}
                  value={sender.postalCode}
                  onChange={(e) => setSender({ ...sender, postalCode: e.target.value })}
                />
              </Field>
              <Field label="住所">
                <input
                  className={inputClass}
                  value={sender.address1}
                  onChange={(e) => setSender({ ...sender, address1: e.target.value })}
                />
              </Field>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="建物名">
                <input
                  className={inputClass}
                  value={sender.address2}
                  onChange={(e) => setSender({ ...sender, address2: e.target.value })}
                />
              </Field>
              <Field label="電話">
                <input
                  className={inputClass}
                  value={sender.tel}
                  onChange={(e) => setSender({ ...sender, tel: e.target.value })}
                />
              </Field>
            </div>
            <Field label="名前">
              <input
                className={inputClass}
                value={sender.name}
                onChange={(e) => setSender({ ...sender, name: e.target.value })}
              />
            </Field>
            <div>
              <Button onClick={() => setSender(DEFAULT_SENDER)}>クリニックの住所に戻す</Button>
            </div>
          </Section>
        </div>

        {/* プレビューと印刷の手順 */}
        <aside className="flex flex-col items-center gap-4 lg:sticky lg:top-6 lg:self-start">
          <div className="rounded-lg shadow-md ring-1 ring-black/10" style={{ zoom: 560 / (size.height * 3.78) }}>
            <EnvelopeFront recipient={draft} sender={sender} settings={settings} />
          </div>
          <ol className="w-80 list-decimal space-y-1 rounded-lg border bg-card p-4 pl-8 text-xs leading-relaxed text-muted-foreground">
            <li>封筒を多目的トレイに印刷面を上にしてセット（初めての封筒は1枚で向きを確かめる）</li>
            <li>
              印刷ダイアログでプリンタ <b className="text-foreground">HL-L8430CDW_A4</b>、用紙サイズ{" "}
              <b className="text-foreground">{size.label.replace(/（.*$/, "")}</b>、倍率{" "}
              <b className="text-foreground">100%（既定）</b>、余白 <b className="text-foreground">なし</b>
            </li>
            <li>
              トレイや用紙の種類（封筒）を指定するときは「システム ダイアログを使用して印刷」（Ctrl+Shift+P）から
            </li>
            <li>ずれたら「全体」「郵便番号」の mm を調整（設定はこのPCに保存される）</li>
          </ol>
        </aside>
      </main>

      {/* 印刷用（画面には出さない） */}
      <div className="hidden print:block">
        {job?.kind === "front" &&
          job.recipients.map((r) => <EnvelopeFront key={r.id} recipient={r} sender={sender} settings={settings} />)}
        {job?.kind === "back" &&
          Array.from({ length: job.count }, (_, i) => <EnvelopeBack key={i} sender={sender} settings={settings} />)}
      </div>
    </>
  );
}

const inputClass =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring";

function Section({
  title,
  icon,
  note,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border bg-card p-4">
      <h2 className="flex items-center gap-2 text-sm font-bold">
        {icon}
        {title}
        {note && <span className="text-xs font-normal text-muted-foreground">{note}</span>}
      </h2>
      {children}
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex min-w-0 flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="text-xs text-destructive">{hint}</span>}
    </label>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number; onChange: (v: number) => void }) {
  return (
    <Field label={label}>
      <input
        type="number"
        step={0.5}
        className={inputClass}
        value={value}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
      />
    </Field>
  );
}

function Check({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="flex items-start gap-2">
      <input type="checkbox" className="mt-0.5 size-4" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function Button({
  primary = false,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { primary?: boolean }) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition disabled:opacity-40",
        primary ? "bg-primary text-primary-foreground hover:opacity-90" : "border bg-background hover:bg-muted",
        className
      )}
      {...props}
    />
  );
}
