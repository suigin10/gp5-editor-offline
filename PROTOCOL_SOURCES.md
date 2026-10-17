# GP-5 preset protocol sources

The desktop port still credits rvalladares for the editor and live-edit protocol.
Please consider supporting the original developer: https://www.buymeacoffee.com/rvalladares (optional).

Additional primary community sources consulted for the 0.2.0 preset features:

- https://github.com/fsanchezlme97-ui/gp5-editor — GP-5 Valeton Suite import/rename capture, `test/fixtures/gp5_suite_import.json`, `97-FF CC.prst`, `test/write.test.js`. MIT, copyright 2026 fsanchezlme97-ui; portions from Andrew Mercurio. Both notices are included in `COMMUNITY-PROTOCOL-LICENSE.txt`.
- https://github.com/drewmerc302/valeton-gp50 — GP-5 .prst profile, CRC and container documentation. MIT, copyright 2026 Andrew Mercurio.
- https://github.com/grzmol/VLTN-Tone-Studio — protocol facts concerning ACK pacing and stored-preset verification; no code copied from this project.

The two test fixtures are copied from fsanchezlme97-ui/gp5-editor; see the included MIT notices. New codec/session/UI code was written for this port.

The GP-5 capture has **26** frames (`total=0x1a`), index 0..25, payload chunks of 19 bytes. It must not use the 29-frame GP-50 transfer. The reassembled payload is `11 4f | slot u32le | prst[25:]`. Names are 10 ASCII bytes. The capture also verifies rename `11 4c | slot u32le | name10`.

`node --test scripts/test-presets.cjs` compares every outgoing write and rename byte with the GP-5 Suite capture. This verifies encoding, not live hardware behavior. The same core frames use the existing `80 80` BLE-MIDI prefix in Bluetooth mode; Bluetooth preset imports have only been tested with a simulator in this port.

Files must have the GP-5 header, 507-byte length, valid CRC, known record layout/device tag, valid order/masks, finite parameters and supported model IDs before import. No GP-50 conversion, IR/capture upload or firmware command is used.

Before import/save, both the current edit buffer and stored slot are backed up. Selecting another slot and returning is needed to read flash: re-selecting the same slot does not refresh the edit buffer. Each write frame waits for a CRC-checked ACK; a timeout stops without automatic retry. Verification reloads flash and compares the entire 466-byte body and name. Rename verifies the new name and checks that the edit buffer is unchanged.

Background synchronization only reads, uses one outstanding request, and pauses for file/device operations. USB: 1.5 s; Bluetooth: 3 s. It does not write edits or save files automatically. Names are refreshed on change notifications and periodically (up to 10 s).


## 0.3.0 GP-50 support

The GP-50 Suite capture in `scripts/fixtures/gp50_suite_write_slot0.json` was extracted directly from the `WRITE` literal of drewmerc302/valeton-gp50 `patch/decode_import_capture.py` at aadcf9b7a2f051d8bce50b8654a6a935a07a06b0 (MIT). `gp50-US-Lead.prst` is reconstructed from that captured payload. All 29 frames match. GP-50 body reads use 511 bytes and Program Change with a 300 ms settle before readback. GP-5 keeps 466-byte reads and its GP-5 select command.

The common parser reads the typed record structure, validates device tags, protects cross-model imports, and preserves GP-50 EXP, FS and 16-byte names. Rename commands retain the capture-verified 10-byte format. GP-50 live CTL/tempo commands remain off. No new IR, SnapTone, firmware or reset write opcode is sent. See FEATURE_REVIEW.md for planned features and upstream evidence.
