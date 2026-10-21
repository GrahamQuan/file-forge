# 3D models: lossless compression and six-angle posters

Use `model compress` for self-contained GLB 2.0. Prefer connected `compress_model`. Check installed help and tool schemas first; older releases may lack this operation. No lossy fallback is authorized by a compression request.

```sh
file-forge model compress "/absolute/scene.glb" --json
```

The MCP tool requires `requestId`, `input`, `output` and `operation: "model-compress"`. There is no options object. Use an output parent within the authorized MCP root; CLI defaults to Downloads on macOS. Follow [execution](execution.md) for job polling and reporting.

GLB optimization only compacts JSON whitespace, preserving numeric tokens and all binary data. It does not simplify geometry, quantize values, re-encode textures, resample animation, or add decoder requirements. No separate model CLI is required. Other model formats and external-resource GLBs are unsupported. Explain that an already compact GLB may not shrink; do not substitute a lossy optimizer to reach a size target.

Folder compression automatically uses this policy for GLB files. Dimensions and quality do not affect models. Sources remain intact. Mixed folders still use the existing lossy image/video presets; do not describe the whole folder as lossless. If the user requires strictly lossless images/videos too, stop and explain that those existing presets do not meet that requirement.

Read schema-v4 asset fields `lossless`, `optimization`, `note`, `size`, `outputSize`, and `sizeChange`. `original-retained` is a valid successful outcome with zero savings. Report it explicitly, alongside the actual path and format. Never claim smaller size solely because the job succeeded.

## Six-angle posters

Use `model posters` / connected `generate_model_posters` when the user wants preview images of a GLB. This is independent of compression; neither `model compress` nor `folder compress` creates posters. Check installed help/schema first.

```sh
file-forge model posters "/absolute/My Model.glb" --width 1200 --height 800 --json
```

The MCP request uses `requestId`, `operation: "model-posters"`, `input`, `output` and optional `options: { width, height, ratio }`. Poll/cancel with the ordinary job tools. Output must be inside the authorized MCP root.

- The built-in poster operation automatically sends each rendered PNG through the shared image workflow with lossless WebP encoding and no further resizing. Do not run the ordinary quality-80 compression preset again. Check `parameters.image` for the recorded processing policy.
- Generate all six lossless WebP files: `my-model-front.webp`, `my-model-back.webp`, `my-model-left.webp`, `my-model-right.webp`, `my-model-top.webp`, `my-model-bottom.webp`. Do not invent a selected best poster or compress the model as an extra step.
- Default canvas is transparent 16:9 at 1024 × 576. Use `--ratio W:H` / `options.ratio` for positive ratios such as 9:16, 1:1 or 1.5:1. Without dimensions, the long edge is 1024. One dimension derives the other with nearest-pixel rounding; both set exact canvas size, each 16–4096, and must agree with any explicit ratio. Invalid/conflicting ratios or derived sizes outside these limits fail; ask for a compatible size rather than silently changing the request. A 3D model has no original pixel aspect ratio. These defaults do not change image/video no-resize behavior.
- Axis directions are front +Z, back -Z, left -X, right +X, top +Y, bottom -Y. Shared orthographic framing and lighting use the default scene/pose without animation. Explain that axis-front can differ from the apparent front of a rotated model; ask if the user requires a semantic angle or different pose that the tool cannot provide.
- Check for local Chrome/Chromium (macOS Chrome or Edge under `/Applications`), or an absolute `FILE_FORGE_CHROME_PATH`. Three.js and decoders are packaged. A missing browser blocks only posters. Follow the entry skill's stop-and-ask rule before installing; propose the existing executable path or an approved browser installation. No user profile or existing tabs are used.
- Input must be a self-contained GLB 2.0 up to 256 MiB. External resources, KTX2/Basis and unknown extensions are rejected. Do not silently remove materials/textures or change rendering tools after a failure. Diagnose `POSTER_BROWSER_REQUIRED`, `POSTER_UNSUPPORTED_MODEL`, `POSTER_RENDER_FAILED`, `POSTER_TIMEOUT` or image-stage `IMAGE_FAILED`, explain a concrete remedy and ask before retrying or changing scope.
- Read schema-v5 per-view status and camera/output metadata. Report partial/cancelled results and retain successful views. Lossless refers to WebP encoding of rendered pixels; sources remain unchanged, but appearance depends on the renderer and lighting. Do not report image-versus-model size differences as compression savings.
