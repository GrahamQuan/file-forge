# FileForge runtime

[简体中文](README.zh-CN.md)

This preview archive is for macOS Apple Silicon. Install Node.js 22.13 or newer (24 recommended)
and FFmpeg yourself. Sharp, its native libraries, and vector tracing are included. No npm, pnpm,
development checkout, network access, or administrator access is required to use this archive.

Verify the archive before extraction with `shasum -a 256 -c file-forge-0.0.0-darwin-arm64.tar.gz.sha256`.
Checksums detect corruption; obtain the archive and checksum from a trusted source. This preview is not signed.
Extract with `tar -xzf file-forge-0.0.0-darwin-arm64.tar.gz`, then enter the extracted directory.

Run directly with `./file-forge.js --help`, or install:

```sh
./install.js --prefix "$HOME/.local"
export PATH="$HOME/.local/bin:$PATH"
file-forge --version
file-forge favicon generate /path/to/logo.png --size 64 --output /path/to/output
```

The installer accepts `--language en|zh-CN` and `--json`. It checks Node, FFmpeg, the target platform,
and every payload file/link. Set `FFMPEG_PATH` to your external executable if it is not on PATH.
It does not edit your shell configuration. Use `file-forge config set language zh-CN` to save CLI language.

Installed builds are preserved under `PREFIX/lib/file-forge`; `PREFIX/bin/file-forge` points to the active
build. Reinstalling an identical intact build is safe. Install a newly downloaded archive to activate it.
Existing unrelated commands and concurrent installers are rejected. If an installer was forcibly killed,
verify that its recorded PID has exited before manually removing its `.install.lock`. Never remove a live lock.
No automatic cleanup or self-update is performed. Keep older builds while processes still use them.
To roll back, run an older retained build's `install.js --prefix PREFIX`. To stop using FileForge, remove
only its owned `PREFIX/bin/file-forge` link; keep settings/assets and remove old build directories only
when you are sure no process needs them.

For Codex, configure the installed `PREFIX/bin/file-forge` with argument `mcp` and an explicit
`FILE_FORGE_ROOT` workspace. All MCP input/output paths must remain within that workspace. The separate
FileForge plugin can use `FILE_FORGE_EXECUTABLE` pointing to this installed executable. Configure Node
on the host's PATH and FFmpeg on PATH or through `FFMPEG_PATH`. No Codex configuration is changed here.

The current source supports image/video/folder compression, inspection, conversion, favicons, explicit
source-directory rename preview/apply, versioned manifest export, and session-local MCP jobs. With no
width/height, compression preserves original dimensions. Check this archive’s help for its capabilities.
GitHub Actions publishes tested patch releases with a separate matching plugin ZIP and checksums.
Uploads, durable jobs, automatic updates, and other distribution platforms remain unimplemented.
The reusable project skill and its copy helper are maintained in the source checkout; runtime
installation does not copy that skill into projects or register the Codex plugin.
Third-party licenses are retained alongside the included production dependencies in `runtime/node_modules`.

Audio/music compression is strictly lossless and requires FFprobe (PATH, beside configured FFmpeg, or FFPROBE_PATH). Eligible PCM/FLAC becomes smaller verified FLAC; other inputs retain original bytes. Self-contained GLB 2.0 compression only compacts JSON whitespace; binary data stays unchanged. Both are included in folder processing. Audio uses schema v4; model/folder deliveries with automatic GLB posters use schema v6. Existing image/video presets remain lossy.

Use `file-forge model posters INPUT.glb --width 1024 --json` for six quality-80 lossy WebP views (front/back/left/right/top/bottom). Default transparent canvas: 16:9 at 1024×576; `--ratio W:H` selects another ratio, one dimension derives the other and both set exact size (16–4096; conflicting explicit ratios fail). Sources remain unchanged. This separate workflow requires local Chrome/Chromium, discovered as macOS Chrome/Edge or set with absolute `FILE_FORGE_CHROME_PATH`; the browser is not bundled. Three.js and Puppeteer Core are included. Self-contained GLB only, up to 256 MiB; external resources, KTX2/Basis and unknown extensions are rejected. Schema-v5 manifests record each view and camera; versions 1–6 remain exportable. Model/folder compression automatically creates six posters per GLB.

The companion skill can also choose direct Sharp/FFmpeg processing for requests beyond built-in presets. It requires authorized host execution and the relevant installed dependencies, preserves sources and verifies outputs. This is agent orchestration, not an arbitrary-command CLI/MCP endpoint or a FileForge-managed job. Missing tools, essential ambiguity and failures require a proposed solution and user decision.

3D posters automatically pass each rendered PNG through the shared image workflow before delivery, preserving the canvas size and using quality-80 lossy WebP. The standard quality-80 encoding runs once; no second compression pass is needed.

GLB compression automatically generates six default 16:9 posters through the standard image workflow. Combined model/folder deliveries use manifest v6; poster failures retain the processed model and report partial status. Poster-only commands still support custom ratios and sizes.

Image, video and folder compression support `--preset clarity`: image/cover quality 90 (WebP effort 6 and smart subsampling), video CRF 18 with slow encoding. The standard defaults remain quality 80 / CRF 23 medium. Explicit quality overrides images/covers only. Clarity is lossy, may take longer and produce larger files, and does not change dimensions unless requested.

Select a single file with its media command, or use `folder compress PATH --media videos --width 512` to resize only videos recursively. `--media images` selects images; omission processes all supported media. Other files retain their bytes/format in the normalized output copy. Codex remembers settings only within the current chat; new chats start with normal defaults.

Video/folder compression supports `--audio remove` to omit video audio, or `--audio keep` (default) to encode the first audio track as AAC 128 kb/s. Only selected videos are affected; silent input is supported. Originals and standalone audio files are preserved by their existing workflows.
