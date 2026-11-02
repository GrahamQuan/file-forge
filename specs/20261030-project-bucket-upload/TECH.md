# Project bucket upload technical design

Status: Implemented locally on 2026-10-30 (Asia/Singapore). Live R2/CDN acceptance and publishing remain separate gates. See [local validation](VALIDATION.md).

[PRODUCT.md](PRODUCT.md) is the authoritative behavior contract. The contract below now has a local implementation; verify installed runtime/plugin capabilities separately.

## Evidence and precedence

The table records the pre-implementation baseline used to design this feature, not the current capability inventory.

| Current source                                                                                                                       | Relevant evidence                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Current capabilities](../../docs/current-capabilities.md)                                                                           | Uploads are explicitly unimplemented; media manifests currently support versions 1–6.                                                                    |
| [Workspace configuration](../../pnpm-workspace.yaml) and [root package](../../package.json)                                          | Packages live under `packages/*`; Effect and platform-node are pinned to 4.0.2, TypeScript to ~7.0.2, with Turborepo orchestration.                      |
| [Core requests](../../packages/core/src/requests.ts)                                                                                 | `validateRequest` and `executeRequest` currently dispatch media, rename, and export operations; no upload request exists.                                |
| [CLI settings](../../packages/cli/src/settings.ts)                                                                                   | `settingsPath`, `readSettings`, and `saveLanguage` manage user language in a separate JSON file; `FILE_FORGE_CONFIG_DIR` overrides its parent directory. |
| [CLI main](../../packages/cli/src/main.ts) and [commands](../../packages/cli/src/commands.ts)                                        | Non-settings commands currently pass an FFmpeg prerequisite check; the command emitter assumes media manifest results.                                   |
| [MCP entry](../../packages/mcp/src/index.ts), [scope](../../packages/mcp/src/scope.ts), [worker](../../packages/mcp/src/worker.ts)   | Session-local jobs use child processes and workspace-scoped requests; startup currently requires FFmpeg and the worker loads media layers.               |
| [Archive builder](../../packages/cli/src/archive.ts) and [release stamping](../../packages/cli/src/release-version.ts)               | Runtime packaging uses production dependency deployment; release stamping explicitly enumerates workspace names.                                         |
| [Git exclusions](../../.gitignore)                                                                                                   | `.env` files are excluded, but a private upload JSON filename is not yet covered.                                                                        |
| [MCP E2E](../../e2e/mcp.test.js), [distribution E2E](../../e2e/distribution.test.js), [Vitest configuration](../../vitest.config.ts) | Tests launch actual processes and use `e2e/**/*.test.js`; no UI validation is permitted.                                                                 |

External local reference, read on 2026-10-30: `/Users/a6677/Documents/projects/ProductDesignSkills/.agents/skills/upload-r2-assets/`. Relevant files are `SKILL.md`, `references/team-projects.md`, `env/.env.r2.example`, `scripts/upload.mjs`, `scripts/check-assets.mjs`, and `spec/flaq-team/projects.json`. They establish explicit review, local configuration, prefix-plus-relative-path mapping, no-overwrite PUT, independent public HEAD, and uncertainty without automatic retry. Their team hierarchy, site-specific rules, plaintext env layout, ambient env overrides, and file-in-memory implementation are not requirements for FileForge. These local files are design evidence, not a runtime dependency or files to modify in this task.

This contract supersedes conflicting upload proposals in the [first-draft spec](../20261009-first-draft/TECH.md): nearest-repository discovery, nested profiles, credential-source references, and durable background jobs will not be implemented here. The user has explicitly chosen project-keyed secret-bearing JSON instead of the earlier conversational Keychain proposal. No `docs/system-design/index.md` exists in this checkout; no ADR or glossary files will be created for this spec.

## Package and dependency boundaries

Create `packages/upload`, named `@file-forge/upload`, as a private ESM workspace with source version `0.0.0`, strict TypeScript, `.js` imports, public package exports, and the existing `tsc` build/typecheck convention. It will own configuration validation, safe asset planning, upload plans/receipts, R2 signing/transport, verification, and typed errors.

