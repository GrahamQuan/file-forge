# FileForge

[English](README.md) | [Simplified Chinese](README.zh-CN.md)

FileForge is a local asset processing and delivery tool for people, scripts, and coding agents. The current **local foundation preview** provides an independent CLI, Effect media services, image batches, favicon generation, bilingual presentation, and generic delivery manifests. It is not a complete v1 release.

## Run from source

Use Node.js 24 (`.node-version`) and pnpm 10.33.0:

```sh
pnpm install
pnpm build
pnpm --silent file-forge --help
pnpm --silent file-forge --version
pnpm --silent file-forge favicon generate ./logo.png --size 64 --output ./icons --json
pnpm --silent file-forge inspect ./assets --recursive --json
pnpm --silent file-forge image process ./assets --width 1200 --format webp --output ./delivery --json
pnpm --silent file-forge manifest export ./prepared-assets --recursive --output ./delivery --json
pnpm --silent file-forge manifest export --manifest ./delivery/file-forge-TASK/manifest.json --output ./reports --json
```

After building, the workspace executable is `packages/cli/dist/launcher.js` (a POSIX launcher). It checks for Node.js before entering JavaScript; Node.js 22.13 or newer is required, with 24 recommended by `.node-version`. Missing Node exits with installation guidance; explicit `--language` is supported, but saved settings cannot be read without Node. The version aliases `-v` and `--version` work offline without loading settings, Sharp, or FFmpeg. Build before running other commands. There is no development server or `pnpm start` command. This source preview is not an installable GitHub release; `--upgrade` returns `UNSUPPORTED_INSTALLATION` without replacing files.

## Local operations

- `inspect` accepts explicit files and directories. Directory recursion requires `--recursive`; duplicate canonical inputs are deduplicated. Empty collections report `empty`. Symlinks, unsupported files, nested directories without recursion, damaged images, and animated images receive explicit outcomes.
- `image process` accepts at least one explicit `--width`, `--height`, `--quality`, or `--format`. Supported output formats are WebP, JPEG, PNG, and AVIF. Width/height must be positive integers; quality is 1–100. Resizing fits within the bounds while preserving aspect ratio and never enlarges. Compression records actual sizes; smaller output is not guaranteed.
- Input image extensions are PNG, JPEG, WebP, AVIF, TIFF, GIF, HEIF, and HEIC; actual decoding depends on Sharp's installed codecs. Animated/multipage images and SVG are excluded from this CLI milestone. The internal media E2E still exercises trusted SVG rendering.
- Each processing/export request creates an exclusive `file-forge-<id>` directory under `--output`, or under the user's Downloads directory on macOS. Other platforms require explicit output and configuration directories and are not distribution-validated. Output parents must be outside selected input directories to prevent recursive ingestion of prior results.
- Names use lowercase ASCII slugs and a deterministic source-path hash suffix, including Unicode-only names. Sources and existing outputs are preserved. Image publication uses verified staged files and exclusive hard links; filesystems without hard-link support report failure.
- Batches dispatch one image at a time. SIGINT/SIGTERM stops dispatch, lets the active Sharp operation finish, and saves a cancelled manifest once the task directory exists. Completed outputs remain available. The CLI does not provide background jobs, cross-process cancellation, request deduplication, crash recovery, or a persistent job registry yet.
- `manifest export` inspects prepared assets without recompression/upload, or reads a version 1 `--manifest`. JSON is authoritative; `report.md` is derived from it. Re-export preserves historical mappings and does not claim fresh local/remote verification. Markdown omits absolute paths by default; `--include-paths` opts in. JSON contains local paths and is a local task record.

`--json` writes one final structured result to stdout. Progress and diagnostics use stderr. Error codes, JSON fields, manifest structure, and generated report headings remain English. Exit codes are 0 for success/empty results, 1 for partial/execution failure, 2 for invalid arguments/settings, and 130 for interruption.

## Favicon generation

```sh
pnpm --silent file-forge favicon generate ./logo.png --size 64 --output ./icons --json
```

This creates `favicon.png`, `favicon.ico`, `favicon.svg`, `manifest.json`, and `report.md` in a new task directory under `./icons`. `--size` defaults to 64 and accepts integers from 16 to 256. Input must be an actual static PNG; animated PNG, symlinks, and non-PNG data are rejected. Omit `--output` to use Downloads on macOS.

