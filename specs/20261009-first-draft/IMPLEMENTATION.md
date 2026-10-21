# Local foundation implementation

Date: 2026-10-09

Status: Local foundation implemented; full specification remains incomplete.

## Selected scope

The user explicitly chose "Implement the local foundation first" during the run-spec readiness review. This milestone includes the Effect media migration, independent bilingual CLI, basic inspection/image batches, and generic JSON/Markdown delivery. It does not settle or implement the remaining v1 product decisions.

The original PRODUCT.md and TECH.md remain the full contract. Their pre-implementation repository evidence is historical; the READMEs describe the executable subset. No release, push, deployment, plugin installation, or external upload was performed.

## Acceptance checklist and evidence

| Local acceptance              | Implementation and real validation                                                                                                                                                                                                                                                                             |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Effect-first media API        | `packages/media` exposes typed Effects with ImageEngine and FfmpegConfig services. Live layers are assembled at CLI/E2E boundaries. No parallel Promise application API remains.                                                                                                                               |
| Sharp behavior and validation | Shared Effect schema constrains dimensions, quality, and format. Real outputs verify aspect ratio, no enlargement, metadata, decoding, source preservation, and rejection of existing output/source aliases.                                                                                                   |
| FFmpeg lifecycle              | Effect 4.0.2 process/platform APIs use argument arrays, shell disabled, bounded logs, timeout, scoped termination, escalation, and awaited exit. Real pipeline plus failure/timeout/interruption flows verify output decoding and PID disappearance.                                                           |
| Independent CLI               | Source entry point, root `pnpm file-forge` script, Effect CLI parsing, explicit noninteractive arguments, stable JSON and exit codes. Offline version aliases bypass runtime/settings imports.                                                                                                                 |
| Bilingual presentation        | One typed catalog enforces locale keys and parameter signatures. Real CLI processes verify English default, Chinese persistence/restart, cross-project behavior, temporary overrides, and locale-independent machine errors. Framework-generated help/errors are intercepted rather than emitted untranslated. |
| Settings integrity            | Version 1 schema, preserved unknown fields, bounded exclusive lock, reread under lock, same-filesystem staged atomic replacement. Real concurrent processes, malformed/unsupported settings, invalid locale, conflicting override, retained lock, and read-only directory exercise failure preservation.       |
| Local inspection              | Explicit file sets and opt-in recursive directories; current file metadata; canonical-path deduplication; explicit empty, damaged, unsupported, animation, link, and nested-directory outcomes. No implicit upload/processing.                                                                                 |
| Image batches                 | Serial bounded dispatch; deterministic ASCII names with hash suffixes; separate exclusive task directory; metadata and actual size changes. Nested output/input scope is rejected. Mixed real assets yield partial results instead of fabricated success.                                                      |
| Cancellation                  | CLI signals stop dispatch and finish active Sharp work. E2E cancels before processing and after a real output is published, verifies exit 130, retained outputs, complete cancelled mappings, no staged files, and process exit.                                                                               |
| Generic delivery              | Versioned schema-validated JSON and derived English Markdown, including failures and original/output mappings. Real ready-assets export requires no processing/upload; manifest re-export retains recorded mappings. Reports omit absolute paths unless requested.                                             |
| Documentation                 | Equivalent English/Chinese READMEs, current project instructions, commands, limits, and remaining scope.                                                                                                                                                                                                       |

## Dependency and adapter decisions

