// GPL-3.0; generated from ../src/a2.ts. See ../NOTICE.md.
import { A2_DILATIONS, A2_HEAD_TAPS, A2_KERNEL_SIZES, selectA2 } from "./nam.mjs";
import { BLOCK, loadKernel, renderBlocks } from "./kernel.mjs";
export function parseA2(text) {
    const { model, channels: C, sampleRate } = selectA2(JSON.parse(text));
    const weights = model.weights;
    let pos = 0;
    const take = (n)=>{
        const out = Float32Array.from(weights.slice(pos, pos + n));
        pos += n;
        return out;
    };
    const rechannel = take(C);
    const layers = A2_KERNEL_SIZES.map((K, li)=>{
        const fileConv = take(C * C * K);
        const conv = new Float32Array(K * C * C);
        for(let o = 0; o < C; o++)for(let i = 0; i < C; i++)for(let k = 0; k < K; k++)conv[(k * C + o) * C + i] = fileConv[(o * C + i) * K + k];
        return {
            kernel: K,
            dilation: A2_DILATIONS[li],
            conv,
            convBias: take(C),
            mix: take(C),
            l1: take(C * C),
            l1Bias: take(C)
        };
    });
    const fileHead = take(C * A2_HEAD_TAPS);
    const head = new Float32Array(A2_HEAD_TAPS * C);
    for(let i = 0; i < C; i++)for(let k = 0; k < A2_HEAD_TAPS; k++)head[k * C + i] = fileHead[i * A2_HEAD_TAPS + k];
    const [headBias, headScale] = take(2);
    const prewarm = layers.reduce((s, l)=>s + (l.kernel - 1) * l.dilation, 0) + A2_HEAD_TAPS - 1;
    return {
        channels: C,
        rechannel,
        layers,
        head,
        headBias,
        headScale,
        prewarm,
        sampleRate
    };
}
const LAYER_BYTES = 36;
const MODEL_BYTES = 44;
export async function renderA2(wasm, model, x, onProgress) {
    const { heap, process } = await loadKernel(wasm, "a2_process");
    const { alloc, put, writeI32 } = heap;
    const C = model.channels;
    const layersPtr = alloc(LAYER_BYTES * model.layers.length);
    model.layers.forEach((l, li)=>{
        const look = (l.kernel - 1) * l.dilation;
        writeI32(layersPtr + li * LAYER_BYTES, [
            l.kernel,
            l.dilation,
            look,
            put(l.conv),
            put(l.convBias),
            put(l.mix),
            put(l.l1),
            put(l.l1Bias),
            alloc(4 * C * (look + BLOCK))
        ]);
    });
    const modelPtr = alloc(MODEL_BYTES);
    const tail = [
        put(model.rechannel),
        put(model.head),
        layersPtr,
        alloc(4 * C * BLOCK),
        alloc(4 * C * BLOCK),
        alloc(4 * C * (A2_HEAD_TAPS - 1 + BLOCK))
    ];
    writeI32(modelPtr, [
        C,
        model.layers.length,
        BLOCK,
        0,
        0,
        ...tail
    ]);
    heap.writeF32(modelPtr + 12, [
        model.headScale,
        model.headBias
    ]);
    return renderBlocks(heap, process, modelPtr, x, model.prewarm, onProgress);
}
