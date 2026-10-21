# Rename original folders on explicit request

This changes the selected source directory names in place. It does not change file names, media bytes, compression settings or embedded path references. `folder compress` continues to produce a separate delivery copy.

## Establish the exact scope

Use the user's stated root, selected subfolders and desired names. They may request root-only, selected subfolders, or both. A normalization request may use lowercase ASCII letters/digits/hyphens; a custom name request uses those exact names. Do not assume every descendant should be renamed.

If intent is unclear, stop and ask with a concrete choice: “Do you want the original folders renamed, or only names in the new output copy? Should this include the root, selected subfolders, or all subfolders?” Ask for missing desired names or a naming rule. Reuse already-specified choices.

Inspect the tree read-only and build an explicit plan. Read the installed help/tool schema: this feature requires the updated source build until a compatible release is available. If absent, explain the missing capability and propose an upgrade/source-build solution, then ask before proceeding.

## Plan format

A JSON array lists paths relative to the original selected root. `.` selects the root itself; each `name` is one new basename, not a move destination. Unlisted folders retain their basenames.

```json
[
  { "path": ".", "name": "example-com" },
  { "path": "Some Route", "name": "some-route" },
  { "path": "Some Route/Old Child", "name": "custom-child" }
]
```

```sh
file-forge folder rename "/absolute/Example.COM" --renames "/absolute/plan.json" --output "/absolute/receipts" --json
file-forge folder rename "/absolute/Example.COM" --renames "/absolute/plan.json" --output "/absolute/receipts" --apply --json
```

The first command previews without renaming. Review the exact old → final path mapping. Apply only the user-authorized mapping; ask if names or scope were inferred or changed. Do not repeatedly request permission for an explicit, unchanged mapping.

MCP uses `rename_folders`, a unique `requestId`, and this body:

```json
{
  "operation": "folder-rename",
  "input": "/absolute/Example.COM",
  "renames": [{ "path": ".", "name": "example-com" }],
  "output": "/absolute/receipts",
  "apply": false
}
```

Omitting `apply` also previews. To apply, submit the authorized mapping with `apply: true` and a new request ID; poll to terminal as described in [execution](execution.md). Do not reuse a preview ID with a changed payload.

## Preconditions and recovery

Keep the receipt parent outside both the original and renamed root. MCP cannot rename its configured workspace root itself; select a child folder within that workspace. If the requested root is out of scope, explain and ask whether to use CLI or another authorized workspace; do not silently widen access.

Preflight rejects duplicate mappings, collisions, existing destination directories, traversal and symlink paths. No merging or overwriting. Case-only renames are allowed when they identify the same directory. Do not edit the source tree concurrently during apply. The operation handles children first and the selected root last.

A version-3 receipt records source, intended output, current path and status for each rename. After interruption or failure, completed renames remain; later changes may still be planned. Inspect current filesystem locations and receipt, report the blocker, recommend a remaining-only repair plan and ask. Do not replay the full old plan or promise automatic rollback.

Changing folder names can break links in copied documents, scripts or application references; rewriting those references is separate work. Report the renamed paths and receipt link, and confirm file contents were not processed. Do not describe successful source renaming as a compressed delivery.
