# Local implementation and validation

Date: 2026-10-30 (Asia/Singapore). Local source implementation is complete. No live R2/CDN acceptance, release, push, deployment or external repository changes were performed.

## Implemented outcome

`@file-forge/upload` owns strict private project configuration, offline selection and hashed plans, SigV4 transport, conditional serial writes, fsynced execution records, independent public checks, and read-only byte reconciliation. CLI and MCP share these operations. Upload workers isolate hashing/staging/network work from MCP status/cancellation. Upload-only use and installation no longer require FFmpeg/Chrome; media submissions retain their prerequisite checks.

Plans bind source contents, destination mappings and the original review directory. Credential rotation does not change that binding. Moving/copying a plan cannot bypass its execution marker. Staging is private, limited to one snapshot, and identified by a unique execution token so parent cleanup does not rely on PID reuse. Receipts preserve completed, uncertain and unsent outcomes; no write retry, deletion or remote rollback exists.

The production transport uses Effect's scoped Node HTTP adapter. The fetch adapter removes streamed Content-Length, so it would not meet the signed-length contract. No new SDK or external runtime dependency was introduced. Only existing Effect/platform facilities and isolated Node filesystem/crypto adapters are used.

Configuration examples and a JSON schema are explicitly packaged. Canonical and compact plugin upload references match. Current guides, both README pairs, setup instructions, media prerequisite descriptions and release stamping were synchronized. Consumer skill copies and installed plugins were not updated.

## Acceptance evidence

| Contract    | Local evidence                                                                                                                                                                                                                                                                                                                                                          |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P01–P04     | Real CLI checks reject malformed/duplicate/unknown fields, invalid project/endpoint/prefix/region, unsafe modes, tracked/unignored files and placeholders without exposing dummy credentials. Explicit projects reach distinct buckets and shared-bucket prefixes. Jurisdiction and domain-shaped identifier cases are covered.                                         |
| P02/P05     | Dummy configuration bytes remain unchanged across CLI checks, language writes, packaging, installation/rollback and skill copying. Runtime archive inventory excludes private config; packaged config checks work without FFmpeg/Chrome. Folder compression skips default-named private config and preserves its source bytes.                                          |
| P04/P06     | Real files exercise exact keys, literal percent and Unicode encoding, empty/nonempty prefixes, exclusions, symlink/hardlink protection, empty selection, duplicate keys, file/count limits and source/output overlap. The configured file is excluded by path/identity; hard-linked aliases fail.                                                                       |
| P07         | Changed source bytes, altered plans, wrong digest, stale destinations and relocated plan artifacts fail preflight. Credential-only rotation succeeds against the unchanged reviewed destination.                                                                                                                                                                        |
| P08         | An independent local HTTP service validates signed conditions, persists object bytes, and permits at most one concurrent create. Replacement conflicts when the observed ETag changes. Same-plan replay is rejected.                                                                                                                                                    |
| P09         | Dropped PUT responses produce unknown outcomes without another PUT. Public HEAD failure preserves upload success. Conditional verification reports matching, differing, missing and denied/changed observations without writes. A real receipt-path filesystem obstruction after committed PUT returns RECEIPT_WRITE_FAILED with remote uncertainty and stops dispatch. |
| P10         | Real STDIO MCP exercises responsive status/cancel, cancellation during source/staging hashes and PUT, deliberate worker termination, and EOF during GET. Receipts retain sending/unknown/not_sent distinctions; workers and owned staging are removed. Server closure is checked by rebinding its port.                                                                 |
| Integration | Existing media and manifest flows, source skill-copy lifecycle, release-version stamping, offline runtime packaging/installation, CLI localization and MCP prerequisites pass regression checks.                                                                                                                                                                        |

The protocol tests use only dummy credentials. A test-only module composition hook routes the actual production transport to a loopback service and pauses real hash streams for lifecycle tests. It is outside all runtime/plugin package allowlists; production commands have no endpoint-validation bypass.

## Commands and results

- `pnpm check`: passed (oxlint, oxfmt, strict TypeScript and build).
- `pnpm test:e2e`: passed, 30 tests across 15 files.
- `pnpm exec vitest run e2e/upload.test.js e2e/folder.test.js e2e/distribution.test.js`: passed, 9 tests, covering the final staging-token and private-config exclusion changes.
- `pnpm exec vitest run e2e/upload.test.js -t 'input/config protection'`: passed, 1 selected test, covering the final project-key validation adjustment.
- Relative links in affected Markdown and parity of the two upload skill references: checked; no missing links or reference drift.
- `git diff --check`: passed.

Only real non-UI E2E tests were run. Model poster rendering in the existing suite is a media backend, not UI validation. Test-owned server ports, child processes and rendering browser processes are cleaned up; no preview was retained.

## Remaining external gates

Live R2 SigV4 compatibility, atomic conditional behavior, actual uploaded bytes and custom-domain behavior require authorization for specific disposable assets/keys and a separate remote acceptance run. Remote cleanup needs its own authorization. Local protocol evidence is not a claim of live compatibility.

No published runtime or plugin version is claimed. Source remains version 0.0.0; publishing and remote release-asset verification are separate steps.
