# Image/video ratio and center cropping

Prefer the built-in route for a requested centered aspect crop. Verify installed help/live schemas first: `--ratio W:H` / MCP `options.ratio` is supported by image compression/conversion, video compression, and folder compression. Use positive finite decimal components, such as `1:1`, `4:3`, `16:9` or `1.5:1`.

```sh
file-forge image compress photo.png --ratio 1:1 --json
file-forge image process photo.jpg --ratio 4:3 --width 1200 --format png --json
file-forge video compress clip.mp4 --ratio 9:16 --height 720 --json
file-forge folder compress ./assets --media videos --ratio 1:1 --width 512 --json
```

Use `options: { "ratio": "1:1", "width": 512 }` with `compress_images`, `process_images`, `compress_video` or `compress_folder`, alongside their normal operation, source, output and request ID fields. Ratio alone is a valid explicit `process_images` option.

Crop before resizing: remove excess left/right or top/bottom edges equally around the center. Apply image orientation first; video uses display aspect and a fixed center throughout the clip. Never stretch, pad or enlarge. Ratio alone needs no dimension question. One dimension is a maximum bound; two must match the requested ratio or validation fails. Integer cropping and even video sizing can slightly alter the final ratio. Very small unrepresentable crops fail; do not silently substitute another result.

Without ratio, existing size rules apply: no dimensions preserves original size, one axis is automatic, two fit inside without cropping. Video covers follow the encoded crop and shared image processing; do not crop or encode them a second time. Folder selection applies first, excluded files stay unchanged, and audio/model optimization and automatic GLB posters do not inherit this crop.

Read `parameters.image` / `parameters.video` for requested ratio and `crop: "center"`; verify actual output dimensions and return video plus cover. Preserve originals. Explain intentional edge removal and avoid treating cropped bytes as equivalent-content compression savings. Retain explicit ratio preferences only in the current chat for compatible operations; never persist configuration or combine an inherited ratio with conflicting new dimensions without resolving the conflict.

For a custom crop region, tracking or other unsupported requirement, use the custom Sharp/FFmpeg route. Missing support, essential ambiguity or failed operations follow the skill's stop-and-ask rules; a clear centered-ratio request needs no redundant crop-position approval.
