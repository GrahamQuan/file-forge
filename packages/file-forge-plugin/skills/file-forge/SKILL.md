---
name: file-forge
description: Inspect local image assets, compress folders, images and videos with first-frame covers, losslessly optimize audio/music and GLB models, resize/convert image batches, generate PNG/ICO/traced-SVG favicons, or export generic delivery manifests with FileForge. Use when the user requests these operations on existing local files. Does not generate new artwork or upload files.
---

# FileForge

Use the configured FileForge MCP server for supported operations. First call `file_forge_info` and verify
runtime version `0.0.0`, the authorized root, and session limits. If setup fails, read
[setup](../../SETUP.md); report the missing prerequisite. Never silently install or upgrade anything.
Node.js >=22.13 and user-installed FFmpeg are required; Sharp is included with the runtime.

## Image/video compression workflow

Width and height are optional maximum bounds. With neither supplied, skip resizing and keep the original dimensions.
With one axis supplied, leave the other omitted so the original ratio determines it.
With both supplied, fit inside the box. Never enlarge; explicitly resized video dimensions round down to even pixels.
For directories use `compress_folder` with `operation: "folder-compress"`, `input`, `output`,
and `options` (an empty object preserves the original dimensions). Preserve hierarchy in a new folder,
normalize names to lowercase ASCII letters, digits and hyphens, and keep extensions separate.
Non-media files are copied unchanged; symlinks, .DS_Store and animated images are skipped.
Naming collisions fail before output creation. Report skipped and failed assets.

### Images (Sharp)

1. Reduce width and height to the agreed bounds.
2. Compress with quality 80 unless the user supplies another quality (1–100).
3. Encode as WebP. Resize and compression happen in one Sharp encoding pass.

Use `compress_images` with operation `image-compress`, `files`, `output`, and
`options: { width, height, quality }`. Use this for compression requests, including when the
user calls the general image workflow. Keep `process_images` for explicit general conversion.

### Videos (FFmpeg)

