# FileForge First Draft: Product Direction

Status: Partially implemented as a local foundation preview; full v1 remains proposed. See [IMPLEMENTATION.md](./IMPLEMENTATION.md) for the explicitly selected scope and validation evidence.

The current local MCP/plugin milestone is specified in [Codex integration](../20261010-codex-integration/PRODUCT.md); its narrower session-only job contract supersedes the durable-job proposal for this preview.

Created: 2026-10-09

Updated: 2026-10-21. HyperFrames rendering and hierarchical delivery naming below are proposed additions; the Downloads default is confirmed. This revision does not claim implementation.

Technical design: [TECH.md](./TECH.md)

## Positioning and decisions

FileForge is a local asset processing and delivery tool with a CLI for people and scripts and a local MCP interface for coding agents. Use FileForge as the product name, `file-forge` for the command and distribution identity, and `@file-forge/*` for workspace packages.

The confirmed direction replaces the Electron-centered product with CLI and MCP entry points sharing one processing core. Agents interpret intent and select operations; FileForge validates and executes them, manages progress and failures, and reports real results. Basic processing must not depend on model APIs or an online AI service.

Requirements come from the project discussion and the user-supplied FileForge asset-production requirements documents in Downloads, including the CLI revision read on 2026-10-09 (the Markdown filename ending in `cli.md`). The revision confirms Effect-based CLI and coding-agent MCP entry points. Its ZIP examples are textual references, not inspected attachments, so their delivery formats are not established contracts.

### Reconciliation of the CLI requirements revision

| Source requirement                                            | Treatment in this specification                                                                                              |
| ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| CLI, MCP, and Effect                                          | Keep the shared-core architecture and existing Effect v4 direction                                                           |
| SQLite in the stack, but no database in the stakeholder notes | Record a contradiction; keep local JSON as the current proposal and do not reinstate the removed database without a decision |
| Separate tabs and a main auto-processing tab                  | Translate into command/tool capability groups and type detection with explicit processing options, not a graphical UI        |
| Chinese as the default language                               | Superseded by the user's explicit English-default decision; retain `en` and `zh-CN` with persisted preference                |
| ZIP, audio/music, GLB, and SVG conversion under v1            | Include in the v1 target, delivered incrementally after the first end-to-end milestone                                       |
| Image/video watermarking marked as deferred                   | Explicitly outside current v1 implementation scope                                                                           |
| Images for different scenes under v2                          | Keep scenario presets and unresolved Logo/Open Graph generation work in v2                                                   |

The source's association of GLB with image conversion is treated as a terminology error: GLB belongs to 3D processing. This does not authorize converting images into 3D models.

The stage ordering and defaults below remain proposals unless explicitly confirmed. Implementers must not treat unresolved decisions as approved scope.

## Users and goals

- People select a project, supply assets, run batches, and receive usable outputs from the terminal.
- Coding agents invoke structured operations instead of rewriting processing scripts for every request.
- Recipients can trace source assets to processed files, video covers, and remote objects.

Support the complete flow: import, inspect, normalize, select, upload, and deliver a manifest. Each step must also work independently. Local processing does not require a Bucket or credentials.

## Scope and proposed stages

### First end-to-end milestone within v1

1. File and directory scanning, batch inputs, validation, and normalized output names.
2. Image resizing, compression, and conversion; video resizing/compression and first-frame covers, including resized/compressed WebP covers.
3. S3-compatible uploads for multiple projects and named profiles.
4. Explicit asset selection, progress, cancellation, and per-file outcomes.
5. A JSON manifest and a generic Markdown delivery report.
6. A FileForge plugin containing a CLI usage skill and setup guidance, followed by local MCP integration in the same plugin. CLI and MCP must provide equivalent behavior for shared operations once both are available.
7. Installable GitHub Releases packages and `file-forge -v`, `file-forge --version`, and `file-forge --upgrade`.
8. English and Simplified Chinese CLI presentation, English by default, with a saved user language preference.

This ordering does not discard the remaining requirements or imply implementation. Version commands, GitHub distribution, and the language policy are explicit user requirements.

### Remaining v1 target

