// GPL-3.0; generated from ../src/nam.ts. See ../NOTICE.md.
export class NamCheckError extends Error {
    detail;
    constructor(detail){
        super(`Tone Studio can't make a SnapTone from this file. Pick another model or report it to the creator. (${detail})`);
        this.name = "NamCheckError";
        this.detail = detail;
    }
}
export const NAM_05X_VERSION = "0.5.4";
export const SNAPTONE_RATES = [
    44100,
    48000,
    96000
];
export const DEFAULT_MODEL_RATE = 48000;
const A1_SIZES = [
    [
        "standard",
        16,
        8
    ],
    [
        "lite",
        12,
        6
    ],
    [
        "feather",
        8,
        4
    ],
    [
        "nano",
        4,
        2
    ]
];
export const A2_KERNEL_SIZES = [
    6,
    6,
    6,
    6,
    6,
    6,
    6,
    6,
    6,
    6,
    6,
    6,
    6,
    6,
    15,
    15,
    6,
    6,
    6,
    6,
    6,
    6,
    6
];
export const A2_DILATIONS = [
    1,
    3,
    7,
    17,
    41,
    101,
    239,
    1,
    3,
    7,
    17,
    41,
    101,
    239,
    1,
    13,
    1,
    3,
    7,
    17,
    41,
    101,
    239
];
export const A2_HEAD_TAPS = 16;
export const A2_CHANNELS = [
    3,
    8
];
const A2_LEAKY_SLOPE = 0.01;
const FILM_KEYS = [
    "conv_pre_film",
    "conv_post_film",
    "activation_pre_film",
    "activation_post_film",
    "input_mixin_pre_film",
    "input_mixin_post_film",
    "layer1x1_post_film",
    "head1x1_post_film"
];
const isObject = (v)=>typeof v === "object" && v !== null && !Array.isArray(v);
function assertCoreVersion(version, what = "file") {
    const v = typeof version === "string" ? version : "";
    const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v);
    if (!m) throw new NamCheckError(`the ${what} has no NAM version`);
    const [major, minor] = [
        Number(m[1]),
        Number(m[2])
    ];
    if (major !== 0 || minor < 5 || minor > 7) throw new NamCheckError(`NAM ${v} ${what}s aren't supported (0.5 to 0.7)`);
    return v;
}
function assertRate(sampleRate) {
    if (sampleRate === undefined || sampleRate === null) return null;
    if (typeof sampleRate !== "number" || !SNAPTONE_RATES.includes(sampleRate)) throw new NamCheckError(`${String(sampleRate)} Hz; SnapTones are made from 44.1, 48 or 96 kHz models`);
    return sampleRate;
}
function uniform(values, what) {
    if (!Array.isArray(values)) return values;
    const distinct = new Set(values.map((v)=>JSON.stringify(v)));
    if (distinct.size !== 1) throw new NamCheckError(`${what} differs between layers`);
    return values[0];
}
function reshapeLayer(i, la) {
    for (const k of FILM_KEYS)if (la[k]?.active) throw new NamCheckError(`layer ${i} uses FiLM`);
    if (la.head1x1?.active) throw new NamCheckError(`layer ${i} uses head1x1`);
    if (la.slimmable != null) throw new NamCheckError(`layer ${i} is slimmable`);
    if (la.packing != null) throw new NamCheckError(`layer ${i} is packed`);
    if ((la.bottleneck ?? la.channels) !== la.channels) throw new NamCheckError(`layer ${i} has a bottleneck`);
    const gating = la.gating_mode ?? [
        "none"
    ];
    const secondary = la.secondary_activation ?? [
        null
    ];
    if (gating.some((g)=>g !== "none") || secondary.some((s)=>s != null)) throw new NamCheckError(`layer ${i} is gated`);
    const head = la.head;
    if (!head || typeof head.out_channels !== "number") throw new NamCheckError(`layer ${i} has no head size`);
    if ((head.kernel_size ?? 1) !== 1) throw new NamCheckError(`layer ${i} head kernel is not 1`);
    let activation = uniform(la.activation, "activation");
    if (activation && typeof activation === "object") activation = activation.type;
    const kernel = "kernel_sizes" in la ? uniform(la.kernel_sizes, "kernel size") : la.kernel_size;
    return {
        input_size: la.input_size,
        condition_size: la.condition_size,
        channels: la.channels,
        head_size: head.out_channels,
        kernel_size: kernel,
        dilations: la.dilations,
        activation,
        gated: false,
        head_bias: Boolean(head.bias)
    };
}
function assertA1(model) {
    const config = model.config;
    const layers = config?.layers;
    if (!Array.isArray(layers) || layers.length !== 2) throw new NamCheckError("expected two layer arrays");
    const size = A1_SIZES.find(([, a, b])=>layers[0].channels === a && layers[1].channels === b);
    if (!size) throw new NamCheckError(`layer arrays of ${String(layers[0].channels)} and ${String(layers[1].channels)} channels aren't an A1 size`);
    layers.forEach((la, i)=>{
        const input = i === 0 ? 1 : layers[0].channels;
        const head = i === 0 ? layers[1].channels : 1;
        if (la.input_size !== input || la.head_size !== head) throw new NamCheckError(`layer ${i} doesn't chain like A1`);
        if (la.kernel_size !== 3 || !Array.isArray(la.dilations) || la.dilations.length === 0) throw new NamCheckError(`layer ${i} has a non-A1 receptive field`);
        if (la.activation !== "Tanh") throw new NamCheckError(`layer ${i} uses ${String(la.activation)}, A1 uses Tanh`);
        if (la.condition_size !== 1) throw new NamCheckError(`layer ${i} isn't conditioned on the mono input`);
        if (la.gated) throw new NamCheckError(`layer ${i} is gated`);
    });
    if (typeof config?.head_scale !== "number") throw new NamCheckError("missing head_scale");
    if (!Array.isArray(model.weights) || model.weights.length === 0) throw new NamCheckError("no weights");
    assertRate(model.sample_rate);
    return size[0];
}
function assertA2Shape(model) {
    if (model.architecture !== "WaveNet") throw new NamCheckError(`the A2 model is ${String(model.architecture)}, not WaveNet`);
    assertCoreVersion(model.version, "A2 model");
    const config = model.config;
    if (!isObject(config) || !Array.isArray(config.layers) || config.layers.length !== 1) throw new NamCheckError("A2 has exactly one layer array");
    if (config.head != null) throw new NamCheckError("A2 has no post-stack head");
    if (typeof config.head_scale !== "number") throw new NamCheckError("missing head_scale");
    if ((config.in_channels ?? 1) !== 1) throw new NamCheckError("A2 takes one input channel");
    const la = config.layers[0];
    if (!isObject(la)) throw new NamCheckError("unreadable layer array");
    const ch = la.channels;
    if (typeof ch !== "number" || !A2_CHANNELS.includes(ch) || la.bottleneck !== ch) throw new NamCheckError(`${String(ch)} channels; A2 standard has 8, A2 nano 3`);
    if (la.input_size !== 1 || la.condition_size !== 1) throw new NamCheckError("the layer array isn't conditioned on the mono input");
    if (JSON.stringify(la.kernel_sizes) !== JSON.stringify(A2_KERNEL_SIZES) || JSON.stringify(la.dilations) !== JSON.stringify(A2_DILATIONS)) throw new NamCheckError("the kernel sizes or dilations aren't A2's");
    const acts = la.activation;
    if (!Array.isArray(acts) || acts.length !== A2_KERNEL_SIZES.length || !acts.every((a)=>isObject(a) && a.type === "LeakyReLU" && Math.abs(Number(a.negative_slope) - A2_LEAKY_SLOPE) < 1e-6)) throw new NamCheckError("A2 uses LeakyReLU(0.01) on every layer");
    if (la.gating_mode != null && !(Array.isArray(la.gating_mode) && la.gating_mode.length === A2_KERNEL_SIZES.length && la.gating_mode.every((g)=>g === "none"))) throw new NamCheckError("the layer array is gated");
    if (la.secondary_activation != null && !(Array.isArray(la.secondary_activation) && la.secondary_activation.length === A2_KERNEL_SIZES.length && la.secondary_activation.every((s)=>s === null))) throw new NamCheckError("the layer array has secondary activations");
    if (isObject(la.head1x1) && la.head1x1.active) throw new NamCheckError("the layer array uses head1x1");
    if (!isObject(la.layer1x1) || la.layer1x1.active !== true || (la.layer1x1.groups ?? 1) !== 1) throw new NamCheckError("A2 uses an ungrouped layer1x1");
    const head = la.head;
    if (!isObject(head) || head.out_channels !== 1 || head.kernel_size !== A2_HEAD_TAPS || head.bias !== true) throw new NamCheckError("A2's head is a 16-tap convolution with bias");
    if (FILM_KEYS.some((k)=>isObject(la[k]) && la[k].active)) throw new NamCheckError("the layer array uses FiLM");
    if ((la.groups_input ?? 1) !== 1 || (la.groups_input_mixin ?? 1) !== 1) throw new NamCheckError("the layer array uses grouped convolutions");
    if (la.slimmable != null) throw new NamCheckError("the layer array is slimmable");
    const weights = model.weights;
    const expected = a2WeightCount(ch);
    if (!Array.isArray(weights) || weights.length !== expected) throw new NamCheckError(`${Array.isArray(weights) ? weights.length : 0} weights where A2 with ${ch} channels has ${expected}`);
    return ch;
}
export const a2WeightCount = (c)=>c + A2_KERNEL_SIZES.reduce((n, k)=>n + k * c * c + 3 * c + c * c, 0) + A2_HEAD_TAPS * c + 2;
export function selectA2(nam) {
    assertCoreVersion(nam.version);
    if (nam.architecture === "WaveNet") return {
        model: nam,
        channels: assertA2Shape(nam),
        sampleRate: assertRate(nam.sample_rate)
    };
    if (nam.architecture !== "SlimmableContainer") throw new NamCheckError(`architecture is ${String(nam.architecture)}`);
    const subs = isObject(nam.config) ? nam.config.submodels : undefined;
    if (!Array.isArray(subs) || subs.length === 0) throw new NamCheckError("the A2 file has no submodels");
    let previous = -Infinity;
    for (const s of subs){
        if (!isObject(s) || typeof s.max_value !== "number" || !isObject(s.model) || !Array.isArray(s.model.weights)) throw new NamCheckError("an A2 submodel can't be read");
        if (s.max_value <= previous) throw new NamCheckError("the A2 submodels aren't sorted by max_value");
        previous = s.max_value;
        assertCoreVersion(s.model.version, "A2 submodel");
        const rate = s.model.sample_rate;
        if (typeof nam.sample_rate === "number" && typeof rate === "number" && rate !== nam.sample_rate) throw new NamCheckError("the A2 submodels have different sample rates");
    }
    if (previous < 1) throw new NamCheckError("the last A2 submodel's max_value is below 1.0");
    const model = subs[subs.length - 1].model;
    const channels = assertA2Shape(model);
    return {
        model,
        channels,
        sampleRate: assertRate(nam.sample_rate ?? model.sample_rate)
    };
}
function examine(model) {
    if (!isObject(model)) throw new NamCheckError("not a NAM model");
    const version = String(model.version ?? "");
    if (model.architecture === "SlimmableContainer" || model.architecture === "WaveNet" && version.startsWith("0.7") && isA2Shaped(model)) {
        const { channels } = selectA2(model);
        return {
            check: {
                version,
                reshaped: false,
                arch: "A2",
                size: channels === 8 ? "standard" : "nano"
            },
            reshaped: null
        };
    }
    if (model.architecture !== "WaveNet") throw new NamCheckError(`architecture is ${String(model.architecture)}`);
    if (version.startsWith("0.5")) return {
        check: {
            version,
            reshaped: false,
            arch: "A1",
            size: assertA1(model)
        },
        reshaped: null
    };
    if (!version.startsWith("0.7")) throw new NamCheckError(`unsupported version ${version || "unknown"}`);
    const config = model.config;
    const layers = config?.layers;
    if (!Array.isArray(layers)) throw new NamCheckError("no layer arrays");
    const out = {
        version: NAM_05X_VERSION,
        architecture: "WaveNet",
        config: {
            layers: layers.map((la, i)=>reshapeLayer(i, la)),
            head: config.head ?? null,
            head_scale: config.head_scale
        },
        weights: model.weights,
        sample_rate: model.sample_rate ?? DEFAULT_MODEL_RATE
    };
    if (model.metadata !== undefined) out.metadata = model.metadata;
    return {
        check: {
            version,
            reshaped: true,
            arch: "A1",
            size: assertA1(out)
        },
        reshaped: out
    };
}
export function checkNam(model) {
    return examine(model).check;
}
export function prepareNam(text) {
    let model;
    try {
        model = JSON.parse(text);
    } catch  {
        throw new NamCheckError("not JSON");
    }
    const { check, reshaped } = examine(model);
    return {
        json: reshaped ? JSON.stringify(reshaped) : text,
        check
    };
}
function isA2Shaped(model) {
    const layers = isObject(model.config) ? model.config.layers : undefined;
    if (!Array.isArray(layers) || layers.length !== 1 || !isObject(layers[0])) return false;
    const act = layers[0].activation;
    return Array.isArray(act) && isObject(act[0]) && act[0].type === "LeakyReLU";
}
export function assertWav(buf) {
    const tag = (o)=>String.fromCharCode(buf[o], buf[o + 1], buf[o + 2], buf[o + 3]);
    if (buf.length < 12 || tag(0) !== "RIFF" || tag(8) !== "WAVE") throw new Error("This IR isn't a WAV file. Pick another model or report it to the creator.");
}