CLI and MCP will depend directly on this package. Upload will not import core or media, and core will not acquire an upload dependency. This avoids pulling Sharp, FFmpeg, or the poster renderer into upload execution and avoids a circular dependency. Shared upload validation and business operations will live in upload, rather than separate CLI/MCP implementations. Media processing and uploading will remain explicit separate operations.

Proposed internal modules, with exact file splitting left to implementation:

| Module        | Responsibility                                                                                    |
| ------------- | ------------------------------------------------------------------------------------------------- |
| `config.ts`   | Strict project-map schema, private-file read protection, project selection, redacted credentials. |
| `requests.ts` | Validated operation requests and public result unions.                                            |
| `plan.ts`     | Selection, path checks, hashes, key/URL mapping, plan digest and serialization.                   |
| `r2.ts`       | SigV4 signing, conditional PUT, HEAD and bounded GET, no redirects or retries.                    |
| `execute.ts`  | Scoped staging, serial transfers, cancellation, receipt journaling and verification.              |
| `index.ts`    | Public schemas, types, services/layers, errors, and `executeUploadRequest`.                       |

Public side-effecting operations will return typed Effects. Use Effect services/layers, FileSystem, Path, Stream, scoped resources, and HTTP facilities. Installed Effect 4.0.2 exposes `effect/http/HttpClient`, `effect/http/FetchHttpClient`, and `effect/Redacted`; their declarations were inspected. Use `Redacted` internally for credential fields, while sanitizing outputs explicitly. Redaction alone is not permission to serialize configuration or raw HTTP errors.

Reuse the reference script's documented SigV4 algorithm as evidence, ported into an isolated adapter with Node crypto behind Effect boundaries. No new AWS SDK or dependency is selected by this design. Validate canonical encoding and actual service behavior before release. The HTTP adapter must explicitly disable fetch redirects and write retries; default fetch behavior must not determine upload policy. Execute Effects only at CLI/MCP process boundaries.

## Private configuration contract (P01–P05)

### Shape and example

The proposed filename is `file-forge.upload.local.json`. Its top-level object is exactly a map of project keys to flat configuration objects. No top-level `projects`, `team`, `profiles`, `$schema`, or `schemaVersion` wrapper is permitted. Each value carries `CONFIG_VERSION: 1` to version the persisted format without changing that outer shape.

Documentation-only example; these credentials are placeholders and must not be accepted as ready-to-upload values:

```json
{
  "example.com": {
    "CONFIG_VERSION": 1,
    "R2_ENDPOINT": "https://<ACCOUNT_ID>.r2.cloudflarestorage.com",
    "R2_BUCKET": "example-assets",
    "R2_REGION": "auto",
    "R2_PUBLIC_BASE_URL": "https://example.com",
    "FILE_PATH": "",
    "R2_ACCESS_KEY_ID": "<ENTER_LOCALLY>",
    "R2_SECRET_ACCESS_KEY": "<ENTER_LOCALLY>"
  },
  "example2.com": {
    "CONFIG_VERSION": 1,
    "R2_ENDPOINT": "https://<ACCOUNT_ID>.r2.cloudflarestorage.com",
    "R2_BUCKET": "example2-assets",
    "R2_REGION": "auto",
    "R2_PUBLIC_BASE_URL": "https://example2.com",
    "FILE_PATH": "",
    "R2_ACCESS_KEY_ID": "<ENTER_LOCALLY>",
    "R2_SECRET_ACCESS_KEY": "<ENTER_LOCALLY>"
  }
}
```

All eight fields are required. `CONFIG_VERSION` is the integer literal `1`; the other values are strings. Temporary session-token credentials are deferred; no extra field is silently ignored. The pure JSON syntax supports neither comments nor interpolation. `{}` means no configured projects, not a default destination. An empty project value is incomplete.

