# CI performance and required checks

The release workflow and PR workflow call the same validation workflow. All real non-UI E2E files run on macOS arm64; lint, formatting, type checking and the source build run on Ubuntu. No tests are removed or disabled.

## Scheduling and coverage

- PR runs use `cancel-in-progress: true`, grouped by PR number. Manual CI runs are grouped by branch.
- Main releases use a separate `queue: max`, `cancel-in-progress: false` concurrency group. Version selection, stamped E2E validation and publication share that lock, avoiding version races and the default single-pending-run replacement. GitHub allows at most 100 waiting runs; overflow still requires operator recovery. This is not an unlimited queue or a guarantee against infrastructure failures.
- Four macOS jobs run independently after path classification: distribution, MCP, model posters/lossless media, and all remaining E2E files. `fail-fast: false` preserves diagnostic coverage. The remaining group automatically includes newly added E2E files. Within each machine, files remain serial to preserve existing process-cleanup assumptions.
- The distribution shard prepares the offline deploy store and packages the runtime/plugin. Publication waits for every shard and the Ubuntu quality checks. Version selection runs once in the classification job, and every release shard validates that same stamped version. PRs also exercise archive packaging, without publishing.
- Four runners per workflow leave one slot under a five-macOS-runner account limit; other workflows and PRs still share the account pool and can queue.

## Documentation changes and branch protection

Root README translations, root `AGENTS.md`, Markdown under `docs/` and `specs/` skip heavy validation when they are the only changes. Packaged READMEs, plugin setup documentation and skills still trigger validation because they affect delivered artifacts. Unknown history, empty diffs and manual runs default to full validation. Renames inspect both old and new paths.

Do not add workflow-level `paths-ignore` to a required workflow: absent checks can leave a PR pending forever. A small path-classification job always runs, and the `pipeline / validate` aggregate reports success for a documentation-only change. For code changes it explicitly requires successful quality and E2E jobs; failures, cancellation and unexpected skips fail the gate. Require this aggregate, not individual conditionally skipped jobs. At the initial audit, main had no branch protection or rulesets; no repository protection settings were changed.

## Caches and prerequisites

Use `actions/setup-node`'s pnpm cache keyed by OS/architecture and the lockfile. Do not cache `node_modules`, browser profiles, Homebrew or test outputs. Only the distribution shard warms the pnpm metadata needed for offline archive deployment. Runtime artifacts are retained for seven days; artifact storage is separate from Actions dependency-cache storage.

Use runner-provided Chrome/FFmpeg first. Missing FFmpeg installs with Homebrew `--force-bottle` (precompiled only); Chrome uses its binary cask. There are no Go/Rust tools or Docker builds in this pipeline, so their setup and caches are intentionally absent.

Turborepo already caches workspace builds locally. On the audit machine, a forced build took 8.65 seconds and the immediate cached build 1.11 seconds (28 ms inside Turbo, all four tasks cached). A remote Turbo cache would add complexity and transfers for a small build, so only the dependency cache is persisted. Release stamping changes package versions and source strings; its second build is necessary. Tests run Vitest directly after the build, and packaging invokes the already-built archive entrypoint.

## Timing interpretation

The audit requested the latest 50 runs with `gh run list --limit 50`; only 16 existed. Per-job step timestamps and logs were downloaded with `gh api .../jobs` and `gh run view --log`. See [the measurement report](ci-performance-results.md) for all available runs and measured before/after results.

Queue time is reported from workflow creation to job start, with dependency waiting separated for downstream jobs. GitHub's jobs API does not reveal the exact time a runner was requested, so this cannot be labeled pure runner-capacity wait. Preparation is job start to the start of Vitest; true test time comes from Vitest's duration in the log. Packaging, uploads and teardown are separately reported rather than mislabeled as tests. Historical failures without a final Vitest duration have unavailable test time.

References: [GitHub concurrency and queue limits](https://docs.github.com/en/actions/how-tos/write-workflows/choose-when-workflows-run/control-workflow-concurrency), [skipped required checks](https://docs.github.com/en/pull-requests/how-tos/merge-pull-requests/troubleshoot-required-status-checks).
