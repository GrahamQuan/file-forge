# FileForge CLI + MCP First Draft: Technical Design

Status: Partially implemented as a local foundation preview. The original design and repository evidence below describe the pre-implementation baseline; see [IMPLEMENTATION.md](./IMPLEMENTATION.md) for current scope and validation.

The current local MCP/plugin milestone is specified in [Codex integration](../20261010-codex-integration/PRODUCT.md); its narrower session-only job contract supersedes the durable-job proposal for this preview.

Created: 2026-10-09

Product contract: [PRODUCT.md](./PRODUCT.md)

## Objective and continuity

This specification replaces `specs/20261009-tech-stack/TECH.md` with a Node.js + TypeScript CLI and local coding-agent MCP design. Retain the earlier Effect v4 direction, including acceptance of required unstable modules, without implying that those dependencies are installed.

PRODUCT.md defines observable behavior. Directories, commands, and models below are proposals unless listed as current repository facts. Documentation changes do not implement entry points or authorize publication. All specifications and project instructions use English; only translated READMEs and localized display messages have language exceptions.

The CLI requirements revision read on 2026-10-09 expands the v1 target beyond the first milestone: ZIP, audio/music, GLB, SVG conversion, specialized handoff templates, and explicit asset replacement remain v1 work. Watermarking is deferred. Translate legacy tab wording into operation groups, retain the confirmed English default, and treat the contradictory SQLite/no-database notes as an open decision rather than a dependency change.

## Repository evidence and completed cleanup

Versions below are manifest declarations, not claims about the latest upstream release.

| Location                            | Current behavior or configuration                                                                                                          |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `package.json`                      | Root `file-forge`; pnpm 10.33.0, Turborepo 2.11.3, TypeScript `~7.0.2`; no executable `bin`, `dev`, or `start`                             |
| `pnpm-workspace.yaml`, `turbo.json` | `apps/*` and `packages/*` workspace patterns; build and typecheck orchestration                                                            |
| `tsconfig.base.json`                | Strict mode, NodeNext, declaration generation                                                                                              |
| `packages/media/src/index.ts`       | `processImage`, `inspectImage`, `runFfmpeg`, `getFfmpegStatus`; Sharp 0.35.4; FFmpeg argument arrays, `shell: false`, AbortSignal, timeout |
| `e2e/media-pipeline.test.js`        | Real Sharp resizing, FFmpeg composition/extraction, decoding and output checks; no CLI/MCP coverage yet                                    |
| `vitest.config.ts`, root scripts    | Vitest collects `e2e/**/*.test.js`; lint, formatting, type, build, and E2E commands exist                                                  |

The user authorized removing the Electron/React application, desktop SQLite package, unused IPC/shared package, empty Playwright setup, desktop scripts, and React lint plugins. The lockfile was refreshed offline with installation scripts disabled. Existing user databases and media were not accessed or removed. The original media E2E retains its real media assertions, with only the obsolete persistence segment removed.

README and AGENTS.md now describe the CLI/MCP direction. No system-design index exists. CLI, MCP, Effect integration, localization runtime, user preference persistence, uploads, manifests, and self-update remain unimplemented. Existing media-library English diagnostics are internal errors; the future CLI must map them to display message keys rather than print them as its localization layer.

## Stack and boundaries

- Retain Node.js, TypeScript strict mode, pnpm workspaces, Turborepo, oxlint, and oxfmt. Reuse existing package boundaries and media primitives.
- Continue the TypeScript 7 / ts-go native compiler direction. Verify runtime compatibility when implementing; do not upgrade dependencies merely to edit the specification.
- Use Sharp for images and FFmpeg for audio/video/composition. Resolve FFmpeg through PATH or `FFMPEG_PATH`; do not download it automatically.
- Use Effect v4 throughout application and infrastructure code, including media processing, configuration, persistence, uploads, upgrades, CLI, and MCP. This is an Effect-first architecture, not an optional wrapper around a permanent Promise-based core. Verify package versions, exports, and protocol support against the selected release.
- Pin validated Effect dependency versions and choose mutually compatible ecosystem packages; do not assume identical version numbers. Commit the lockfile and avoid installing competing frameworks without a concrete need.
- No built-in model API, provider SDK, or agent loop initially. Clients supply reasoning; skills supply usage guidance.
- CLI/MCP must not depend on Electron or the removed SQLite layer. Propose versioned local JSON for jobs and manifests; preserve historical user data.
- Start with local STDIO MCP, without a network listener, remote authentication, or persistent daemon.

