// GPL-3.0; generated from ../src/wavenet.ts. See ../NOTICE.md.
import { BLOCK, loadKernel, renderBlocks } from "./kernel.mjs";
const isObject = (v)=>typeof v === "object" && v !== null && !Array.isArray(v);
export function parseA1(text) {
    const nam = JSON.parse(text);
    if (!isObject(nam) || nam.architecture !== "WaveNet" || !isObject(nam.config) || !Array.isArray(nam.weights)) throw new Error("Not a NAM WaveNet model");
    const { layers, head } = nam.config;
    if (!Array.isArray(layers) || layers.length === 0 || head != null) throw new Error("Not a NAM A1 WaveNet");
    const weights = nam.weights;
    let pos = 0;
    const take = (n)=>{
        if (pos + n > weights.length) throw new Error("The NAM file has fewer weights than its layers need");
        const out = Float32Array.from(weights.slice(pos, pos + n));
        pos += n;
        return out;
    };
    const arrays = layers.map((la, i)=>{
        if (!isObject(la) || !Array.isArray(la.dilations)) throw new Error(`Layer array ${i} is not an A1 layer array`);
        if (la.kernel_size !== 3) throw new Error(`Layer array ${i} has kernel size ${String(la.kernel_size)}; A1 uses 3`);
        if (la.gated) throw new Error(`Layer array ${i} is gated`);
        if (la.activation !== "Tanh") throw new Error(`Layer array ${i} uses ${String(la.activation)}; A1 uses Tanh`);
        if (la.condition_size !== 1) throw new Error(`Layer array ${i} is not conditioned on the mono input`);
        const C = Number(la.channels);
        const inSize = Number(la.input_size);
        const headSize = Number(la.head_size);
        const rechannel = take(C * inSize);
        const arrayLayers = la.dilations.map((d)=>({
                dilation: d,
                look: 2 * d,
                conv: take(C * C * 3),
                convBias: take(C),
                mix: take(C),
                l1: take(C * C),
                l1Bias: take(C)
            }));
        return {
            inSize,
            channels: C,
            headSize,
            rechannel,
            layers: arrayLayers,
            head: take(headSize * C),
            headBias: la.head_bias ? take(headSize) : new Float32Array(headSize)
        };
    });
    const headScale = take(1)[0];
    if (pos !== weights.length) throw new Error(`The NAM file has ${weights.length - pos} more weights than its layers use`);
    arrays.forEach((a, i)=>{
        const prev = arrays[i - 1];
        if (i === 0 ? a.inSize !== 1 : a.inSize !== prev.channels || a.channels !== prev.headSize) throw new Error("The NAM layer arrays don't chain");
    });
    if (arrays[arrays.length - 1].headSize !== 1) throw new Error("The NAM model is not mono");
    const receptiveField = 1 + arrays.reduce((s, a)=>s + a.layers.reduce((t, l)=>t + l.look, 0), 0);
    const sr = nam.sample_rate;
    return {
        arrays,
        headScale,
        receptiveField,
        sampleRate: typeof sr === "number" && sr > 0 ? sr : null
    };
}
const LAYER_BYTES = 36;
const ARRAY_BYTES = 32;
const MODEL_BYTES = 36;
export async function renderA1(wasm, model, x, onProgress) {
    const { heap, process } = await loadKernel(wasm, "a1_process");
    const { alloc, put, writeI32 } = heap;
    const maxC = Math.max(...model.arrays.map((a)=>a.channels));
    const arraysPtr = alloc(ARRAY_BYTES * model.arrays.length);
    const headOutTable = alloc(4 * model.arrays.length);
    model.arrays.forEach((a, ai)=>{
        const layersPtr = alloc(LAYER_BYTES * a.layers.length);
        a.layers.forEach((l, li)=>{
            const fields = [
                l.dilation,
                l.look,
                put(l.conv),
                put(l.convBias),
                put(l.mix),
                put(l.l1),
                put(l.l1Bias),
                alloc(4 * a.channels * l.look),
                alloc(4 * a.channels * (l.look + BLOCK))
            ];
            writeI32(layersPtr + li * LAYER_BYTES, fields);
        });
        writeI32(arraysPtr + ai * ARRAY_BYTES, [
            a.inSize,
            a.channels,
            a.headSize,
            a.layers.length,
            put(a.rechannel),
            put(a.head),
            put(a.headBias),
            layersPtr
        ]);
        writeI32(headOutTable + ai * 4, [
            alloc(4 * a.headSize * BLOCK)
        ]);
    });
    const modelPtr = alloc(MODEL_BYTES);
    const work = Array.from({
        length: 5
    }, ()=>alloc(4 * maxC * BLOCK));
    writeI32(modelPtr, [
        model.arrays.length,
        0,
        arraysPtr,
        ...work,
        headOutTable
    ]);
    heap.writeF32(modelPtr + 4, [
        model.headScale
    ]);
    return renderBlocks(heap, process, modelPtr, x, model.receptiveField, onProgress);
}
