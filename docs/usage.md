# Using FileForge

## Before running

Use the installed `file-forge` executable, or its absolute path `~/.local/bin/file-forge`. From the source checkout, use `pnpm --silent file-forge` after building. Confirm prerequisites and inspect the installed command help:

```sh
file-forge --version
file-forge --help
file-forge image compress --help
file-forge video compress --help
```

Ask for missing operation parameters; an inspection request does not authorize processing or uploading. Quote paths with spaces. Preserve original filenames and source assets.

## Inspect without changing files

```sh
file-forge inspect "$HOME/Downloads/Adorable dog portrait.jpg" --json
file-forge inspect "$HOME/Downloads/file-forge/inputs" --recursive --json
```

Inspection reports supported metadata and per-file outcomes without creating processed copies. Do not claim metadata that the returned result does not contain. Use FFprobe when video stream details are needed.

## Compress images to WebP

```sh
file-forge image compress "$HOME/Downloads/Adorable dog portrait.jpg" \
  --width 512 --height 512 --json
```

Dimensions are optional maximum bounds; omit both to retain original size. Aspect ratio is preserved, and small images are not enlarged. A non-square source will not become a square unless its aspect ratio is already square; this command does not crop. Default WebP quality is 80. Use `--quality 1` through `--quality 100` when explicitly requested.

For batches and an explicit destination:

```sh
file-forge image compress "$HOME/Downloads/file-forge/inputs" \
  --recursive --width 1200 --height 800 \
  --output "$HOME/Downloads/file-forge/outputs" --json
```

For explicit format conversion, use the general image operation:

```sh
file-forge image process "$HOME/Downloads/Adorable dog portrait.jpg" \
  --width 512 --format png --output "$HOME/Downloads/file-forge/outputs" --json
```

General image processing supports WebP, JPEG, PNG, and AVIF. Read its help for current options.

## Compress video and create a cover

```sh
file-forge video compress "$HOME/Downloads/clip.mp4" \
  --width 1280 --height 720 \
  --output "$HOME/Downloads/file-forge/outputs" --json
```

The result includes an H.264 MP4, optional AAC audio, and a first-frame WebP cover matching the encoded dimensions. Width and height are maximum bounds, aspect ratio is preserved, and explicitly resized output dimensions are rounded down to even pixels. Without requested dimensions, resizing is skipped; incompatible original H.264 dimensions fail rather than silently change. `--quality` controls the cover image, not video CRF; the current compression workflow uses CRF 23.

### A requested width with automatic height

Omit the other axis; FileForge preserves the original aspect ratio automatically:

```sh
file-forge video compress INPUT.mp4 --width 300 --json
file-forge folder compress INPUT_DIRECTORY --width 300 --json
```

With no dimensions supplied, compression skips resizing and retains the original dimensions. Both dimensions specify a bounding box; outputs never enlarge. Folder processing recursively preserves hierarchy inside a new delivery directory. Names use lowercase ASCII letters, digits and hyphens, with extensions separate. Non-media files are copied unchanged, `.DS_Store`, symlinks and animated images are skipped, and naming collisions fail before output creation. Each MP4 receives a same-basename sibling WebP cover (for example, `clip.mp4` and `clip.webp`). The manifest records failures and skips. These folder and optional-size features require the current source build until the next release.

## Generate favicons

```sh
file-forge favicon generate "$HOME/Downloads/logo.png" \
  --size 64 --output "$HOME/Downloads/file-forge/outputs" --json
```

Input must be a supported static PNG. Output includes PNG, ICO, and traced SVG. Sizes range from 16 to 256; the default is 64. Tracing can change colors, edges, and partial transparency.

## Export a delivery manifest

```sh
file-forge manifest export "$HOME/Downloads/file-forge/inputs" \
  --recursive --output "$HOME/Downloads/file-forge/outputs" --json
```

This inspects prepared assets and generates generic delivery metadata without forcing recompression or uploading. An existing manifest can be supplied with `--manifest PATH` instead of file arguments.

## Output and results

On macOS, omitted `--output` defaults to Downloads. Other platforms require explicit output, although the released archive currently supports macOS arm64 only. Each operation creates a separate `file-forge-<id>` task directory containing outputs, `manifest.json`, and `report.md`. Keep output roots outside scanned input folders. Do not rename or delete original files. The explicit `folder rename --apply` operation changes selected directory names and writes its receipt separately.

