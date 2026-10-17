# 0.2.0の検証結果 — 2026-10-17

- GP-5のSuite実キャプチャ: 書き込み全26フレームとリネームをバイト単位で照合、成功。
- 単体テスト8件: 成功。空白・短い名前・10文字名、破損/異機種/不正レコード/NaN/不正並び順/番号の拒否、USB19バイト・BLE100バイト応答、欠落/順序不正、ACKタイムアウト、切断を検証。
- Electron内のUSB/Bluetooth両画面: 合成GP-5へのPC保存、読み込み、リネーム、自動同期、PCファイルのバイト一致、編集中/保存済み両バックアップ、バックアップ失敗時の書き込み中止、ダイアログ終了を確認。
- 破損ファイルと確認キャンセル時の通信ゼロを確認。
- 元のGP-5書き出し関数は原版との一致を維持。新PC保存は検証済みの共通codecとネイティブ保存ダイアログを使用。
- オフライン表示、MIDI/SysEx権限、ポート列挙（閉じたまま）、BLE選択画面、外部通信遮断、バージョンとアイコンの既存スモークも成功。

新機能はシミュレーターで検証しています。実機への接続・パラメーター送信・保存・リネームは実行していません。特にBluetoothでのプリセット転送は実機未検証です。
制限付き開発環境のため、スモーク起動だけ --no-sandbox --disable-gpu と作業用TEMPを指定しています。配布版は sandbox: true を維持します。

## 再現

```powershell
node scripts/check-gp5-export.cjs
node --test scripts/test-presets.cjs
$env:GP5_PATCH_TEST_ROOT = (Get-Location).Path
npm run smoke
```

拡張スモークは実ポートを開かず、USB/Bluetooth入出力を合成デバイスへ置き換えます。テスト用userDataとバックアップは指定のGP5_SMOKE_DIR内です。
原作者rvalladares氏に感謝します。任意の寄付: https://www.buymeacoffee.com/rvalladares

パッケージ版EXEの拡張スモーク: USB/Bluetoothとも成功。FileVersion / ProductVersion: 0.2.0。名前変更ダイアログ中に対象パッチが変わった場合の送信ゼロも確認。
