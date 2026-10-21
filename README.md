# FileForge

[English](README.md) | [简体中文](README.zh-CN.md)

Local media processing for people, scripts, and coding agents, powered by Sharp and FFmpeg. Available through a CLI and local MCP tools.

**Source capabilities:** image/video/folder compression, lossless audio/music and GLB JSON optimization, six-angle 3D posters, image conversion, favicon generation, inspection, explicit source-folder renaming, and versioned delivery manifests are implemented. Uploads, persistent jobs, and self-update are not yet implemented. GitHub release automation is configured; availability depends on a successful main-branch run.

Source folders can also be renamed explicitly with `folder rename INPUT --renames PLAN.json`: preview by default, `--apply` to apply an exact root/subfolder mapping. File contents remain unchanged; see [usage](docs/usage.md#rename-original-folders-explicitly).

## Local guides

- [Install FileForge and connect Codex](docs/installation.md)
- [Use the CLI and MCP tools](docs/usage.md)
- [Current capabilities and remaining work](docs/current-capabilities.md)
- [Copy the reusable skill into another project](docs/skill-distribution.md)
- [Documentation index for coding agents](docs/README.md)

## Quick start

Install Node.js 24, pnpm 10.33.0, and FFmpeg. FFmpeg must be on `PATH` or configured through `FFMPEG_PATH`; Sharp is included.

```sh
pnpm install
pnpm build
pnpm --silent file-forge --help
```

## Usage

```sh
# Inspect assets
pnpm --silent file-forge inspect ./assets --recursive --json

# Compress images to WebP
pnpm --silent file-forge image compress ./assets --width 1200 --height 800 --output ./delivery --json

# Compress a video to MP4 and generate a WebP cover
pnpm --silent file-forge video compress ./clip.mp4 --width 1280 --height 720 --output ./delivery --json

# Losslessly optimize audio/music or a self-contained GLB
pnpm --silent file-forge audio compress ./song.wav --output ./delivery --json
pnpm --silent file-forge model compress ./scene.glb --output ./delivery --json
pnpm --silent file-forge model posters ./scene.glb --width 1024 --output ./delivery --json

# Compress a directory into a normalized hierarchy, preserving original dimensions
pnpm --silent file-forge folder compress ./assets --output ./delivery --json

# Generate PNG, ICO, and traced SVG favicons from a static PNG
pnpm --silent file-forge favicon generate ./logo.png --size 64 --output ./icons --json

# Export a delivery manifest for prepared assets
pnpm --silent file-forge manifest export ./assets --recursive --output ./delivery --json
```

Compression keeps the original dimensions when no width or height is supplied. Supply `--width` or `--height` alone for an automatic other axis, or both for a bounding box. Aspect ratio is preserved without enlargement. Use `folder compress <directory>` to recursively compress media into a new normalized hierarchy, copy non-media files unchanged, and skip `.DS_Store`, symlinks, and animated images. Naming collisions fail before output creation. Smaller file sizes are not guaranteed. For more control, `image process` supports WebP, JPEG, PNG, and AVIF; use `--help` for options.

Media outputs and rename receipts go into a new `file-forge-<id>` directory with `manifest.json` and `report.md`. Media source files are preserved; applying an explicit folder-rename plan changes directory names only. Keep output directories outside input directories. `--json` emits the final result to stdout; diagnostics go to stderr.

English is the default. Save Chinese as your preference with `file-forge config set language zh-CN`, or use `--language en|zh-CN` for one invocation.

Audio/music and GLB use strictly lossless optimization, including inside folders. Audio requires FFprobe (`FFPROBE_PATH` supported); eligible integer PCM/FLAC becomes smaller verified FLAC, otherwise original bytes are retained. GLB only compacts JSON whitespace and preserves binary data, so savings may be small or zero. These defaults do not change existing lossy image/video behavior. See [policy and supported formats](docs/lossless-audio-models.md).

## Codex and installation

- **Codex / MCP:** follow the [setup guide](packages/file-forge-plugin/SETUP.md). Set `FILE_FORGE_ROOT` explicitly; tool paths must stay within it. Jobs last for the MCP session only.
- **macOS Apple Silicon archive:** run `pnpm package:runtime` and follow the [installation guide](packages/cli/distribution/README.md). Download published builds from [GitHub Releases](https://github.com/GrahamQuan/file-forge/releases); inspect the selected release assets and capabilities before installing. Node.js and FFmpeg are installed separately; installing the plugin does not install the runtime.

## Reusable project skill

The source of truth is [skills/file-forge](skills/file-forge/SKILL.md): a routing map and focused references for setup and supported operations. It asks with a recommended solution when tools, essential information or repairs are missing.

```sh
pnpm build
pnpm skill:copy --project "/Users/a6677/Documents/projects/ProductDesignSkills" --dry-run
pnpm skill:copy --project "/Users/a6677/Documents/projects/ProductDesignSkills"
```

Copy creates or fully replaces the target skill from this repository; stale target files are removed from the active copy. Identical copies are unchanged. Previous copies are retained as recovery backups outside the active skills directory. This copies the skill to `<project>/.agents/skills/file-forge`; it does not install the runtime or Codex plugin. See [skill distribution](docs/skill-distribution.md).

## Development

TypeScript + Effect in a pnpm/Turborepo monorepo. CLI and MCP share core operations, with media adapters around Sharp and FFmpeg.

```sh
pnpm check       # Lint, formatting, types, and build
pnpm test:e2e    # Real non-UI CLI and media flows; requires FFmpeg
```

The source checkout may contain features absent from an installed release. See [current capabilities](docs/current-capabilities.md) before interpreting historical specs.

See the [product scope](specs/20261009-first-draft/PRODUCT.md), [technical design](specs/20261009-first-draft/TECH.md), and [implementation status](specs/20261009-first-draft/IMPLEMENTATION.md) for details.

## License

[MIT](LICENSE)

## Automatic releases

Pushes to `main` run `pnpm check` and real E2E on macOS arm64 before publishing the next patch version (`0.0.1`, `0.0.2`, ...). Pull requests only validate. Each release includes the runtime archive, a matching plugin ZIP, and SHA-256 sidecars. Verify the checksum before extraction, then run the archive installer. To upgrade, install the newer archive using the same prefix and reconnect Codex MCP; automatic `--upgrade` remains unavailable. Install/configure the matching plugin separately. Node.js and FFmpeg remain external prerequisites.

Release tags identify the tested source commit; CI stamps release versions in its disposable checkout. No version commits are pushed back to main. Completed release reruns do not publish duplicates. Failed drafts require inspection/recovery and are never overwritten automatically; reserved tags may leave version gaps. The repository must allow GitHub Actions to write releases/tags. Local checks do not establish whether a particular remote workflow or release succeeded; verify it on GitHub.

3D posters render six axis views as quality-80 lossy WebP with transparent backgrounds. The canvas defaults to 16:9 at 1024×576; use `--ratio W:H` for another ratio, one dimension derives the other and both set exact size (16–4096; conflicting explicit ratios fail). Requires local Chrome/Chromium, configurable via `FILE_FORGE_CHROME_PATH`. Sources are unchanged; model/folder compression automatically generates six posters per GLB. See [poster behavior, cameras and limits](docs/model-posters.md).

The skill supports both built-in FileForge workflows and custom Sharp/FFmpeg processing. Codex selects the appropriate route from your request, checks the relevant installed capabilities, preserves sources and verifies outputs. Custom work uses host terminal/Node tools and does not require a FileForge installation; missing dependencies, essential ambiguity and failures still trigger a question with a proposed solution. See [custom processing](docs/custom-processing.md).

3D posters automatically pass each rendered PNG through the shared image workflow before delivery, preserving the canvas size and using quality-80 lossy WebP. The standard quality-80 encoding runs once; no second compression pass is needed.

GLB compression automatically generates six default 16:9 posters through the standard image workflow. Combined model/folder deliveries use manifest v6; poster failures retain the processed model and report partial status. Poster-only commands still support custom ratios and sizes.

Image, video and folder compression support `--preset clarity`: image/cover quality 90 (WebP effort 6 and smart subsampling), video CRF 18 with slow encoding. The standard defaults remain quality 80 / CRF 23 medium. Explicit quality overrides images/covers only. Clarity is lossy, may take longer and produce larger files, and does not change dimensions unless requested.

Select a single file with its media command, or use `folder compress PATH --media videos --width 512` to resize only videos recursively. `--media images` selects images; omission processes all supported media. Other files retain their bytes/format in the normalized output copy. Codex remembers settings only within the current chat; new chats start with normal defaults.

Video/folder compression supports `--audio remove` to omit video audio, or `--audio keep` (default) to encode the first audio track as AAC 128 kb/s. Only selected videos are affected; silent input is supported. Originals and standalone audio files are preserved by their existing workflows.
