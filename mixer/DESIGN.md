# 院内ミキサー (mixer)

Windows PC で音楽を流しつつ、PC に接続したマイクで院内放送をワンタップで割り込ませる
ためのクライアント完結型 Web アプリ。バックエンド不要。

## 構成

- Vite + React 19 + TypeScript + Tailwind v4（既存 `timecard` / `shift` と同系統）
- 状態管理は `MixerEngine`（`src/audio/mixer.ts`）に集約し、`useMixer` で React に橋渡し。

## オーディオ信号経路（Web Audio API）

```
<audio>(音楽) ─→ MediaElementSource ─→ musicGain ─┐
                                                   ├─→ master ─→ destination
マイク(getUserMedia) ─→ MediaStreamSource ─→ micGain ┘            （OS既定出力＝BTスピーカー）
```

- **放送ON/OFF**: `micGain` を `0 ↔ micVolume` に短いランプで切替。
- **ダッキング**: 放送中は `musicGain` を `musicVolume × duckVolume` に下げる。
- クリックノイズ回避のため全ゲイン変更は `linearRampToValueAtTime`（既定 80ms）。

## 重要な運用前提

1. **出力先**: Web Audio は OS 既定の再生デバイスへ出力する。Bluetoothスピーカーを
   Windows の既定再生デバイスに設定しておくこと（アプリ内デバイス選択は未実装）。
2. **マイク処理を無効化**: `getUserMedia` で `echoCancellation` / `noiseSuppression` /
   `autoGainControl` をすべて `false`。通話用処理は PA 用途で音を歪ませるため。
3. **HTTPS 必須**: `getUserMedia` は HTTPS か localhost でのみ動作。
4. **起動ジェスチャ**: 「ミキサーを開始」クリックで AudioContext 生成とマイク許可を
   まとめて取得（自動再生制限とマイク権限を1操作で満たす）。
5. **ハウリング**: マイクとスピーカーが同室だと物理ループしうる。配置・指向性で回避。
6. **常駐**: タブを開いたままにする。音声再生中はタブが落ちにくい。
7. 推奨ブラウザ: Chrome / Edge（Windows）。

## MVP スコープ（実装済み）

- 音楽ファイルの読み込み・再生 / 一時停止
- マイク放送のON/OFFトグル
- 音楽音量・マイク音量・ダッキング量の調整

## 今後の拡張候補

- プレイリスト（複数曲・連続再生・ループ・並べ替え）
- 出力デバイス選択（`setSinkId`）
- チャイム/定型アナウンスの再生
- 放送中インジケータの全画面表示・ホットキー

## 開発

```
pnpm --filter mixer dev      # http://localhost:5176/mixer/
pnpm --filter mixer build
```
