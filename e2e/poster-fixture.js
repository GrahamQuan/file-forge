// A closed box with six distinct unlit faces: visible from every requested axis.
export function makePosterGlb(extra = {}) {
  const faces = [
    [
      [-1, -0.7, 0.5],
      [1, -0.7, 0.5],
      [1, 0.7, 0.5],
      [-1, 0.7, 0.5],
    ],
    [
      [1, -0.7, -0.5],
      [-1, -0.7, -0.5],
      [-1, 0.7, -0.5],
      [1, 0.7, -0.5],
    ],
    [
      [-1, -0.7, -0.5],
      [-1, -0.7, 0.5],
      [-1, 0.7, 0.5],
      [-1, 0.7, -0.5],
    ],
    [
      [1, -0.7, 0.5],
      [1, -0.7, -0.5],
      [1, 0.7, -0.5],
      [1, 0.7, 0.5],
    ],
    [
      [-1, 0.7, 0.5],
      [1, 0.7, 0.5],
      [1, 0.7, -0.5],
      [-1, 0.7, -0.5],
    ],
    [
      [-1, -0.7, -0.5],
      [1, -0.7, -0.5],
      [1, -0.7, 0.5],
      [-1, -0.7, 0.5],
    ],
  ];
  const colors = [
    [1, 0, 0, 1],
    [0, 1, 0, 1],
    [0, 0, 1, 1],
    [1, 1, 0, 1],
    [1, 0, 1, 1],
    [0, 1, 1, 1],
  ];
  const bin = Buffer.from(
    new Float32Array(faces.flatMap((face) => [0, 1, 2, 0, 2, 3].flatMap((i) => face[i]))).buffer,
  );
  const json = {
    asset: { version: "2.0" },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes: [{ mesh: 0 }],
    buffers: [{ byteLength: bin.length }],
    bufferViews: faces.map((_, i) => ({ buffer: 0, byteOffset: i * 72, byteLength: 72 })),
    accessors: faces.map((face, i) => ({
      bufferView: i,
      componentType: 5126,
      count: 6,
      type: "VEC3",
      min: [0, 1, 2].map((axis) => Math.min(...face.map((v) => v[axis]))),
      max: [0, 1, 2].map((axis) => Math.max(...face.map((v) => v[axis]))),
    })),
    meshes: [{ primitives: faces.map((_, i) => ({ attributes: { POSITION: i }, material: i })) }],
    materials: colors.map((color) => ({
      pbrMetallicRoughness: { baseColorFactor: color },
      extensions: { KHR_materials_unlit: {} },
    })),
    extensionsUsed: ["KHR_materials_unlit"],
    ...extra,
  };
  const text = Buffer.from(JSON.stringify(json));
  const padded = Buffer.alloc(Math.ceil(text.length / 4) * 4, 32);
  text.copy(padded);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(28 + padded.length + bin.length, 8);
  header.writeUInt32LE(padded.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  const bh = Buffer.alloc(8);
  bh.writeUInt32LE(bin.length);
  bh.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, padded, bh, bin]);
}
