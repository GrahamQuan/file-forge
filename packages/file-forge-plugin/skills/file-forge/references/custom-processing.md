# Custom processing with Sharp and FFmpeg

Use this route when the requested result is outside a built-in workflow or the user explicitly requests direct Sharp/FFmpeg processing. Choose from the user's actual goal, installed capabilities and preservation requirements. Announce the route and proceed when the request is clear and dependencies are ready; choosing this route initially does not require a separate approval or a failed built-in attempt.

| Need                                                                                             | Route                                                                       |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------- |
| A FileForge preset exactly meets the request                                                     | Existing CLI/MCP workflow                                                   |
| Image crop, composite, rotation, color/alpha operations or other supported image transformations | [Direct Sharp](sharp.md)                                                    |
| Video/audio trim, remux, extraction, filters, mixing or other supported media transformations    | [Direct FFmpeg](ffmpeg.md)                                                  |
| Several transformations                                                                          | Combine tools, verifying intermediates and avoiding unnecessary re-encoding |

These are examples, not an allowlist. Use other operations exposed by the installed Sharp/FFmpeg version when they serve the request. Neither tool handles arbitrary tasks or replaces a 3D renderer. Check local help and official documentation rather than inventing APIs or codecs.

## Scope and decisions

- Built-in feature absence is not a processing failure. Do not force a custom request through a mismatched preset or require an upgrade merely because the preset lacks an option.
- A direct route needs host terminal/Node access and its own dependencies; it does not require a working FileForge CLI/plugin. If the user explicitly requires the plugin or a particular workflow, honor that choice. Do not use custom processing to bypass an access restriction, an accepted MCP job, or a failed operation's stop-and-ask decision.
- Check only dependencies used by the selected route. If missing/incompatible, explain what is needed and propose an existing executable/module path or local installation; ask before installing unless already authorized. If terminal execution is unavailable, explain that the typed MCP tools cannot run arbitrary code and ask for a suitable execution route.
- Resolve essential ambiguity before processing: selected streams, trim range, overlay content/placement, crop region, output format when consequential, or a quality tradeoff. Reuse known choices; do not ask about omitted optional dimensions. No dimensions means no resize unless the requested operation itself defines the output canvas/crop.
- Preserve quality first. A requested edit intentionally changes content; this is distinct from unwanted compression loss. Prefer lossless encoding or stream copy where compatible. Do not substitute lossy compression, drop streams, flatten transparency/animation, reduce sample precision, or change color/HDR handling silently. If the requested format and preservation requirements conflict, explain and ask. Existing explicitly selected FileForge presets retain their documented behavior.

## Execute and deliver

1. Inspect selected inputs and write a small task-specific script or explicit command. Pass filenames as data/arguments, not source or shell code. Keep scripts outside managed runtime/plugin directories; do not patch FileForge just to perform a one-off task.
2. Write into a new delivery directory under macOS Downloads by default, or the user's selected authorized destination. Keep folder output outside its input tree. Normalize output path components to lowercase ASCII letters, digits and hyphens, keeping extensions separate; detect collisions before processing and ask rather than overwrite. Preserve original files and names.
3. Use a unique staging destination and exclusive publication/no-overwrite behavior. Preserve completed deliverables on failure. For multi-file work, record per-file success/failure and inspect actual results before continuing after a failure.
4. Validate the requested outcome with Sharp metadata/decoded pixels or FFprobe/FFmpeg as appropriate: dimensions, alpha, format, stream inventory, duration/timestamps, sample properties and decoding. Verify exact decoded content when claiming lossless preservation; encoder quality settings alone are not proof. Calculate savings only for comparable source/output content, not extracts, edits or new derivatives.
5. Return actual paths and identify the route as direct Sharp/FFmpeg. Keep a concise receipt with tool versions, input/output mapping, operation/options and validation results; retain a useful reproducible script when appropriate. This receipt is not a FileForge schema-v1–v6 processing manifest. Optional `manifest export` only inspects supported prepared assets; it does not certify custom processing or fully inspect audio/video.
6. Direct processes are not FileForge jobs: track their PID/session and cancellation yourself. Stop task-owned children, verify exit, and clean temporary staging; preserve originals, deliverables and unrelated services. If execution/validation fails, retain results, diagnose, propose a solution and ask before retrying or changing the route.
