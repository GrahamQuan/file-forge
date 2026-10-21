# Folder compression

Status: implementation contract, superseding the original explicit-both-dimensions compression rule.

Expose `folder compress <directory>` and MCP `compress_folder` (`folder-compress`) through shared core operations. Recursively create a new delivery directory under the selected output parent (Downloads by default on macOS). Preserve source files and hierarchy under a normalized source-root name.

All compression operations accept optional positive integer width and height. Neither supplied skips resizing and preserves original dimensions; there is no fallback size. One supplied axis leaves the other automatic. Both supplied define a bounding box. Preserve aspect ratio without enlargement; explicitly resized H.264 dimensions round down to even integers and supplied video bounds must be at least two pixels.

Normalize each path component to lowercase ASCII letters, digits and hyphens; collapse runs of other characters to a hyphen and trim edges. Keep the final file extension separate. Reject empty normalized stems and all destination collisions before creating output, including converted extensions and generated video covers. Reject output within the input tree, resolving existing symlink ancestors.

Without explicit dimensions, videos incompatible with the current H.264/yuv420p encoder (such as odd pixel dimensions) fail rather than silently resize. Existing orientation handling remains in place.

Static supported images become WebP (quality 80 by default). Supported video extensions mp4, mov, m4v, webm, mkv and avi become H.264 MP4 (CRF 23, optional AAC audio) with same-basename sibling WebP cover (for example, `clip.mp4` and `clip.webp`). Copy other regular files unchanged in content. Skip .DS_Store, symlinks, non-regular files and animated images, recording the reason. Preserve empty directories. Do not rewrite references inside copied documents.

Process serially with scoped staging. Per-file media errors produce failed entries and allow remaining files to proceed. Cancellation retains completed output and writes a cancelled manifest. Folder manifests use schema version 2; version 1 remains readable. Include source/output mappings, dimensions and byte sizes. Reports live outside the normalized asset root. Skips alone do not make a successful delivery fail; a delivery with no produced files is empty.

Validate through real CLI and STDIO MCP E2E flows, including optional axes, nested mixed media, collision and output-scope rejection, source preservation, skips, partial failure and manifest round-trip. Run pnpm check and pnpm test:e2e. No UI tests.

## Local validation evidence

`pnpm check` passes lint, formatting, TypeScript checking and builds. `pnpm test:e2e` passes 14 real non-UI tests across 10 files, including CLI folder processing, plugin-backed STDIO MCP, optional image/video axes, source preservation, collisions, output scope, partial failure and schema-v2 export round-trip. Existing lifecycle tests cover worker cancellation and shutdown. No browser or UI validation was performed. The installed runtime and public release are not updated by this source change.