- ZIP input, audio/music processing and composition, optional HyperFrames project rendering, GLB compression, and SVG-to-JSX/TSX conversion.
- Specialized `song.md` and `prompt.md` delivery formats after inspecting original examples.
- Asset replacement and fresh remote status queries after defining overwrite and caching behavior. Version history is a possible design choice, not a separately confirmed feature.
- Environment diagnostics.

These are v1 requirements, not automatically deferred to v2. The first milestone may ship as an explicitly incomplete preview; it must not be described as full v1 completion. Specialized templates and replacement behavior need their open decisions resolved before their implementation and acceptance.

### V2 and exclusions

V2 covers source-to-scene image presets, including size/format variants for social media, Logo exports, and Open Graph images. Whether Logo generation includes generative AI and whether Open Graph work includes browser screenshots remain unresolved.

Image/video watermarking is explicitly deferred, with no committed release. The crossed-out site-template migration request is excluded. Remote MCP, a persistent daemon, a graphical editor, built-in model inference, and a remote database are not initial goals. The workflow accepts assets generated elsewhere; it does not imply an integrated generation service.

## Observable behavior and acceptance

### P01 Equivalent entry points

Given the same inputs, options, and destination, CLI and MCP operations produce semantically equivalent results. The CLI works independently of Codex. MCP does not expose a generic shell. A skill guides tool use without replacing validation or guaranteeing automatic tool selection.

Human output provides readable summaries; machine output has a stable structure. Noninteractive requests never wait for terminal prompts. Missing required information returns an explicit error. Help and capability queries do not start media tasks.

### P02 Inputs, checks, and naming

Accept file lists and directories, making recursion, selection, and unsupported formats explicit. Empty input receives an explicit result rather than a fabricated success. Before upload, check names, size, readability, destination configuration, and conflicts. Limits come from explicit configuration or options, not undocumented assumptions.

Detection identifies types and available capabilities; it does not authorize cropping, uploading, or overwriting. Normalize generated delivery folder segments and filename stems to ASCII lowercase letters (`a-z`), digits (`0-9`), and hyphens only. Replace runs of other characters, including spaces, `_`, `+`, and dots, with one hyphen; trim leading and trailing hyphens. Preserve `/` as the hierarchy separator and the final file extension separately in lowercase (for example, `.mp4`). Preserve source files, user metadata, and original-to-output mappings.

Accept an explicit relative delivery path representing a project and route. For example, `example.com/Some-Route/some example` becomes `example-com/some-route/some-example`; `My Clip.MP4` becomes `my-clip.mp4`. This is naming input, not a URL to fetch. Apply the same rules to an explicitly supplied version segment without inventing a project version.

Allow an existing final asset collection to be prepared in this layout by copying selected files without recompression or upload. Report empty normalized segments and collisions before publishing the collection; never silently merge differently named source folders or overwrite files. Deterministic asset suffixes remain permitted for ordinary processing outputs, but must be reflected in mappings. Reject absolute delivery paths, traversal segments, and empty hierarchy segments. Non-ASCII characters follow the same replacement rule; no automatic translation or transliteration is implied.

### P03 Batch processing and media outputs

A single request can process a collection. FileForge manages concurrency instead of requiring one agent call per file. Image resizing preserves aspect ratio without enlargement by default. Record parameters and actual output dimensions, format, and size. Compression does not guarantee a smaller file; report the actual change and any unmet target.

A video cover uses the first decodable video frame and remains linked to its source. Missing video streams and decoding failures produce explicit errors, not empty covers. Use an explicit preset or report missing options rather than inferring an operation from file type alone.

On macOS, the default output root is the current user's `~/Downloads`, independent of the working directory. Allow an explicit output root. Retain a separate task directory to preserve earlier exports: `~/Downloads/file-forge-<task-id>/<normalized-delivery-path>/<filename>`. When no delivery path is supplied, keep outputs directly in the task directory. Return the resolved directory and relative asset paths. Missing permissions or an unusable output root produce an explicit failure without falling back elsewhere. Other platforms require an explicit output root until their defaults are confirmed.

