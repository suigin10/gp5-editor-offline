# GP-5 NAM converter (GPL-3.0)

Offline A1/A2 NAM → 2696-byte SnapTone. Runs independently as a Node-compatible command-line process; the desktop app supplies its bundled Electron runtime in RunAsNode mode. No network, MIDI or Bluetooth API is used here.

```powershell
node cli.mjs --check input.nam
node cli.mjs --check-signal nam_input_wav.wav
node cli.mjs --model input.nam --signal nam_input_wav.wav --out output.clo
```

Output must not exist. Progress, result and errors are JSON-lines on stdout. Cancel by terminating the process; the editor removes its temporary workspace and never writes a user-selected output until conversion succeeds and the user saves it.

The test signal must be the file from Valeton Suite: 44.1kHz PCM16, at least 70 seconds. It is not distributed here. Model families/rates follow the pinned VLTN checker (A1 WaveNet 0.5.x/compatible 0.7.x and A2 WaveNet/SlimmableContainer; 44.1/48/96kHz). Unsupported architectures/configurations fail before conversion.

## Build corresponding runtime

Node.js 24+:

```powershell
node build.mjs
```

This uses Node's TypeScript transform with no downloaded compiler/dependencies. To rebuild the already-included WASM kernels, install clang with wasm32 and SIMD support, then:

```powershell
node build-wasm.mjs
```

The exact flags are in build-wasm.mjs. src/ is the original corresponding TypeScript/C source, runtime/ is the generated JavaScript and prebuilt WASM. ORIGIN.json pins upstream files/hashes. The conversion adapter in engine.mjs performs the excitation resample/PCM round trip, NAM render, 0.31 output gain, HTKPA clone and GP-5 truncation/CRC.

See NOTICE.md, GPL and MIT notices. These licenses describe this utility and its components; they do not change rights in the separate original editor.
