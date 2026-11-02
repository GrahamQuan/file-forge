# CI measurement results

Audit date: 2026-11-02. Requested 50 runs; GitHub returned all 16 available runs (2026-10-21). Tests grew over this history, so the latest same-source successful run is the comparison baseline, not the average across older smaller suites.

## Historical job breakdown

All durations are seconds. Wait = workflow creation to job start; dependency = known upstream wait included in that number. Preparation ends at Vitest start. Test time is Vitest wall time, including its imports. Other = packaging/upload/teardown and timestamp rounding. A dash means unavailable or not applicable; failed/cancelled partial testing is not treated as zero. Publish has no tests: its execution is shown as other. Steps have second-level precision; logs have finer precision.

| Run         | Job      | Result    |  Wait | Dependency | Preparation | Tests | Other |
| ----------- | -------- | --------- | ----: | ---------: | ----------: | ----: | ----: |
| 39587283207 | validate | success   |   5.0 |        0.0 |        34.5 | 340.0 |  24.6 |
| 39587283207 | publish  | success   | 407.0 |      404.0 |           — |     — |  10.0 |
| 39584124860 | validate | success   |   4.0 |        0.0 |        38.8 | 312.0 |  26.3 |
| 39584124860 | publish  | success   | 384.0 |      381.0 |           — |     — |  12.0 |
| 39581455856 | validate | success   |   8.0 |        0.0 |        38.2 | 292.1 |  21.7 |
| 39581455856 | publish  | success   | 362.0 |      360.0 |           — |     — |   9.0 |
| 39578707393 | validate | success   |   8.0 |        0.0 |        45.8 | 238.7 |  20.4 |
| 39578707393 | publish  | success   | 316.0 |      313.0 |           — |     — |  14.0 |
| 39575903430 | validate | success   |   7.0 |        0.0 |        33.4 | 178.3 |  15.3 |
| 39575903430 | publish  | success   | 237.0 |      234.0 |           — |     — |  11.0 |
| 39571639528 | validate | success   |  45.0 |        0.0 |        41.0 | 214.4 |  29.6 |
| 39571639528 | publish  | success   | 333.0 |      330.0 |           — |     — |  14.0 |
| 39566895536 | validate | success   |  11.0 |        0.0 |        38.5 |  91.0 |  11.5 |
| 39566895536 | publish  | success   | 155.0 |      152.0 |           — |     — |  11.0 |
| 39566009375 | validate | success   |  99.0 |        0.0 |        41.8 | 156.9 |  19.2 |
| 39566009375 | publish  | success   | 321.0 |      317.0 |           — |     — |  13.0 |
| 39565536415 | validate | cancelled | 154.0 |        0.0 |        44.6 |     — |     — |
| 39565536415 | publish  | cancelled | 323.0 |      323.0 |           — |     — |   0.0 |
| 39565354184 | validate | failure   |   8.0 |        0.0 |        34.3 | 134.8 |   3.8 |
| 39565354184 | publish  | skipped   |     — |          — |           — |     — |     — |
| 39559426711 | validate | success   |   9.0 |        0.0 |        42.9 | 119.2 |  11.9 |
| 39559426711 | publish  | success   | 187.0 |      183.0 |           — |     — |  12.0 |
| 39558390914 | validate | success   |   6.0 |        0.0 |        25.1 |  81.6 |  12.3 |
| 39558390914 | publish  | success   | 128.0 |      125.0 |           — |     — |  14.0 |
| 39558178133 | validate | failure   |   8.0 |        0.0 |           — |     — |     — |
| 39558178133 | publish  | skipped   |     — |          — |           — |     — |     — |
| 39557216153 | validate | success   |   6.0 |        0.0 |        26.3 |  82.5 |  13.2 |
| 39557216153 | publish  | success   | 131.0 |      128.0 |           — |     — |  11.0 |
| 39551269736 | validate | success   |   8.0 |        0.0 |        27.7 |  70.9 |  15.4 |
| 39551269736 | publish  | success   | 125.0 |      122.0 |           — |     — |   9.0 |
| 39550975416 | validate | failure   |  10.0 |        0.0 |        33.1 |  63.2 |   4.7 |
| 39550975416 | publish  | skipped   |     — |          — |           — |     — |     — |