For upload, the collection-relative path is the object key beneath the selected profile's explicit prefix: `example-com/some-route/some-example/xxx.mp4`. Exclude the local Downloads path and task-directory name. Preparing this layout does not authorize an upload. Separate local task directories preserve exports but do not provide remote versioning; repeated keys still follow the no-overwrite policy.

### P04 Projects and upload destinations

Bind each task to a specific project and profile. A project's explicit default profile may be used, but never silently fall back to another project or Bucket. Missing credentials block only operations that need them.

Distinguish the storage API endpoint, Bucket, object-key prefix, and public base URL. Do not invent public URLs for private objects. Resolve secrets locally and exclude them from tool responses, logs, and delivery files.

### P05 Selection and upload

Upload an explicit file set or the selected outputs of a manifest. Authorization to upload a complete set does not require repeated per-file confirmation. A request to inspect or process alone does not authorize an upload.

If files change after inspection, recheck them or reject stale results. Reject overwriting existing objects by default and report conflicts. Overwrite, versioned URLs, and CDN invalidation remain separate decisions.

### P06 Jobs, cancellation, and failure

Long operations return job identity, state, stage, and completed counts. Report stages and counts when exact progress is unavailable; do not fabricate percentages.

Per-file failures may allow other files to continue. Distinguish complete success, partial success, failure, cancellation, and interruption. Cancellation stops new work and terminates or finishes active work safely. Do not silently delete objects already uploaded.

Persisted results remain readable after a connection or process exits. The initial implementation does not promise background continuation or resuming midway through encoding. Verify uncertain remote writes before retrying, and do not blindly repeat confirmed successful writes.

### P07 Delivery and mappings

The JSON manifest is authoritative for delivery relationships; derive generic Markdown from it. Record stable asset IDs, sources, outputs, cover relationships, statuses, destinations, and object locations. The manifest is not a substitute for current filesystem or remote state; refresh that information when requested.

Include failures and missing fields in reports. Do not present partial completion as full success. Titles, lyrics, and prompts must come from user input or explicit metadata, not guesses from filenames. Do not claim compatibility with old specialized templates until their formats are confirmed.

Support delivery of an already prepared asset collection without forcing recompression, regeneration, or a fresh upload. Inspect the supplied files, verify supplied remote mappings when requested, and generate the selected delivery format from actual inputs. The v1 specialized outputs are `song.md` for music and `prompt.md` for image/video collections, including asset mappings. A generic report is a milestone fallback, not acceptance of these specialized formats. Missing required template metadata must be reported before claiming a complete handoff.

### P08 Local data and installation

No remote database is required. Read files and remote information on demand; persist task records and mappings locally. Operations without network dependencies work offline.

Each explicit inspect/status refresh reads the relevant current source, reporting unavailable remote information as unavailable rather than presenting an old snapshot as current. Historical jobs and delivery mappings remain historical records. The SQLite/no-database conflict in the source remains open; neither live refresh nor this spec requires reintroducing a database.

Installation documentation distinguishes FileForge, FFmpeg, MCP configuration, and plugin packaging. Installing a plugin does not imply that every local runtime dependency is installed. Upgrades must preserve source assets, configuration, task history, and delivery outputs.

### P09 Versions, upgrades, and GitHub distribution

`file-forge -v` and `file-forge --version` are identical: report the installed version and exit successfully without network access, project configuration, FFmpeg, or MCP startup. Reserve `-v` for version information, not verbose output.

`file-forge --upgrade` checks the official GitHub Releases source and installs the latest stable release for the supported platform and architecture. It performs an upgrade rather than merely displaying advice. If already current, report that and exit successfully without reinstalling. Do not downgrade or opt into prereleases automatically. Ordinary processing and MCP startup do not trigger upgrades.

Release assets must be installable, not just source archives. Document version, platform support, dependencies, and upgrade considerations. Confirm Node.js bundling, archive format, and repository identity before the first release. FFmpeg remains an external dependency.

Download interruption, validation failure, unsupported platforms, and installation errors preserve the previous installation. Do not terminate running tasks or MCP sessions without authorization. Report that existing MCP sessions need reconnection to use an upgraded version.

