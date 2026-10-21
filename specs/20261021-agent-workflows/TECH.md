# Agent workflow scripts

Status: Proposed.

Created: 2026-10-21

Contract: [PRODUCT.md](./PRODUCT.md)

## Verified starting points

- Root `package.json` provides `pnpm check`, `pnpm test:e2e`, and `pnpm package:runtime`.
- `packages/cli/src/archive.ts` packages a runtime and checksum; its default output directory is `release`.
- `packages/cli/src/install.ts` verifies payloads, locks installations, preserves managed builds, and atomically switches the launcher. `packages/cli/src/distribution.ts` supplies scoped process and integrity helpers.
- `e2e/distribution.test.js` exercises real archive extraction, isolated installation, native media, installed MCP, failure preservation, and rollback. `e2e/mcp.test.js` covers actual STDIO tools and lifecycle behavior.
- `packages/file-forge-plugin/SETUP.md` currently requires manual environment configuration and describes direct MCP and local marketplace setup. The plugin is a separate source package, not a runtime installer.
- The current Git origin is `https://github.com/GrahamQuan/file-forge.git`. No `.github` release workflow was present during this review. Public release hosting and self-update are not implemented.

Preserve the completed distribution spec and its evidence. This proposal adds orchestration and remote delivery; it must not retroactively label existing local tests as public-release or live-host acceptance.

## Entrypoints and structure

Proposed workflow names below describe the interface to implement; they are not available commands today. Keep executable sources under `packages/*`, use ESM TypeScript and Effect v4, and expose root pnpm aliases only for contributor workflows. Keep substantive operations reusable as typed Effects, executing them at process boundaries. Reuse the existing installer and process services rather than introducing parallel Promise-based orchestration.

| Proposed entrypoint                  | Purpose                                                 | Required context                                |
| ------------------------------------ | ------------------------------------------------------- | ----------------------------------------------- |
| `pnpm workflow:validate`             | Run checks and real non-UI E2E; collect stage results   | Development checkout and prerequisites          |
| `pnpm workflow:codex -- ...`         | Prepare/apply source or installed MCP/plugin setup      | Explicit asset root, route, configuration scope |
| `pnpm workflow:release -- ...`       | Prepare validated runtime/plugin artifacts and report   | Checkout, explicit version, supported target    |
| Downloadable bootstrap script        | Download, verify, and install a published runtime       | Supported host, Node.js, FFmpeg, network        |
| `file-forge --upgrade`               | Resolve and install a compatible stable release         | Managed installation and network                |
| Installed setup/rollback entrypoints | Connect an installed runtime or select a retained build | Explicit setup/rollback intent                  |

Finalize exact flags while implementing shared schemas. A bootstrap must be independently downloadable from the trusted release channel and must not depend on an already installed FileForge or a checkout. Select and document its minimal dependency set before implementation. Any bootstrap shell is limited to bootstrapping; application behavior remains Effect-based. No `curl | sh` requirement. Ensure packaged setup/upgrade modules and their dependencies are included by the archive allowlists.

## Execution and results (W01/W06)

Model each workflow as ordered stages with declared prerequisites and artifacts. Record a schema version, workflow/run identity, selected target, overall status, per-stage status, timestamps, stable error codes, log paths, side effects, and cleanup outcomes. Emit one final JSON result to stdout in machine mode; route progress and child logs to stderr or bounded per-stage files. Keep all human-facing strings in `packages/cli/src/messages.ts`.

Reuse the existing checks and E2E runner instead of maintaining duplicate tests inside workflow scripts. Run a selected stage only when its prerequisites are satisfied; represent omitted stages as not run. Fail fast for dependent writes while preserving completed reports. Do not recursively invoke the orchestration workflow from its own E2E suite.

Use Effect scoped subprocesses, argument arrays, bounded cancellation, and ownership records including PID, working directory, port, and terminal/session where applicable. Persist reports outside disposable staging. Handle SIGINT/SIGTERM at the boundary; stop dispatch, await child cleanup, and preserve an interrupted report. Never run cleanup against broad process names.

