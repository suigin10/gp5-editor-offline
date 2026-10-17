# 0.1.2の検証結果 — 2026-10-17

- USB/Bluetooth両ページのオフライン表示と画像読込: 成功
- 両画面のGP-50書き出し処理と不要UIを削除
- GP-5プリセット書き出し: USB/BTとも原版とバイト一致（パッチ0/49/99の合成データ）
- USB/Bluetooth切替位置と選択状態、削除対象DOMの不存在を確認
- USB Web MIDI/SysEx権限とGP-5入出力ポートの列挙: 成功、ポートは閉じたまま
- Bluetooth APIとアダプター検出: 利用可能
- BLE機器選択画面: 合成機器で選択コールバックを確認
- PCへのプリセット形式ファイル保存: 合成データのバイト一致を確認
- 外部HTTP/HTTPS通信の遮断: 確認
- パッケージしたEXEでの同じスモーク検証: 成功

制限付き開発環境のため、通常のChromiumサンドボックス起動は拒否されました。
スモーク検証のみ --no-sandbox --disable-gpu と、作業用TEMPを指定しました。
配布アプリはsandbox: trueの設定で、これらのオプションは付属しません。
通常のWindowsデスクトップ環境での起動は、ユーザーによる初回確認が必要です。
Bluetoothの無線電源変更は開発環境で拒否されました。実機の探索・GATT接続は未検証です。
GP-5への接続同期、編集、保存、NAM転送、ファームウェア更新は実行していません。

実機での初回手順: Suiteを終了し、USBモードでConnectして表示同期を確認してください。
Bluetoothは上部のBluetoothボタンから切り替え、本体のBluetoothを有効にしてConnectします。

0.1.2では、ページのversionメタデータ、タイトル、ファビコン参照、EXEアイコンとバージョン情報を追加確認済みです。

原作者: rvalladares / https://rvalladares.com/gp5/gp5editor/
開発・公開に感謝します。任意の寄付: https://www.buymeacoffee.com/rvalladares

パッケージ版スモーク: 成功。FileVersion / ProductVersion: 0.1.2。
