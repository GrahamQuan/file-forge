# CI measurement results

Audit date: 2026-11-02. Requested 50 runs; GitHub returned all 16 available runs (2026-10-21). Tests grew over this history, so the latest same-source successful run is the comparison baseline, not the average across older smaller suites.

## Historical job breakdown

All durations are seconds. Wait = workflow creation to job start; dependency = known upstream wait included in that number. Preparation ends at Vitest start. Test time is Vitest wall time, including its imports. Other = packaging/upload/teardown and timestamp rounding. A dash means unavailable or not applicable; failed/cancelled partial testing is not treated as zero. Publish has no tests: its execution is shown as other. Steps have second-level precision; logs have finer precision.

| Run         | Job      | Result    |  Wait | Dependency | Preparation | Tests | Other |
| ----------- | -------- | --------- | ----: | ---------: | ----------: | ----: | ----: |
| 39587283207 | validate | success   |   5.0 |        0.0 |           — |     — |     — |
| 39587283207 | publish  | success   | 407.0 |      404.0 |           — |     — |  10.0 |
| 39584124860 | validate | success   |   4.0 |        0.0 |           — |     — |     — |
| 39584124860 | publish  | success   | 384.0 |      381.0 |           — |     — |  12.0 |
| 39581455856 | validate | success   |   8.0 |        0.0 |           — |     — |     — |
| 39581455856 | publish  | success   | 362.0 |      360.0 |           — |     — |   9.0 |
| 39578707393 | validate | success   |   8.0 |        0.0 |           — |     — |     — |
| 39578707393 | publish  | success   | 316.0 |      313.0 |           — |     — |  14.0 |
| 39575903430 | validate | success   |   7.0 |        0.0 |           — |     — |     — |
| 39575903430 | publish  | success   | 237.0 |      234.0 |           — |     — |  11.0 |
| 39571639528 | validate | success   |  45.0 |        0.0 |           — |     — |     — |
| 39571639528 | publish  | success   | 333.0 |      330.0 |           — |     — |  14.0 |
| 39566895536 | validate | success   |  11.0 |        0.0 |           — |     — |     — |
| 39566895536 | publish  | success   | 155.0 |      152.0 |           — |     — |  11.0 |
| 39566009375 | validate | success   |  99.0 |        0.0 |           — |     — |     — |
| 39566009375 | publish  | success   | 321.0 |      317.0 |           — |     — |  13.0 |
| 39565536415 | validate | cancelled | 154.0 |        0.0 |           — |     — |     — |
| 39565536415 | publish  | cancelled | 323.0 |      323.0 |           — |     — |   0.0 |
| 39565354184 | validate | failure   |   8.0 |        0.0 |           — |     — |     — |
| 39565354184 | publish  | skipped   |     — |          — |           — |     — |     — |
| 39559426711 | validate | success   |   9.0 |        0.0 |           — |     — |     — |
| 39559426711 | publish  | success   | 187.0 |      183.0 |           — |     — |  12.0 |
| 39558390914 | validate | success   |   6.0 |        0.0 |           — |     — |     — |
| 39558390914 | publish  | success   | 128.0 |      125.0 |           — |     — |  14.0 |
| 39558178133 | validate | failure   |   8.0 |        0.0 |           — |     — |     — |
| 39558178133 | publish  | skipped   |     — |          — |           — |     — |     — |
| 39557216153 | validate | success   |   6.0 |        0.0 |           — |     — |     — |
| 39557216153 | publish  | success   | 131.0 |      128.0 |           — |     — |  11.0 |
| 39551269736 | validate | success   |   8.0 |        0.0 |           — |     — |     — |
| 39551269736 | publish  | success   | 125.0 |      122.0 |           — |     — |   9.0 |
| 39550975416 | validate | failure   |  10.0 |        0.0 |           — |     — |     — |
| 39550975416 | publish  | skipped   |     — |          — |           — |     — |     — |

## Baseline and optimization validation

Latest baseline: [39587283207](https://github.com/GrahamQuan/file-forge/actions/runs/39587283207), source `ff3df5e`. The validate job took 399 seconds; workflow creation to publish completion was 417 seconds. Vitest ran 14 files and 23 tests in 339.96 seconds. Preparation was about 35 seconds (including builds, stamping and static checks). The largest files were distribution (89.77 s), MCP (72.07 s), lossless (42.04 s) and posters (33.00 s).

Local forced build: 8.65 seconds. Immediate repeat: 1.11 seconds, four of four Turbo tasks cached (28 ms task scheduling/cache time). No broken build cache was found. Workflow-level redundant build wrappers were removed, while the rebuild after release stamping remains necessary.

Remote optimized runs are recorded below after validation. Branch runs exercise the same source and all tests but do not stamp a release or publish; publication time is therefore reported separately instead of claiming an end-to-end release measurement.
