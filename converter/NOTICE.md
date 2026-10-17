# Standalone NAM to SnapTone converter

This directory is a separate GPL-3.0 command-line utility, invoked by the editor through files and JSON-lines output in a separate process. Its license does not purport to relicense the original rvalladares editor. The editor does not import the converter DSP modules into its renderer or main process.

Source: grzmol/VLTN-Tone-Studio, https://github.com/grzmol/VLTN-Tone-Studio/tree/8aae5c14edc13b5857b0ce42f277a420de0731bf (v0.7.2), GPL-3.0. Thank you to grzmol and contributors for publishing the conversion engine. LICENSE-GPL-3.0.txt is included verbatim. ORIGIN.json lists exact upstream files and hashes.

Unmodified corresponding sources in src/: nam.ts, signal.ts, wavenet.ts, a2.ts, kernel.ts, htkpa.ts, a1kernel.c and a2kernel.c. runtime/*.mjs is generated from those TypeScript sources with rewritten relative imports. runtime/*.wasm is copied from that same pinned upstream revision. Build instructions and scripts are included. engine.mjs and cli.mjs are GPL-3.0 adapters added for this utility; no optional cab-IR baking is exposed in this version.

Dependencies and provenance retained from upstream:

- NeuralAmpModelerCore: MIT, Copyright (c) 2023 Steven Atkinson. A2 kernel operation order follows NAM/wavenet/a2_fast.cpp at commit baf1bf8. The example NAM models in tests/fixtures are its MIT example models, as identified in the upstream gp5/NOTICE.md. NEURALAMPMODELER-MIT.txt is included. suite-a1.clo and suite-a2.clo are the upstream comparison outputs made by Valeton Suite from those example models.
- r8brain-free-src: MIT, Copyright (c) 2013-2014 Aleksey Vaneev (source revision 7f1980e referenced by htkpa.ts); current upstream notice Copyright (c) 2013-2026 Aleksey Vaneev. R8BRAIN-MIT.txt is included. https://github.com/avaneev/r8brain-free-src
- Takuya OOURA FFT: Copyright (C) 1996-2001 Takuya OOURA. The FFT port is identified and credited in htkpa.ts, via r8brain's ooura_fft. https://www.kurims.kyoto-u.ac.jp/~ooura/fft.html
- htkpa.ts documents a TypeScript reimplementation of Suite's HTKPA clone algorithm and contains constant tables identified upstream as copied from the vendor library. Its original provenance comments are retained. No vendor DLL, test signal, firmware, catalog or factory tone bank is bundled by this converter.

Valeton's nam_input_wav.wav is supplied by the user from their installed Valeton Suite. It is never included in source or release packages. Valeton and Neural Amp Modeler names remain their owners' trademarks. This utility is not an official Valeton product.

All utility source needed to build/modify the distributed runtime is in this directory and the matching release source archive. See README.md and LICENSE-GPL-3.0.txt for redistribution terms.