### P10 Installation-source compatibility

Initially guarantee self-update for the official GitHub package installation layout. For source checkouts and package-manager-owned installations, report that self-update is unsupported and provide the appropriate instructions rather than overwriting their files. Add upgrade strategies for other installation channels separately.

### P11 English project content and bilingual CLI presentation

Use English for code, comments, identifiers, specifications, agent instructions, and project-authored documentation. The only exceptions are translated README files and localized display messages. `README.md` is English; `README.zh-CN.md` is Simplified Chinese, with equivalent information and reciprocal links. Preserve user-authored filenames and asset content in their original language.

Support exactly `en` and `zh-CN` initially, with `en` as the default regardless of operating-system locale. All FileForge-authored terminal text, including help, validation messages, progress, summaries, and upgrade/configuration feedback, comes from one typed TypeScript message object with both locales.

Proposed commands `file-forge config set language en` and `file-forge config set language zh-CN` validate and persist the preference in user configuration. It applies across projects and subsequent invocations. `file-forge config get language` reports the saved preference or the default. An explicit `--language <locale>` overrides presentation for one invocation only; persistent changes require the configuration command. Confirm a successful change using the newly selected language.

Reject unsupported explicit locale values without changing configuration. Missing configuration defaults to English. Invalid saved settings produce an English diagnostic and fall back to English without silently overwriting the file. If saving fails, report failure rather than claiming the language was remembered.

Only presentation is localized. Commands, flags, configuration keys, machine JSON fields and enum values, error codes, MCP schemas/tool descriptions, and internal diagnostics stay English and stable. The local CLI language preference does not alter MCP behavior or delivery-manifest data. English remains the language of generated delivery-report structure; preserve user content as supplied. Raw third-party diagnostics are not automatically translated; wrap them with localized FileForge explanations when shown to people.

### P12 Directory and ZIP batch intake

Support a directory or ZIP as a collection of assets for inspection, processing, selection, and upload. By default, a ZIP used as collection input is unpacked and its selected files are processed/uploaded individually; do not silently upload the archive itself. Preserve archive-relative paths in source mappings and apply the same naming, validation, output, and partial-failure rules as ordinary directory input.

Report unreadable, encrypted, corrupt, or unsafe archives explicitly. Reject entries that escape the extraction area or exceed configured resource limits. Do not overwrite input archives or unrelated files; clean task-owned extraction files after their consumers finish. An archive rejected as unsafe must not trigger upload of its contents.

### P13 Audio, music, GLB, and SVG operations

Expose audio/music conversion and explicitly configured image/video/audio composition as batch capabilities. Record selected output formats, timing/composition options, actual results, and failures. The exact v1 operation and codec/preset matrix must be settled before implementing these adapters; do not interpret the requirement as a general-purpose timeline editor or arbitrary FFmpeg interface.

Support GLB compression with a declared compatibility preset. Preserve source files, validate the resulting model, and report actual size change, unsupported extensions, and any intentional quality tradeoff. Do not silently discard animations, materials, or textures to claim compression success. Define target-consumer compatibility before choosing a compression strategy.

Accept local SVG paths and generate the requested JSX or TSX output with a deterministic component name and output mapping. Produce valid source for supported SVG content without executing the input. Report rejected content and unsupported features; do not silently create broken components. Component conventions and external-reference handling must be fixed before acceptance.

### P14 Asset replacement and remote inspection

Expose inspection of remote object information for an explicit project/profile and object selection, including available key/URL metadata and current existence. Keep private-object handling and credentials consistent with P04. An unreachable destination is not proof that an object is missing.

Asset replacement must use an explicit operation targeting an existing asset, preserve its identity and source-to-output relationships, and report the resulting object mapping. A failed replacement must not be reported as successfully published or erase the last confirmed delivery mapping. Whether replacement keeps the old URL or publishes a new key, and how stale caches are addressed, remain open; ordinary upload continues to reject overwrite.

### P15 Runtime and plugin distribution

