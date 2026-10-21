# Lossless 3D models: GLB

Use `model compress` for self-contained GLB 2.0. Prefer connected `compress_model`. Check installed help and tool schemas first; older releases may lack this operation. No lossy fallback is authorized by a compression request.

```sh
file-forge model compress "/absolute/scene.glb" --json
```

The MCP tool requires `requestId`, `input`, `output` and `operation: "model-compress"`. There is no options object. Use an output parent within the authorized MCP root; CLI defaults to Downloads on macOS. Follow [execution](execution.md) for job polling and reporting.

GLB optimization only compacts JSON whitespace, preserving numeric tokens and all binary data. It does not simplify geometry, quantize values, re-encode textures, resample animation, or add decoder requirements. No separate model CLI is required. Other model formats and external-resource GLBs are unsupported. Explain that an already compact GLB may not shrink; do not substitute a lossy optimizer to reach a size target.

Folder compression automatically uses this policy for GLB files. Dimensions and quality do not affect models. Sources remain intact. Mixed folders still use the existing lossy image/video presets; do not describe the whole folder as lossless. If the user requires strictly lossless images/videos too, stop and explain that those existing presets do not meet that requirement.

Read schema-v4 asset fields `lossless`, `optimization`, `note`, `size`, `outputSize`, and `sizeChange`. `original-retained` is a valid successful outcome with zero savings. Report it explicitly, alongside the actual path and format. Never claim smaller size solely because the job succeeded.