| Field                  | Validation and meaning                                                                                                                                                                                                                                                        |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Project key            | Exact, case-sensitive identifier, 1–128 ASCII characters; lowercase letters/digits separated by `.`, `_`, or `-`, with alphanumeric ends. Reject reserved prototype property names. Domain-shaped keys are supported but do not imply DNS ownership or select the public URL. |
| `CONFIG_VERSION`       | Exactly `1`; fail closed for unsupported versions.                                                                                                                                                                                                                            |
| `R2_ENDPOINT`          | HTTPS R2 S3 API root; no credentials, explicit port, query, fragment, bucket path, or custom proxy. Validate actual account endpoint forms, including documented jurisdiction-specific hosts.                                                                                 |
| `R2_BUCKET`            | Explicit valid R2 bucket name; never derived from the project.                                                                                                                                                                                                                |
| `R2_REGION`            | Exactly `auto` for this R2-only version.                                                                                                                                                                                                                                      |
| `R2_PUBLIC_BASE_URL`   | HTTPS public origin with no credentials, explicit port, query, fragment, or path beyond `/`. Strip only an optional terminal `/` for mapping. No path-rewrite configuration.                                                                                                  |
| `FILE_PATH`            | Required, explicitly empty or a relative slash-separated prefix ending in `/`. Reject absolute paths, backslashes, control characters, empty internal segments, `.` and `..`. No relation to the project key is required.                                                     |
| `R2_ACCESS_KEY_ID`     | Nonempty credential string, no whitespace/control characters or documentation placeholders; never returned, even partially.                                                                                                                                                   |
| `R2_SECRET_ACCESS_KEY` | Nonempty secret string under the same constraints; do not trim or normalize credentials.                                                                                                                                                                                      |

Reject duplicate object keys at any level before ordinary JSON decoding can silently discard them. Reject unknown fields and invalid known-field values with sanitized field-level errors. Validate the complete file against its structure; a bad unrelated entry can block use, with a safe project identifier/field diagnostic. Do not echo unknown field names or values that might themselves contain secrets. Limit the file to 1 MiB and 100 projects as explicit initial implementation bounds.

A single file contains every configured project's credentials, so runtime parsing necessarily reads them. Retain only the selected validated entry after parsing; keep no process-global configuration or credential cache. This is not process isolation between projects.

### Location, selection, and read-only ownership

Default macOS path: `~/Library/Application Support/file-forge/file-forge.upload.local.json`, alongside but separate from language `config.json`. Respect the existing `FILE_FORGE_CONFIG_DIR` parent-directory convention without moving upload secrets into the language settings document.

CLI path precedence: explicit upload-only `--config`, then startup `FILE_FORGE_UPLOAD_CONFIG`, then the config-directory default. These values select a file path only. There will be no current-directory search, upward repository search, application `.env` import, R2/AWS environment-field overrides, or cross-file merging.

MCP will resolve one absolute private configuration path at server startup from `FILE_FORGE_UPLOAD_CONFIG` or the same default. Individual tools cannot supply a config path, endpoint, bucket, credentials, or field overrides. The worker receives the pinned path through trusted process setup, never through the public request payload. Local credential contents are loaded only inside the upload operation.

The host-configured credential file is a narrowly defined read-only exception to MCP's asset workspace boundary. Assets, plans, receipts, and scratch output must still be inside `FILE_FORGE_ROOT`. A tool cannot use this exception for arbitrary external-file reads. Restricting which projects a local operator may access is not a new ACL service: the configured file's entries are the operator's available projects.

On supported macOS systems, require a regular, non-symlink credential file owned by the effective user, with no group/other permissions and no additional ACL grants. Read-only owner access is sufficient; recommend mode `0600` for user editing. Resolve the configured parent once; reject unsafe aliases and do not follow a final-file symlink. Protect against path replacement while reading with descriptor identity checks. Fail with repair instructions rather than chmod/chown or file rewrites. Recommend a private `0700` parent directory; reject a parent writable by other users. Isolate any necessary native filesystem inspection behind an Effect adapter.

