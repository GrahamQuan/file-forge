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

Video covers share the output video basename, with `.webp` instead of `.mp4` and no `-cover` suffix. Standalone compression produces `video.mp4` and `video.webp`; folder compression uses the normalized source basename. If another input would produce the same cover path, folder preflight rejects the collision without overwriting files.

For requested operations beyond these presets, select [custom processing](custom-processing.md) and read [direct FFmpeg](ffmpeg.md). Do not force the request into a mismatched built-in operation.

Use the opt-in `--preset clarity` / MCP `options.preset: "clarity"` when the user prioritizes detail while still compressing. It uses image/cover quality 90 (WebP effort 6, smartSubsample enabled) and video CRF 18 / slow. Omission keeps quality 80 and CRF 23 / medium. Explicit quality overrides images/covers only. No automatic resizing or sharpening. This is lossy and may be slower/larger; never promise a quality threshold or the smallest possible output. Audio/model optimization and automatic GLB posters keep their existing policies. Check installed support before using the flag.

Video audio is kept by default: the first audio stream, when present, is encoded as AAC at 128 kb/s (not byte-for-byte passthrough or preservation of every track). Use `--audio remove` / MCP `options.audio: "remove"` to omit all audio streams; `--audio keep` explicitly restores the default. Supported by video and folder compression; image-only commands reject it. Folder selection applies first: only selected videos lose audio, excluded files and standalone audio/music files retain their existing behavior. Silent input is valid in either mode. Covers, video dimensions and compression presets are unchanged. Manifests record `parameters.video.audio`. Remember an explicit choice only within this chat, and pass it on compatible later requests; new chats default to keep.

```sh
file-forge video compress clip.mp4 --audio remove --json
file-forge folder compress ./assets --media videos --width 512 --audio remove --json
```
