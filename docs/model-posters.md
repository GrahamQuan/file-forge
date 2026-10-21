# Six-angle 3D posters

`model posters` / `generate_model_posters` renders a self-contained GLB 2.0 into six lossless WebP images: front, back, left, right, top and bottom. The model is never modified. This is a separate operation from model or folder compression; compression does not generate posters automatically. Check installed help/tool schemas before assuming a release has this source capability.

```sh
file-forge model posters "/absolute/My Model.glb" --json
file-forge model posters "/absolute/My Model.glb" --width 1200 --height 800 --output "/absolute/delivery" --json
```

Output goes into a new task directory under macOS Downloads or `--output`:

```text
my-model-front.webp
my-model-back.webp
my-model-left.webp
my-model-right.webp
my-model-top.webp
my-model-bottom.webp
manifest.json
```

The stem uses lowercase ASCII letters, numbers and hyphens (up to 180 characters); an empty normalized stem becomes `model`. Each run creates a separate directory and never overwrites previous results. No additional “best angle” poster is selected.

## Dimensions, cameras and appearance

Unlike resizing an existing image/video, a 3D render has no original pixel dimensions. The default canvas is 1024 × 1024. One supplied dimension makes a square canvas; both supplied dimensions set the exact canvas. Each dimension must be an integer from 16 through 4096. This does not restore any resize fallback for existing images/videos.

All views use orthographic projection, shared scale and centered bounding-sphere framing with 10% padding, a transparent background, neutral room-environment lighting and the model's default scene/pose. Animation is not played. Imported cameras and lights are ignored. Materials and embedded textures are loaded by Three.js; rendering and tone mapping can differ from another viewer. Lossless WebP means no additional lossy image encoding after rendering; it does not mean a 2D poster preserves all 3D information.

| File view | Camera location relative to model center | Camera up |
| --------- | ---------------------------------------- | --------- |
| front     | +Z                                       | +Y        |
| back      | -Z                                       | +Y        |
| left      | -X                                       | +Y        |
| right     | +X                                       | +Y        |
| top       | +Y                                       | -Z        |
| bottom    | -Y                                       | +Z        |

Labels follow the model's coordinate axes, not a guess about its semantic front. A rotated export may therefore have a different apparent front. Flat or one-sided geometry can legitimately appear edge-on or invisible from some views.

## Dependencies and supported input

FileForge still requires Node.js and FFmpeg at startup. Poster generation additionally needs a local Chrome/Chromium-compatible browser; it is not bundled or downloaded automatically. Three.js, its Draco/Meshopt decoders and Puppeteer Core are packaged dependencies. Sharp encodes the rendered pixels with `lossless: true`.

On macOS the renderer discovers Google Chrome or Microsoft Edge in `/Applications`. Set `FILE_FORGE_CHROME_PATH` to an absolute browser executable for another location; for example:

```sh
export FILE_FORGE_CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
```

For MCP, set this in the server environment when needed. Each job uses its own temporary browser profile and pipe transport, with no debug listening port. Only packaged scripts and the selected GLB are served to the renderer; external model resources are blocked. The owned browser and temporary files are cleaned up on completion, failure or cooperative cancellation. Existing browser profiles and tabs are not used.

Input is limited to a regular, non-symlink, self-contained `.glb` file up to 256 MiB. Embedded PNG/JPEG/WebP/AVIF textures and supported Three.js material extensions are accepted, as are Draco/Meshopt geometry decoders. External resources, KTX2/Basis textures, unknown declared extensions, malformed GLBs and empty/invalid bounds fail explicitly. This is not full glTF conformance validation. Large/complex scenes may time out: initialization is limited to 90 seconds and each view to 60 seconds. The browser's own startup timeout is 30 seconds.

## MCP and manifests

Submit `generate_model_posters` and poll `job_status` using the same request ID:

```json
{
  "requestId": "model-posters-1",
  "operation": "model-posters",
  "input": "/workspace/my-model.glb",
  "output": "/workspace/delivery",
  "options": { "width": 1200, "height": 800 }
}
```

`options` is optional. All paths must remain inside the configured MCP root. `job_cancel` stays available while rendering runs in a worker.

Deliveries use manifest schema v5, operation `model-posters`. Assets record `view`, `camera`, output dimensions/format/size, `lossless: true` and `optimization: "rendered-poster"`. Parameters record canvas, renderer/browser versions, projection, orientation, pose, lighting and encoding. Readers and export preserve versions 1–5. Rendered images are new derivatives; do not present their size difference from the GLB as compression savings.

Completed views are published incrementally and retained after a later failure or cancellation. Inspect per-view status: failed views carry an error code and unrendered views are skipped. Missing browser reports `POSTER_BROWSER_REQUIRED`; unsupported input reports `POSTER_UNSUPPORTED_MODEL`; launch/render failures report `POSTER_RENDER_FAILED`; deadline failures report `POSTER_TIMEOUT`. Use those codes to diagnose the prerequisite or input and propose a solution before retrying. Do not silently install a browser, change model materials or switch to lossy encoding.

Validation uses real CLI/MCP media jobs and checks six face colors, transparent/lossless WebP encoding, dimensions, source integrity, manifest export, rejection paths, cancellation and owned-browser cleanup. These are non-UI E2E checks, not screenshot comparisons.
