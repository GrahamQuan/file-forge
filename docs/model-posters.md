# Six-angle 3D posters

`model posters` / `generate_model_posters` renders a self-contained GLB 2.0 into six quality-80 lossy WebP images: front, back, left, right, top and bottom. Each view renders to a temporary lossless PNG and then runs through the shared image-processing workflow: orientation handling, no additional resize, quality-80 lossy WebP encoding, output validation and exclusive publication. The model is never modified. Model and folder compression automatically generate these six views for every successfully processed GLB; this command remains available for posters alone. Check installed help/tool schemas before assuming a release has this source capability.

```sh
file-forge model posters "/absolute/My Model.glb" --json
file-forge model posters "/absolute/My Model.glb" --ratio 9:16 --json
file-forge model posters "/absolute/My Model.glb" --ratio 1:1 --width 800 --json
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

Unlike resizing an existing image/video, a 3D render has no original pixel dimensions. The default ratio is 16:9, producing 1024 × 576. Use `--ratio W:H` (MCP `options.ratio`) for any positive ratio, including 9:16, 1:1, 3:2 or 1.5:1. With no dimensions, the longer edge is 1024 (9:16 gives 576 × 1024; 1:1 gives 1024 × 1024). With one dimension, derive the other from the ratio, defaulting to 16:9, and round to the nearest whole pixel. With both dimensions, they define the exact canvas; if a ratio is explicitly supplied, height must equal the nearest integer to width divided by that ratio. Conflicts and derived dimensions outside the supported range fail before creating a delivery. Each dimension must be an integer from 16 through 4096. This does not restore any resize fallback for existing images/videos.

All views use orthographic projection, shared scale and centered bounding-sphere framing with 10% padding, a transparent background, neutral room-environment lighting and the model's default scene/pose. Animation is not played. Imported cameras and lights are ignored. Materials and embedded textures are loaded by Three.js; rendering and tone mapping can differ from another viewer. WebP quality 80 uses lossy encoding of rendered pixels; a poster is a derivative and does not preserve all 3D information.

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

FileForge still requires Node.js and FFmpeg at startup. Poster generation additionally needs a local Chrome/Chromium-compatible browser; it is not bundled or downloaded automatically. Three.js, its Draco/Meshopt decoders and Puppeteer Core are packaged dependencies. The shared Sharp image workflow applies the ordinary WebP quality-80 compression preset once, preserving transparency and canvas dimensions.

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

Deliveries use manifest schema v5, operation `model-posters`. Assets record `view`, `camera`, output dimensions/format/size, `lossless: false` and `optimization: "rendered-poster"`. Parameters record the selected ratio, actual canvas, renderer/browser versions, projection, orientation, pose, lighting and encoding. `parameters.image` records `workflow: "process-image"`, `format: "webp"`, `encoding: "lossy"`, `quality: 80` and `resize: "none"`. Readers and export preserve versions 1–6. Rendered images are new derivatives; do not present their size difference from the GLB as compression savings.

Completed views are published incrementally and retained after a later failure or cancellation. Inspect per-view status: failed views carry an error code and unrendered views are skipped. Missing browser reports `POSTER_BROWSER_REQUIRED`; unsupported input reports `POSTER_UNSUPPORTED_MODEL`; launch/render failures report `POSTER_RENDER_FAILED`; deadline failures report `POSTER_TIMEOUT`; shared image-processing failures report `IMAGE_FAILED`. Use those codes to diagnose the prerequisite or input and propose a solution before retrying. Do not silently install a browser, change model materials or change the encoding policy.

Validation uses real CLI/MCP media jobs and checks equality with standard quality-80 image encoding, six face colors, transparent quality-80 WebP encoding, dimensions, source integrity, manifest export, rejection paths, cancellation and owned-browser cleanup. These are non-UI E2E checks, not screenshot comparisons.

Model compression and folders containing GLBs use manifest schema v6 and automatically generate six 1024 × 576, 16:9, quality-80 WebP posters after each successful GLB optimization. The model remains strictly lossless; poster images are lossy derivatives. Each model's poster set lives in its own uniquely named delivery subfolder beside the processed GLB, with a separate v5 poster manifest; the parent v6 manifest also lists every view and its status. Folder image/video size settings do not alter these default poster canvases. Use the poster-only command for custom ratios or sizes. Missing Chrome, unsupported rendering or a failed view retains the processed GLB and successful views and reports a partial result. Cancellation preserves completed files and poster receipts. Inspection and manifest export never render posters.
