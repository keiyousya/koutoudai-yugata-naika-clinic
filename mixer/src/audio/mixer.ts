/**
 * MixerEngine — Web Audio ベースの院内放送ミキサー。
 *
 * 信号経路:
 *   <audio>(音楽) ─→ MediaElementSource ─→ musicGain ─────────────────────┐
 *                                                                         ├─→ master ─→ destination
 *   マイク ─→ MediaStreamSource ─→ rnnoise ─→ micComp ─→ gateGain ─→ micGain ┘
 *
 * - rnnoise: RNNoise(ニューラル雑音除去)で環境ノイズを消す。読み込み失敗時は素通し。
 * - micComp: 声を整えるコンプレッサー。
 * - gateGain: ノイズゲート。無音時にミュートしハウリングのループを断つ。
 * - 放送ON/OFFは micGain を 0↔micVolume に滑らかにランプして実現。
 * - 放送中は musicGain を duckVolume 倍に下げる（ダッキング）。
 */

import {
  RnnoiseWorkletNode,
  loadRnnoise,
} from "@sapphi-red/web-noise-suppressor";
import rnnoiseWasmUrl from "@sapphi-red/web-noise-suppressor/rnnoise.wasm?url";
import rnnoiseSimdWasmUrl from "@sapphi-red/web-noise-suppressor/rnnoise_simd.wasm?url";
import rnnoiseWorkletUrl from "@sapphi-red/web-noise-suppressor/rnnoiseWorklet.js?url";

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
  /** ノイズゲートの強さ 0..1（大きいほど小さい雑音をカット） */
  noiseGate: number;
  /** マイク取得失敗時のメッセージ */
  micError: string | null;
};

const RAMP = 0.08; // 秒。ゲイン変更のランプ時間

/** ノイズゲート: noiseGate=1 のときの RMS しきい値。これ以下の入力を雑音とみなしてミュート。 */
const GATE_MAX_THRESHOLD = 0.05;
const GATE_HOLD = 0.4; // 秒。一度開いたゲートを保持する時間（語尾の切れを防ぐ）
const GATE_ATTACK = 0.01; // 秒。ゲートを開くランプ
const GATE_RELEASE = 0.18; // 秒。ゲートを閉じるランプ

/**
 * マイク音量の上限（ゲイン倍率）。1.0=ユニティ。
 * 自動ゲイン＋コンプレッサーに加え、手動でも最大 6倍(=600%) まで
 * 増幅できるようにして「近づかないと拾わない」マイクを補正する。
 */
export const MAX_MIC_GAIN = 6;

export class MixerEngine {
  private ctx: AudioContext | null = null;
  private audioEl: HTMLAudioElement | null = null;
  private musicSource: MediaElementAudioSourceNode | null = null;
  private micStream: MediaStream | null = null;
  private micSource: MediaStreamAudioSourceNode | null = null;
  private rnnoise: RnnoiseWorkletNode | null = null;
  private micComp: DynamicsCompressorNode | null = null;
  private micAnalyser: AnalyserNode | null = null;
  private gateGain: GainNode | null = null;
  private gateBuf: Float32Array<ArrayBuffer> | null = null;
  private gateOpenUntil = 0; // ctx.currentTime 基準。これ以前はゲート開を維持
  private gateTarget = 1; // 現在のゲート目標（1=開, 0=閉）。再ランプの無駄打ちを避ける
  private rafId = 0;
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
    micVolume: 1.4,
    duckVolume: 0.25,
    noiseGate: 0.15,
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
    // RNNoise は 48kHz 前提のため AudioContext を 48kHz 固定で生成する。
    const ctx = new AudioContext({ sampleRate: 48000 });
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

    // マイクグラフ:  micSource → micComp → gateGain(ノイズゲート) → micGain → master
    //                       └→ micAnalyser（ゲート判定用の側鎖。音は通さない）
    // コンプレッサーで声を整え、ノイズゲートで無音時の環境雑音をミュートする。
    // 無音時にマイクが切れることで、スピーカーとのハウリングのループも断ち切る。
    this.micComp = ctx.createDynamicsCompressor();
    this.micComp.threshold.value = -32; // dB。穏やかな圧縮に留め、ノイズフロアを持ち上げすぎない
    this.micComp.knee.value = 30;
    this.micComp.ratio.value = 4;
    this.micComp.attack.value = 0.003;
    this.micComp.release.value = 0.25;

    this.gateGain = ctx.createGain();
    this.gateGain.gain.value = 1; // ゲートは開で初期化（放送ON/OFFは micGain 側で制御）

