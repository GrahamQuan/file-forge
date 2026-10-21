# Agent-operated testing, installation, and upgrades

Status: Proposed; scripts and public releases are not implemented by this specification.

Created: 2026-10-21

Technical design: [TECH.md](./TECH.md)

## Purpose and continuity

A user should be able to ask Codex to test FileForge locally, connect it to Codex, install a published runtime, or upgrade an existing installation. Codex should invoke documented, noninteractive scripts and interpret structured results instead of reconstructing shell procedures on each request.

This follows the completed [local runtime distribution milestone](../20261016-runtime-distribution/PRODUCT.md). Its exclusions of remote downloads and automatic Codex configuration remain accurate for that milestone; this proposal adds separately requested workflows. The [first-draft contract](../20261009-first-draft/PRODUCT.md) remains authoritative for media behavior. HyperFrames and hierarchical S3 delivery paths remain proposed until separately implemented.

## Workflow contracts

### W01 Local validation

One workflow runs prerequisite checks, repository checks, and real non-UI E2E tests, including actual CLI/MCP processing and archive installation outside the checkout. It reports which stages passed, failed, or were not run, with durable log/report locations. Missing prerequisites fail clearly; no silent installation of Node.js, pnpm, or FFmpeg.

Tests use isolated inputs, output roots, configuration, installation prefixes, and MCP sessions. They preserve existing installations, source assets, user preferences, Codex configuration, and unrelated services. A failed stage prevents dependent stages from being reported as passed. Support explicit reruns of selected stages without implying full-workflow success.

### W02 Local Codex setup and agent acceptance

An explicit setup workflow accepts a source build or installed runtime, an existing authorized asset root, and a Codex configuration destination. It checks runtime compatibility and dependencies, then prepares or applies a connection without requiring hand-edited absolute paths. Preparation returns the exact proposed configuration; explicit setup/apply authorization permits installation without repeated confirmation.

Support direct MCP setup for tool testing and the FileForge plugin for the complete skill-plus-tools experience. Do not enable duplicate FileForge MCP servers through both routes. Preserve unrelated configuration and detect conflicts. Missing or incompatible Codex capabilities produce an actionable unsupported result rather than invented installation success.

After connection, verify runtime information and actual processing through MCP. A live Codex acceptance workflow asks the host agent to discover FileForge, invoke its tools, poll a job, inspect results, and test cancellation. Protocol success is distinct from the plugin being installed and selected in a live host. Automated or manual UI testing remains prohibited; use supported host APIs/CLI where available, otherwise report the host step as pending for the user. Reconnection must not lose the record of unfinished checks or replay uncertain writes.

All input/output paths must be within the selected MCP root. For Downloads testing, use a dedicated directory such as `~/Downloads/file-forge-test` containing separate inputs and outputs. Do not widen access to the entire home directory merely to satisfy path validation.

### W03 Release preparation and publication

Provide a release-preparation workflow that validates the source, builds versioned runtime and plugin artifacts, checks their compatibility and contents, and produces checksums and a reviewable release report. Initially support macOS arm64 only. No secrets, machine-specific paths, user media, or development fixtures enter artifacts.

A push to remote `main` triggers the gated release workflow. The user authorizes automatic publication from pushes to `main` in `GrahamQuan/file-forge` after all required checks and real E2E pass. Pull requests validate without publication. Local validation/preparation never publishes. The GitHub publication job alone creates tags and uploads verified assets. Failed validation blocks publication. Existing release assets must not be silently replaced.

### W04 Download and install

A noninteractive workflow resolves an explicit stable version or the latest stable published release from the configured official GitHub repository, downloads the matching runtime and integrity metadata, verifies them, and installs through the existing installer. Public installation must not require pnpm or a development checkout. State bootstrap prerequisites explicitly; the current runtime still requires Node.js and FFmpeg.

Reject absent releases, missing assets, unsupported targets, integrity failures, denied access, and incompatible prerequisites before changing the active installation. Never fall back to an unrelated repository, a source build, or an unverified asset. A network failure leaves any working installation intact. Installation alone does not change Codex settings; connecting it is an explicit workflow or an explicitly requested combined install-and-connect operation.

### W05 Upgrade and rollback

An explicit upgrade resolves the installed version and release target, downloads and verifies the new runtime, activates it through the existing managed installer, and validates the installed CLI and MCP entrypoint. An already-current intact install is a successful no-op. Reject automatic downgrades and unsupported or unowned installations; rollback is a separate explicit operation using a retained managed build.

Preserve old builds, media, settings, manifests, and historical data. Do not terminate running jobs to upgrade. Report when MCP reconnection is needed; an existing connection may still use the previous runtime. Failed activation or post-activation validation restores the previous managed launcher when safe and reports the outcome. Runtime and plugin compatibility is checked separately; do not silently upgrade the plugin or modify its configuration during a runtime-only upgrade.

### W06 Agent-readable results and cleanup

Every workflow exposes documented inputs, noninteractive behavior, stable error codes, meaningful exit status, and a versioned JSON report. Report completed side effects even on partial failure, distinguish unavailable external checks from failures, and provide the next action when blocked. Human display messages follow the existing English/Simplified Chinese catalog policy.

Track and stop task-owned processes, temporary servers, MCP sessions, and workers. Clean only owned staging data; retain requested artifacts and diagnostic reports with their paths. Preserve user browser resources and other tasks. Report cleanup failures accurately. No workflow may claim full acceptance when required host, platform, or public-release checks remain unverified.

## Boundaries and remaining decisions

These scripts automate setup and verification of implemented capabilities; they do not implement HyperFrames, S3 uploads, or new media operations. No package-manager publishing, other platform support, or prerequisite auto-installation is implied.

The confirmed release repository is `GrahamQuan/file-forge`. Successful releases automatically increment the highest reserved stable semantic version by one patch, starting at `0.0.1`. Failed unpublished reservations may leave version gaps; never reuse or overwrite a reserved tag. Publisher verification policy for automatic downloads and the supported Codex setup interface remain prerequisites for those separate workflows. First-draft `file-forge --upgrade` and the workflow upgrade entrypoint must share one implementation when delivered.

## Main-branch release implementation (2026-10-21)

`.github/workflows/release.yml` validates pull requests and main pushes on macOS arm64 with Node.js 24, pinned pnpm, and FFmpeg. Main releases select the next patch version, stamp a disposable checkout before checks/E2E, package the runtime and matching plugin ZIP with SHA-256 sidecars, and transfer them to a separate publication job. Tags point to the exact triggering source commit; the tag's source retains development versions, and `packages/cli/src/release-version.ts` reproduces the selected release metadata. No version commit is pushed back to main.

Publication creates a draft, uploads all verified artifacts, checks completeness, then publishes it. Rerunning an already published source commit is a no-op for publication. An incomplete draft stops with a recovery instruction rather than overwriting assets; tags reserved before failure are never reused. Releases are serialized without cancelling an active run; GitHub may coalesce pending runs during rapid pushes. Release notes identify the source commit and validation run. Repository settings must permit the workflow token to write releases/tags. GitHub-hosted execution is unverified until the workflow runs remotely.

Downloads support manual installation/upgrades through the existing archive installer, retaining old builds. Automatic download/self-update and automated Codex setup remain proposed, and must not be advertised as implemented by this CI change.
