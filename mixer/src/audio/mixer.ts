/**
 * MixerEngine — Web Audio ベースの院内放送ミキサー。
 *
 * 信号経路:
 *   <audio>(音楽) ─→ MediaElementSource ─→ musicGain ─┐
 *                                                      ├─→ master ─→ destination(OS既定出力=BTスピーカー)
 *   マイク(getUserMedia) ─→ MediaStreamSource ─→ micGain ┘
 *
 * - 放送ON/OFFは micGain を 0↔micVolume に滑らかにランプして実現。
 * - 放送中は musicGain を duckVolume 倍に下げる（ダッキング）。
 * - クリックノイズを避けるため全ゲイン変更は短いランプで行う。
 */

export type MixerState = {
  /** AudioContext と音楽グラフが初期化済みか */
  ready: boolean;
  /** マイク入力が取得済みか */
  micReady: boolean;
  /** 放送中（マイクON）か */
  broadcasting: boolean;
  /** 音楽再生中か */
  playing: boolean;
  /** 読み込み済みトラック名（未読込なら null） */
  trackName: string | null;
  /** 音楽音量 0..1 */
  musicVolume: number;
  /** マイク音量 0..MAX_MIC_GAIN（1.0=ユニティ、それ以上は増幅） */
  micVolume: number;
  /** 放送中の音楽音量倍率 0..1（ダッキング量） */
  duckVolume: number;
  /** マイク取得失敗時のメッセージ */
  micError: string | null;
};

const RAMP = 0.08; // 秒。ゲイン変更のランプ時間

/**
 * マイク音量の上限（ゲイン倍率）。1.0=ユニティ。
 * PA用途で AGC を切っているぶん素の収音が小さくなりがちなため、
 * 最大 4倍(=400%) まで手動で増幅できるようにしている。
 */
export const MAX_MIC_GAIN = 4;

export class MixerEngine {
  private ctx: AudioContext | null = null;
  private audioEl: HTMLAudioElement | null = null;
  private musicSource: MediaElementAudioSourceNode | null = null;
  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private musicGain: GainNode | null = null;
  private micGain: GainNode | null = null;
  private master: GainNode | null = null;
  private trackUrl: string | null = null;

  private state: MixerState = {
    ready: false,
    micReady: false,
    broadcasting: false,
    playing: false,
    trackName: null,
    musicVolume: 0.8,
    micVolume: 1.6,
    duckVolume: 0.25,
    micError: null,
  };

  private onChange: (s: MixerState) => void;

  constructor(onChange: (s: MixerState) => void) {
    this.onChange = onChange;
  }

  getState(): MixerState {
    return this.state;
  }

  private emit(patch: Partial<MixerState>) {
    this.state = { ...this.state, ...patch };
    this.onChange(this.state);
  }

  /**
   * ユーザー操作（クリック）起点で呼ぶ。AudioContext 生成・音楽グラフ構築・
   * マイク取得をまとめて行う。自動再生制限とマイク権限の双方をこの1ジェスチャで満たす。
   */
  async start(): Promise<void> {
    if (this.ctx) return;
    const ctx = new AudioContext();
    await ctx.resume();
    this.ctx = ctx;

    this.master = ctx.createGain();
    this.master.gain.value = 1;
    this.master.connect(ctx.destination);

    // 音楽グラフ
    const audioEl = new Audio();
    audioEl.crossOrigin = "anonymous";
    audioEl.addEventListener("ended", () => this.emit({ playing: false }));
    audioEl.addEventListener("pause", () => this.emit({ playing: false }));
    audioEl.addEventListener("play", () => this.emit({ playing: true }));
    this.audioEl = audioEl;

    this.musicSource = ctx.createMediaElementSource(audioEl);
    this.musicGain = ctx.createGain();
    this.musicSource.connect(this.musicGain).connect(this.master);

    // マイクグラフ
    this.micGain = ctx.createGain();
    this.micGain.gain.value = 0; // 起動直後は放送OFF
    this.micGain.connect(this.master);

    this.emit({ ready: true });
    this.applyGains(0);

    await this.initMic();
  }

  /** マイクを取得して micGain に接続。PA用途のため通話用処理は無効化する。 */
  private async initMic(): Promise<void> {
    if (!this.ctx || !this.micGain) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
        video: false,
      });
      this.micStream = stream;
      this.micSource = this.ctx.createMediaStreamSource(stream);
      this.micSource.connect(this.micGain);
      this.emit({ micReady: true, micError: null });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.emit({ micReady: false, micError: `マイクを取得できません: ${msg}` });
    }
  }

  /** マイク取得をやり直す（権限拒否後の再試行用）。 */
  async retryMic(): Promise<void> {
    await this.initMic();
  }

  /** 音楽ゲイン・マイクゲインを現在の state に合わせてランプ適用。 */
  private applyGains(ramp = RAMP): void {
    if (!this.ctx) return;
    const { musicVolume, micVolume, duckVolume, broadcasting } = this.state;
    const musicTarget = musicVolume * (broadcasting ? duckVolume : 1);
    const micTarget = broadcasting ? micVolume : 0;
    if (this.musicGain) this.ramp(this.musicGain.gain, musicTarget, ramp);
    if (this.micGain) this.ramp(this.micGain.gain, micTarget, ramp);
  }

  private ramp(param: AudioParam, value: number, time: number): void {
    const ctx = this.ctx!;
    const now = ctx.currentTime;
    param.cancelScheduledValues(now);
    param.setValueAtTime(param.value, now);
    if (time <= 0) param.setValueAtTime(value, now);
    else param.linearRampToValueAtTime(value, now + time);
  }

  /** 音楽ファイル（File）を読み込む。再生は別途 play()。 */
  loadTrack(file: File): void {
    if (!this.audioEl) return;
    if (this.trackUrl) URL.revokeObjectURL(this.trackUrl);
    this.trackUrl = URL.createObjectURL(file);
    this.audioEl.src = this.trackUrl;
    this.emit({ trackName: file.name, playing: false });
  }

  async play(): Promise<void> {
    if (!this.audioEl || !this.audioEl.src) return;
    await this.ctx?.resume();
    await this.audioEl.play();
  }

  pause(): void {
    this.audioEl?.pause();
  }

  async togglePlay(): Promise<void> {
    if (this.state.playing) this.pause();
    else await this.play();
  }

  /** 放送ON/OFF。マイク未取得なら何もしない。 */
  setBroadcasting(on: boolean): void {
    if (on && !this.state.micReady) return;
    this.emit({ broadcasting: on });
    this.applyGains();
  }

  toggleBroadcast(): void {
    this.setBroadcasting(!this.state.broadcasting);
  }

  setMusicVolume(v: number): void {
    this.emit({ musicVolume: clamp01(v) });
    this.applyGains();
  }

  setMicVolume(v: number): void {
    this.emit({ micVolume: clamp(v, 0, MAX_MIC_GAIN) });
    this.applyGains();
  }

  setDuckVolume(v: number): void {
    this.emit({ duckVolume: clamp01(v) });
    this.applyGains();
  }

  /** 後片付け。タブを閉じる際などに。 */
  dispose(): void {
    this.audioEl?.pause();
    this.micStream?.getTracks().forEach((t) => t.stop());
    if (this.trackUrl) URL.revokeObjectURL(this.trackUrl);
    this.ctx?.close();
    this.ctx = null;
  }
}

function clamp01(v: number): number {
  return clamp(v, 0, 1);
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}
