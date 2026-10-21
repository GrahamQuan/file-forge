# Runtime archive and installer

Contract: [PRODUCT.md](./PRODUCT.md). Status: Implemented and verified locally on 2026-10-16.

The runtime currently lives in four ESM workspaces and starts through `packages/cli/dist/launcher.js`.
Node/FFmpeg preflight and typed bilingual presentation already exist. The plugin is a separate artifact.
The host is darwin-arm64 with Node 24.18.0 and pnpm 10.33.0. All new JavaScript uses `.js`.

## Build

Add a packaging entrypoint under `packages/cli`, using Effect filesystem/process services and pinned pnpm
10 `deploy --legacy --prod` to construct an isolated production dependency tree. This is a build-time tool;
recipients never run a package manager. Add explicit workspace `files` allowlists for compiled runtime code.
Consult the installed pnpm help and official deploy documentation; verify the produced dependency links
are wholly contained in the artifact. Keep third-party license files. Do not copy source fixtures, credentials,
repository configuration, dev dependencies, or the pnpm store. Remove deployment-local store metadata.

Stage an archive root containing `package.json` (ESM), `file-forge.js`, `install.js`, `runtime/`, English/Chinese
usage READMEs, and `distribution.json`. Generate bootstrap diagnostics from the existing message catalog.
`distribution.json` schema version 1 records target, runtime version, Node minimum, and a sorted inventory
of regular files (SHA-256 and mode) and contained relative symlinks. Inventory excludes the manifest itself.
Use system tar through the scoped Effect process adapter to create a gzip archive and an outer checksum.
Build into a temporary directory and publish unique artifacts; never overwrite an existing different archive.

## Install

The installer is a typed Effect program, entered only at its process boundary. Node checks precede loading
application dependencies. Validate metadata, target, exact inventory, and executable prerequisites before
creating an installation. Use narrowly scoped Node lstat where Effect's filesystem API follows symlinks.
All other filesystem and process orchestration uses Effect services. Human display strings belong to the
single typed CLI catalog; stable machine diagnostics stay English.

Use `PREFIX/lib/file-forge/<version>-<target>-<manifest-hash>` for runtime directories, an exclusive lock in
that managed parent, and a staged copy verified again before publication. Mark installations with a versioned
ownership record. Never overwrite a preexisting unowned runtime directory or a regular `PREFIX/bin/file-forge`.
Activate via an owned temporary symlink renamed over an existing owned launcher. Keep old versions and
preferences. On failure/interruption, remove only the current attempt's temporary directory/link/lock; a fully
published but inactive owned build may remain for recovery. This protects cooperative installers, not against
hostile concurrent mutation by another process with the same user's write permissions.

The build and installer have no release download endpoint or automatic update path. Update both READMEs,
the CLI upgrade guidance, plugin runtime setup reference, and first-draft implementation tracking.

## Verification

Run `pnpm check` and `pnpm test:e2e`. Add real archive/install E2E: unpack into an isolated path with spaces,
check checksum and symlink containment, install with a restricted PATH containing only external Node/FFmpeg
and system utilities, verify version/help, Sharp image and traced favicon output, and real MCP startup/tool
execution from the installed path. Exercise reinstall, existing-command conflict, lock conflict, modified
payload, missing Node/FFmpeg, wrong target, and preservation of the original input and installed command.
Verify all subprocesses exit and remove test-owned temporary files; do not run UI validation. Produce a local
archive for review, separately reporting that public hosting/signing and other targets are not implemented.

## Local acceptance evidence (2026-10-16)

- `pnpm check`: lint, formatting, strict native TypeScript checks, and all builds passed.
- `pnpm test:e2e`: all 10 real non-UI flows across 7 files passed.
- The final focused distribution E2E passed again after reusing the bilingual launcher bootstrap. It additionally
  verifies malformed metadata, escaping symlinks, Chinese missing-Node guidance, activation of a distinct build,
  preservation of both builds, and rollback using the retained installed runtime's installer.
- `pnpm package:runtime` produced `release/file-forge-0.0.0-darwin-arm64.tar.gz` (26,083,994 bytes)
  and its `.sha256` sidecar. SHA-256: `eeab34fbe929eb0ac62001981c747971bb358da686ce97dc4403986b8d1bed64`.
  The outer checksum was independently verified. Generated dependency command shims and deployment metadata
  were removed; packaged scripts/configuration contain no build-host absolute paths.
- Installed CLI and MCP executed real Sharp and vector-tracing operations from an isolated prefix with spaces,
  without npm/pnpm on PATH. Missing FFmpeg, modified payloads, wrong targets, busy locks, and command collisions
  preserved the active installation. Original input bytes remained unchanged.
- Test-owned MCP/worker/command processes exited; isolated install trees and packaging staging were removed.
  No preview servers, listening ports, browser resources, or global installation were created.

Public hosting, signing, automated release/update, other platform targets, and manual Codex host UI acceptance
remain unverified/out of scope. The archive is a local downloadable artifact, not a published GitHub release.