Ship two related deliverables: the FileForge runtime distributed through GitHub Releases, and the FileForge plugin for Codex. The runtime provides the CLI and shared processing core, with the local MCP server added when ready. The plugin packages usage instructions and setup guidance; it does not duplicate processing logic.

The initial plugin calls the installed CLI and does not require MCP. Users install the runtime, install the plugin, then follow its setup workflow. Setup checks the executable's availability, its compatible version, and operation-specific dependencies such as FFmpeg. Missing prerequisites produce actionable instructions, not a false ready state. Bucket credentials are needed only for storage operations. Plugin installation alone must not be advertised as installing the runtime, FFmpeg, credentials, or filesystem permissions.

Start with one FileForge usage skill covering input inspection, batch processing, project/profile selection, result interpretation, failure handling, and delivery. Include setup guidance and supporting references; do not require a separate skill for every command. Users should not have to clone the development repository or install its development skills to use the product.

Add local MCP configuration to the same plugin after the server and shared operations are validated. Prefer a configured, compatible MCP connection for supported operations; otherwise use the compatible CLI when available and permitted. Choose the route before executing. Never automatically repeat a failed or uncertain write through the other interface; reconcile task/object state first to avoid duplicate processing or uploads.

Document supported runtime versions for every plugin release and report incompatible installations before invoking unsupported operations. Runtime self-update and plugin updates are separate lifecycles; upgrading the CLI does not implicitly update the skill. Clear instructions improve discovery but do not guarantee automatic skill selection. Standalone skills may support development or testing; the plugin is the intended user-facing integration. An `llms.txt` documentation index is optional and is not an installation or discovery mechanism.

### P16 Optional HyperFrames rendering

Support rendering an existing local HyperFrames project into a final MP4 through both CLI and MCP, using explicit render settings and the shared output and delivery rules. This adds HTML/CSS-based motion graphics and designed compositions alongside existing image and audio/video processing. HyperFrames is an optional third-party rendering backend; missing dependencies block only its operations.

The initial scope is project-to-video rendering. Composition authoring, a graphical editor, hosted rendering, and automatic installation of upstream agent plugins are excluded. Preserve the supplied project and its internal asset names so references continue to resolve; normalize only final delivery copies. No model API or Bucket credentials are required for a self-contained local render.

Validate project inputs, supported settings, and dependency compatibility before rendering. Report progress, cancellation, missing assets, unsupported projects, render failures, and verified output metadata through the existing operation contracts. A failed or cancelled render must not publish a partial video as successful. Stop task-owned render processes and browser resources on completion, failure, or cancellation.

HyperFrames projects execute code. Rendering must be explicitly requested, and implementation must settle the supported project trust, filesystem, and network policy before enabling the operation. Inspection alone must not execute the project.

## Open decisions

1. Specialized delivery template fields and compatibility with their consumers.
2. Implementation ordering within v1 and the exact audio/composition operation matrix, GLB compatibility presets, and SVG component conventions.
3. Asset replacement semantics, versioned URLs, caching, and remote-query scope.
4. Supported S3-compatible providers, provider limits, private-object access, and distribution platforms.
5. The scope of Logo and Open Graph features.
6. Additional OS/architecture targets and Node.js bundling beyond the local macOS arm64 milestone. The confirmed GitHub repository is `GrahamQuan/file-forge`; main-branch automatic patch releases are defined in the agent-workflow follow-up. Version commands and English-default bilingual presentation are already confirmed.
7. The validated HyperFrames version, supported render settings, and enforceable project execution policy.
8. Whether local SQLite is actually required: the source lists it while also stating no database is needed. Keep the local JSON proposal and removed database code unchanged until this is resolved.

Resolve these questions before implementing the affected capability. They do not prevent independent design of CLI/MCP, basic processing, and generic manifests.

The local archive and installer milestone is specified in [runtime distribution](../20261016-runtime-distribution/TECH.md). Public hosting, signing, and self-update remain outside that milestone.

Agent-operated validation, Codex setup, release preparation, download, and upgrade workflows are proposed in [agent workflows](../20261021-agent-workflows/PRODUCT.md). That follow-up does not change the completed local distribution milestone or imply that public releases exist.
