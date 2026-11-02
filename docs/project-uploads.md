# Project bucket uploads

This source checkout provides explicit Cloudflare R2 uploads through CLI and MCP. Check installed help and schemas before using them. Local protocol E2E evidence does not establish live R2 or custom-domain compatibility; remote acceptance and release verification remain separate gates.

Uploads preserve source bytes and do not process images, compress assets, edit website links, provision buckets/DNS, delete objects, retry writes, or roll back completed uploads. Complete cover/poster processing upstream. Upload requires Node.js, but not FFmpeg or Chrome. Media operations still require their existing prerequisites.

## Private configuration

The user maintains a private `file-forge.upload.local.json` file, preferably outside repositories, skills, managed installations and generated deliveries. Default macOS location: `~/Library/Application Support/file-forge/file-forge.upload.local.json`. `FILE_FORGE_CONFIG_DIR` changes the default parent. CLI precedence is upload `--config`, then `FILE_FORGE_UPLOAD_CONFIG`, then default. MCP pins `FILE_FORGE_UPLOAD_CONFIG` (or default) at startup; tools cannot supply configuration paths or credentials.

Use the [placeholder example](../packages/upload/schema/example.json) and [JSON schema](../packages/upload/schema/config.schema.json). All eight fields are required. These placeholders deliberately fail readiness validation. The outer object is a flat project map; no teams, profiles or environment hierarchy. Project keys are exact lowercase ASCII identifiers, not inferred bucket or domain names.

The user enters credentials privately. Agents must never open, edit, copy, export, or ask the user to paste this real file. Use sanitized config-check results. The runtime reads it without rewriting, migrating or backing it up. Plaintext storage is not encryption or isolation from other processes owned by the same user.

On macOS the file must be regular, owned by the effective user, without symlinks, group/other permissions or additional ACL grants. Recommend mode `0600` and a private `0700` parent. The parent must not be writable by other users. A repository-local file must be ignored and untracked; checking this requires Git. An alternate filename requires the user's own ignore rule. Default-named private files are excluded from folder deliveries and rejected from distribution payloads. Language settings remain a separate `config.json`; that name cannot hold upload credentials.

Configuration has a 1 MiB/100-project limit. Unknown fields, duplicate keys, unsupported versions, invalid endpoint forms and placeholder credentials fail closed. No AWS/R2 environment overrides, profiles, `.env` interpolation or default project selection apply. Each operation reads one snapshot. Credential-only rotation is allowed after planning; destination changes require a new plan.

