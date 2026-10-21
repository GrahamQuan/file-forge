# FileForge local Codex integration

Status: Implemented and verified locally on 2026-10-10. Manual Codex host installation/selection remains an external acceptance gate.

This milestone implements the MCP and dedicated Codex plugin requested after the local foundation.
It narrows first-draft P01/P06/P15 to existing operations; uploads, video commands, durable job storage,
public distribution, self-update, and automatic installation remain outside this milestone.

## Acceptance

1. `file-forge mcp` serves local STDIO MCP with no non-protocol stdout. It requires external Node.js and
   FFmpeg as already agreed. Sharp and vector tracing remain runtime dependencies. Setup failure exits
   with English machine diagnostics on stderr; it never downloads dependencies.
2. Tools expose file inspection, image processing, favicon generation, and manifest export with the same
   core validation and results as CLI. Tools never accept arbitrary commands or FFmpeg arguments.
3. Each operation submits a session-owned job using an explicit `requestId`. Identical resubmission returns
   the same job; different parameters with the same ID fail. Status returns the result manifest or a stable
   error code. Cancellation is explicit and remains responsive during media work. Accepted cancellation
   enters `cancelling`, and becomes terminal only when the worker exits. A completion/cancellation race may
   legitimately finish successfully; report the actual outcome.
4. One worker runs at a time. Busy submissions fail before acceptance. Keep at most 128 session records;
   refuse new jobs when full instead of discarding deduplication history. Records disappear on server exit;
   completed files remain. Never replay uncertain work after reconnection or route failure.
5. Require an explicit existing workspace root through `FILE_FORGE_ROOT`. All supplied paths must remain
   within that root, including resolved symlinks/ancestors. Outputs must have an explicit parent. This is
   request scoping, not an OS sandbox; concurrent hostile filesystem mutation is outside this local preview.
6. The repository includes a local plugin with portable and Codex compatibility manifests, MCP wiring,
   one English usage skill, setup instructions, and exact preview runtime compatibility. It uses an installed
   `file-forge` or explicit `FILE_FORGE_EXECUTABLE`; it does not bundle or install runtime dependencies.
7. Documentation explains source-checkout setup and how to enable the plugin or configure MCP directly,
   how to test all implemented operations through Codex, and which features remain unavailable.
   No global Codex configuration is changed by this implementation. In-app installation/selection remains
   a manual host acceptance gate; automated protocol E2E must not be described as in-app verification.