If the file is in a Git worktree, verify that it is ignored and not already tracked before consuming credentials. Report an unchecked protection state and stop if this cannot be established; the preferred external location avoids this requirement. Git ignore does not remove an already tracked secret. No runtime path writes, creates backup copies of, or migrates this JSON.

Implementation must add exact default-filename ignore rules and explicit exclusions in delivery/packaging paths. An alternate filename remains the user's responsibility to ignore, with the same runtime check. Agents must not open the real file to diagnose errors. The packaged and canonical skills will direct them to the sanitized check operation instead. There is no `config set`, `config export`, or raw-config MCP tool for uploads.

Reject configuration locations inside managed installation/rollback trees, packaged or reusable skill directories, and generated delivery directories. These trees may be replaced by existing installation or skill-copy workflows; they cannot satisfy private-file preservation. A user-selected repository-local file outside those trees is supported only with the protection checks above.

## Project, bucket, and domain relationships

Each project maps to one explicit tuple `(endpoint, bucket, FILE_PATH, publicBaseUrl)` plus its own locally supplied credential fields. Several entries may contain equal values, but there is no inheritance, shared credential registry, or team object. Shared credentials are repeated only when the user deliberately provides them; the runtime never copies them between projects.

The project key can be `heydream.im` while its public base is `https://cdn.heydream.im` and its prefix is `heydream/`. Separate projects may share a bucket with disjoint prefixes. Mapping two domain names to the same bucket does not isolate identical keys or automatically hide prefixes. The user provisions public routing outside FileForge. [R2 public bucket documentation](https://developers.cloudflare.com/r2/buckets/public-buckets/) describes bucket/domain attachment; this configuration only records that existing relationship.

Use bucket-scoped object credentials where possible. R2 supports bucket-scoped object read/write permissions; shared broad credentials remain broad regardless of local prefixes. No management token is needed. See [R2 authentication](https://developers.cloudflare.com/r2/api/tokens/).

## Planning and immutable execution inputs (P04, P06–P08)

Proposed CLI surface:

| Command                                                                                                                                            | Purpose                                                                                    |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `file-forge upload config check --project <key> [--config <path>]`                                                                                 | Offline validation; return sanitized readiness only.                                       |
| `file-forge upload plan --project <key> --input <file-or-directory> --output <parent> [--recursive] [--overwrite-key <key> ...] [--config <path>]` | Produce an offline plan and complete review table. Directory input requires `--recursive`. |
| `file-forge upload apply --project <key> --plan <plan.json> --plan-hash <sha256> [--config <path>]`                                                | Execute the exact authorized plan; no implicit planning or overwrite flags.                |
| `file-forge upload verify --project <key> --receipt <receipt.json> [--config <path>]`                                                              | Explicit remote read-only reconciliation; no PUT or automatic retry.                       |

The standard `--json` and `--language` presentation flags apply. `upload` without a subcommand shows help and never uploads. Require an explicit output parent for planning; create an exclusively named `file-forge-upload-<id>` directory outside the source tree. Apply writes its receipt beside the selected plan; verify creates an additional observation artifact there. CLI config paths are an operator interface, not a capability offered by MCP.

MCP proposals are `check_upload_config`, `plan_upload`, `upload_files`, and `verify_upload`. Each takes `project` plus the corresponding non-secret inputs above in camelCase; submitted operations retain the existing required `requestId` and job status/cancellation convention. No request schema contains `team`, credential values, raw config, or arbitrary HTTP options. `upload_files` requires `plan` and `planHash`. The hash is integrity binding, not authentication or evidence of human consent.

Selection and mapping will work as follows:

1. Validate request and selected config locally. Determine the source root explicitly; do not infer it from batch naming or business repository layout.
2. For a single file, map its basename. For an explicitly recursive directory, map paths relative to that directory. Preserve case and filenames; do not apply folder compression normalization.
3. V1 supported upload extensions will be PNG, JPEG, WebP, GIF, SVG, AVIF, ICO, MP4, WebM, MOV, MP3, WAV, OGG, FLAC, M4A, AAC, and GLB, with one shared typed MIME table. Uploading does not assert that an extension proves valid encoded content. Users/skills review authenticity and purpose upstream.
4. Exclude conventional `.env*`, private upload configuration, hidden files, `prompts/`, project LOG files, and non-media reports/control files from recursive selection, listing each exclusion. Explicit selection of a forbidden or unsupported file fails. Reject symlinks, special files, and hard-linked aliases to protected configuration; never traverse them. Recognize selected secret configuration by identity as well as filename. This does not claim to detect arbitrary secrets disguised as media.
5. Reject empty selections, duplicate keys, traversal segments, control characters, unsafe source/output overlap, or keys exceeding 1,024 UTF-8 bytes. Object key length follows [R2 limits](https://developers.cloudflare.com/r2/platform/limits/). Encode each key segment once for URLs/signing; literal `%` is data, not already-encoded path syntax. Do not use URL resolution that could normalize `..` or turn a filename into a query/fragment.
6. Hash selected files with streamed SHA-256 and record bytes and MIME. Proposed initial bounds: 1,000 selected files, 512 MiB per file, 10 GiB total selected bytes. These are FileForge resource limits, not R2 maxima. Oversize input fails before PUT; no multipart fallback.
7. Include exact replacement keys only when explicitly requested; they must be keys present in this plan. Show replacement intent for each entry. All others are create-only.
8. Persist the sanitized plan with a canonical SHA-256 over its complete reviewable contents, excluding its own hash field. Include project, schema/kind, plan ID, source identity, per-file digest/size/MIME, replacement intent, canonical non-secret destination snapshot, and generated URLs. Do not include credentials, a config-file body/hash, signed URLs, or authorization evidence invented by the agent.

Plan files are untrusted on reload. Apply validates schema and rejects extra fields, recomputes the digest, checks the caller's reviewed hash, and recomputes all keys/URLs. Destination changes require a new plan. Credentials may rotate without invalidating destination/content approval; apply loads a fresh selected entry once and freezes it for that execution. The planned endpoint is never used to override current private configuration.

Preflight all source paths and hashes before starting writes. Immediately before each PUT, copy that file into task-owned private staging, hash the copy, and compare it to the approved digest. Stream that exact snapshot to the provider. A mismatch stops further dispatch; previous successes remain. Scope staging so at most one file snapshot is present, with cleanup on all exits. No long-lived secret copy or source mutation is permitted.

## Transfer, verification, and receipts (P08–P10)

Transfer files serially. Use SHA-256 payload signing and an explicit content length/type. Recommended first-version request deadlines are 120 seconds for PUT/GET and 15 seconds for HEAD, with no application or transport write retry. Do not send bucket-creation headers or provider management requests. Reject redirects rather than re-signing or forwarding credentials elsewhere.

Create-only PUT signs `If-None-Match: *`. A replacement-approved entry first performs signed HEAD against the configured bucket/key. If present, PUT signs `If-Match` with the observed opaque ETag; if absent, use create-only PUT. Denied/uncertain HEAD prevents the write. Conditional conflict stops dispatch; there is no fallback to unconditional PUT. This protects the HEAD-to-PUT interval, not historical versions before that observation. R2 documents atomic conditional PUT semantics in its [S3 extensions](https://developers.cloudflare.com/r2/api/s3/extensions/).

After a confirmed PUT, perform a separate unsigned HEAD to the public URL with redirects disabled. Never attach S3 authorization, cookies, or credentials to that request. Record availability, response status, and observation time separately from upload status. Do not claim byte equality, cache freshness, or successful DNS provisioning from a HEAD response.

`verify` will resolve the receipt's project against current configuration and require the same destination. Use signed HEAD and, for an existing candidate object, conditional GET against its observed ETag, streaming and bounding bytes by the planned size before computing SHA-256. Record `matches`, `differs`, `absent_observed`, or `unknown`, with observation time. A changed object during verification is unknown and requires a fresh observation. ETag is never treated as a content hash. Negative reads do not resolve an in-flight uncertain write. Verification preserves the original execution history and never retries PUT.

Before the first write, exclusively claim execution for that plan and persist an initial receipt. Each item is journaled as `sending` before dispatch and then updated atomically after its outcome. Fsync the journal boundary needed to retain an attempted-write record. A process crash with a surviving `sending` entry means unknown remote outcome. If journaling fails, stop dispatch; if it fails after a request, report `RECEIPT_WRITE_FAILED` with remote uncertainty instead of assuming no upload happened.

An exclusive execution marker prevents concurrent or repeated apply of the same plan. Keep it as execution history after completion; do not automatically remove a stale marker or replay after restart. Recovery creates a new plan after verification and user review. This prevents same-plan replay without claiming distributed exactly-once delivery across different plans or devices. Provider conditional writes remain authoritative across processes.

Use separate versioned artifacts, not a new variant of the existing media manifest:

| Artifact    | Required fields                                                                                                                                                                                             |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Plan        | `kind: "file-forge.upload-plan"`, `schemaVersion: 1`, `id`, `project`, `createdAt`, `destination`, `entries`, `excluded`, `planHash`.                                                                       |
| Receipt     | `kind: "file-forge.upload-receipt"`, `schemaVersion: 1`, `planId`, `planHash`, `project`, `destination`, timestamps, overall `status`, per-entry source digest/key/URL, transfer and public-check outcomes. |
| Observation | `kind: "file-forge.upload-observation"`, `schemaVersion: 1`, receipt/plan identity, project, per-entry verification result and timestamp.                                                                   |

Transfer outcomes are `not_sent`, `sending`, `uploaded`, `conflict`, `failed`, or `unknown`. Public checks are `not_attempted`, `reachable`, `unreachable`, or `unknown`. Overall execution status is `succeeded`, `partial`, `failed`, or `cancelled`; it never replaces per-entry outcomes. Complete confirmed uploads with failed public checks yield `partial`. Cancellation has overall `cancelled` even if some items uploaded. Any non-cancelled failure with completed or uncertain writes yields `partial`; a definite failure with no possible writes yields `failed`. A fully confirmed batch with reachable public URLs yields `succeeded`.

Only a successful provider response confirms `uploaded`; a documented conditional rejection yields `conflict`. Use `failed` only when there is evidence the write was not accepted, such as local rejection before dispatch or a definitive authorization rejection. A timeout, broken response, ambiguous server error, or cancellation after dispatch yields `unknown`; an HTTP error alone must not be assumed to prove absence of side effects.

On the first transfer conflict, definite failure, or unknown outcome, stop further transfers and retain unsent entries. A public HEAD failure does not stop the remaining approved uploads. Cancellation stops dispatch, interrupts active requests, marks a possibly dispatched PUT unknown, and preserves completed objects. No automatic deletion, rollback, or resumed sending occurs.

Expected error codes include `UPLOAD_CONFIG_MISSING`, `UPLOAD_CONFIG_INVALID`, `UPLOAD_CONFIG_UNSAFE`, `UPLOAD_PROJECT_UNKNOWN`, `UPLOAD_PLAN_INVALID`, `UPLOAD_PLAN_STALE`, `UPLOAD_INPUT_CHANGED`, `UPLOAD_LIMIT_EXCEEDED`, `UPLOAD_ALREADY_STARTED`, `UPLOAD_CONFLICT`, `UPLOAD_OUTCOME_UNKNOWN`, and `RECEIPT_WRITE_FAILED`. Errors expose only allowlisted context. Provider bodies, raw schema input/cause trees, request headers, credentials, and stack traces containing request objects must not cross CLI/MCP/log boundaries.

CLI uses exit 0 for successful checks/plans/verified matches and successful execution, 1 for partial/failed/uncertain/conflicting operation results, 2 for invalid invocation/configuration/preflight, and 130 for cancellation. Machine results retain detailed outcomes independently of exit status.

## CLI, MCP, and packaging integration

- Add an upload command module and an upload-specific typed result emitter to CLI. Route upload before media prerequisite/loading paths in `main.ts`. Preserve help/version/language behavior. All display messages remain in [messages.ts](../../packages/cli/src/messages.ts), with English and Simplified Chinese parity.
- Extend MCP's tool registry and job dispatcher with an explicit operation family. Keep upload request validation in `@file-forge/upload`; do not add media imports to it. Workspace checking must cover input, plan, receipt, output, and every file reconstructed from a persisted plan, both before submission and inside the worker.
- Add an upload worker entry that provides only upload and Node/HTTP layers. Reuse session job accounting, `requestId` conflict handling, one active job, cancellation, and scoped process ownership. Do not send raw credentials in worker stdin, arguments, stderr, or job fingerprints.
- Move the existing unconditional MCP FFmpeg prerequisite to media submission. Upload-only use must work without FFmpeg/Chrome. Preserve early `FFMPEG_REQUIRED` for media operations and update capability/help reporting and existing prerequisite E2E expectations accordingly. CLI and MCP media behavior otherwise stays unchanged.
- Adapt job result handling so partial/failed upload receipts are retained instead of dropped because a worker used a nonzero outcome code. Cancellation must retain the known receipt path even if the worker cannot send its final result. Persist the plan/receipt location in the parent job snapshot before launch; after forced worker exit expose that location without inferring success or absence.
- Add production workspace dependencies to CLI/MCP, update the lockfile only during implementation, and include upload in the explicit release-version stamping list. Verify `pnpm deploy` carries the new package and needed runtime modules into the offline archive.
- Keep private config outside installed runtime/rollback trees. Package only explicitly enumerated code, schemas, examples, and documentation. Never copy arbitrary JSON from user configuration or the external reference skill. Existing source version stamping and remote release verification rules continue to apply.

## Migration and documentation

No automatic migration will read or rewrite the old skill's env files. Document a user-performed field-for-field transfer into the selected project object, add `CONFIG_VERSION: 1`, preserve the existing endpoint/bucket/CDN/prefix, and choose the new project key explicitly. Former local team names do not enter the key or remote path automatically. A duplicate project name across former teams must receive distinct user-chosen flat identifiers; never overwrite an existing entry.

Existing batches can remain under the centralized skill directories; users select the actual batch directory as upload input. This removes its outer team/project/version directories from relative mapping naturally, without relocating data. Do not enforce the reference script's nonempty prefix or last-segment site-name checks on new FileForge configurations. Existing nonempty prefixes and remote URLs remain unchanged unless the user intentionally edits them.

During implementation, review and update [docs index](../../docs/README.md), [capability inventory](../../docs/current-capabilities.md), [usage](../../docs/usage.md), [installation](../../docs/installation.md), both root READMEs, both archive READMEs, [plugin setup](../../packages/file-forge-plugin/SETUP.md), [canonical skill](../../skills/file-forge/SKILL.md), and [packaged skill](../../packages/file-forge-plugin/skills/file-forge/SKILL.md). Add a focused upload configuration/operation reference and safe placeholder example/schema at implementation time. Include read-only private-file handling, explicit project selection, review/approval, exclusions, failures, reconciliation, cleanup, and no automatic code-link updates.

Keep custom Sharp/FFmpeg references consistent if their delivery guidance discusses uploading; do not change unrelated behavior. Update consumer skills only through the established explicit copy workflow. Do not rewrite historical specs or logs as evidence of implementation. If system-design documentation is introduced before implementation, update the relevant configuration/security/package-boundary document then. No system-design file is introduced solely for this feature spec.

## Validation and acceptance evidence

Only real non-UI E2E tests are allowed. Use real CLI and STDIO MCP processes, temporary filesystem fixtures, and a task-owned local HTTP service that independently validates signatures and persists object bytes for protocol tests. No mocked upload-method tests may be relabeled E2E. A test-only dependency-composition harness may route the production transport to loopback with dummy credentials; it must not add a public CLI/MCP endpoint-validation bypass or ship in runtime artifacts. Local protocol results do not establish Cloudflare compatibility.

| Coverage                         | Observable evidence                                                                                                                                                                                                                                         |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P01–P04: project map and privacy | Two projects and same-name assets reach only their selected targets; shared-prefix behavior is explicit; malformed/duplicate/unknown fields, unsafe permissions, tracked files, reserved keys and env overrides fail without secret output or file changes. |
| P02/P05: lifecycle               | Record private-config byte hashes before/after CLI, MCP, language writes, packaging, installation/rollback and skill copy. Config remains unchanged and absent from uploads and archives. Only dummy credentials are used.                                  |
| P04/P06: selection               | Exercise empty/nonempty prefixes, literal percent/Unicode paths, traversal, symlink/hardlink aliases, duplicate destinations, non-media exclusions, size limits, and source/output overlap using real files.                                                |
| P07: approval binding            | Changed file contents, altered plan, wrong digest/project and changed destination produce no unauthorized PUT. Credential rotation against an unchanged destination succeeds.                                                                               |
| P08: concurrency                 | Concurrent create requests to a persisted object store have at most one success. Replacement has a signed condition; an intervening update causes conflict. Reapplying the same plan is rejected.                                                           |
| P09: remote outcomes             | Store bytes then drop the PUT response, return CDN failure after PUT success, change content before verification, and return denied/missing observations. Inspect independent server request counts to prove no hidden retry.                               |
| P10: cancellation/recovery       | Cancel during hashing/staging/PUT/GET; send MCP EOF and terminate workers. Receipts retain sent/unknown/unsent distinctions, existing objects remain, status/cancel stays responsive, and staging/processes/ports are cleaned.                              |
| Integration                      | Packaged upload works without FFmpeg/Chrome; media requests still report their prerequisites; existing manifest readers remain compatible; release stamping includes upload; both languages and JSON output remain coherent.                                |

Implementation checks are `pnpm check` and `pnpm test:e2e`, as defined in the root package. Add upload coverage under `e2e/**/*.test.js` and update affected existing E2E flows. Do not add unit, component, screenshot, browser, or UI tests. Track every test-owned server/process and verify process exit and port release.

Before claiming live support, separately obtain authorization for specific disposable R2 assets, keys, and any cleanup. Validate actual SigV4, conditional create/replacement, byte integrity, and custom-domain results against that approved target; never use a production credential file as a test fixture. If remote validation is not authorized, report local evidence and the remaining remote validation gap rather than uploading a test object. Cleanup of remote objects is not implied by upload permission.

## Delivery stages and completion

1. Implement strict private configuration and the independent package, offline planning, redacted diagnostics, and CLI/MCP surface contracts.
2. Implement scoped transport, execution claim/journal, conditional writes, public checks, read-only reconciliation, and cancellation through real workers.
3. Complete E2E coverage, prerequisite integration, packaging/version stamping, and synchronized guides/skills.
4. Report separately authorized remote acceptance evidence and the published runtime/plugin versions only after release verification. Local development does not authorize pushing or publishing.

Rollback of the runtime will not rewrite private configuration, remove receipts, or reverse uploads. Unsupported config/artifact versions fail with instructions; old readers are not expected to interpret the new upload artifacts. Earlier media manifest compatibility remains unchanged.

The implementation is complete only when product behaviors, shared CLI/MCP validation, config immutability, no secret disclosure, approval binding, truthful partial/unknown outcomes, resource cleanup, and distribution/documentation checks are demonstrated. Initial resource limits and R2-only support are explicit proposed defaults; no unresolved credential-storage or team-hierarchy decision is left for implementation.
