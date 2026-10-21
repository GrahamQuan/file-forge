# Built-in workflows and custom processing

The FileForge skill can choose between two execution routes based on the requested result:

| Route             | When to use it                                                                                         | Execution                                                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Built-in workflow | A coded preset meets the request, such as folder compression or six-angle posters                      | FileForge CLI or typed MCP tools                                                       |
| Custom processing | The request needs other capabilities of the installed Sharp/FFmpeg, or explicitly requests those tools | Codex writes/runs a task-specific Node script or FFmpeg command through its host tools |

For example, ordinary folder compression uses FileForge; an image watermark or explicit crop can use Sharp; an audio fade, stream extraction or video trim can use FFmpeg. These examples are not an allowlist. Codex checks actual capabilities and selects the route without asking the user to choose a tool for an otherwise clear request.

Custom work requires local execution access and the relevant dependencies. Sharp needs Node and a resolvable Sharp installation; FFmpeg tasks need the selected FFmpeg/FFprobe capabilities. A FileForge CLI/plugin installation is not required for an independent direct task. The skill does not automatically install missing tools: it identifies the blocker, proposes a concrete solution and asks, reusing prior authorization where applicable. Essential ambiguity and failed processing also retain the stop-and-ask behavior.

The custom route preserves source files and writes a new delivery directory, defaulting to macOS Downloads. Output names use lowercase ASCII letters, digits and hyphens with separate extensions; collisions must be resolved before processing. No dimensions means no resize, except where an explicitly requested crop/canvas defines the result. Quality preservation takes priority over size: avoid unnecessary encoding, use compatible stream copy or lossless encoding, and verify actual output properties. Requested edits intentionally change content; never describe that as unchanged-source fidelity or treat quality 100 as proof of losslessness.

Built-in preset defaults remain available when the user selects them. Do not force their lossy output format, resizing policy or cover generation onto a custom request with different requirements. Direct processing cannot bypass workspace permissions, an explicit route requirement or a pending/failed accepted MCP job.

Custom commands are not new FileForge CLI commands or MCP tools. They do not provide FileForge job polling/cancellation or automatic schema-v1–v5 processing manifests. Codex tracks its own processes, verifies output and cleanup, and reports the actual tool, settings, paths and per-file outcomes. A separate custom receipt or retained script can make the work reproducible. The typed FileForge interface continues to validate only its implemented operations.

The maintained references are [custom workflow](../skills/file-forge/references/custom-processing.md), [Sharp](../skills/file-forge/references/sharp.md) and [FFmpeg](../skills/file-forge/references/ffmpeg.md). The packaged plugin contains matching references, so it remains usable independently of a source checkout. Official API references are linked there; installed versions/builds determine availability.