All three icons have an exact square canvas. The logo keeps its aspect ratio, is never cropped or enlarged, and receives centered transparent padding when necessary. PNG and ICO preserve raster alpha. The ICO contains one PNG-compressed frame for modern consumers, not a multi-resolution legacy Windows icon pack.

SVG uses actual colored vector paths traced by the pinned VTracer adapter, not an embedded PNG. Tracing approximates colors, edges, and partial transparency; review detailed logos before publishing. Fully transparent PNG input yields an empty transparent SVG. The tracing dependency is loaded only by favicon generation; the library operation does not use FFmpeg or an online service, but the CLI checks the shared prerequisites.

All encodings are generated before publication. A failed or cancelled publication removes its own incomplete directory; existing files remain untouched. Cancellation waits for the current native call. The version 1 manifest records three derived outputs under the `favicon` image preset and can be re-exported with `manifest export`.

## Language settings

```sh
pnpm --silent file-forge config get language
pnpm --silent file-forge config set language zh-CN
pnpm --silent file-forge config set language en
pnpm --silent file-forge --language zh-CN --help
```

English is the default regardless of OS locale. The saved preference applies across projects and restarts; `--language en|zh-CN` overrides only one invocation. All FileForge terminal messages live in one typed bilingual object. Command names and machine results are not translated.

On macOS settings live at `~/Library/Application Support/file-forge/config.json`. `FILE_FORGE_CONFIG_DIR` explicitly overrides that directory for isolated installations/tests. Missing settings default to English without writes. Malformed, unsupported, or unreadable settings produce an English diagnostic and remain untouched. Saving preserves unknown fields and uses a bounded exclusive lock plus atomic replacement. A conflicting language override is rejected. A retained `config.json.lock` blocks writes: only remove it after confirming no live FileForge settings writer owns it.

## Architecture and validation

```text
packages/cli/          Effect CLI adapter, presentation, and user settings
packages/core/     Inspection, image batch orchestration, manifests, and reports
packages/media/    Effect services around Sharp and scoped FFmpeg execution
packages/mcp/      Local STDIO MCP and session-owned task processes
packages/file-forge-plugin/  Local plugin manifests, skill, and setup guidance
e2e/               Real non-UI process and media flows
specs/             Product contract, technical design, and implementation evidence
```

Effect and `@effect/platform-node` are pinned to 4.0.2. Services use typed Effects, schemas, platform filesystem/process services, and scoped resource cleanup; execution occurs at CLI/test boundaries. A narrow Node `lstat` adapter handles link detection because the selected Effect filesystem API follows links and exposes no `lstat`. The CLI adapts framework errors to its catalog and suppresses framework help rendering in machine mode.

Node.js and FFmpeg are user-installed prerequisites, not bundled executables. Sharp is included as a package dependency; no separate Sharp installation is needed. Install FFmpeg on PATH or set `FFMPEG_PATH` to its executable. Every business CLI command checks that FFmpeg can run before doing work; a missing or unusable executable exits with `FFMPEG_REQUIRED` and human-readable installation guidance. Help, version, and language settings remain available without FFmpeg. No dependency is downloaded automatically. The scoped FFmpeg service uses argument arrays, no shell, bounded logs, timeout, SIGTERM, and verified escalation/exit through the Node platform adapter.

| Command                             | Purpose                                                      |
| ----------------------------------- | ------------------------------------------------------------ |
| `pnpm build`                        | Build workspace packages with TypeScript 7's native compiler |
| `pnpm typecheck`                    | Strict TypeScript checks                                     |
| `pnpm lint`                         | oxlint                                                       |
| `pnpm format` / `pnpm format:check` | oxfmt                                                        |
| `pnpm check`                        | Lint, formatting, types, and build                           |
| `pnpm test:e2e`                     | Real CLI, Sharp, and FFmpeg flows; FFmpeg is required        |

E2E covers actual image/audio/video outputs, FFmpeg failure/timeout/interruption and process exit, CLI language persistence and concurrent writes, invalid/read-only settings, partial batches, source preservation, deterministic names, manifests, cancellation, PNG/ICO/vector-SVG favicon decoding, and invalid/animated favicon input. Fixtures and task processes are cleaned up. There are no unit, component, or UI tests.