## Effect-first implementation contract

The current `packages/media/src/index.ts` is a prototype using `async` functions, `node:fs/promises`, direct `spawn`, manual timers, and a Promise-based process lifecycle. These interfaces are not the target architecture. Preserve their useful behavior while migrating them before building new entry points on top of them.

| Concern                                     | Required implementation direction                                                       |
| ------------------------------------------- | --------------------------------------------------------------------------------------- |
| Application and media operations            | Return typed Effects with explicit success, expected error, and service requirements    |
| Dependency wiring                           | Define focused services and layers; assemble the live Node environment at entry points  |
| Input and persisted data                    | Use Effect schema facilities for runtime validation and typed decoding                  |
| Filesystem, paths, child processes, HTTP    | Prefer the selected Effect release's platform services and Node implementations         |
| Jobs, progress, concurrency, timeout, retry | Use scoped Effect concurrency, scheduling, and stream/queue facilities where needed     |
| CLI and MCP                                 | Use relevant Effect ecosystem modules after verifying the chosen version's capabilities |
| Sharp and specialized libraries             | Keep the processing engines; adapt APIs and errors inside Effect services               |
| Pure transformations and translations       | Keep ordinary typed functions and the central TypeScript message object                 |

Public side-effecting operations must not return bare Promises as their primary application API. Keep Promise/callback interop inside narrow external-library or framework adapters. Do not execute Effects inside reusable services to turn them back into Promises; execute programs at CLI/MCP host boundaries and real E2E boundaries.

Prefer platform services over scattered direct Node calls, custom dependency containers, timer loops, and retry helpers. If the pinned Effect release lacks a required capability, document the gap and isolate a scoped native adapter. Verify availability rather than copying older examples. Effect-first does not mean installing every ecosystem package or adding model-provider dependencies without a model feature.

### Media migration

Split image and FFmpeg service implementations into focused modules as needed; keep `packages/media/src/index.ts` as the public export surface. Concrete service identifiers and file names remain implementation choices.

- Migrate `processImage` and `inspectImage` into Effect operations wrapping Sharp, with typed validation/processing errors and filesystem services for output preparation.
- Migrate `runFfmpeg` into a scoped process operation using Effect platform facilities where supported. Preserve argument arrays, no shell execution, bounded output, nonzero-exit reporting, timeout, and graceful termination followed by verified forceful termination when needed.
- Connect interruption to actual cleanup and await child-process exit. Wrapping the current Promise alone does not establish cancellation; retain a native adapter only for a verified platform gap.
- Migrate `getFfmpegStatus` to an Effect operation with a typed availability result. Expected unavailability may become status data; cancellation must remain interruption rather than being swallowed as an unavailable result.
- Keep localization at the CLI boundary. Services expose stable errors and structured details, retaining underlying diagnostic causes without leaking secrets.
- Update the real media E2E to execute the new Effect program and provide live dependencies at the test boundary. Preserve media assertions and verify failure/cancellation behavior during implementation; do not maintain a duplicate Promise API solely to avoid updating callers.

Fibers do not make synchronous work interruptible or eliminate task processes. Sharp cancellation requires explicit handling independently of FFmpeg cancellation. The existing prototype and dependency manifests remain unchanged by this specification update.

## Proposed structure

```text
apps/
  cli/             # new: CLI, presentation, preferences, MCP bootstrap
packages/
  core/            # new: operations, project config, jobs, manifest, storage adapter
  mcp/             # new: protocol adapter calling core
  media/           # existing: migrate Sharp / FFmpeg primitives to Effect services
  shared/          # optional: public serializable contracts when actually needed
```

Keep storage, project configuration, and manifest handling inside core initially. Add separate GLB/SVG packages only when implementation and dependencies justify them. The CLI assembles the Node runtime, core, and MCP adapter. Determine plugin packaging paths and release metadata at the packaging stage.

```text
[Human / Scripts] --> [CLI Adapter] --------+
                                           |
[Coding Agent] --> [STDIO MCP Adapter] -----+--> [Core Operations]
                                                       |
                                       +---------------+---------------+
                                       |               |               |
                                    [Media]       [Local State]     [Storage]
```