## Baseline and optimization validation

Latest baseline: [39587283207](https://github.com/GrahamQuan/file-forge/actions/runs/39587283207), source `ff3df5e`. The validate job took 399 seconds; workflow creation to publish completion was 417 seconds. Vitest ran 14 files and 23 tests in 339.96 seconds. Preparation was about 35 seconds (including builds, stamping and static checks). The largest files were distribution (89.77 s), MCP (72.07 s), lossless (42.04 s) and posters (33.00 s).

Local forced build: 8.65 seconds. Immediate repeat: 1.11 seconds, four of four Turbo tasks cached (28 ms task scheduling/cache time). No broken build cache was found. Workflow-level redundant build wrappers were removed, while the rebuild after release stamping remains necessary.

Three complete successful optimized runs are recorded below. Branch runs exercise the same source and all tests but do not stamp a release or publish; publication time is therefore reported separately instead of claiming an end-to-end release measurement.

## First remote iteration

[Run 41385385434](https://github.com/GrahamQuan/file-forge/actions/runs/41385385434), commit `45ab3d5`, passed all 14 files / 23 tests and Ubuntu checks. Workflow creation to the aggregate gate: 217 seconds, versus 404 seconds to baseline validation completion (46.3% shorter). Workflow completion was 218 seconds; no release was published.

| E2E shard    | Vitest time | Job duration |
| ------------ | ----------: | -----------: |
| Distribution |    111.98 s |        196 s |
| MCP          |     77.23 s |        133 s |
| Models       |     67.57 s |        132 s |
| Remaining    |     86.85 s |        137 s |

Unlike the older runner, this run had to install precompiled FFmpeg bottles, taking 26–31 seconds per macOS job. The distribution job was the critical path and then spent another 17 seconds rebuilding an archive already built and exercised by its E2E. The second iteration removes that duplicate packaging by retaining the original tested archives, and selects the release version once rather than querying it independently on every shard.

## Local verification

`pnpm check` passed. The initial full local E2E run passed 22 tests and hit the existing 120-second timeout in distribution installation. The unchanged distribution test passed on isolated retry in 49.36 seconds; the new artifact-retention path then passed with the original timeout in 46.13 seconds. Both retained SHA-256 sidecars matched their artifacts. No assertion, case or test timeout was removed or relaxed in the repository. The remote full-suite result is the primary complete validation evidence.

The path classifier was executed against actual commits: the documentation-only report commit returned `required=false`, and the workflow commit returned `required=true`. Precompiled actionlint 1.7.12 passed with only its outdated `queue` syntax rule suppressed; GitHub accepted and ran the queue-enabled workflow. Existing reusable and packaged user skills were reviewed; CI changes do not alter their media tools, commands or delivery contracts.

Actions cache usage after the remote runs: 166,401,000 bytes across two OS-specific pnpm caches (about 159 MiB), well below the requested 10 GB budget. Four-way sharding uses more aggregate runner time in exchange for lower elapsed time; it does not claim a billing reduction.

## Optimized job breakdowns

### Iteration 1: run [41385385434](https://github.com/GrahamQuan/file-forge/actions/runs/41385385434)

Creation to successful validation gate: **217 seconds** (46.3% shorter than the 404-second baseline).

| Job                           |  Wait | Dependency within wait | Preparation | E2E or static checks | Other |
| ----------------------------- | ----: | ---------------------: | ----------: | -------------------: | ----: |
| pipeline / changes            |   5.0 |                    0.0 |           — |                    — |   5.0 |
| pipeline / e2e (distribution) |  14.0 |                   10.0 |        52.9 |                112.0 |  31.2 |
| pipeline / e2e (remaining)    |  13.0 |                   10.0 |        41.4 |                 86.8 |   8.8 |
| pipeline / e2e (models)       |  14.0 |                   10.0 |        53.2 |                 67.6 |  11.2 |
| pipeline / quality            |  13.0 |                   10.0 |         8.0 |                  9.0 |   4.0 |
| pipeline / e2e (mcp)          |  14.0 |                   10.0 |        47.6 |                 77.2 |   8.2 |
| pipeline / validate           | 213.0 |                  210.0 |           — |                    — |   4.0 |

All durations are seconds. Quality is static validation, not E2E. Classifier/gate execution has no tests and is listed under other.

### Iteration 2: run [41385831031](https://github.com/GrahamQuan/file-forge/actions/runs/41385831031)

Creation to successful validation gate: **209 seconds** (48.3% shorter than the 404-second baseline).

| Job                           |  Wait | Dependency within wait | Preparation | E2E or static checks | Other |
| ----------------------------- | ----: | ---------------------: | ----------: | -------------------: | ----: |
| pipeline / changes            |   4.0 |                    0.0 |           — |                    — |   6.0 |
| pipeline / e2e (distribution) |  13.0 |                   10.0 |        52.1 |                 81.8 |   7.1 |
| pipeline / quality            |  13.0 |                   10.0 |         7.0 |                  8.0 |   2.0 |
| pipeline / e2e (mcp)          |  13.0 |                   10.0 |        46.2 |                 69.5 |   4.3 |
| pipeline / e2e (models)       |  13.0 |                   10.0 |        36.4 |                 54.5 |   3.1 |
| pipeline / e2e (remaining)    |  14.0 |                   10.0 |        58.1 |                126.6 |   5.3 |
| pipeline / validate           | 206.0 |                  204.0 |           — |                    — |   3.0 |

All durations are seconds. Quality is static validation, not E2E. Classifier/gate execution has no tests and is listed under other.

After removing duplicate packaging, the remaining shard became the critical path (about 125 seconds of tests). Moving CLI foundations to the models shard and favicons to the MCP shard balances the existing cases without changing their assertions.

### Iteration 3: run [41386249438](https://github.com/GrahamQuan/file-forge/actions/runs/41386249438)

Creation to successful validation gate: **180 seconds** (55.4% shorter than the 404-second baseline).

| Job                           |  Wait | Dependency within wait | Preparation | E2E or static checks | Other |
| ----------------------------- | ----: | ---------------------: | ----------: | -------------------: | ----: |
| pipeline / changes            |   3.0 |                    0.0 |           — |                    — |   5.0 |
| pipeline / e2e (models)       |  11.0 |                    8.0 |        54.4 |                103.5 |   5.1 |
| pipeline / e2e (remaining)    |  11.0 |                    8.0 |        39.2 |                 43.4 |   2.4 |
| pipeline / e2e (mcp)          |  11.0 |                    8.0 |        50.0 |                 97.8 |   4.2 |
| pipeline / quality            |  11.0 |                    8.0 |        18.0 |                  9.0 |   3.0 |
| pipeline / e2e (distribution) |  12.0 |                    8.0 |        53.5 |                 93.4 |   6.0 |
| pipeline / validate           | 177.0 |                  174.0 |           — |                    — |   3.0 |

All durations are seconds. Quality is static validation, not E2E. Classifier/gate execution has no tests and is listed under other.

## Final comparison and limits

The final configuration ([run 41386249438](https://github.com/GrahamQuan/file-forge/actions/runs/41386249438), commit `5233bae`) passed all **14 E2E files / 23 tests**, plus lint, formatting, type checking and build. Creation to the required validation gate fell from **404 seconds to 180 seconds**, a **55.4% reduction**. Three optimized gate measurements were 217, 209 and 180 seconds. Workflow completion on the final branch run was 180 seconds.

This is an observed validation comparison, not a controlled benchmark or a measured production-release speedup. The old main run also selected/stamped a release and subsequently published it; branch verification does not publish. Runner images changed between October and November, and individual runner speed and cache hits vary. No new main release was created during the optimization. The main release lock and stamped-build path are preserved; PR cancellation and main backlog overflow were not stress-tested with synthetic pushes.

The final gate's exact check name was verified through GitHub's check-runs API: `pipeline / validate`. Main currently has no required-check policy; if protection is enabled later, require that aggregate. All existing tests remain included, future test files join the remaining shard, and documentation-only changes still return a completed gate without heavy CI.

Local test/render processes were checked after completion; no task-owned service or browser process remained. No preview server or UI browser session was started. The original working tree's pending feature changes were excluded from this branch and from remote verification.
