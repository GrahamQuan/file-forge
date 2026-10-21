# Direct Sharp image processing

Read [custom processing](custom-processing.md) first. Use Node.js and Sharp for requested image operations beyond the FileForge presets. Choose the necessary API from the installed version; the examples below do not limit available operations.

## Resolve the dependency

Resolve Sharp from an existing project that declares it, or from the verified FileForge media package's module context. In this source checkout the root declares Sharp. For a managed installation, resolve the active executable to its runtime and inspect its package layout; do not assume a global import or hardcode a pnpm store path. Use Node's `createRequire` anchored to a verified package manifest when the task script lives elsewhere. Check `sharp.versions` and `sharp.format`. Do not modify managed builds to add scripts/dependencies. If no usable Sharp exists, propose a task-local Node project with a compatible Sharp version and ask before installing.

## Select the pipeline

- Inspect metadata, orientation, color profile, alpha, page/frame count and dimensions first. Deliberately choose orientation handling before interpreting crop coordinates. Preserve animation/multipage content unless the user requests a frame/page.
- Crop/extract, extend, rotate/flip, composite, blur/sharpen, color and channel operations are available through Sharp's APIs. Read the relevant API for operation order and constraints; repeated calls do not necessarily form independent sequential passes. Check coordinates, overlays and dimensions against the intended image.
- Select output format and metadata/profile behavior deliberately. Sharp strips metadata by default; retain relevant metadata/profile explicitly when preservation is required, and account for orientation after rotating pixels. PNG or lossless WebP can preserve rendered pixels, but format changes may affect bit depth, color or metadata. Do not treat JPEG quality 100 as lossless.
- Apply only requested resizing. Prefer one encoding pass. Keep input and output distinct, stage into a fresh task-owned directory and publish without replacement; `toFile` alone does not provide an exclusive-create guarantee. Pass paths through argv/config rather than interpolating them into JavaScript.
- Reopen output with Sharp to verify format, dimensions, transparency and page count as applicable. For a no-change lossless conversion, compare decoded pixels under a consistent color/orientation interpretation; for edits, verify the requested transformation instead of claiming equality with the source.

Official references: [operations](https://sharp.pixelplumbing.com/api-operation/), [resize/extract/extend](https://sharp.pixelplumbing.com/api-resize/), [composite](https://sharp.pixelplumbing.com/api-composite/), [output and metadata](https://sharp.pixelplumbing.com/api-output/), [input metadata](https://sharp.pixelplumbing.com/api-input/). Match examples to the installed version.