1. Establish the reduced dimensions first.
2. If the user needs animated copy, use a local Hyperframes project at those dimensions.
   Reuse an existing local installation, or install `hyperframes` locally in the task's motion
   project with `npm install --save-dev hyperframes`. This conditional installation is part of
   the requested motion workflow; announce it and avoid global installs. Read the
   [official CLI instructions](https://hyperframes.app/docs/5-packages/cli), author the requested
   copy and animation, then render a local video. Preserve the source and project. Do not invent
   copy when it is missing: ask for the text and timing. This is an agent-orchestrated step;
   FileForge does not render Hyperframes compositions itself.
3. Submit `compress_video`, operation `video-compress`, with `input` (the source or motion
   render), `output`, and `options: { width, height, quality }`. FFmpeg scales before encoding
   H.264 MP4 (CRF 23) with optional AAC audio. Here `quality` controls the cover's image quality.
4. The operation extracts the first frame of the final video and runs the Sharp image workflow
   to produce a compressed WebP cover with the same actual width and height as the video.

Return both video and cover paths. Compression does not guarantee a smaller file.
Do not install Hyperframes for ordinary compression. Stop task-owned preview/render workers
and close temporary browser resources when finished; preserve user-owned resources.

## Submit and observe

- Use user-authorized paths within the configured workspace. Require an explicit output parent for writes.
- Select `compress_images` or `compress_video` for the compression workflow above.
  Other operations use `inspect_files`, `process_images`, `generate_favicons`, or `export_manifest`.
  Supply a unique `requestId` and the tool's `operation` literal (`inspect`, `image`, `favicon`, or `export`).
- Inspection takes `files` and optional `recursive`. Image processing adds `options` with explicit width,
  height, quality (1–100), and/or format (`webp`, `jpeg`, `png`, `avif`), plus `output`.
- Favicons take `input` (static PNG), `output`, and optional `size` (16–256, default 64).
  SVG contains traced vector shapes; warn that tracing can change colors, edges, and partial transparency.
- Export takes `files` OR `manifest`, `output`, and optional `recursive`/`includePaths`.
  Reports omit absolute paths by default; JSON manifests retain local paths.
- Poll `job_status` with the same `requestId`, using a reasonable delay (start at one second).
  Report success only after terminal status. Return actual output paths and per-file failures.
  To stop, call `job_cancel`, then poll until terminal. `cancelling` is not completion.
- One job runs at a time. `BUSY` means the new request was not accepted; wait for the active job.
  The session retains up to 128 jobs. Request IDs deduplicate only within that live session.
- Never change parameters for an accepted ID. After timeout, query status; do not automatically replay a
  write through CLI. After reconnect, records are lost: inspect known output directories and report
  uncertainty rather than duplicate the operation. Never delete completed outputs to recover.

## CLI fallback

Only before a job has been accepted, if MCP is unavailable and terminal use is permitted, resolve
`FILE_FORGE_EXECUTABLE` or `file-forge` on PATH, verify `--version`, then use explicit arguments and `--json`.
Use argument arrays or proper shell quoting for user paths. Never interpolate paths as shell code.
Supported command equivalents:

```text
file-forge inspect INPUT... --json
file-forge folder compress INPUT_DIRECTORY --width 512 --output OUTPUT --json
file-forge image compress INPUT... --width 800 --height 600 --output OUTPUT --json
file-forge video compress INPUT.mp4 --width 1280 --height 720 --output OUTPUT --json
file-forge favicon generate INPUT.png --size 64 --output OUTPUT --json
file-forge manifest export INPUT... --output OUTPUT --json
file-forge manifest export --manifest MANIFEST.json --output OUTPUT --json
```

CLI supports `--recursive` and `--language en|zh-CN`, plus `config get language` and
`config set language en|zh-CN`. Parse JSON rather than localized text. Exit 0 means success/empty,
1 partial/failure, 2 invalid arguments/configuration, and 130 cancellation. CLI cancellation waits for
active media work; retain completed outputs and inspect delivery metadata.

No uploads, general audio/composition CLI operations, ZIP intake, GLB processing, SVG-to-JSX, specialized delivery
formats, persistent jobs, or self-update are implemented. Do not invent tools or promise those features.

## Explicit source-folder renaming

Use `rename_folders` (`operation: "folder-rename"`) or `folder rename INPUT --renames PLAN.json` only when the user requests changing original directory names. The plan is an array of `{ "path": "relative/subfolder", "name": "desired-name" }`; `path: "."` selects the input root. Custom names are exact; derive lowercase/hyphen names only when requested. Ask which root/subfolders and names when unclear. Preview first (omit apply), show mappings, and use `apply: true` / `--apply` only for the user's authorized mapping. Reuse explicit authorization; do not ask again for settled names. This does not rename files or compress media. Default compression still creates a new folder. Receipt output must be outside both old and new source roots. MCP cannot rename its configured workspace root. On collision/failure stop, preserve completed renames, show receipt current paths and ask with a proposed solution. Never retry the full plan blindly.

Video covers share the output video basename, with `.webp` instead of `.mp4` and no `-cover` suffix. Standalone compression produces `video.mp4` and `video.webp`; folder compression uses the normalized source basename. If another input would produce the same cover path, folder preflight rejects the collision without overwriting files.

## Lossless audio and models

Use `compress_audio` (`operation: "audio-compress"`) and `compress_model` (`operation: "model-compress"`) with `input`, `output` and `requestId`, then poll. Audio requires FFprobe, configurable through `FFPROBE_PATH`. Eligible 16/24-bit integer PCM/FLAC becomes smaller sample-verified FLAC; other encodings, extra streams, or non-beneficial candidates retain original bytes. GLB 2.0 optimization only compacts JSON whitespace and preserves binary data and decoder requirements; external-resource models are rejected. No lossy model/audio options exist. Folder processing dispatches both automatically, independently of width/height/quality. Read schema-v4 `lossless`, `optimization`, `note` and byte sizes; explicitly report `original-retained` with zero savings. Mixed-folder images/videos still use existing lossy presets.