Both adapters call application operations directly; do not share business logic by composing CLI commands and parsing terminal output. Core must not depend on terminal UI, MCP transport, locale, or an agent runtime. Public results are serializable, with no fibers, database handles, or process objects.

## Operation contracts and entry points

Business command/tool names remain proposals. `-v`, `--version`, and `--upgrade` are confirmed user requirements. Both adapters share operation validation and semantics.

| CLI after `file-forge`                                | MCP direction                    | Purpose                                                               |
| ----------------------------------------------------- | -------------------------------- | --------------------------------------------------------------------- |
| `inspect`                                             | `inspect_files`                  | Scan inputs, identify types, return checks and selection references   |
| `image process`                                       | `process_images`                 | Batch image processing with explicit options/presets                  |
| `video process`                                       | `process_video`                  | Constrained compression, resizing, and cover extraction               |
| `audio process`, `media compose`                      | `process_audio`, `compose_media` | Explicit audio/music processing and composition options               |
| `model compress`                                      | `compress_model`                 | GLB compression with validated compatibility settings                 |
| `svg convert`                                         | `convert_svg`                    | Local SVG to JSX/TSX conversion                                       |
| `upload`                                              | `upload_files`                   | Upload selected outputs to a project profile                          |
| `remote inspect`                                      | `inspect_remote_assets`          | Refresh selected object information for a project/profile             |
| `asset replace`                                       | `replace_asset`                  | Explicit replacement; implement after URL/cache semantics are decided |
| `manifest export`                                     | `export_manifest`                | Generate delivery files from recorded results                         |
| `job status`, `job cancel`                            | `get_job`, `cancel_job`          | Read job state and request cancellation                               |
| `-v`, `--version`                                     | No new tool needed               | Read the installed version offline                                    |
| `--upgrade`                                           | No initial self-update tool      | Upgrade the official GitHub installation                              |
| `config get language`, `config set language <locale>` | Not exposed                      | Read or persist the local presentation preference                     |

Requests include explicit inputs, options, output policy, and project/profile when needed. Write requests support `requestId` deduplication. Short reads return synchronously; MCP long operations return `jobId`. CLI operations wait and report progress by default; detached CLI execution is out of initial scope.

Proposed exit codes: 0 for full success, 1 for execution/partial failure, 2 for invalid arguments/configuration, and 130 for user interruption. In CLI `--json` mode, stdout contains one final structured result; logs/progress go to stderr. STDIO MCP reserves stdout exclusively for protocol output. Protocol keys, enums, and error codes remain fixed English identifiers.

Return summaries, pagination, or manifest references instead of thousands of records in one agent response. Reject unsupported operations, invalid inputs, and missing configuration before side effects. Do not expose arbitrary shell commands, FFmpeg argument passthrough, or natural-language execution endpoints.

The source's separate image/video/audio/music/3D/upload tabs become capability groups, not a TUI or desktop requirement. Treat music as an audio role with music-specific delivery metadata rather than duplicating the audio engine. Automatic dispatch may select an adapter only within an explicitly requested operation/preset; detection alone never authorizes processing or uploading.

## V1 intake, adapters, and delivery

### Directory and ZIP intake (P02, P12)

Add one core intake layer for file lists, directories, and ZIP collections. Assign stable source references including the input archive identity and entry-relative path; ephemeral extraction paths are execution details, not the only persisted provenance. Normalize entries before writing, reject absolute/traversal paths and unsafe links, and enforce configured count, total expanded size, and per-entry limits while streaming extraction, not only from archive headers.

Extract into a task-owned directory, validate the collection, then allow downstream processing or upload. Unsafe/incomplete extraction must not publish a partial archive collection. An individual unsupported media file in a safely extracted collection uses the normal per-file result policy. Encrypted archives return an unsupported-input error initially; adding password handling requires a separate decision. Retain extraction files only for their active consumers and remove them on success, failure, or cancellation. Reruns use the source archive and recorded mapping, not a vanished temporary path.

The default archive operation uploads selected contents, not the ZIP object. Inspection summaries expose included/skipped entries and selection references. ZIP dependencies and exact limits must be chosen during implementation; no archive library is currently installed by this spec.

### Media, GLB, and SVG adapters (P03, P13)

