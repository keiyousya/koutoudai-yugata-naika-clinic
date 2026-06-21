import { cn } from "@/lib/utils";

type Props = {
  label: string;
  value: number; // 0..1
  onChange: (v: number) => void;
  disabled?: boolean;
  accent?: "music" | "mic" | "duck";
};

const accentClass: Record<NonNullable<Props["accent"]>, string> = {
  music: "accent-sky-400",
  mic: "accent-emerald-400",
  duck: "accent-amber-400",
};

export function VolumeSlider({ label, value, onChange, disabled, accent = "music" }: Props) {
  return (
    <label className={cn("block", disabled && "opacity-50")}>
      <div className="mb-1.5 flex items-baseline justify-between">
        <span className="text-sm font-medium text-card-foreground">{label}</span>
        <span className="text-xs tabular-nums text-muted-foreground">
          {Math.round(value * 100)}
        </span>
      </div>
      <input
        type="range"
        min={0}
        max={100}
        value={Math.round(value * 100)}
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
