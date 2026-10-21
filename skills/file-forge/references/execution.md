# Execution, cancellation and delivery

## Choosing the execution route

Prefer available FileForge MCP tools and inspect their live schemas. Tool names may have a host namespace. Verify root/version with `file_forge_info`. All MCP input/output locations must resolve within the configured `FILE_FORGE_ROOT`. For a path outside that root, explain the restriction, recommend CLI or a scoped copy/configuration change, and ask which route to use before proceeding.

CLI writes default to Downloads on macOS; other platforms require explicit output. MCP always receives an explicit output parent. Preserve a user-selected output path, and keep folder output outside its input tree. Quote shell paths, use argument arrays where available, and do not interpolate filenames into shell code. Read machine output with `--json`; stdout is the result, stderr is diagnostics.

## MCP jobs

Supply a unique `requestId` for each intended job. Keep its exact submitted payload and ID. Acceptance is not completion: poll `job_status` until a terminal state such as succeeded, partial, failed, empty or cancelled. The current session allows one active job and retains up to 128 job records.

An identical request ID/payload deduplicates within the session; changing the payload under that ID causes conflict. `BUSY` means wait for the current job. Use `job_cancel` only for the intended job, then poll through cancelling until terminal; media cleanup can take up to 30 seconds.

Records disappear after reconnect. `UNKNOWN_JOB` does not prove no files were written. Inspect known delivery paths before retrying. Never resubmit uncertain accepted work through CLI merely because the tool connection dropped.

## Verify and report

Read the final overall status and every asset status. If anything failed or the outcome does not meet the requested result, preserve completed outputs, explain the cause and recommended remedy, and ask before retrying or altering the workflow. Confirm outputs exist and inspect actual dimensions/format when relevant. Retain manifests and report skipped/failed entries. Compression may increase file size; do not claim a percentage without comparing actual bytes.

For an individual media output:

`bytes saved = originalBytes - outputBytes`

`percent saved = bytes saved / originalBytes * 100`

For a zero-byte original, report byte counts without dividing. Report negative savings as an increase. Compare the main video separately from its cover; distinguish processed-media totals from complete delivery size (which includes covers, copied files and reports). Do not count skipped sources as compressed savings.

Return concise linked paths, operation, actual dimensions, sizes/savings and failures. Keep original media contents intact. Change original directory names only through an explicitly authorized rename mapping. Remove only task-owned transient staging/test files; retain deliverables. Stop and verify exit of any task-owned temporary processes, preserving shared Codex/MCP services and unrelated processes.
