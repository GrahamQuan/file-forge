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

## Blurred image padding

Opt in with `--blur-fill` in `image process` or `image compress`, or set `options.padding` to `"blur"` in `process_images` or `compress_images`. The target ratio defaults to `1:1` in this mode. A ratio by itself uses the centered crop.

```sh
file-forge image process portrait.jpg --blur-fill --json
file-forge image compress landscape.png --blur-fill --ratio 4:3 --width 1200 --json
```

After applying EXIF orientation, Sharp fits the complete foreground in the target canvas without enlargement. A second copy of the source covers the canvas and is Gaussian blurred before the foreground is centered over it. The fill uses source pixels. For translucent inputs, the source and background alpha are composited in alpha-capable output formats. An image that already fills the canvas needs no background.

Fill alone uses `image process` and produces a full-color lossless PNG by default. Explicit `--format webp` and `--format avif` alone use lossless encoding. `image compress --blur-fill` opts into compression. It encodes the finished composite as WebP at the selected preset or quality. An explicit quality or preset in `image process` also opts into lossy encoding, including when selecting JPEG, which requires one of those options in blur-fill mode. The MCP equivalents follow the same policy.

With no bounds, the canvas expands to fit the original foreground at the target ratio. Width and height are optional canvas bounds. Both must match the target ratio when supplied together, including the default square ratio. Pixel rounding may slightly alter the actual ratio. Unrepresentable or overly large canvases fail. The manifest records the target `ratio`, `padding: "blur"`, effective format and encoding, quality when lossy, and actual output dimensions. Batch and recursive image inputs use the same policy.

## Blurred video padding

Use `file-forge video process clip.mp4 --blur-fill` for fill alone. It composes each frame and encodes the video once as H.264 High MP4 with 8-bit `yuv420p` at CRF 18 / slow for macOS preview. The video encode is lossy. It writes a matching first-frame PNG cover and copies the first audio stream when present. If the stream cannot be remuxed into MP4, use a compatible source or explicitly request audio removal.

Use `file-forge video compress clip.mp4 --blur-fill --ratio 4:3` when compression is requested. It composes the frames first, then uses H.264 High MP4 with `yuv420p`, AAC audio and a WebP cover. Standard is CRF 23 / medium, and clarity is CRF 18 / slow. Explicit quality still controls the WebP cover.

Both routes use FFmpeg and FFprobe for one local video file. In MCP, send `options.padding: "blur"` to `process_video` (operation `video`) or `compress_video` (operation `video-compress`). The ratio defaults to `1:1`. Only a request for blur fill invokes this mode. A plain ratio uses centered cropping.

FFmpeg orients the frames, normalizes non-square pixels by reducing an axis, then centers the fitted foreground without enlargement. The canvas expands around the original when bounds are omitted. Width and height are maximum bounds. The canvas is rounded to even pixels within those bounds, so the actual ratio can vary slightly. Backgrounds come from the corresponding frames, downscaled for blurring and expanded to fill the canvas. The manifest records padding, target ratio, encoding, audio policy and actual output dimensions. Cover extraction begins after encoding and MP4 muxing finish. For supported SDR inputs, blur fill writes BT.709 primaries and matrix with an sRGB transfer function to the video. Untagged input uses those color defaults. FileForge converts the finalized MP4's first frame to full-range sRGB and embeds an sRGB ICC profile in the PNG or WebP cover through the shared image workflow. HDR transfers and color tags outside the SDR conversion path keep the existing FFmpeg behavior.
