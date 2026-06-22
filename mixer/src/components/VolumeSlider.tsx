import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type Props = {
  label: string;
  value: number; // 0..1（mic のみ 0..max/100）
  onChange: (v: number) => void;
  disabled?: boolean;
  accent?: "music" | "mic" | "duck";
  /** スライダー／入力欄のパーセント上限。既定 100 */
  max?: number;
};

const accentClass: Record<NonNullable<Props["accent"]>, string> = {
  music: "accent-sky-400",
  mic: "accent-emerald-400",
  duck: "accent-amber-400",
};

export function VolumeSlider({
  label,
  value,
  onChange,
  disabled,
  accent = "music",
  max = 100,
}: Props) {
  const percent = Math.round(value * 100);
  // テキスト入力は途中（空文字など）を許すため別途ローカルに保持し、
  // 外部値（スライダー操作）の変化をミラーする。
  const [text, setText] = useState(String(percent));
  useEffect(() => {
    setText(String(percent));
  }, [percent]);

  const commit = (raw: string) => {
    if (raw.trim() === "") return; // 入力途中の空欄は確定しない
    const n = Number(raw);
    if (Number.isNaN(n)) return;
    const clamped = Math.min(max, Math.max(0, Math.round(n)));
    onChange(clamped / 100);
  };

  return (
    <label className={cn("block", disabled && "opacity-50")}>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-sm font-medium text-card-foreground">{label}</span>
        <div className="flex items-baseline gap-0.5 text-xs text-muted-foreground">
          <input
            type="number"
            min={0}
            max={max}
            value={text}
            disabled={disabled}
            onChange={(e) => {
              setText(e.target.value);
              commit(e.target.value);
            }}
            onBlur={() => setText(String(percent))}
            className="w-12 rounded bg-secondary px-1.5 py-0.5 text-right tabular-nums text-card-foreground outline-none focus:ring-1 focus:ring-accent"
          />
          <span>%</span>
        </div>
      </div>
      <input
        type="range"
        min={0}
        max={max}
        value={percent}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value) / 100)}
        className={cn(
          "h-2 w-full cursor-pointer appearance-none rounded-full bg-secondary",
          accentClass[accent]
        )}
      />
    </label>
  );
}
