# Local MCP and Codex plugin

Product contract: [PRODUCT.md](./PRODUCT.md). Status: Implemented and verified locally.

## Evidence and design

`packages/core/src/index.ts` already provides inspection, image processing, favicon generation, and
manifest reading/export. `packages/cli/src/commands.ts` calls these operations. Effect 4.0.2 exposes
`effect/ai/McpServer`, `McpProtocol`, `Tool`, and `Toolkit`, including STDIO and protocol cancellation.
Use these pinned APIs, not a second MCP framework. Existing Effect process and Node services provide
worker lifecycle management. All runtime packages remain under `packages/*`.

Add shared operation request schemas/dispatch to core and have CLI and workers use them. Add
`packages/mcp` with seven tools: `file_forge_info`, `inspect_files`, `process_images`, `generate_favicons`,
`export_manifest`, `job_status`, and `job_cancel`. Business tools accept a request ID and return a job
snapshot immediately. The status result contains the existing version 1 manifest, preserving per-asset
outcomes. Expose English schemas/descriptions and scrub internal exceptions to stable error codes.

The MCP session will own bounded in-memory records and an Effect scope. Work executes in a separate
Node process using the shared core dispatcher, with requests on stdin and results on stdout. Workers
handle SIGINT/SIGTERM with the existing Effect cancellation behavior. Cancellation uses scoped process
interruption with SIGINT and a bounded 30-second cleanup grace period; after that, the process adapter
may force termination and report cancellation with potentially incomplete artifacts, never success.
Server shutdown/EOF will close the job scope and await process cleanup. No HTTP port or daemon is added.

Resolve `FILE_FORGE_ROOT` at startup and validate input/output real paths (or nearest existing ancestor)
before submission and again inside the worker. This prevents ordinary traversal and symlink escapes;
it is not protection against a hostile concurrent filesystem writer. Manifest export may copy metadata
for other paths but must not open assets referenced by a supplied manifest. Existing core source-preservation
and output-publication behavior remains authoritative.

The plugin lives under `packages/file-forge-plugin` and has no runtime workspace dependency. Portable
`plugin.json` and `mcp.json` plus `.codex-plugin/plugin.json` and `.mcp.json` compatibility files follow
[official package guidance](https://developers.openai.com/plugins/build/plugins), consulted 2026-10-10.
A POSIX bootstrap uses `FILE_FORGE_EXECUTABLE` or PATH, verifies `file-forge 0.0.0`, requires a workspace
root, and execs `file-forge mcp`. The product skill documents tool inputs, session jobs, CLI fallback only
before an operation is accepted, prerequisites, unsupported features, and no blind retry after uncertainty.
Provide a private local archive, with no publication, global installation, account upload, or release.

## Verification

Real non-UI subprocess E2E will initialize MCP, list tools, execute all four operations on real PNG files,
compare CLI semantics, decode output media, test invalid schemas, scope escapes, idempotency/conflicts,
status/cancellation responsiveness, missing prerequisites, and cleanup on EOF/signal. Launch through the
actual plugin bootstrap with an explicit runtime location, validate both manifest formats, and inspect
the private archive. Run `pnpm check` and `pnpm test:e2e`. Record the manual Codex installation/selection
gate separately and update both READMEs and first-draft implementation tracking.

## Verification record — 2026-10-10

- `pnpm check` passed: lint, formatting, strict TypeScript checks, and builds for all four runtime packages.
- `pnpm test:e2e` passed: six files and nine real non-UI flows. After final cancellation-acceptance hardening,
  the two MCP flows passed again against the final runtime.
- MCP tests launch through the portable and compatibility startup configurations, initialize and discover
  seven tools, run all four business operations, decode PNG/SVG and inspect ICO, compare real image output
  bytes with CLI, reject invalid/scope-escaping requests, verify ID reuse/conflicts and busy rejection.
- Cancellation is exercised after a real AVIF output is published: status remains responsive, the cancelled
  manifest retains completed assets, and the worker exits. Active-worker EOF and SIGTERM shutdown also
  verify PID disappearance. Missing runtime/root/FFmpeg fail without non-protocol stdout. Reconnection
  loses session records as documented.
- Manifest identities, versions, presentation, skill frontmatter, and both actual launch configurations are
  checked in the E2E flow. The private archive `dist/file-forge-plugin-0.0.0.zip` contains seven files,
  including hidden compatibility files, with valid JSON and ZIP integrity verified. No runtime, native
  dependency, secret, or machine-specific configuration is bundled in that plugin archive.
- Tests remove temporary fixtures. Servers use STDIO only; no listening port or browser resources were
  created. Test-owned server/worker processes exited.

Remaining gate: install/configure the plugin in the target Codex host, select its skill in a new chat, and
exercise the prompts in `packages/file-forge-plugin/SETUP.md`. The account/global configuration was not
changed. No public release, cross-platform acceptance, or in-app plugin verification is claimed.