## Codex setup (W02)

Use supported Codex CLI or host APIs when available; consult the current [MCP documentation](https://learn.chatgpt.com/docs/extend/mcp?surface=cli) and [plugin packaging documentation](https://developers.openai.com/plugins/build/plugins) before selecting an API. Do not automate the host UI or assume a plugin installation command exists.

Resolve the runtime executable, Node directory, FFmpeg executable, and authorized root to validated absolute paths. Configure `command` plus `mcp` arguments for direct MCP, or `FILE_FORGE_EXECUTABLE` and the existing plugin bootstrap for plugin mode. Set `FILE_FORGE_ROOT` explicitly. Use per-operation configuration; do not mutate the global environment or commit machine-specific values.

Preparation writes an inspectable candidate and structured change summary. Apply uses supported configuration operations or a format-aware, validated edit with backup, concurrency detection, and atomic replacement; never append duplicate TOML tables or replace unrelated settings. Respect user-level versus trusted project scope. Recognize an existing matching connection as a no-op and report differing connections as conflicts. Detect plugin/direct-server duplication before enabling a route. Preserve original files on validation or write failure.

Keep protocol smoke tests and live-host acceptance separate in the report. Protocol checks call `file_forge_info`, execute a real small supported operation in an isolated authorized root, poll it, verify outputs, and close the session. The plugin acceptance instructions let Codex discover and use the installed skill/tools in a fresh connection and record actual evidence. If a restart or unsupported host action prevents completion, return a resumable pending step rather than claiming success or modifying hidden host state.

## Release and remote install (W03/W04)

Fix repository identity in trusted release configuration, not user asset metadata. Resolve release metadata from GitHub with explicit error handling. Select stable, non-draft, non-prerelease versions unless a future separately defined mode permits otherwise. Match target and version exactly across release tag, asset filenames, distribution metadata, runtime output, and plugin compatibility metadata. Never derive executable commands from release descriptions.

Separate validation/preparation and publication jobs, with write permissions only in publication. Preparation runs checks, builds into an owned directory, verifies archive/plugin contents, and creates checksums and a release manifest. The authorized main-branch publication job consumes that exact prepared manifest and rechecks hashes and version; use least-privilege GitHub credentials without logging them. Pushes to `main` explicitly authorize gated automatic tags and releases; pull requests and local preparation do not. Reject existing conflicting assets.

Download into owned staging with bounded size/time and HTTPS source/redirect validation. Verify the outer archive checksum before extraction, and establish the publisher verification policy before enabling production download. A checksum hosted beside an archive detects corruption but is not independent authenticity evidence. Do not invent signing assurance.

Remote extraction must reject absolute/traversing entries, escaping links, duplicate/conflicting entries, special files, and resource-limit violations before they can write outside staging. The existing local trusted-archive test is insufficient proof of safe remote extraction. Validate the extracted complete inventory before invoking downloaded code. Only after integrity, platform, version, and prerequisites pass should the shared installer activate a build. Failed downloads/extraction must not alter the active launcher.

## Upgrade and compatibility (W05)

Use the same verified download/install operation for bootstrap installation and upgrades. Inspect managed ownership and installed metadata before changing anything. Compare semantic versions, report already-current intact installs, reject downgrade through upgrade, and reject source/package-manager/unowned layouts. Preserve existing installer locks and immutable directories; do not remove builds used by live processes.

Retain the previous managed launcher target, validate the activated CLI and an isolated MCP handshake, and restore the previous target after validation failure only if ownership and concurrent state still match. If rollback cannot safely complete, report both the installation and rollback state without further destructive recovery. First installation failure has no previous build; do not invent a successful rollback.

Runtime upgrades do not edit plugin files or auto-restart active MCP jobs. Report plugin compatibility and reconnection needs. Explicit combined upgrade-and-connect requests may run setup after installation succeeds. Persist versioned workflow reports; do not rewrite historical manifests or assume unknown session jobs failed.

## Implementation sequence and acceptance

1. Implement local validation/reporting and isolated process cleanup by orchestrating existing checks.
2. Implement configuration preparation and supported apply paths, plus packaged setup for installed runtimes. Verify host capabilities before claiming plugin installation automation.
3. Use the confirmed automatic patch convention; resolve publisher verification for automated downloads; implement preparation, safe download/extraction, and shared install/upgrade/rollback.
4. Add gated main-branch release CI under the confirmed repository and version policy. Do not publish from local implementation validation.
5. Update both root READMEs, both archive guides, plugin setup guidance, and the usage skill with actual commands and unsupported states.

Run `pnpm check` and `pnpm test:e2e` after implementation. Add only real non-UI E2E under `e2e/**/*.test.js`:

- Invoke workflow processes against isolated real workspaces; verify stage reports, failures, interruption, logs, and cleanup. Reuse the suite for media validation without a recursive full-suite invocation.
- Apply setup to isolated Codex configuration containing unrelated entries; verify preservation, idempotence, conflicts, concurrent edits, denied paths, source versus installed executables, and valid real MCP startup. Never alter the developer's actual Codex configuration in automated tests.
- Exercise release selection/download/extraction/install through a controlled loopback fixture service with real artifacts, including absent releases, incomplete downloads, bad checksums, malformed archives, unsafe paths/links, wrong targets, and invalid metadata. Permit the local transport only through an internal test configuration, not production asset inputs.
- Upgrade between distinct valid test versions, verify version/media/MCP from the installed path, no-op behavior, rejection of downgrades, preserved active jobs/builds, failed activation, rollback, and unrelated-command protection. Retain existing installer E2E coverage.
- Run public GitHub acceptance only against an explicitly authorized test repository or release; local fixtures do not establish production connectivity, permissions, or publication success.

Track owned fixture servers, ports, sessions, and child processes and verify cleanup. No UI testing. Report live Codex plugin acceptance and public-release verification independently when unavailable. This specification authorizes the configured main-branch CI publication after passing checks; it does not authorize publication from local tests, global installation, or editing the user's active Codex configuration during tests.

## Main-branch release implementation (2026-10-21)

`.github/workflows/release.yml` validates pull requests and main pushes on macOS arm64 with Node.js 24, pinned pnpm, and FFmpeg. Main releases select the next patch version, stamp a disposable checkout before checks/E2E, package the runtime and matching plugin ZIP with SHA-256 sidecars, and transfer them to a separate publication job. Tags point to the exact triggering source commit; the tag's source retains development versions, and `packages/cli/src/release-version.ts` reproduces the selected release metadata. No version commit is pushed back to main.

Publication creates a draft, uploads all verified artifacts, checks completeness, then publishes it. Rerunning an already published source commit is a no-op for publication. An incomplete draft stops with a recovery instruction rather than overwriting assets; tags reserved before failure are never reused. Releases are serialized without cancelling an active run; GitHub may coalesce pending runs during rapid pushes. Release notes identify the source commit and validation run. Repository settings must permit the workflow token to write releases/tags. GitHub-hosted execution is unverified until the workflow runs remotely.

Downloads support manual installation/upgrades through the existing archive installer, retaining old builds. Automatic download/self-update and automated Codex setup remain proposed, and must not be advertised as implemented by this CI change.

Local validation: `pnpm check` passed with Node.js 24.18.0; `pnpm test:e2e` passed all 12 tests across 9 files. The release E2E stages a real copied checkout, validates its CLI version and matching plugin metadata, and preserves source files. Archive E2E validates the plugin ZIP and installed runtime. Workflow YAML and embedded JavaScript parse successfully. Test-owned processes exited; no browser resources were created. No remote push, tag, or release was performed during this validation.
