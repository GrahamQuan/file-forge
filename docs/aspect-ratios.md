# Image and video aspect ratios

Current source supports optional `--ratio W:H` in `image compress`, `image process`, `video compress`, and `folder compress`. The equivalent MCP field is `options.ratio` in `compress_images`, `process_images`, `compress_video`, and `compress_folder`. Verify installed help and live schemas before using it; source support does not establish published release availability.

```sh
file-forge image compress photo.png --ratio 1:1 --json
file-forge image process photo.jpg --ratio 4:3 --width 1200 --format png --json
file-forge video compress clip.mp4 --ratio 9:16 --height 720 --json
file-forge folder compress ./assets --media videos --ratio 1:1 --width 512 --json
```

Supply an explicit output parent outside macOS. MCP requires paths under its configured root, an output parent, and a unique request ID, for example:

```json
{
  "requestId": "square-video-1",
  "operation": "video-compress",
  "input": "/workspace/clip.mp4",
  "options": { "ratio": "1:1", "width": 512 },
  "output": "/workspace/deliveries"
}
```

## Crop and resize contract

- Ratios use two positive finite decimal components separated by a colon, such as `1:1`, `16:9`, or `1.5:1`. Zero, negative, non-finite, overflowing/underflowing ratios and malformed strings are rejected. Scientific notation is not accepted.
- Crop the largest centered rectangle of the target aspect before resizing. Wide sources lose left/right edges; tall sources lose top/bottom edges. For example, `1920x1080` to `1:1` retains the central `1080x1080`, removing 420 pixels from each side. There is no padding, content-aware positioning or subject tracking.
- Image cropping follows EXIF orientation. Video cropping uses the autorotated display aspect, including sample aspect ratio, with a fixed center throughout the clip. Non-square video pixels are normalized to square pixels by reducing an axis, without increasing either cropped pixel dimension.
- With ratio alone, crop without additional image resizing. Video dimensions still round down to even pixels for H.264/yuv420p. With one dimension, use it as a maximum bound; with both dimensions, require their ratio to match the explicit target before pixel rounding, then treat them as maximum bounds. Never enlarge. Conflicting dimensions fail validation before creating a delivery.
- Integer image crop sizes round down and offsets use the center rounded down; opposite edges can differ by one pixel. Subsequent image resizing follows Sharp's integer sizing. Video output dimensions round down to even pixels. The actual aspect can differ slightly from the request. Crops smaller than one image pixel, or final video axes smaller than two pixels, fail instead of padding or silently restoring source size.
- Without ratio, existing behavior remains: no dimensions means no resizing; one axis derives the other; two axes fit inside bounds without cropping or enlargement. Incompatible original video dimensions still fail if neither ratio nor size was requested.

Video covers come from the first decoded frame of the final cropped video and pass through the shared image workflow once. They match the video dimensions and are not cropped a second time. Preset, quality and audio policies retain their existing meanings.

Folder selection applies first. Only selected images/videos use the ratio; excluded regular files are copied unchanged, audio/model bytes retain their existing policy, and automatic GLB poster canvases remain unchanged. Poster-only `--ratio` continues to configure a canvas, not this image/video crop workflow.

Sources remain untouched. Manifests record the requested `ratio`, `crop: "center"`, requested bounds and actual asset output dimensions in the existing parameter/asset fields. Standalone deliveries remain v1; folder version selection is unchanged, and older manifests remain readable/re-exportable. Report actual dimensions and intentional edge removal; cropped output savings are not an equivalent-content compression comparison.