Reuse `packages/media` for image and FFmpeg primitives. Add typed operation-specific options for audio transcoding/extraction and composition, including stream selections, timing, format, and output policy as needed by the accepted operation matrix. Do not expose an unbounded generic composition schema before those operations are agreed. Probe actual outputs and persist audio/video relationships and cover roles in the manifest.

GLB needs a dedicated format-aware adapter; do not send it through Sharp or treat FFmpeg as the model compressor. Select the library and compression method only after defining target renderer support, extension preservation, and lossy/lossless policy. Validate the input and output, record required decoder extensions and actual size changes, and reject presets that violate the agreed compatibility target. Preserve materials, textures, animation, and scene structure unless an explicit accepted option permits changing them.

SVG-to-JSX/TSX needs a separate source-conversion adapter with explicit output language and deterministic component naming. Parse SVG as input data without evaluating scripts, resolving external entities, or fetching remote resources. Define rejection/sanitization rules for event handlers, script content, external references, and unsafe markup before implementing. Validate generated syntax and consumer compatibility in an isolated fixture; this does not introduce React as an application runtime or UI test dependency.

All adapters use the same batch lifecycle, cancellation, output staging, error/result contracts, and locale-independent codes. New display messages belong in the central bilingual catalog.

### Ready-assets delivery and templates (P07)

Allow manifest export to start from an inspected existing collection plus explicit metadata/remote mappings, without requiring a new processing job or upload. Validate supplied mappings and distinguish user-supplied addresses from verified upload records. Preserve source-to-processed, video-to-cover, and song-to-related-asset relationships.

Add versioned delivery template adapters for generic Markdown, `song.md`, and `prompt.md`, all derived from the same JSON manifest. Define required metadata from the original examples before implementing specialized schemas. Missing required fields return an incomplete-delivery result; do not fabricate lyrics/prompts or label generic Markdown as compatible with those consumers. The CLI revision only names its reference ZIPs; their contents remain unverified.

### Fresh remote information and replacement (P04, P05, P08, P14)

Use the selected profile's storage adapter for explicit reads of object metadata and public URL mapping. Return observation time and distinguish missing objects from access denied, network failure, and unknown state. Never use historical manifest records as proof of current remote existence. Current observations and immutable delivery history have different roles.

Reserve a separate replace operation with an existing asset reference and new selected output. Its object-key, conditional-write, cache, and rollback policies are unresolved; do not implement it by silently enabling overwrite on normal upload. Once defined, publish and verify the new object before committing the new delivery mapping, retaining the previous confirmed mapping on failure. Do not delete the old object by default. No local SQLite package is reinstated by this revision; versioned JSON remains a provisional persistence design pending the source conflict's resolution.

## Localization and user language configuration

Implements P11. This is a CLI presentation concern, separate from project/Bucket configuration and core operation state. Proposed modules under `apps/cli/src` are `i18n/messages.ts`, `i18n/translate.ts`, and `config/user-settings.ts`; they do not exist yet.

### One typed message object

Export one `messages` TypeScript object keyed by `en` and `zh-CN`. English defines the canonical message-key set; require Chinese to satisfy the same keys and parameter signatures. Use a typed `MessageCatalog` and `Record<Locale, MessageCatalog>` or equivalent compile-time checks. Include help, argument/schema error presentation, prompts, progress, empty states, summaries, configuration, and upgrade messages.

Store complete sentences rather than concatenating translated fragments. Parameterized messages use typed functions or validated placeholders with the same parameters in both locales. Do not evaluate translations as code or interpret substituted file paths as formatting instructions. Render English comments and identifiers even in the Chinese catalog. No separate JSON locale files or scattered inline presentation strings.

A request-scoped translator receives the selected locale. Do not mutate a global locale for parallel jobs. English is the fallback for an unexpectedly missing runtime key; invalid keys/translation gaps must be caught during development and validation rather than returning `undefined` to users.

Core returns typed error codes and structured parameters. CLI maps these to message keys. MCP descriptions, schemas, error identifiers, and diagnostics remain English. JSON result structures and generic delivery-report structure do not change with the CLI locale. Preserve user metadata verbatim. FFmpeg and other third-party diagnostics remain raw detail behind a localized FileForge explanation, not fabricated translations.

### Configuration and precedence

Use a user-level settings file, separate from project storage credentials. A proposed initial macOS path is `~/Library/Application Support/file-forge/config.json`; resolve the actual home directory through Node APIs. Confirm native config directories before adding other platforms. Proposed content is:

