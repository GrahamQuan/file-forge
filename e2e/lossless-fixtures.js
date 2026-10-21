import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";
import sharp from "sharp";

export const ffmpeg = (...args) => {
  const result = spawnSync(
    process.env.FFMPEG_PATH || "ffmpeg",
    ["-nostdin", "-v", "error", "-n", ...args],
    { encoding: "utf8", timeout: 30000 },
  );
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
};
export const makeGlb = async (extra = {}) => {
  const positions = Buffer.from(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]).buffer);
  const indices = Buffer.from(new Uint16Array([0, 1, 2, 0]).buffer);
  const animation = Buffer.from(new Float32Array([0, 1, 0, 0, 0, 1, 0, 0]).buffer);
  const image = await sharp({ create: { width: 2, height: 2, channels: 4, background: "red" } })
    .png()
    .toBuffer();
  const bin = Buffer.concat([positions, indices, animation, image]);
  const json = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0, name: 'Triangle " with spaces' }],
    buffers: [{ byteLength: bin.length }],
    bufferViews: [
      { buffer: 0, byteOffset: 0, byteLength: 36 },
      { buffer: 0, byteOffset: 36, byteLength: 6 },
      { buffer: 0, byteOffset: 44, byteLength: 8 },
      { buffer: 0, byteOffset: 52, byteLength: 24 },
      { buffer: 0, byteOffset: 76, byteLength: image.length },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 3,
        type: "VEC3",
        min: [0, 0, 0],
        max: [1, 1, 0],
      },
      { bufferView: 1, componentType: 5123, count: 3, type: "SCALAR" },
      { bufferView: 2, componentType: 5126, count: 2, type: "SCALAR", min: [0], max: [1] },
      { bufferView: 3, componentType: 5126, count: 2, type: "VEC3" },
    ],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
    animations: [
      {
        samplers: [{ input: 2, output: 3, interpolation: "LINEAR" }],
        channels: [{ sampler: 0, target: { node: 0, path: "translation" } }],
      },
    ],
    images: [{ bufferView: 4, mimeType: "image/png" }],
    textures: [{ source: 0 }],
    materials: [{ pbrMetallicRoughness: { baseColorTexture: { index: 0 } } }],
    extras: { note: "Preserve this metadata" },
    ...extra,
  };
  const text = Buffer.from(JSON.stringify(json, null, 2));
  const jsonChunk = Buffer.alloc(Math.ceil(text.length / 4) * 4, 32);
  text.copy(jsonChunk);
  const binChunk = Buffer.alloc(Math.ceil(bin.length / 4) * 4);
  bin.copy(binChunk);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + jsonChunk.length + binChunk.length, 8);
  const jh = Buffer.alloc(8);
  jh.writeUInt32LE(jsonChunk.length);
  jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8);
  bh.writeUInt32LE(binChunk.length);
  bh.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jh, jsonChunk, bh, binChunk]);
};
export const glbContent = (buffer) => {
  const length = buffer.readUInt32LE(12);
  assert.equal(buffer.readUInt32LE(8), buffer.length);
  return {
    json: JSON.parse(buffer.subarray(20, 20 + length).toString()),
    binary: buffer.subarray(20 + length),
  };
};
