# GP-5 preset protocol sources

The desktop port still credits rvalladares for the editor and live-edit protocol.
Please consider supporting the original developer: https://www.buymeacoffee.com/rvalladares (optional).

Additional primary community sources consulted for the 0.2.0 preset features:

- https://github.com/fsanchezlme97-ui/gp5-editor — GP-5 Valeton Suite import/rename capture, `test/fixtures/gp5_suite_import.json`, `97-FF CC.prst`, `test/write.test.js`. MIT, copyright 2026 fsanchezlme97-ui; portions from Andrew Mercurio. Both notices are included in `COMMUNITY-PROTOCOL-LICENSE.txt`.
- https://github.com/drewmerc302/valeton-gp50 — GP-5 .prst profile, CRC and container documentation. MIT, copyright 2026 Andrew Mercurio.
- https://github.com/grzmol/VLTN-Tone-Studio — protocol facts concerning ACK pacing and stored-preset verification; no code copied for those preset features.

The two test fixtures are copied from fsanchezlme97-ui/gp5-editor; see the included MIT notices. New codec/session/UI code was written for this port.

The GP-5 capture has **26** frames (`total=0x1a`), index 0..25, payload chunks of 19 bytes. It must not use the 29-frame GP-50 transfer. The reassembled payload is `11 4f | slot u32le | prst[25:]`. Names are 10 ASCII bytes. The capture also verifies rename `11 4c | slot u32le | name10`.

`node --test scripts/test-presets.cjs` compares every outgoing write and rename byte with the GP-5 Suite capture. This verifies encoding, not live hardware behavior. The same core frames use the existing `80 80` BLE-MIDI prefix in Bluetooth mode; Bluetooth preset imports have only been tested with a simulator in this port.

Files must have the GP-5 header, 507-byte length, valid CRC, known record layout/device tag, valid order/masks, finite parameters and supported model IDs before import. No GP-50 conversion or firmware command is used by preset import.

Before import/save, both the current edit buffer and stored slot are backed up. Selecting another slot and returning is needed to read flash: re-selecting the same slot does not refresh the edit buffer. Each write frame waits for a CRC-checked ACK; a timeout stops without automatic retry. Verification reloads flash and compares the entire 466-byte body and name. Rename verifies the new name and checks that the edit buffer is unchanged.

Background synchronization only reads, uses one outstanding request, and pauses for file/device operations. USB: 1.5 s; Bluetooth: 3 s. It does not write edits or save files automatically. Names are refreshed on change notifications and periodically (up to 10 s).


## 0.3.0 GP-50 support

The GP-50 Suite capture in `scripts/fixtures/gp50_suite_write_slot0.json` was extracted directly from the `WRITE` literal of drewmerc302/valeton-gp50 `patch/decode_import_capture.py` at aadcf9b7a2f051d8bce50b8654a6a935a07a06b0 (MIT). `gp50-US-Lead.prst` is reconstructed from that captured payload. All 29 frames match. GP-50 body reads use 511 bytes and Program Change with a 300 ms settle before readback. GP-5 keeps 466-byte reads and its GP-5 select command.

The common parser reads the typed record structure, validates device tags, protects cross-model imports, and preserves GP-50 EXP, FS and 16-byte names. Rename commands retain the capture-verified 10-byte format. GP-50 live CTL/tempo commands remain off. No new IR, SnapTone, firmware or reset write opcode is sent. See FEATURE_REVIEW.md for planned features and upstream evidence.


## 0.4.0 IR / SnapTone形式の独自実装

参照: VLTN Tone Studio v0.7.2 / 8aae5c14edc13b5857b0ce42f277a420de0731bf、app/src/renderer/src/gp5/lib/{userir,snaptone,protocol,session}.mjs の説明・通信事実。

- IR selector 0x20 / upload 0x21 / fxId 0x0A100000+slot0..19。44.1kHzの先頭512サンプル、符号拡張した24bitをint32 LEとして2048バイト。
- SnapTone selector0x24 / upload0x25 / fxId0x0F000000+slot50..79。2696バイトVTSI、CRC16/MODBUS [12,end) を8..9へBE格納。サイズ4..7=2696、extend20..23=2560、type18/version19=0。
- upload payload: SET+opcode、nId u32=0、fxId u32、name16、node16=0、fPara32=0、data。74バイトの前置き。既存GP-5 packetizerの19バイト分割を使用し112/146フレーム。
- ファイルACKはkind0x13または0x14、payload[2]=0。拒否・欠落で停止、自動再送しない。転送後は一覧の名前・flag0のみ照合。
- 一覧は18/selector、count個の状態バイト、count個の16バイト名。IR20/SnapTone80。flag0=user、flag1=factory/empty。未知値と欠落は拒否。

asset-codec.js、追加のsession/UI/PC保管は独自実装。0.4.0ではGPLの参照コード・変換エンジン・数表・モデル・テストモデルを配布しませんでした。ローカルの参照エンコーダーで両端スロット、A1/A2変換済み例を使い、全112/146フレームの一致を確認しました。GP-50用fixtureは異機種ファイルの拒否テストに限って保持します。

## 0.5.0 独立したNAM変換器

同じVLTNコミットのNAM判定、A1/A2 WASMレンダー、リサンプル、SnapToneクローンをconverter/にGPL-3.0として同梱。原本ハッシュはORIGIN.json、変更点とライセンスはNOTICE.md。エディター側は独立CLIへファイルパスを渡し、出力をasset-codecで再検査します。通信処理とは独立し、未接続で変換できます。

NAM→44.1kHzテスト信号をモデルレートへ変換→PCM24→A1/A2レンダー→0.31ゲイン→PCM16→8840バイトクローン→2696バイトへ整形・CRC更新。Suiteと同じパイプラインの量子化を反映しています。追加Cab IRは適用しません。
