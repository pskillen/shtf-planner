// Shrink an ONNX model's weights without a Python toolchain: weights only, nothing else about the graph changes.
//   node date-spike/shrink-onnx.mjs fp16|int8 IN.onnx OUT.onnx
//   fp16: float32 weights stored as float16, a Cast node turns them back to float32 when the model loads.
//   int8: float32 weights stored as int8 (symmetric, per output channel for Conv and MatMul weights, per tensor otherwise)
//         with a DequantizeLinear node in front of each. Compute stays float32 (this is not ORT's integer-kernel quantisation,
//         which needs its Python tool); only the download is smaller, and only as far as the file compresses.
// Weights under 1024 values stay float32. Built on onnx-proto (npm, MIT); no model is downloaded.
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { onnx } = require('onnx-proto');
const [mode, inPath, outPath] = process.argv.slice(2);
const T = onnx.TensorProto.DataType;
const MIN = 1024;

const model = onnx.ModelProto.decode(readFileSync(inPath));
const g = model.graph;
const num = (d) => (typeof d === 'number' ? d : d.toNumber());
const opset = (model.opsetImport.find((o) => !o.domain || o.domain === 'ai.onnx') ?? {}).version;
const opsetN = num(opset ?? 0);
if (mode === 'int8' && opsetN < 13) {
  // per-axis DequantizeLinear needs opset 13
  const o = model.opsetImport.find((x) => !x.domain || x.domain === 'ai.onnx');
  console.log(`opset ${opsetN} -> 13 (DequantizeLinear with an axis)`);
  o.version = 13;
}

// These converted models keep their weights in Constant nodes. Large float ones become graph initializers (same name), the rest stay.
{
  const keep = [];
  for (const n of g.node) {
    const a = n.opType === 'Constant' ? n.attribute.find((x) => x.name === 'value' && x.t) : null;
    const dims = a ? a.t.dims.map(num) : [];
    if (a && a.t.dataType === onnx.TensorProto.DataType.FLOAT && dims.reduce((x, y) => x * y, 1) >= MIN) {
      a.t.name = n.output[0];
      g.initializer.push(a.t);
    } else keep.push(n);
  }
  g.node = keep;
}

// which node consumes each initializer, to pick the quantisation axis
const users = new Map();
for (const n of g.node) for (const [i, name] of n.input.entries()) (users.get(name) ?? users.set(name, []).get(name)).push({ op: n.opType, i, n });

function floats(t) {
  if (t.rawData && t.rawData.length) {
    const b = new Uint8Array(t.rawData);
    return new Float32Array(b.buffer, 0, b.byteLength / 4);
  }
  return Float32Array.from(t.floatData);
}

function toHalf(v) {
  const f = new Float32Array(1), u = new Uint32Array(f.buffer);
  f[0] = v;
  const x = u[0], sign = (x >>> 16) & 0x8000;
  let e = ((x >>> 23) & 0xff) - 127 + 15, m = x & 0x7fffff;
  if (((x >>> 23) & 0xff) === 0xff) return sign | 0x7c00 | (m ? 0x200 : 0);
  if (e >= 31) return sign | 0x7c00;
  if (e <= 0) {
    if (e < -10) return sign;
    m = (m | 0x800000) >> (1 - e);
    return sign | ((m + 0x1000) >> 13);
  }
  let h = sign | (e << 10) | (m >> 13);
  if (m & 0x1000) h += 1; // round to nearest (ties up: close enough for weights)
  return h;
}

const newInits = [], extraNodes = [];
let before = 0, after = 0, count = 0;
for (const t of g.initializer) {
  const dims = t.dims.map(num);
  const n = dims.reduce((a, b) => a * b, 1);
  if (t.dataType !== T.FLOAT || n < MIN) { newInits.push(t); continue; }
  const w = floats(t);
  before += n * 4; count++;
  if (mode === 'fp16') {
    const h = new Uint16Array(n);
    for (let i = 0; i < n; i++) h[i] = toHalf(w[i]);
    const name = t.name + '__fp16';
    newInits.push(onnx.TensorProto.create({ name, dims: t.dims, dataType: T.FLOAT16, rawData: new Uint8Array(h.buffer) }));
    extraNodes.push(onnx.NodeProto.create({ name: 'cast_' + t.name, opType: 'Cast', input: [name], output: [t.name], attribute: [onnx.AttributeProto.create({ name: 'to', type: onnx.AttributeProto.AttributeType.INT, i: T.FLOAT })] }));
    after += n * 2;
  } else {
    // axis: Conv weights [O,I,kh,kw] -> 0; MatMul weights [K,N] -> 1; anything else -> one scale for the tensor
    const u = users.get(t.name) ?? [];
    let axis = -1;
    if (u.length === 1 && u[0].op === 'Conv' && u[0].i === 1 && dims.length >= 2) axis = 0;
    else if (u.length === 1 && u[0].op === 'MatMul' && u[0].i === 1 && dims.length === 2) axis = 1;
    const C = axis < 0 ? 1 : dims[axis];
    const scale = new Float32Array(C), q = new Int8Array(n);
    const inner = axis === 0 ? n / C : 1; // stride between consecutive elements of one channel on axis 0
    const chanOf = (i) => (axis < 0 ? 0 : axis === 0 ? Math.floor(i / inner) : i % C);
    const amax = new Float32Array(C);
    for (let i = 0; i < n; i++) { const c = chanOf(i); const a = Math.abs(w[i]); if (a > amax[c]) amax[c] = a; }
    for (let c = 0; c < C; c++) scale[c] = amax[c] > 0 ? amax[c] / 127 : 1;
    for (let i = 0; i < n; i++) q[i] = Math.max(-127, Math.min(127, Math.round(w[i] / scale[chanOf(i)])));
    const qn = t.name + '__q', sn = t.name + '__scale', zn = t.name + '__zp';
    newInits.push(
      onnx.TensorProto.create({ name: qn, dims: t.dims, dataType: T.INT8, rawData: new Uint8Array(q.buffer) }),
      onnx.TensorProto.create({ name: sn, dims: axis < 0 ? [] : [C], dataType: T.FLOAT, rawData: new Uint8Array(scale.buffer) }),
      onnx.TensorProto.create({ name: zn, dims: axis < 0 ? [] : [C], dataType: T.INT8, rawData: new Uint8Array(C) }),
    );
    extraNodes.push(onnx.NodeProto.create({ name: 'dq_' + t.name, opType: 'DequantizeLinear', input: [qn, sn, zn], output: [t.name], attribute: axis < 0 ? [] : [onnx.AttributeProto.create({ name: 'axis', type: onnx.AttributeProto.AttributeType.INT, i: axis })] }));
    after += n + C * 4;
  }
}
g.initializer = newInits;
g.node = [...extraNodes, ...g.node];
writeFileSync(outPath, onnx.ModelProto.encode(model).finish());
console.log(`${mode}: ${count} weight tensors, ${(before / 1e6).toFixed(2)} MB -> ${(after / 1e6).toFixed(2)} MB of weights; file ${(readFileSync(inPath).length / 1e6).toFixed(2)} -> ${(readFileSync(outPath).length / 1e6).toFixed(2)} MB`);
