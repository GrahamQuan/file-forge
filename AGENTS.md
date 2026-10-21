# Project conventions

## Language

- Use English for source code, comments, identifiers, specifications, agent instructions, and all other project-authored content.
- Only translated README files and localized display messages may use other languages. Keep `README.md` in English and `README.zh-CN.md` in Simplified Chinese, with equivalent content and reciprocal links.
- Do not translate or rewrite user filenames, metadata, or asset content to enforce this policy.
- The CLI supports `en` and `zh-CN`, defaults to `en`, and stores its language preference in user configuration. Keep every FileForge-authored CLI display message in one typed TypeScript object; do not scatter strings across commands.
- Localize only presentation. Command names, configuration keys, error codes, JSON keys/enums, MCP schemas, tool descriptions, and machine diagnostics remain English and stable.

## Stack and structure

- Use a Git monorepo, pnpm workspaces, and Turborepo. Keep all workspaces under `packages/*`, including executable entry points such as the CLI.
- Build a Node.js + TypeScript CLI for manual use and local MCP calls by coding agents. Both entry points must reuse the same business operations.
- The local foundation includes `packages/cli`, `packages/core`, Effect-based `packages/media`, bilingual presentation, and real non-UI E2E flows. Local STDIO MCP and the source plugin are implemented under `packages/mcp` and `packages/file-forge-plugin`; macOS arm64 runtime archives, managed installation/rollback, plugin ZIPs, checksums, and gated GitHub Actions patch releases are implemented. Uploads, persistent job management, automatic self-update, and other distribution targets remain planned. Do not reintroduce desktop dependencies or the removed desktop database/IPC packages.
- Start with `docs/README.md` and `docs/current-capabilities.md` for current behavior. Original scope is in `specs/20261009-first-draft/`; newer folder-processing and source-folder-renaming contracts under `specs/20261021-*` supersede conflicting older assumptions. Historical implementation reports are milestone evidence, not a current feature/release inventory. Do not advertise proposed commands as implemented.
- Prefer Sharp for images and FFmpeg for video, audio, music, and compositions.
- Use Effect v4 throughout application and infrastructure code, including media adapters and contributor helpers. Public side-effecting operations return typed Effects; use services/layers, schemas, scoped resources, and structured concurrency.
- Prefer relevant Effect ecosystem facilities for CLI, MCP, filesystem, processes, HTTP, configuration, and scheduling. Verify availability in the selected release and isolate justified native/third-party adapters instead of maintaining parallel Promise-based application logic.
- Execute Effects at process/framework boundaries, not inside reusable services. Keep pure functions, types, and localization objects as ordinary TypeScript. Retain Sharp and FFmpeg behind Effect adapters, and install only packages needed by implemented capabilities.
- Use oxlint and oxfmt, not ESLint or Prettier.

## User workflows and skill ownership

- Implemented CLI/MCP operations include inspection, image conversion/compression, video compression with covers, strictly lossless audio/music and GLB JSON optimization, six-angle lossless WebP model posters, recursive folder compression, explicit source-folder rename preview/apply, favicons, and manifest export. Verify installed help/schemas before assuming a source feature is released.
- Compression without width or height skips resizing; never restore the removed 512 × 512 fallback. One axis is automatic on the other; two are maximum bounds. Preserve aspect ratio without enlargement. Explicit video resizing rounds down to even dimensions; incompatible original no-resize dimensions fail instead of silently changing.
- Media operations preserve sources and write new deliveries. `folder rename` / `rename_folders` is the explicit opt-in exception for directory names only: default preview, explicit apply, collision/symlink/traversal checks, receipts outside old/new roots, and no automatic rollback or blind replay. Never infer source-renaming permission from compression.
- Preserve manifest compatibility: v1 inspection/image/video/export, v2 folder delivery, v3 directory-rename receipts, v4 audio/model and mixed-folder deliveries, v5 model posters. MCP jobs remain session-local; unknown jobs after reconnect do not prove no output exists. Do not rename the configured MCP workspace root.
- The canonical reusable user skill is `skills/file-forge/`; ProductDesignSkills and other project copies are consumers. Edit the canonical skill and use `pnpm skill:copy --project PATH` after building. A user request to “copy” means create or fully replace the entire target skill from this repository, including removal of stale target files; no merge or extra replacement confirmation is needed. Identical copies are no-ops. Keep recovery backups outside the active skills directory and out of commits. Do not make consumer edits the new source of truth.
- Keep the compact runtime plugin skill under `packages/file-forge-plugin/skills/file-forge/` consistent with current tools. It is a separate packaged artifact; copying the reusable skill does not install/upgrade the runtime or register the plugin.
- Preserve the user-facing skill's stop-and-ask behavior for missing tools, unclear essential choices and failed operations: explain the blocker and recommend a concrete solution before requesting a decision. Reuse explicit unchanged authorization. Omitted optional dimensions are not a reason to ask.
- The user skill supports two routes: built-in CLI/MCP workflows when suitable, and agent-authored direct Sharp/FFmpeg processing for other clear media requests. Choose and announce the route without a redundant approval; check only its dependencies. Missing dependencies, essential ambiguity, failed operations and access restrictions still require the established stop-and-ask behavior. Custom processing does not require FileForge setup, does not create FileForge jobs, and must preserve sources and verify quality. Maintain `custom-processing.md`, `sharp.md` and `ffmpeg.md` in canonical and packaged skills together.
- HyperFrames is an externally orchestrated workflow, not a built-in FileForge command. Do not expose planned S3/general-composition functions as available CLI tools.