`R2_ENDPOINT` is an HTTPS account API root, including the documented `eu`, `fedramp` and `us` [jurisdiction hosts](https://developers.cloudflare.com/r2/reference/data-location/). `R2_REGION` is `auto`; the bucket is explicit. The public base is an HTTPS origin without a path, credentials, port, query or fragment. `FILE_PATH` is explicitly empty for bucket root or a safe relative prefix ending in `/`.

Keys are exactly prefix plus the selected file's relative path (basename for a single file). URLs are public origin plus the encoded key. Names, case, extensions and literal percent characters are preserved. FileForge adds no project, batch or timestamp prefix. Shared buckets share identical keys even when domains differ; use deliberate prefixes to separate them. Configure direct public root-plus-key routing outside FileForge.

## CLI workflow

```sh
file-forge upload config check --project example.com --json
file-forge upload plan --project example.com --input /absolute/assets --output /absolute/reviews --recursive --json
file-forge upload apply --project example.com --plan /absolute/reviews/file-forge-upload-ID/plan.json --plan-hash REVIEWED_SHA256 --json
file-forge upload verify --project example.com --receipt /absolute/reviews/file-forge-upload-ID/receipt.json --json
```

Checks and planning are offline. A configuration check reports structure/protection readiness, not connectivity or write permission. User repairs happen locally, followed by a new check. No test-object upload occurs.

Directory selection requires `--recursive`; output must already exist outside the source tree. Planning lists selected assets and exclusions and writes a new exclusive review directory. Supported extensions: PNG/JPEG/WebP/GIF/SVG/AVIF/ICO, MP4/WebM/MOV, MP3/WAV/OGG/FLAC/M4A/AAC and GLB. Extension/MIME mapping does not prove encoded content validity. Hidden files, prompts, project logs, manifests/reports/control files and private configuration are excluded or rejected. Symlinks, special files and hard-linked configuration aliases fail. Limits: 1,000 assets, 512 MiB each, 10 GiB total, 1,024-byte keys.

Review every source, relative path, size, SHA-256, MIME, bucket, key, URL and create/replace intent. Obtain explicit upload authorization for those contents and mappings. `planHash` binds plan integrity; it is not evidence of human approval. Local organization, upload, object replacement and website-link edits are separate permissions. Reuse unchanged explicit authorization; changed bytes or mappings need a fresh plan/review.

Create-only is the default. To review replacements, add one `--overwrite-key EXACT_KEY` per selected key while planning. There is no apply-time/global overwrite switch. Replacement observes the current ETag and writes with an atomic condition; concurrent changes produce a conflict, never an unconditional fallback. This does not preserve historical versions.

## Outcomes and recovery

Transfers run serially from private hashed staging. All sources are preflighted, and each staged snapshot must match the reviewed hash before dispatch. Plans, receipts and observations are separate version-1 upload artifacts; media manifests v1–v6 remain unchanged. They contain sanitized destination metadata, never credentials or signed requests.

Apply claims a plan exclusively and journals `sending` before dispatch. Keep the plan, `.execution` marker and receipt in their original review directory. The hashed plan binds that directory; copying or moving a plan does not create a new executable review. A second apply is rejected, including after interruption. Transfer outcomes are `not_sent`, `sending`, `uploaded`, `conflict`, `failed` or `unknown`. A surviving `sending` means uncertainty, not absence. Receipts persist completed outcomes and unsent entries; batches are not transactions.

CLI `upload apply` reports per-file and byte-weighted overall percentages on stderr, including with `--json`; stdout remains the final JSON result. Percentages measure bytes supplied to the HTTP transport, not bytes acknowledged or committed by R2. At 100%, the CLI waits for R2 confirmation; only a successful R2 response marks the file uploaded. Public URL checks are displayed separately and can leave the overall result partial even when every upload was confirmed. Empty files advance without division by zero; an entirely empty-byte batch uses file counts for overall progress. Progress is transient, not persisted in receipts or exposed by MCP.

Public HEAD checks are independent of confirmed upload status. Reachability proves neither content equality nor CDN freshness. Failed public checks do not repeat PUTs and yield a partial result. Transfer conflict, definite failure or uncertainty stops further transfers. Cancellation aborts active work, preserves completed objects and may mark the active write unknown.

Verify performs signed HEAD and conditional bounded GET, comparing bytes with the reviewed SHA-256. It records `matches`, `differs`, `absent_observed` or `unknown` in a separate observation without changing execution history. An absent observation cannot prove an earlier in-flight write failed. Never replay a completed/uncertain plan or delete its marker as recovery. Inspect evidence, then create and authorize a new plan for any remaining work.

`RECEIPT_WRITE_FAILED` means journaling failed; remote effects may exist. Stop and preserve all artifacts. Do not infer absence from a nonzero exit. CLI exit codes: 0 successful check/plan/execution or matching verification; 1 partial/failed remote results; 2 invalid request/configuration/preflight; 130 cancellation.

## MCP and agent workflow

Tools: `check_upload_config` (`upload-check`), `plan_upload` (`upload-plan`), `upload_files` (`upload-apply`) and `verify_upload` (`upload-verify`). Supply the corresponding `operation`, explicit `project`, required `requestId`, and camelCase arguments (`input`, `output`, `recursive`, `overwriteKeys`, `plan`, `planHash`, `receipt`). Poll `job_status`; use `job_cancel` when needed. Assets, plans, receipts and staging stay within `FILE_FORGE_ROOT`; only the pinned private config has a narrow read-only exception.

One active job and session-local accounting remain. Status/cancellation stay responsive in separate upload workers. The parent retains the expected receipt path before an apply worker launches, including after forced exit. An expected path may not yet exist and is not proof of a write. Unknown jobs after reconnect do not imply no uploads: use the persisted artifacts. Task-owned staging and HTTP/process resources are cleaned on scoped exits; after an uncatchable standalone CLI kill, inspect retained staging locally before removing only known temporary snapshots.

Before live acceptance testing, obtain explicit authorization for specific disposable assets/keys. Remote deletion requires separate authorization. Do not use production credentials as test fixtures. No release or external repository edits are implicit.

## Migration

The user manually transfers endpoint, bucket, public base and prefix from an old skill configuration, adds `CONFIG_VERSION: 1`, and chooses a flat project key. Never automatically read/migrate `.local` or env files. Duplicate names across old teams require distinct user-chosen keys. Old team names do not enter remote paths. Select an existing batch directory directly; its outer hierarchy is naturally omitted from relative paths. Existing remote prefixes/URLs remain unchanged unless explicitly edited by the user.

CLI `upload apply` supports `--progress auto|table|lines`. The default `auto` uses a live table in terminals at least 79 columns wide and 10 rows tall; pipes, narrow terminals and `TERM=dumb` use lines. The table separates sent percentage, R2 confirmation and public URL results, with byte-weighted overall progress. Live tables show up to eight recent files; the final table includes all receipt entries. Object keys are escaped and clipped for safe display; full keys remain in the JSON result and receipt. Explicit `table` in redirected or small-terminal output prints plain snapshots without cursor controls. All progress stays on stderr, including with `--json`.

For bucket uploads, check the private project JSON first with `upload config check --project KEY`. Missing or incomplete configuration stops upload work; the CLI asks for local setup on stderr and exits without waiting for credential input.

## Inspect current folders

Run `file-forge upload folders --project KEY` for a folder tree or add `--json` for the bucket, effective prefix and sorted full folder prefixes. The root is the project's `FILE_PATH`. An empty configured prefix selects the bucket root. Add `--prefix images/2026` to inspect a relative subfolder. The MCP tool is `list_bucket_folders` with operation `upload-folders`.

This command validates the private configuration first, then makes signed ListObjectsV2 requests with the configured prefix. It derives folders from object names and trailing-slash marker objects across pages. It reads listing metadata only. A concurrent bucket change may affect subsequent pages. After 100 pages or 10,000 distinct folders it fails if more results are needed. Select a narrower prefix to retry.