```json
{
  "schemaVersion": 1,
  "language": "en"
}
```

Locale precedence is explicit `--language en|zh-CN`, then saved `language`, then `en`. Do not infer the default from OS locale. The override affects one invocation only. `config set language <locale>` is the explicit persistence operation; do not allow an override to conflict with the language being saved. `config get language` reports the saved value or default and does not create a file.

Validate before writing. Preserve unrelated settings, serialize concurrent updates with a lock, reread within the lock, and atomically replace via a temporary file in the same directory. Report success only after persistence succeeds, using the newly selected locale. On a write failure, retain the old file and return failure. No network, media runtime, Bucket credentials, or MCP startup is needed to manage language settings.

Missing settings default to English without creating a file. Invalid saved locale, malformed JSON, unsupported schema, or read errors produce a stable English diagnostic and use English without rewriting settings; retain enough detail to repair the problem. If a malformed settings file prevents a safe merge during `config set`, reject the write rather than discard unknown data. Unsupported explicit locales return an argument error without writes.

Resolve settings and locale before help, validation display, and upgrade messages. Pure `-v` / `--version` returns its locale-independent version output without loading settings. A machine-readable configuration response uses stable fields such as `language` and `source`, never localized keys. Upgrades preserve settings across versions; future schema changes need explicit compatibility/migration behavior.

## Project configuration and credentials

Propose project-level `file-forge.config.json` with `schemaVersion`, project ID, optional default profile, and named profiles. Storage profiles distinguish `provider`, `endpoint`, `region`, `bucket`, `prefix`, `publicBaseUrl`, and credential-source references. They do not own the user's language preference.

- CLI prefers an explicit config path; otherwise locate the nearest project config upward from the current directory. Local processing remains available without one.
- MCP upload requests explicitly identify the project config or registered project ID, not the server's startup directory.
- Explicit profile overrides the project default. Missing selections fail; never merge unrelated profiles or silently fall back.
- Credentials reference environment-variable names resolved locally. Do not switch project credentials by mutating the global environment.
- If `.env` support is added, require an explicit file and parse a per-task mapping instead of searching arbitrary directories.
- Persist a sanitized configuration snapshot. Never expose credentials, sensitive headers, or signed URLs in logs or public delivery files.
- Generate public URLs only with explicit configuration and known public access. For private objects record Bucket/key; temporary signing is a separate capability.

A global project registry may follow later and is not required initially.

## Jobs and persistence

Store versioned job JSON and manifests under a user-local state directory. Determine platform-specific state paths before implementation, separately from user settings; do not reuse Electron userData or an arbitrary working directory. Give each job its own directory and use exclusive creation/locking plus atomic replacement to protect concurrent CLI/MCP writes.

Suggested states: `queued`, `running`, `succeeded`, `partial`, `failed`, `cancelled`, `interrupted`. Record stage, input identity, outputs, error codes, retryability, and timestamps per item. Freeze submitted job configuration so later profile changes cannot redirect a running task.

The MCP server owns its jobs; CLI owns its foreground jobs. On cancellation/exit, stop dispatch, cancel active resources, await exit, persist results, and clean temporary outputs. After abnormal exit, verify instance ownership and locks before marking stale jobs interrupted. Do not misclassify another live instance's job. Cross-process cancellation must reach the owner; changing a JSON state alone is not cancellation. Report unreachable owners accurately.

No promise of continued processing after MCP exit or resuming midway through encoding. Retry remaining work using verified completed outputs. An identical `requestId` and input/options fingerprint refers to the original job; reject reuse with different parameters. Without a request ID, a new submission creates a new job.

Separate stable `assetId` from content fingerprints. Record sources, outputs, roles/derivation relationships, actual metadata, uploads, and errors. Temporary signed links are not permanent identifiers. Derive Markdown from the manifest and allow public reports to omit absolute local paths.

## Execution and storage safeguards

