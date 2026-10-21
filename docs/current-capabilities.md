# Implemented source capabilities

This describes the current source checkout, not a guarantee about any installed release. Check the selected runtime's version/help and MCP tool schemas. Source builds use `0.0.0`; CI stamps release versions. See [installation](installation.md) for release installation and compatibility checks.

| Operation                 | CLI                                     | MCP                        | Behavior                                                                 |
| ------------------------- | --------------------------------------- | -------------------------- | ------------------------------------------------------------------------ |
| Image metadata            | `inspect`                               | `inspect_files`            | Read-only image inspection; recursive only when requested                |
| Image compression         | `image compress`                        | `compress_images`          | WebP, default quality 80; optional dimensions                            |
| Image conversion          | `image process`                         | `process_images`           | WebP/JPEG/PNG/AVIF, at least one explicit processing option              |
| Video compression         | `video compress`                        | `compress_video`           | H.264 MP4, optional AAC, matching first-frame WebP cover                 |
| Folder compression        | `folder compress`                       | `compress_folder`          | Recursive new copy with normalized hierarchy; other regular files copied |
| Original directory rename | `folder rename`                         | `rename_folders`           | Explicit relative-path/name map; preview by default, opt-in apply        |
| Favicon set               | `favicon generate`                      | `generate_favicons`        | Static PNG → PNG/ICO/traced vector SVG, size 16–256, default 64          |
| Manifest/report           | `manifest export`                       | `export_manifest`          | Inspect prepared assets or re-export a versioned manifest                |
| Job control               | MCP session                             | `job_status`, `job_cancel` | One running job; session-only records, up to 128                         |
| Runtime information       | `--version`, `--help`                   | `file_forge_info`          | Version, capabilities/help; MCP root and limits                          |
| CLI presentation          | `config get/set language`, `--language` | —                          | English and Simplified Chinese; machine schemas remain English           |
| Project skill copy        | `pnpm skill:copy` (source checkout)     | —                          | Create or fully replace canonical skill copy; preview and backup         |

## Invariants

No width and no height means compression skips resizing and preserves original dimensions, with existing orientation handling. One dimension leaves the other automatic; both define maximum bounds without cropping or enlargement. Explicitly resized H.264 dimensions round down to even pixels. Without resize, an original size incompatible with H.264/yuv420p fails rather than being silently changed. Image quality and cover quality do not change video CRF (23).

Media operations preserve originals and create `file-forge-<id>` output directories; on macOS the default parent is Downloads. Source-directory rename is the explicit exception: only named directories change in place, file contents stay intact, and a separate receipt records progress. Keep outputs/receipts outside the relevant source tree. MCP paths must remain in its configured workspace; the configured root itself cannot be renamed.

Folder compression normalizes output path components to lowercase ASCII letters/digits/hyphens and keeps extensions separate. It rejects collisions and empty normalized stems, skips `.DS_Store`, symlinks and animated images, and preserves empty directories. Embedded references in copied files are not rewritten.

Audio/music: `audio compress` / `compress_audio`. GLB: `model compress` / `compress_model`. Both also dispatch inside folders; see [lossless policy and limits](lossless-audio-models.md).

Manifest versions: v1 inspection/image/video/export, v2 folder delivery, v3 source-folder rename receipt. v4 covers audio/model deliveries and mixed folders. v5 covers six-angle model posters. v6 covers model/folder deliveries with automatic posters. Readers/re-export accept all six. Failures, skips and current rename paths must be read from the result, not inferred from process exit alone.

## Distribution and remaining work

Implemented: local macOS arm64 archives and managed installation/rollback, plugin ZIP packaging, checksums, and gated GitHub Actions patch releases on `main`. Runtime and plugin are separately installed; Node/FFmpeg remain external prerequisites. Verify actual published assets rather than treating local checks as remote-release evidence.

Not implemented as FileForge CLI/MCP features: S3 uploads, durable job storage, automatic `--upgrade`, general audio editing/composition or arbitrary FFmpeg filters, lossy model optimization, and built-in HyperFrames rendering. HyperFrames can be orchestrated externally for an explicitly requested motion workflow. Proposed workflow scripts in older specs are not available unless listed in the actual package scripts/help.

Video covers use the same basename as their MP4: standalone `video.mp4` / `video.webp`, or the normalized source basename in folder deliveries. Cover/image path collisions fail folder preflight before output creation.

3D posters: `model posters` / `generate_model_posters` renders six axis-aligned quality-80 lossy WebPs from self-contained GLB using Three.js and external Chrome/Chromium. Transparent 16:9 canvas (1024×576) by default; `--ratio W:H` selects another ratio, one dimension derives the other and both set canvas dimensions (16–4096). Also generated automatically by model/folder compression; sources are unchanged. See [poster contract](model-posters.md).

The skill also supports [custom Sharp/FFmpeg processing](custom-processing.md) through authorized host tools. Codex chooses this route when built-in presets do not fit. This extends the skill’s workflows, not the CLI/MCP command schema; direct jobs have their own process tracking and output verification.

Each 3D poster is rendered to a temporary PNG and automatically processed through the shared image workflow before delivery: quality-80 lossy WebP, no additional resizing, output validation and exclusive publication. Ordinary image compression keeps its existing defaults; no manual second compression pass is needed.

Opt in to `--preset clarity` for higher image/video detail retention with compression. Defaults are unchanged; see [clarity preset](clarity-preset.md) for settings, overrides and tradeoffs.

Folder processing supports `--media all|images|videos`; non-selected files are copied unchanged. See [media selection and chat preferences](media-selection.md).

Video audio defaults to keep; opt in to `--audio remove` for videos or selected videos in folders. See [video audio controls](video-audio.md).