    this.micAnalyser = ctx.createAnalyser();
    this.micAnalyser.fftSize = 1024;
    this.gateBuf = new Float32Array(new ArrayBuffer(this.micAnalyser.fftSize * 4));

    this.micGain = ctx.createGain();
    this.micGain.gain.value = 0; // 起動直後は放送OFF
    this.micComp.connect(this.gateGain);
    this.gateGain.connect(this.micGain);
    this.micGain.connect(this.master);

    this.emit({ ready: true });
    this.applyGains(0);
    this.startGateLoop();

    await this.setupRnnoise(ctx);
    await this.initMic();
  }

  /**
   * RNNoise(ニューラル雑音除去)ノードを用意し micComp の前段に挿す。
   * WASM/Worklet の読み込みに失敗しても放送は使えるよう、失敗時は null のままにして素通しする。
   */
  private async setupRnnoise(ctx: AudioContext): Promise<void> {
    if (!this.micComp) return;
    try {
      const wasmBinary = await loadRnnoise({
        url: rnnoiseWasmUrl,
        simdUrl: rnnoiseSimdWasmUrl,
      });
      await ctx.audioWorklet.addModule(rnnoiseWorkletUrl);
      const node = new RnnoiseWorkletNode(ctx, { maxChannels: 1, wasmBinary });
      node.connect(this.micComp);
      // ゲート判定は雑音除去後の信号で行う（無音をより正確に検出できる）
      if (this.micAnalyser) node.connect(this.micAnalyser);
      this.rnnoise = node;
    } catch {
      this.rnnoise = null; // フォールバック: micSource → micComp を直結する
    }
  }

  /**
   * ノイズゲートのループ。放送中のみ、生マイク入力の音量(RMS)を監視し、
   * しきい値を下回ったら gateGain を 0 に落として雑音をミュートする。
   * 判定はコンプレッサー前の素の信号で行う（圧縮後は音量が均されて判定できないため）。
   */
  private startGateLoop(): void {
    const tick = () => {
      this.rafId = requestAnimationFrame(tick);
      const ctx = this.ctx;
      const analyser = this.micAnalyser;
      const gate = this.gateGain;
      const buf = this.gateBuf;
      if (!ctx || !analyser || !gate || !buf) return;
      if (!this.state.broadcasting) return; // 放送OFF中は判定しない

      analyser.getFloatTimeDomainData(buf);
      let sum = 0;
      for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i];
      const rms = Math.sqrt(sum / buf.length);

      const threshold = this.state.noiseGate * GATE_MAX_THRESHOLD;
      const now = ctx.currentTime;
      if (rms > threshold) this.gateOpenUntil = now + GATE_HOLD;
      const target = now < this.gateOpenUntil ? 1 : 0;
      if (target !== this.gateTarget) {
        this.ramp(gate.gain, target, target ? GATE_ATTACK : GATE_RELEASE);
        this.gateTarget = target;
      }
    };
    this.rafId = requestAnimationFrame(tick);
  }

  /** マイクを取得して micComp と側鎖アナライザに接続。 */
  private async initMic(): Promise<void> {
    if (!this.ctx || !this.micComp) return;
    try {
      // 既存ストリームがあれば停止してから取り直す（再試行時の二重取得を防ぐ）
      this.micStream?.getTracks().forEach((t) => t.stop());
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          // ブラウザのノイズ抑制は残す。一方 AGC は無音時にゲインを最大化して
          // ハウリングを誘発するため無効化し、増幅は手動＋コンプレッサーで行う。
          noiseSuppression: true,
          autoGainControl: false,
        },
        video: false,
      });
      this.micStream = stream;
      this.micSource?.disconnect();
      this.micSource = this.ctx.createMediaStreamSource(stream);
      // RNNoise があればその前段へ、なければコンプレッサーへ直結（フォールバック）
      const head: AudioNode = this.rnnoise ?? this.micComp;
      this.micSource.connect(head);
      // RNNoise 未使用時はゲート判定用に生信号を analyser へ分岐する
      if (!this.rnnoise && this.micAnalyser) this.micSource.connect(this.micAnalyser);
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

  /** ノイズゲートの強さを設定。0=無効、1=最も強くカット。 */
  setNoiseGate(v: number): void {
    this.emit({ noiseGate: clamp01(v) });
  }

  /** 後片付け。タブを閉じる際などに。 */
  dispose(): void {
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rnnoise?.destroy();
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