## Remaining v1 scope

Uploads, project profiles, persistent job management, ZIP, audio/composition commands, GLB, SVG-to-JSX/TSX, specialized `song.md`/`prompt.md`, remote inspection/replacement, public GitHub releases, and self-update remain unimplemented. Storage policy, specialized operation/template contracts, and release targets require their open decisions. Watermarking is deferred; broader scene presets remain v2; the requested favicon export is available now.

The runtime and local Codex plugin are separate deliverables. Plugin installation will not install the runtime, FFmpeg, credentials, or permissions. Runtime and plugin upgrades will have separate lifecycles. No runtime or plugin has been published by this work.

The desktop and SQLite packages remain removed. Historical databases and user media have not been read, migrated, or deleted. Project-authored content uses English except this README's translation and localized messages; user asset names/content remain unchanged.

See [PRODUCT.md](specs/20261009-first-draft/PRODUCT.md), [TECH.md](specs/20261009-first-draft/TECH.md), [implementation evidence](specs/20261009-first-draft/IMPLEMENTATION.md), and [AGENTS.md](AGENTS.md).

The favicon contract and validation scope are in [the favicon specification](specs/20261010-favicon-generation/TECH.md).

## Codex integration

Local STDIO MCP and the source plugin now expose inspection, image processing, favicon generation, and
manifest export. See [setup and Codex test prompts](packages/file-forge-plugin/SETUP.md) and the
[integration contract](specs/20261010-codex-integration/PRODUCT.md). Build first, then configure
`file-forge mcp` with an explicit `FILE_FORGE_ROOT`; all request paths must resolve within it.

Business tools return session jobs: poll `job_status`, use `job_cancel` to stop, and keep the same request ID
to avoid duplicate submissions. One worker runs at a time, with 128 retained records. Closing the server
stops its workers; completed files remain. Records are not durable, and uncertain writes must not be
automatically replayed after reconnection. Help/version/language preferences remain CLI setup commands.

The plugin is source-only and has not been installed into your Codex account. Protocol E2E covers its
actual bootstrap; in-app installation and skill selection remain a manual acceptance gate.

## Downloadable runtime (macOS Apple Silicon)

No npm publication or package-manager installation is needed by recipients. Build the archive with
`pnpm package:runtime`; artifacts and SHA-256 checksums appear under `release/`. Packaging requires an
installed workspace and cached production dependencies. Public download hosting is not configured yet.

Install Node.js >=22.13 (24 recommended) and FFmpeg yourself. Sharp and the vector tracer are included.
After checking the checksum and extracting the archive, run:

```sh
./install.js --prefix "$HOME/.local"
export PATH="$HOME/.local/bin:$PATH"
file-forge --help
```

The installer verifies the payload and target, preserves earlier builds, and activates the command atomically.
It does not edit shell profiles. See the [archive guide](packages/cli/distribution/README.md) for direct use,
rollback, and installed MCP configuration. This initial archive supports macOS arm64 only.
The [distribution spec](specs/20261016-runtime-distribution/TECH.md) records scope and validation.

### Image/video compression

The agent workflow asks for missing width and height before processing. Dedicated compression
commands and MCP tools require both dimensions; non-interactive calls reject incomplete inputs.

```sh
pnpm --silent file-forge image compress ./assets --width 1200 --height 800 --output ./delivery --json
pnpm --silent file-forge video compress ./clip.mp4 --width 1280 --height 720 --output ./delivery --json
```

Images resize, compress, and encode to WebP using Sharp (quality 80 by default). Videos use
FFmpeg to resize and encode H.264 MP4 at CRF 23 with AAC audio when present, then extract the
first frame and compress it to WebP through the image pipeline. Both preserve aspect ratio
without enlargement; video dimensions round down to even pixels. The cover matches the actual
video dimensions. `--quality` controls image/cover quality, not video CRF. Smaller file size is
not guaranteed. Each video request accepts one file and returns a manifest containing video
and cover outputs. `compress_images` (`image-compress`) and `compress_video` (`video-compress`)
provide the same operations through MCP.

Optional animated copy is orchestrated by the agent using a local Hyperframes project before
final compression. Hyperframes is installed locally only when motion is requested; it is not
a runtime dependency or a built-in FileForge composition renderer.
