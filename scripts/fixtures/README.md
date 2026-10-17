# GP-5 protocol fixtures

Copied from https://github.com/fsanchezlme97-ui/gp5-editor/tree/main/test/fixtures (2026-10-17).

- gp5_suite_import.json: Valeton Suite GP-5 import and rename capture.
- 97-FF-CC.prst: matching GP-5 preset (original filename: 97-FF CC.prst).

MIT notices: ../../COMMUNITY-PROTOCOL-LICENSE.txt. Details: ../../PROTOCOL_SOURCES.md.
These are test vectors, not user backups. Tests never open a real MIDI/Bluetooth device.

gp50-US-Lead.prst was reconstructed from the MIT `WRITE` capture in drewmerc302/valeton-gp50/patch/decode_import_capture.py, commit aadcf9b7a2f051d8bce50b8654a6a935a07a06b0. In 0.4.0 it is used only to verify rejection of foreign-device files. No VLTN GPL implementation was copied.