`--json` emits the final structured result to stdout; diagnostics go to stderr. Check overall and per-file statuses, actual output paths, dimensions, and sizes. A successful process exit alone is insufficient if the result reports partial failures. Compression does not guarantee a smaller file.

To report savings, compare real file byte sizes: `(originalBytes - outputBytes) / originalBytes * 100`. Handle an empty original without division by zero. State an increase when the output is larger. Use consistent units: decimal KB/MB or binary KiB/MiB.

## Use from a Codex chat

Once the plugin is loaded, examples are:

> Use FileForge to inspect inputs, then compress the images to WebP within 512 × 512. Save under outputs and preserve the originals.

> Use FileForge to compress inputs/clip.mp4 to width 300 with automatic height. Omit height and report actual dimensions and size savings.

The configured root determines what `inputs` and `outputs` refer to. Call `file_forge_info` rather than assuming a machine-specific path. Supply absolute paths inside that root and an explicit output parent to MCP writes.

Use the discovered tool schemas and [plugin skill](../packages/file-forge-plugin/skills/file-forge/SKILL.md). Relevant tools include `inspect_files`, `compress_images`, `compress_video`, `compress_folder`, `rename_folders`, `process_images`, `generate_favicons`, and `export_manifest`. Supply a unique `requestId`; poll `job_status` with that ID until terminal. Use `job_cancel` for cancellation and continue polling until cleanup finishes.

Only one job runs at a time. Records last for the current MCP session, with up to 128 retained jobs. Reconnecting loses those records; `UNKNOWN_JOB` is not proof that no files were written. Inspect known destinations before retrying. Never automatically replay an uncertain write through CLI fallback.

If no FileForge tools are available, say so. Before any job has been accepted, the installed CLI can be used when authorized, but identify it as CLI execution. See [installation troubleshooting](installation.md#verify-the-connection) for plugin discovery.

## Language and unsupported features

```sh
file-forge config set language zh-CN
file-forge config set language en
```

English is the default. `--language en|zh-CN` overrides presentation for one invocation. Machine keys, error codes, and MCP schemas stay English.

Do not promise S3 uploads, built-in HyperFrames rendering, persistent jobs, or automatic self-update: those features are not implemented CLI/MCP capabilities. An agent can orchestrate external tools separately when requested, but must not describe that as an implemented FileForge command.

## Compress an entire folder

```sh
file-forge folder compress "/absolute/assets" --output "/absolute/delivery" --json
file-forge folder compress "/absolute/assets" --width 300 --output "/absolute/delivery" --json
```

The first preserves each media file’s dimensions; the second limits width with automatic height. Both preserve source contents and create a normalized hierarchy. See [current capabilities](current-capabilities.md) for copied/skipped file behavior.

## Rename original folders explicitly

`folder rename` changes directory names in place only with `--apply`. It does not compress or rename files. Create a JSON array describing selected folders relative to the original root:

```json
[
  { "path": ".", "name": "example-com" },
  { "path": "Some Route", "name": "some-route" },
  { "path": "Some Route/Old Child", "name": "new-child" }
]
```

```sh
file-forge folder rename "/absolute/Example.COM" --renames "/absolute/plan.json" --output "/absolute/receipts" --json
file-forge folder rename "/absolute/Example.COM" --renames "/absolute/plan.json" --output "/absolute/receipts" --apply --json
```

The first command writes a preview receipt; the second applies the explicit mapping. Custom names are preserved exactly. Check current names between preview and apply. No directory merging, overwriting, traversal or symlink paths are allowed. Keep the tree free of concurrent edits while applying. Nested changes run before root changes. On failure, later entries remain planned; completed changes remain and the schema-v3 receipt records current locations. Do not retry blindly or assume rollback. Receipt output must be outside both the original and renamed root. MCP `rename_folders` takes `operation: "folder-rename"`, `input`, `renames`, `output`, optional `apply`, and a unique `requestId`. It cannot rename its configured workspace root itself. Existing content references to renamed folders are not rewritten. These commands require the updated source build until a compatible release is published.
