// GPL-3.0; generated from ../src/kernel.ts. See ../NOTICE.md.
export const BLOCK = 1024;
const PAGE = 65536;
export async function loadKernel(wasm, entry) {
    const memory = new WebAssembly.Memory({
        initial: 64
    });
    const { instance } = await WebAssembly.instantiate(wasm, {
        env: {
            memory
        }
    });
    const { [entry]: process, __heap_base: heapBase } = instance.exports;
    if (typeof process !== "function" || !(heapBase instanceof WebAssembly.Global)) throw new Error(`The SnapTone kernel lacks ${entry}`);
    let top = Number(heapBase.value) + 15 & ~15;
    const alloc = (bytes)=>{
        const p = top;
        top = top + bytes + 15 & ~15;
        if (top > memory.buffer.byteLength) memory.grow(Math.ceil((top - memory.buffer.byteLength) / PAGE));
        return p;
    };
    const heap = {
        memory,
        alloc,
        put (data) {
            const p = alloc(data.byteLength);
            new Float32Array(memory.buffer, p, data.length).set(data);
            return p;
        },
        writeI32: (p, values)=>new Int32Array(memory.buffer, p, values.length).set(values),
        writeF32: (p, values)=>new Float32Array(memory.buffer, p, values.length).set(values)
    };
    return {
        heap,
        process: process
    };
}
export function renderBlocks(heap, process, modelPtr, x, prewarm, onProgress) {
    const inPtr = heap.alloc(4 * BLOCK);
    const outPtr = heap.alloc(4 * BLOCK);
    const run = (src, n)=>{
        new Float32Array(heap.memory.buffer, inPtr, n).set(src.subarray(0, n));
        process(modelPtr, inPtr, outPtr, n);
        return new Float32Array(heap.memory.buffer, outPtr, n);
    };
    const zeros = new Float32Array(BLOCK);
    for(let done = 0; done < prewarm; done += BLOCK)run(zeros, BLOCK);
    const y = new Float32Array(x.length);
    for(let s = 0; s < x.length; s += BLOCK){
        const n = Math.min(BLOCK, x.length - s);
        y.set(run(x.subarray(s, s + n), n), s);
        if (onProgress && s / BLOCK % 256 === 0) onProgress(s / x.length);
    }
    onProgress?.(1);
    return y;
}