- Audio/model compression is strictly lossless: never silently introduce sample-rate/precision reduction, geometry quantization, texture recompression or animation resampling. Preserve originals when safe optimization does not shrink them and report that outcome. GLB compression currently compacts JSON only; do not advertise geometry compression. See `docs/lossless-audio-models.md`.

- Any image created, extracted, rendered or selected for use as a poster or cover must pass through the image workflow before delivery. This applies to video frames, 3D views, existing images and custom Sharp/FFmpeg workflows. Reuse the shared image-processing pipeline in built-in operations; custom processing must perform the corresponding image validation, requested resizing and encoding steps. Honor the requested dimensions, transparency, format and quality policy; do not introduce resizing or lossy compression where preservation is required. Verify the final image and record its processing settings. An image step already performed by the producing workflow satisfies this rule; do not add a redundant encoding pass.
- 3D model poster renders pass through the shared image-processing workflow before delivery: temporary PNG → lossless WebP with no additional resize. Keep the internal lossless encoding policy separate from ordinary quality-80 image compression; do not duplicate Sharp encoding in the renderer or add a lossy second pass. Record the policy in manifest `parameters.image`.
- Model posters are a separate derivative workflow: six axis-aligned views, lossless WebP, transparent canvas, default 16:9 at 1024×576, configurable positive W:H ratio, one axis derives the other, both set exact canvas dimensions (16–4096; reject an explicit ratio conflict). Use scoped Three.js/Puppeteer Core rendering with an external Chrome/Chromium executable, isolated profile and pipe transport; preserve browser sandboxing, block external model resources and verify owned-process cleanup. See `docs/model-posters.md`. This is a media backend, not authorization for UI tests.

## Tests and validation

- Do not write or run unit, component, UI, UI E2E, or screenshot tests.
- Write and run only real non-UI E2E tests; do not relabel unit tests as E2E.
- Leave UI validation to the user after implementation is complete; do not perform automated or manual UI testing.
- Use Vitest with `e2e/**/*.test.js`. Do not preinstall additional test tools without actual use cases.
- After implementation changes, run `pnpm check`; run `pnpm test:e2e` for media or data changes. Contributor helpers that copy or mutate project files need real filesystem E2E coverage, including conflict/backup/cleanup behavior. For prose-only changes, check links, commands, bilingual README parity and consistency without running the application suite solely for prose. Respect explicit user instructions not to execute code or tests, and report the unverified scope.

## Implementation boundaries

- Use ESM by default with `"type": "module"` in package manifests. Use `.js` for JavaScript files and module paths; `.mjs` is unnecessary.
- Use TypeScript strict mode. Import across workspaces through package names and public exports, never internal source paths.
- Retain the TypeScript 7 / ts-go native compiler direction and existing `tsc` commands; do not fall back to the older JavaScript compiler.
- Share explicit input validation between CLI and MCP. Do not expose generic shell execution or arbitrary FFmpeg argument passthrough through the CLI/MCP. This does not prohibit the user skill from orchestrating direct Sharp/FFmpeg through authorized host tools.
- Keep Sharp on the Node.js side. Start FFmpeg with argument arrays and `shell: false`, never shell command concatenation.
- Keep MCP status and cancellation responsive. Effect fibers do not replace workers or task processes.
- Reserve STDIO MCP stdout for protocol output and use stderr for logs. Keep progress text out of CLI machine-readable output.
- Resolve configuration and credentials per task; do not switch projects by mutating global process environment variables. Never put secrets in logs, tool responses, or delivery manifests.
- Never silently delete source assets, task records, or historical data during failure recovery, upgrades, or migration. Do not commit media outputs, secrets, or user data.
- Version persisted formats and provide compatibility or migrations instead of deleting user data.

## Documentation and distribution

- After every code update, automatically review and synchronize `skills/file-forge`, its references, the compact plugin skill, and all affected documentation before considering the task complete; do not wait for a separate documentation request. Update the current guides, both root READMEs, archive guides, setup instructions and command examples as applicable. Do not add meaningless edits to unaffected documents. Keep historical specs recognizable as historical; use the docs index to route readers to current contracts instead of rewriting old evidence as new proof.
- Keep archive README translations aligned with packaged capabilities. Source version `0.0.0` is stamped by release CI; do not claim a published release contains uncommitted source changes.
- GitHub Actions validates `main` and publishes the next patch runtime/plugin/checksum set. Local work does not authorize pushing or publishing. Verify remote run/assets separately before reporting release success. `file-forge --upgrade` and proposed orchestration aliases remain unavailable unless actually implemented.

## Temporary resource cleanup

- Record the owning task, working directory, PID, port, and terminal session for every temporary server, preview, watcher, or automation process started by the task.
- Unless the user requests that a preview remain available, gracefully stop task-owned services and child processes after validation; verify process exit and port release.
- Recheck identity and ownership before forceful termination. Never use broad cleanup such as `killall node` or `pkill node`.
- Preserve pre-existing services, other tasks' services, and Codex/MCP infrastructure.
- Track and close task-created browser tabs, windows, sessions, and recording/tracing workers. Keep pages explicitly requested by the user or required for reviewing the deliverable.
- Preserve existing tabs, profiles, cookies, and login state. Report uncertain ownership or unsupported cleanup accurately.
- In the final response, report temporary service and browser cleanup. Explain any retained resources and how to stop them.
