# 0.3.0の検証結果 — 2026-10-18

- GP-5: Suite記録の全26フレームとリネームが一致。
- GP-50: MITのSuite記録から再構成した全29フレームが一致。
- 単体テスト12件。機種名誤認、異機種ファイル送信ゼロ、16文字名、GP-50追加設定のバイト保持、欠落・CRC・切断・タイムアウトを確認。
- GP-5 USB/Bluetooth と GP-50 USB/Bluetooth の4画面を合成デバイスで検証。PC保存・読み込み・リネーム・同期、変更先固定、両バックアップ、キャンセル、異機種、保存失敗時の送信抑止を確認。
- GP-50のCTL・テンポ直接変更は無効。BPMの＋/−とTapも含め、無効状態を検証。
- パッチ長/ヘッダー/機種タグ/レコードを照合。GP-5ポート名がGP-50へ部分一致しないことを確認。
- 原版GP-5エクスポート関数の比較検証は維持。

全てソフトウェア・模擬通信の検証です。本体への送信・保存を行っていません。GP-50実機と各Bluetooth接続、IR/SnapTone転送は未検証です。
開発環境の制限のためスモーク起動のみ --no-sandbox --disable-gpu と作業用TEMPを指定。配布設定は sandbox: true を維持します。

```powershell
node --test scripts/test-presets.cjs
node scripts/check-gp5-export.cjs
$env:GP5_PATCH_TEST_ROOT = (Get-Location).Path
npm run smoke
```

拡張スモークは実ポートを開かず、GP5_SMOKE_DIR内のテスト用userDataで動きます。
取り込み候補と実機検証の順序: FEATURE_REVIEW.md。
原作者rvalladares氏に感謝します。任意の寄付: https://www.buymeacoffee.com/rvalladares
