import { useRef } from "react";
import {
  Mic,
  MicOff,
  Music,
  Pause,
  Play,
  Power,
  Upload,
  AlertTriangle,
} from "lucide-react";
import { useMixer } from "@/hooks/useMixer";
import { MAX_MIC_GAIN } from "@/audio/mixer";
import { VolumeSlider } from "@/components/VolumeSlider";
import { cn } from "@/lib/utils";

export function App() {
  const { engine, state } = useMixer();
  const fileRef = useRef<HTMLInputElement>(null);

  // 起動前: 単一の「開始」ジェスチャで AudioContext とマイク権限を確保する
  if (!state.ready) {
    return (
      <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
        <div className="flex size-16 items-center justify-center rounded-2xl bg-card">
          <Mic className="size-8 text-accent" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">院内ミキサー</h1>
          <p className="mt-2 max-w-sm text-sm text-muted-foreground">
            開始すると音声の出力を準備し、マイクの使用許可を求めます。出力先は Windows
            の既定の再生デバイス（Bluetoothスピーカー）になります。
          </p>
        </div>
        <button
          onClick={() => engine.start()}
          className="flex items-center gap-2 rounded-xl bg-primary px-6 py-3 font-semibold text-primary-foreground transition hover:opacity-90"
        >
          <Power className="size-5" />
          ミキサーを開始
        </button>
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col gap-5 px-5 py-8">
      <header className="flex items-center gap-3">
        <div className="flex size-10 items-center justify-center rounded-xl bg-card">
          <Mic className="size-5 text-accent" />
        </div>
        <h1 className="text-lg font-bold">院内ミキサー</h1>
      </header>

      {state.micError && (
        <div className="flex items-start gap-2 rounded-xl bg-destructive/15 p-3 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div className="flex-1">
            <p>{state.micError}</p>
            <button
              onClick={() => engine.retryMic()}
              className="mt-1 font-semibold underline underline-offset-2"
            >
              再試行
            </button>
          </div>
        </div>
      )}

      {/* 放送トグル（主役） */}
      <button
        onClick={() => engine.toggleBroadcast()}
        disabled={!state.micReady}
        className={cn(
          "flex items-center justify-center gap-3 rounded-2xl py-8 text-xl font-bold transition disabled:opacity-50",
          state.broadcasting
            ? "bg-accent text-background shadow-lg shadow-accent/30"
            : "bg-card text-card-foreground hover:bg-secondary"
        )}
      >
        {state.broadcasting ? (
          <>
            <Mic className="size-7" />
            放送中
          </>
        ) : (
          <>
            <MicOff className="size-7" />
            放送オフ
          </>
        )}
      </button>
      <p className="-mt-3 text-center text-xs text-muted-foreground">
        {state.broadcasting
          ? "マイクがスピーカーに出力されています（音楽は自動で小さくなります）"
          : "タップでマイク放送を開始します"}
      </p>

      {/* 音楽プレーヤー */}
      <section className="rounded-2xl bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <Music className="size-4 text-muted-foreground" />
          <span className="flex-1 truncate text-sm">
            {state.trackName ?? (
              <span className="text-muted-foreground">曲が選択されていません</span>
            )}
          </span>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => engine.togglePlay()}
            disabled={!state.trackName}
            className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-secondary py-2.5 font-semibold transition hover:opacity-90 disabled:opacity-40"
          >
            {state.playing ? <Pause className="size-4" /> : <Play className="size-4" />}
            {state.playing ? "一時停止" : "再生"}
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="flex items-center justify-center gap-2 rounded-xl bg-secondary px-4 py-2.5 font-semibold transition hover:opacity-90"
          >
            <Upload className="size-4" />
            読み込む
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="audio/*"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) engine.loadTrack(file);
              e.target.value = "";
            }}
          />
        </div>
      </section>

      {/* 音量 */}
      <section className="flex flex-col gap-4 rounded-2xl bg-card p-4">
        <VolumeSlider
          label="音楽の音量"
          value={state.musicVolume}
          onChange={(v) => engine.setMusicVolume(v)}
          accent="music"
        />
        <VolumeSlider
          label="マイクの音量"
          value={state.micVolume}
          onChange={(v) => engine.setMicVolume(v)}
          accent="mic"
          max={MAX_MIC_GAIN * 100}
        />
        <VolumeSlider
          label="ノイズゲート（雑音カット）"
          value={state.noiseGate}
          onChange={(v) => engine.setNoiseGate(v)}
          accent="gate"
        />
        <VolumeSlider
          label="放送中の音楽音量（ダッキング）"
          value={state.duckVolume}
          onChange={(v) => engine.setDuckVolume(v)}
          accent="duck"
        />
      </section>

      <p className="mt-auto pt-2 text-center text-xs text-muted-foreground">
        出力先は OS の既定の再生デバイスです。Bluetoothスピーカーを既定に設定してください。
      </p>
    </main>
  );
}
