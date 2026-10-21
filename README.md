# FileForge

[English](README.md) | [简体中文](README.zh-CN.md)

Local media processing for people, scripts, and coding agents, powered by Sharp and FFmpeg. Available through a CLI and local MCP tools.

**Preview:** image processing, video compression, favicon generation, inspection, and delivery manifests are available. Uploads, persistent jobs, and self-update are not yet implemented. GitHub release automation is configured; availability depends on a successful main-branch run.

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

# Generate PNG, ICO, and traced SVG favicons from a static PNG
pnpm --silent file-forge favicon generate ./logo.png --size 64 --output ./icons --json

# Export a delivery manifest for prepared assets
pnpm --silent file-forge manifest export ./assets --recursive --output ./delivery --json
```

Compression requires both width and height, preserves aspect ratio, and never enlarges. Smaller file sizes are not guaranteed. For more control, `image process` supports WebP, JPEG, PNG, and AVIF; use `--help` for options.

Outputs go into a new `file-forge-<id>` directory with `manifest.json` and `report.md`. Source files are preserved. Keep output directories outside input directories. `--json` emits the final result to stdout; diagnostics go to stderr.

English is the default. Save Chinese as your preference with `file-forge config set language zh-CN`, or use `--language en|zh-CN` for one invocation.

## Codex and installation

- **Codex / MCP:** follow the [setup guide](packages/file-forge-plugin/SETUP.md). Set `FILE_FORGE_ROOT` explicitly; tool paths must stay within it. Jobs last for the MCP session only.
- **macOS Apple Silicon archive:** run `pnpm package:runtime` and follow the [installation guide](packages/cli/distribution/README.md). Download published builds from [GitHub Releases](https://github.com/GrahamQuan/file-forge/releases); the first download appears after a successful main-branch release. Node.js and FFmpeg are installed separately; installing the plugin does not install the runtime.

## Development

TypeScript + Effect in a pnpm/Turborepo monorepo. CLI and MCP share core operations, with media adapters around Sharp and FFmpeg.

```sh
pnpm check       # Lint, formatting, types, and build
pnpm test:e2e    # Real non-UI CLI and media flows; requires FFmpeg
```

See the [product scope](specs/20261009-first-draft/PRODUCT.md), [technical design](specs/20261009-first-draft/TECH.md), and [implementation status](specs/20261009-first-draft/IMPLEMENTATION.md) for details.

## License

[MIT](LICENSE)

## Automatic releases

Pushes to `main` run `pnpm check` and real E2E on macOS arm64 before publishing the next patch version (`0.0.1`, `0.0.2`, ...). Pull requests only validate. Each release includes the runtime archive, a matching plugin ZIP, and SHA-256 sidecars. Verify the checksum before extraction, then run the archive installer. To upgrade, install the newer archive using the same prefix and reconnect Codex MCP; automatic `--upgrade` remains unavailable. Install/configure the matching plugin separately. Node.js and FFmpeg remain external prerequisites.

Release tags identify the tested source commit; CI stamps release versions in its disposable checkout. No version commits are pushed back to main. Completed release reruns do not publish duplicates. Failed drafts require inspection/recovery and are never overwritten automatically; reserved tags may leave version gaps. The repository must allow GitHub Actions to write releases/tags. Public workflow execution has not been verified locally.