- Normalize output names only. Add deterministic collision suffixes, never overwrite sources or sibling outputs, and retain original-name mappings. Fix and verify Unicode/empty-slug behavior during implementation.
- Validate real paths, symlinks, input/output aliases, and recursive scanning of output directories. Limit operations to the selected scope; MCP connectivity is not unlimited filesystem authorization.
- V1 ZIP support must bound extraction size/count and reject traversal and unsafe links before scanning.
- Write staged outputs, verify them, then publish. Clean only task-owned temporary files, not successful outputs or user files.
- Recheck input fingerprints before upload. Enforce no-overwrite through provider-supported atomic conditional writes, not a HEAD/PUT race. If required semantics are unsupported, reject the mode instead of silently weakening it.
- A failed network response may follow a successful server write. Verify remote content/metadata before retrying; do not assume ETag is a content hash. Report already uploaded objects on cancellation rather than deleting them.
- Keep FFmpeg argument arrays, `shell: false`, timeouts, and bounded logs. Build arguments internally from constrained parameters, with no unauthorized remote input or external references.
- Reuse `runFfmpeg` cancellation and verify process exit. Do not assume Sharp has equivalent AbortSignal behavior; isolate work in a task process when hard cancellation is required, or explicitly finish the active operation.
- Effect fibers do not remove synchronous CPU blocking. Bound scanning, Sharp concurrency, and FFmpeg process counts; use workers/task processes where needed to keep MCP responsive.
- Never blindly retry non-idempotent external writes or expose secrets in errors.

## Skill, MCP, and plugin packaging

Implements P15. Maintain separate runtime and plugin artifacts. The GitHub runtime contains the CLI, shared core, and eventually the local MCP server. The plugin initially contains one FileForge usage skill, setup guidance, and supporting references that call the installed CLI. Add MCP startup configuration to that same plugin only when its server is implemented and validated. A skills-only plugin can precede the MCP adapter; MCP remains part of the v1 target rather than a prerequisite for an early plugin preview.

The usage skill covers inspection, batch operations, project/profile selection, structured results, cancellation/failures, and delivery. Setup instructions may live with the usage skill and its references initially; do not create a skill per command. Product usage instructions are distinct from `.agents/skills` used to develop this repository. Users must not need the development repository to operate the released tool.

Setup resolves `file-forge` on PATH or through an explicitly configured executable location, reads its version, and checks compatibility and required dependencies without starting processing or uploading. Test actual execution availability, not just a file's existence. Missing FFmpeg blocks operations needing it, not unrelated image work. Diagnose missing executables, permission failures, unsupported versions, and inaccessible input paths distinctly. Provide installation/configuration instructions; do not silently install packages, upgrade the runtime, or collect credentials for unrelated operations.

For CLI invocation, use explicit noninteractive arguments, stable `--json` output, and documented exit/error codes. Keep progress on stderr and parse structured results rather than localized terminal messages. Distribute version-matched command examples and workflow references; retain runtime `--help` as the installed command reference. An optional `llms.txt` may index published docs later but does not register the integration with Codex.

Publish plugin/runtime compatibility metadata and validate it during setup. Plugin releases and runtime releases may have separate versions. `file-forge --upgrade` updates only the runtime; it must not silently rewrite installed plugin files. When a runtime upgrade falls outside a plugin's supported range, report the mismatch and provide the appropriate update guidance.

When MCP is available, select a compatible configured MCP operation before execution, otherwise use CLI if available and permitted. Preserve shared schemas, job identity, and idempotency rules across routes. Never turn a timeout or failed write into an automatic CLI/MCP replay. Query the existing job or destination state first; if the outcome cannot be determined, report uncertainty rather than duplicating the action.

Tool descriptions and skill files remain English. Prefer existing capabilities; do not add uploads the user did not request. Clearly report unsupported work. Describe specific goals rather than a vague generic media tool, without guaranteeing automatic selection by every client.

Verify independent CLI operation and plugin-driven CLI workflows before the initial plugin release; verify actual MCP calls before adding its configuration. Separate plugin installation from preparing Node/Sharp/FFmpeg and permissions. Do not assume cloud tools can read local files. Verify package-name availability, executable entry points, native dependency installation, and platform support before release; this name is not proof of public namespace ownership. Select concrete plugin manifest paths and supported installation channels against the official packaging specification at implementation time; this spec does not publish or install a plugin.

## GitHub releases and self-update

Implements P09/P10. Upgrading belongs to a separate CLI installation module, not media operations or MCP tools. Handle version flags before loading media, project configuration, preferences, or MCP runtime. Use build metadata consistent with the release tag, package version, and MCP server version.

