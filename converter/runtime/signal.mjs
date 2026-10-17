// GPL-3.0; generated from ../src/signal.ts. See ../NOTICE.md.
export const SIGNAL_RATE = 44100;
export const SIGNAL_FRAMES = 70 * SIGNAL_RATE;
export const SIGNAL_IN_SUITE = {
    win32: "data\\flutter_assets\\assets\\wavs\\nam_input_wav.wav (next to Valeton Suite.exe)",
    darwin: "Valeton Suite.app/Contents/Frameworks/App.framework/Resources/flutter_assets/assets/wavs/nam_input_wav.wav"
};
export function readSignalWav(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const tag = (o)=>String.fromCharCode(bytes[o], bytes[o + 1], bytes[o + 2], bytes[o + 3]);
    if (bytes.length < 12 || tag(0) !== "RIFF" || tag(8) !== "WAVE") throw new Error("This isn't a WAV file.");
    let fmt = null;
    for(let off = 12; off + 8 <= bytes.length;){
        const size = view.getUint32(off + 4, true);
        const body = off + 8;
        if (tag(off) === "fmt ") {
            fmt = {
                format: view.getUint16(body, true),
                channels: view.getUint16(body + 2, true),
                rate: view.getUint32(body + 4, true),
                bits: view.getUint16(body + 14, true)
            };
        } else if (tag(off) === "data") {
            if (!fmt || fmt.format !== 1 || fmt.bits !== 16 || fmt.rate !== SIGNAL_RATE) throw new Error("This isn't Valeton's test signal (it is a 16-bit WAV at 44.1 kHz).");
            const frames = Math.floor(Math.min(size, bytes.length - body) / (2 * fmt.channels));
            if (frames < SIGNAL_FRAMES) throw new Error("This WAV is shorter than Valeton's 70-second test signal.");
            const out = new Int16Array(frames);
            for(let i = 0; i < frames; i++)out[i] = view.getInt16(body + i * 2 * fmt.channels, true);
            return out;
        }
        off = body + size + (size & 1);
    }
    throw new Error("This WAV file has no audio data.");
}
