# Favicon generation from a PNG logo

Status: Implemented and verified locally on macOS.

Created: 2026-10-10

## Contract

The user requested PNG-to-ICO/PNG/SVG favicon generation at size 64 and explicitly selected true vector tracing for SVG. This authorizes a narrow favicon capability now, ahead of the broader scene/logo presets left for v2 in the first-draft spec. It does not authorize AI logo generation or general scene presets.

Add `file-forge favicon generate <input.png> [--size 64] [--output DIR] [--json]`. The default size is 64; accept integer sizes 16 through 256. One source produces `favicon.png`, `favicon.ico`, and `favicon.svg` in a new exclusive task directory. Existing sources and destinations remain untouched. The CLI uses the existing English/Chinese catalog and machine-output rules.

- Accept an actual static PNG file, reject symlinks, directories, corrupt data, non-PNG content, and animated/multipage input. Validate input and size before creating output files.
- Fit the source inside an exact square canvas without stretching, cropping, or enlarging source pixels. Center smaller/non-square content on transparent padding. PNG and ICO preserve raster alpha.
- ICO contains one PNG-compressed frame at the requested size. Target modern favicon consumers, not legacy Windows icon editors or multi-resolution application-icon packages.
- SVG contains traced colored vector paths, an explicit square width/height and viewBox, and no embedded bitmap, script, or external resource. Trace the normalized icon raster with a pinned preset. Tracing approximates edges, colors, and partial transparency; do not claim pixel-perfect conversion. Fully transparent input remains a valid empty transparent SVG.
- Generate and validate all three encodings before publication. Persist source/output mappings and actual sizes in the existing version 1 manifest with `operation: image`, `parameters.image.preset: favicon`, `size`, and `svg: vector-trace`; use one derived asset record per format. Existing manifests stay readable and re-exportable.
- Use Effect services and scoped staging. Cancellation waits for the current bounded Sharp/tracer call, then prevents publication. A task that fails during publication cleans only its own incomplete directory. Completed results remain intact.

## Repository evidence and design

`packages/media/src/index.ts` currently provides Sharp and FFmpeg Effect services. `packages/core/src/index.ts` provides validated manifests, exclusive task directories, and reports. `packages/cli/src/commands.ts` defines Effect CLI operations; `messages.ts` owns bilingual display strings. All workspaces are under `packages/*`.

Add a focused favicon media module with an Effect service/layer. Keep Sharp for raster normalization and output decoding. Use `@neplex/vectorizer` 0.1.0 behind a narrow asynchronous Effect adapter for real color tracing; verify its installed API and native runtime. Lazy-load it only for favicon operations. Its [official project](https://github.com/neplextech/vectorizer) documents the asynchronous VTracer interface. Pin the tracing preset and bound tracing to at most 256 by 256 pixels. Encode the small ICO directory/header directly around the verified PNG payload, following Microsoft's [ICO directory](https://devblogs.microsoft.com/oldnewthing/20101018-00/?p=12513) and [PNG icon format](https://devblogs.microsoft.com/oldnewthing/20101022-00/?p=12473) documentation.

The shared core operation will accept the source, size, and output parent; resolve real paths; call the media service; stage the three files; and persist a generic manifest/report using existing facilities. No FFmpeg, network service, uploads, new CLI framework, or model dependency is needed. Dependency/runtime failures return stable error codes rather than a success without SVG.

## Acceptance and validation

Use only real non-UI E2E through the executable and actual libraries:

1. A colored transparent non-square PNG produces all three formats at 64 by 64 by default and at another explicit size; the source bytes are unchanged.
2. Decode PNG pixels and the ICO frame; validate the ICO header/directory lengths, dimensions, offsets, alpha, and payload. Decode generated SVG to verify size, transparency, and recognizable source colors. Assert vector paths and absence of image/data/external/script references.
3. Verify preserved aspect ratio, transparent padding, no enlargement of small sources, fully transparent input, and the 256-size ICO header convention.
4. Invalid sizes, corrupted/non-PNG/animated inputs, symlinks, and existing output-parent conflicts fail explicitly without replacing any user file.
5. Repeated/concurrent real commands produce isolated outputs, valid manifests/reports, no leftover staging directories, and parseable JSON in both locales. Re-export the new manifests through the existing command.
6. Verify interruption and task-owned cleanup using real execution where practical. Keep existing image/media flows intact.

Run `pnpm check` and `pnpm test:e2e`. Update both READMEs and help. No publication or cross-platform/native-package compatibility claim follows from local verification.

## Local verification record

On 2026-10-10, `pnpm check` passed and `pnpm test:e2e` passed all six real flows across four files. The two favicon flows verify normal and concurrent CLI execution, 32/64/256 output sizes, path-only SVG rendering, color/padding checks, a fully transparent source, small-source preservation, ICO structure and FFmpeg decoding, manifest re-export, invalid sizes, actual APNG rejection, destination preservation, and SIGINT cleanup. Native tracing is pinned to `@neplex/vectorizer` 0.1.0; Sharp remains 0.35.4.

The implementation lives in `packages/media/src/favicon.ts`, the shared `generateFavicons` operation in `packages/core/src/index.ts`, and the CLI/catalog under `packages/cli/src`. The ICO serializer uses the existing verified PNG bytes and needs no separate encoding dependency. All existing image/media and language E2E flows still pass. Test-owned files and processes were cleaned up. No server, browser session, external upload, or release was created. Other native platforms and visual fidelity on arbitrary user logos remain outside the local verification claim.
