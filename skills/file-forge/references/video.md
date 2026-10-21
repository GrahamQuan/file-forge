# Video compression and covers

```sh
file-forge video compress "/absolute/clip.mp4" --json
file-forge video compress "/absolute/clip.mp4" --width 300 --json
file-forge video compress "/absolute/clip.mp4" --height 720 --output "/absolute/output-parent" --json
```

Use `compress_video` with a unique `requestId` and:

```json
{
  "operation": "video-compress",
  "input": "/absolute/clip.mp4",
  "options": { "width": 300 },
  "output": "/absolute/output-parent"
}
```

Pass `options: {}` when no dimensions were requested. Compression uses H.264 MP4, CRF 23, AAC for optional input audio, and a first-frame WebP cover. `quality` affects the cover, not video CRF. There is no arbitrary FFmpeg argument passthrough.

No width/height skips the scale filter. Explicit bounds preserve ratio without enlargement, round down to even output pixels, and must each be at least 2. Original dimensions incompatible with H.264/yuv420p can fail when no resize is requested; report that instead of silently adding resize/padding. Existing autorotation behavior still applies.

Return both video and cover. Validate actual encoded dimensions and byte sizes; covers are additional delivery files, not part of the main-video savings figure. With FFprobe available, use `-v error -show_entries stream=width,height,sample_aspect_ratio:format=size,duration -of json` on the selected output.

## HyperFrames and other motion work

HyperFrames is an external authoring/rendering workflow, not a built-in FileForge command. Do not install it for ordinary compression. If the user requests animated text/composition, inspect an available local HyperFrames project and its actual CLI documentation. Resolve content/timing from user instructions. Render externally when authorized, then pass the resulting video to FileForge and label each step accurately. Do not invent `file-forge hyperframes` or other unimplemented commands.
