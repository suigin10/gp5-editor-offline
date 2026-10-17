# GP5 Editor Offline — v0.1.2

Windows 11 x64用のオフラインGP-5エディターです。USB / Bluetoothに対応します。

## 起動と接続

ZIPをフォルダーごと展開し、`GP5-Editor-Offline.exe`を起動してください。DLL・resources・localesも必要です。
ブラウザーやNode.jsの別途インストールは不要です。インストーラー、管理者権限、ファームウェア更新も不要です。

1. Valeton Suiteや他のGP-5エディターを終了します。
2. 画面上部のUSB / Bluetoothで接続方式を選び、`Connect GP-5`を押します。
3. Bluetoothの場合は本体のBluetoothを有効にし、表示されたGP-5を選びます。スマートフォン等の接続は終了してください。
4. 接続後のパラメーター操作は本体へ反映されます。`Save`は確認後に現在のパッチを上書きします。
5. ダウンロードメニューの`Save GP-5 preset`で、現在のプリセットをPCへ保存できます。

起動だけでは接続や送信を行いません。NAM変換・導入、ファームウェア更新の機能はありません。
コード署名はありません。最初の実機確認前にはプリセットをバックアップしてください。

## バージョンとアイコン

本アプリのバージョンは **0.1.2** です。原作のバージョン番号とは別に管理します。
EXE・ウィンドウ・ファビコンに、本移植版用に作成した共通のペダルアイコンを使用しています。

## 原作者への謝意と支援

本アプリは **rvalladares氏のGP5 Editor** を基にした非公式のWindows移植版です。
GP-5のエディターを開発・公開してくださった原作者に、心より感謝します。
便利に使えたときは、原作者への感謝と寄付による支援も、ぜひお忘れなく（寄付は任意です）。

- 原作・Bluetooth版: https://rvalladares.com/gp5/gp5editor/
- 原作・USB版: https://rvalladares.com/gp5/gp5editor/usb.html
- 原作者への寄付: https://www.buymeacoffee.com/rvalladares

本移植版は原作者またはValetonが提供・承認した公式アプリではありません。

## 再配布条件の確認状況

取得した原作ページでは、エディター全体の改変・再配布を認めるライセンスを確認できていません。
配布用ファイルの整理と、公開・第三者配布の許諾は別の事項です。公開前に原作者へ条件をご確認ください。
出典表示・謝意・寄付案内は再配布許可の代わりにはなりません。本パッケージは原作の権利を変更しません。
Bootstrap、Electron、Chromiumのライセンス類は改変せず同梱しています。

## ソースから実行・ビルド

Node.js 24以上を使用します。初回の依存取得にはネット接続が必要です。

```powershell
npm ci
npm run brand
node scripts/check-gp5-export.cjs
npm start
npm run smoke
npm run package
```

`package.json`のversionからHTMLとウィンドウの表記を同期します。ビルド出力は`../../outputs/<version>/`です。
PNG・ICO・SVGアイコンを同梱しているので、通常のビルドでアイコン生成は不要です。
`smoke`は非表示起動とポート列挙、合成データの保存、合成BLE機器選択を検証します。実機へのコマンドは送りません。
制限付き開発環境でのテスト条件と未確認事項は`VALIDATION.md`をご確認ください。
