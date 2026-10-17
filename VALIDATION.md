# 0.4.0の検証 — 2026-10-18

単体テスト17件: 既存GP-5パッチ通信8件とGP-50拒否1件、IR/SnapTone・一括走査8件。

- SuiteのGP-5パッチ26フレームとリネームの一致。
- IR 112 / SnapTone146フレームをローカルの独立した参照エンコーダーと全バイト照合。A1/A2の変換済み例、両端ユーザー枠で確認。参照GPLコード・モデルは同梱しない。
- WAVの符号・ステレオ平均・量子化・512サンプル・ゼロ埋め・破損・不正値、VTSIのサイズ・CRC・形式、工場枠拒否、NACK・応答なしの停止。
- 100件の保存済みパッチ走査、未保存編集の別退避、中止・保存失敗・元の選択への復帰。
- 合成USB / Bluetoothを使ったElectron UI・IPC: PC別名保存、指定スロットコピー、部分一括バックアップ、ファイルメニュー、IR20/SnapTone80一覧、USB転送、元ファイル・履歴の実ファイル、BLE転送ボタン無効。
- 初期ウィンドウの作業領域制限、1100x650・900x560で下部保存欄、通常/Live View、SnapTone斜線表示と文字・名前を確認。

今回の新機能は実機へ送信していません。IR / SnapToneの実際の音、再起動後の内容、接続断時の実機状態は未確認です。転送後の名前・flag照合は内容の全バイト照合ではありません。

制限付き開発環境のスモーク起動のみ --no-sandbox --disable-gpu と作業用TEMPを指定。配布版はsandbox:trueを維持します。合成通信は独立userDataを使い、実MIDIポートを開きません。

```powershell
node scripts/check-gp5-export.cjs
node --test scripts/test-presets.cjs scripts/test-library-assets.cjs
$env:GP5_PATCH_TEST_ROOT = (Get-Location).Path
npm run smoke
```

原作者rvalladares氏に感謝します。任意の寄付: https://www.buymeacoffee.com/rvalladares