- Pinned `effect` and `@effect/platform-node` to 4.0.2 after checking registry versions, peer compatibility, installed exports, and source. Used current `effect/cli` and `effect/process` exports rather than obsolete beta import paths. Kept TypeScript 7 native `tsc`, Sharp, pnpm, and Turborepo.
- Official context: [Effect platform documentation](https://effect.website/docs/v4/platform/introduction). Installed package source and actual compilation/E2E are the authority for the pinned API behavior.
- Effect FileSystem 4.0.2 has no `lstat`; its `stat` follows links. A narrow Node `lstat` Effect adapter rejects symlink inputs. Other orchestration and filesystem operations use Effect services.
- Effect CLI 4.0.2 still prints help with `renderErrors: false`. A request-local Console override suppresses that renderer; the CLI emits catalog-based help/errors and one machine result. Interactive framework globals are disabled.
- Sharp cancellation explicitly waits for the current operation, then releases staging resources. Hard cancellation of Sharp and responsive MCP workers remain outside this milestone.
- Source preview targets macOS defaults. `FILE_FORGE_CONFIG_DIR` and explicit output allow isolated tests without touching actual preferences or Downloads. No user-local state registry was introduced while persistence decisions remain open.

## Validation record

Executed on macOS with Node.js 24.18.0, pnpm 10.33.0, and the available local FFmpeg:

- `pnpm check`: lint, formatting, strict types, and builds passed.
- `pnpm test:e2e`: three files / four real non-UI flows passed. This includes the preserved Sharp → FFmpeg image/music/video/audio pipeline and the additional lifecycle/CLI flows.
- Test-owned temporary assets, isolated settings, locks, and staging files are removed. FFmpeg and interrupted CLI PIDs are checked after exit. No preview server, listening port, browser tab, or browser session was created.

This is local acceptance only: no other platform, clean release installation, object storage provider, plugin host, or MCP protocol acceptance is claimed.

## Remaining gates

- Manual Codex host installation and skill-selection acceptance; local protocol/packaging implementation is tracked in the 2026-10-10 integration milestone.
- Video CLI/covers, persistent jobs and state directories, request IDs, cross-instance status/cancellation, crash recovery, and pagination for agent responses.
- Projects/profiles, S3 provider selection, credential handling, atomic uploads, uncertain-write reconciliation, and real storage E2E.
- ZIP limits/extraction; agreed audio/composition matrix; GLB consumer compatibility; SVG component/security conventions.
- Original specialized template examples and required metadata, remote query policy, replacement URL/cache/rollback behavior, and the SQLite-versus-local-JSON decision.
- GitHub identity, supported targets, Node bundling, package/install layout, verification/signing design, self-update, release acceptance, and explicit publication authorization.

`--upgrade` only diagnoses the unsupported source installation. It does not fulfill the future official-package self-update requirement. No generic report is claimed compatible with `song.md` or `prompt.md`, and no local manifest is claimed to be a fresh remote observation.

## 2026-10-10 MCP/plugin continuation

The user authorized [the local Codex integration milestone](../20261010-codex-integration/PRODUCT.md).
It adds shared request schemas/dispatch, STDIO MCP, session-owned task processes, status/cancellation,
workspace scoping, and a local plugin package. Session request IDs are now implemented; durable records,
cross-instance control, and public distribution remain future work. Node.js is explicitly user-installed
per the runtime-prerequisites milestone, so Node bundling is no longer an open decision for this preview.
See the integration technical design for current verification and the manual host acceptance gate.

## 2026-10-16 runtime distribution continuation

The [runtime distribution milestone](../20261016-runtime-distribution/TECH.md) adds a macOS arm64 archive,
SHA-256 checksum, and offline local installer. Node.js and FFmpeg remain external; Sharp, its native libraries,
and the vector tracer are included. Recipients need no npm/pnpm or checkout. Immutable build directories,
verified payloads, command ownership checks, a cooperative installer lock, and atomic symlink activation
preserve earlier builds and support rollback. Public hosting, signing, self-update, other targets, and manual
Codex host acceptance remain separate gates. This resolves the local package/install layout gate above.

## 2026-10-21 folder processing

The [folder contract](../20261021-folder-processing/TECH.md) adds recursive CLI/MCP folder compression, hierarchy-preserving normalized names, copied non-media content, explicit skips, collision preflight, and schema-v2 folder manifests with legacy-v1 reading. Compression size options now accept either axis alone and skip resizing and preserve original dimensions when neither is supplied. These changes are local source functionality pending the next release.

## 2026-10-21 explicit source-folder renaming

The [source-folder rename contract](../20261021-source-folder-renaming/TECH.md) adds preview/apply directory mappings through CLI and MCP, with schema-v3 progress receipts. This explicitly requested operation changes original directory names while preserving file contents; normal media workflows still write new copies. Validated locally with `pnpm check` and all 16 E2E tests. No release or installed-runtime upgrade is included.