- `-v` and `--version` print `file-forge <version>`; `--json`, if supported, uses a structured result. They work offline without FFmpeg/configuration. Conflicting upgrade or business operations return an argument error without side effects.
- Fix the official owner/repository in release configuration, never in untrusted asset/project input. Compare semantic versions; exclude draft/prerelease candidates and do not downgrade by default.
- Produce OS/architecture-specific installable archives, version/compatibility metadata, and verification material. Match Sharp native dependencies to targets. Decide Node bundling, archive format, and installation layout before release; compiled TypeScript alone is not a self-contained executable.
- Download to staging; validate source, version, platform, and checksums before safe extraction. Checksums detect corruption but are not independent authenticity proof when supplied by the same source. Define signing/attestation separately in release design.
- Prefer installer-owned version directories and an installation-source marker. Install a new version separately, check its version entry point, then atomically switch the stable launcher. Preserve/restore the old launcher on failure rather than overwriting active scripts/native dependencies.
- Lock installation updates and retain versions used by live processes. If safe side-by-side operation is unavailable, report installation busy and ask the user to finish active work; do not kill it.
- Reject unsupported layouts, source checkouts, package-manager installations, insufficient permissions, and unsupported targets before replacement. Provide instructions without automatic elevation or undeclared remote installation scripts.
- Return 0 for success/already current, 1 for upgrade failures, 2 for invalid arguments, and 130 for interruption. Localize human upgrade feedback through the CLI catalog; preserve machine output contracts.
- Preserve all user data and language settings. Do not update silently during ordinary commands or hot-update an MCP process. Clean staging and report the new version and any required MCP reconnection.

This defines behavior, not a published release, workflow, installer, or authorization to access a particular repository.

## Implementation stages and compatibility

1. Resolve stage-specific open decisions and validate selected Effect CLI/MCP versions; contain external API differences in adapters.
2. Migrate the media prototype and its real E2E to Effect services first. Then add Effect-based core contracts, CLI presentation/messages, user preference handling, and one real image CLI flow using those services. Update scripts and README alongside actual functionality.
3. Add video covers, jobs/manifests, and multi-project uploads for the initial delivery flow, retaining independent CLI use.
4. Package the initial CLI-backed FileForge plugin with its usage skill, setup guidance, and compatibility information; validate setup and real CLI workflows without MCP. Add STDIO MCP with shared validation/results and actual protocol E2E, then add its configuration to the same plugin.
5. Complete the remaining v1 adapters: ZIP intake, agreed audio/composition operations, GLB compression, SVG conversion, specialized templates, and remote inspection/replacement after their prerequisite decisions. The first working chain is a milestone, not full v1 acceptance.
6. Complete GitHub packages, version flags, self-update, clean-install checks, and skill/plugin distribution for the declared release scope. V2 adds scene-specific image outputs; watermarking has no committed release.

The user authorized early legacy cleanup, so implementing CLI first is no longer a prerequisite to deleting the old desktop/database/shared packages. Historical SQLite data remains untouched and is not automatically imported: old Asset rows do not capture complete delivery relationships. Design historical import separately if requested.

Keep conventions, both READMEs, scripts, workspace/lockfile, and specifications aligned with implemented behavior. Update system-design documents if subsequently introduced. Rollbacks preserve user data. Reject unsupported persisted versions rather than overwriting or recreating them.

## Validation and completion

The original specification-authoring work used static reading and file checks only, following the user's no-execution instruction for that work. The subsequent authorized implementation is validated separately in IMPLEMENTATION.md; do not infer test success from the original design review. Existing future implementation checks are `pnpm check` and `pnpm test:e2e`; preserve their intent when adding entry points. Empty Playwright tooling has been removed.

Effect migration acceptance also requires typed public operation signatures, service/layer wiring at runtime boundaries, real FFmpeg interruption/timeout cleanup, preserved Sharp output behavior, and no duplicated Promise-based orchestration. Verify these through type checks, code review, and the existing real E2E during implementation, not by adding unit tests.

