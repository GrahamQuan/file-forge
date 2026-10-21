# Image inspection, compression and conversion

Inspect only when requested or useful to the operation; inspection is not permission for unrelated processing. The current inspector handles image metadata, with explicit unsupported/skipped entries for other formats. Use FFprobe for video stream metadata.

```sh
file-forge inspect "/absolute/input.png" --json
file-forge inspect "/absolute/assets" --recursive --json
file-forge image compress "/absolute/input.png" --json
file-forge image compress "/absolute/input.png" --width 300 --json
file-forge image process "/absolute/input.png" --format png --quality 90 --json
```

Compression produces WebP at quality 80 by default; supported explicit quality is integer 1–100. No dimensions means no resizing. Width-only or height-only sets that maximum while preserving aspect ratio. Two axes mean fit inside, not exact square/crop/stretch. Small images are not enlarged. Orientation metadata is applied by the image pipeline.

For explicit output formats use `image process`, supporting WebP, JPEG, PNG and AVIF; it needs at least one explicit option such as format, quality or a dimension. Image compression accepts multiple files and opt-in `--recursive`; it produces flat, uniquely named outputs. For preserving directory hierarchy, use [folders](folders.md).

MCP request bodies, plus a unique `requestId`:

- `inspect_files`: `{"operation":"inspect","files":["/absolute/input.png"],"recursive":false}`
- `compress_images`: `{"operation":"image-compress","files":["/absolute/input.png"],"options":{},"output":"/absolute/output-parent"}`
- `process_images`: `{"operation":"image","files":["/absolute/input.png"],"options":{"format":"avif","width":300},"output":"/absolute/output-parent"}`

Read live schemas before submitting. Animated images and unsupported formats are reported, not flattened silently. Originals remain unchanged. [Validate the result](execution.md) rather than claiming success solely from exit status.

For requested operations beyond these presets, select [custom processing](custom-processing.md) and read [direct Sharp](sharp.md). Do not force the request into a mismatched built-in operation.

Use the opt-in `--preset clarity` / MCP `options.preset: "clarity"` when the user prioritizes detail while still compressing. It uses image/cover quality 90 (WebP effort 6, smartSubsample enabled) and video CRF 18 / slow. Omission keeps quality 80 and CRF 23 / medium. Explicit quality overrides images/covers only. No automatic resizing or sharpening. This is lossy and may be slower/larger; never promise a quality threshold or the smallest possible output. Audio/model optimization and automatic GLB posters keep their existing policies. Check installed support before using the flag.