| Contract                 | Future real non-UI E2E or manual acceptance                                                                                                                                                                                                                                                                     |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P01                      | Real CLI and MCP process equivalent inputs; check outcomes, rejection, exit codes, protocol/JSON purity                                                                                                                                                                                                         |
| P02/P03                  | Real mixed/empty directories, Unicode/colliding names, small images, damaged media; check outputs, unchanged sources, cover relationships                                                                                                                                                                       |
| P04/P05                  | Isolated S3-compatible storage with two projects/profiles; verify upload/read-back, isolation, atomic conflicts, and validation before writes                                                                                                                                                                   |
| P06                      | Real cancellation, service exit, interruption, duplicate request IDs, cross-instance status/cancel; check records and resource cleanup                                                                                                                                                                          |
| P07                      | Generate and reread manifests/reports from real processing/upload; check mappings, partial errors, schema versions, and redaction                                                                                                                                                                               |
| P08                      | Local operation without network/Bucket credentials; clean supported installation without Electron or model APIs                                                                                                                                                                                                 |
| P09/P10                  | Isolated old/new release installs; version aliases offline; upgrades, current-version no-op, prerelease exclusion, bad archives, interruption, locking, provenance, data retention, MCP reconnection                                                                                                            |
| P11                      | Isolated user config: English default, persist Chinese then restart, switch back, cross-project persistence, temporary override, invalid/read-only/malformed settings, parallel updates, bilingual help/errors/upgrade feedback, unchanged JSON/MCP results                                                     |
| P12                      | Real directory/ZIP input through CLI and MCP: nested entries, duplicate names, corruption, traversal/links, expansion limits, cancellation cleanup, and contents uploaded instead of the archive                                                                                                                |
| P13                      | Actual audio/composition outputs decoded; real GLB inspected before/after with compatibility/preservation checks; SVG converted into syntactically valid JSX/TSX with unsafe inputs rejected and original files preserved                                                                                       |
| P07 specialized delivery | Export a ready-made collection without processing/upload; validate `song.md` and `prompt.md` against agreed examples and report missing metadata; no claim of compatibility before templates are confirmed                                                                                                      |
| P14                      | External object changes observed by fresh reads; missing/denied/unreachable distinguished; once policy is defined, real replacement preserves asset identity and prior mapping on publication failure                                                                                                           |
| P15                      | Install runtime and plugin in an isolated supported environment without the development checkout; validate CLI-only setup/use, missing executable or FFmpeg, denied access, incompatible versions, later MCP setup and equivalent results, and no duplicate writes after an uncertain response or route failure |

For P15, combine real non-UI CLI/MCP execution with manual Codex workflow acceptance; do not add UI automation tests. Check direct and indirect requests against the usage skill, verify setup never claims unavailable dependencies are ready, and validate CLI updates separately from plugin updates. Do not treat successful plugin installation as proof that local processing works. Record unsupported host/install channels rather than claiming universal availability.

For P11, exercise actual CLI processes and settings files instead of unit tests of the lookup function. Compile-time catalog checks must enforce both locale keys and parameter signatures. Verify every FileForge-authored display path resolves through the catalog; framework-generated help and parser errors must be adapted too. Validate both READMEs and scan project-authored files for language-policy violations without altering user content.

Upgrade E2E uses a dedicated release test source and isolated installation, never a developer's actual install or a production release. A controlled local distribution server can drive real download/extraction/switching failures; GitHub release integration needs separate dedicated-repository acceptance. Report unverified platform/provider scope explicitly.

Use real isolated object storage for upload E2E, not mocked calls. A local compatible service can validate basics; confirm provider-specific conditional writes against the target service. Report missing services/credentials instead of claiming coverage.

Keep the existing real media assertions and integrate them into CLI/MCP as entry points arrive. Track ownership of generated files, objects, processes, and servers; stop gracefully and verify cleanup without affecting other work.

Completion requires applicable product behaviors, checks/E2E, accurate installation/operation documentation, compatible user data, and closed resource lifecycles. V1 may be implemented in milestones, but a preview missing v1 requirements must be labeled accordingly. Resolve open decisions before each affected stage; do not silently reclassify remaining v1 work as v2 or include deferred watermarking.

## Reference boundaries

The Effect v4 direction is inherited, not a claim that current upstream versions or exports were verified here. During implementation, consult official guides, CLI/MCP examples, schema documentation, and migrations matching selected versions. Do not copy floating main or obsolete import paths. Verify current Codex plugin packaging rules at the packaging stage. Treat proposed dependencies and APIs as design choices, not existing repository facts.

The local archive and installer milestone is specified in [runtime distribution](../20261016-runtime-distribution/TECH.md). Public hosting, signing, and self-update remain outside that milestone.
