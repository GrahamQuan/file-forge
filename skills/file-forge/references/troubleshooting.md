# Troubleshooting and boundaries

The actions below are diagnostic steps and proposed solutions, not automatic repair permission. When a blocker is established, explain the evidence and task impact, recommend a concrete next step, ask for the needed information or decision, and wait. Read-only checks may continue. An already-approved identical remedy under unchanged conditions does not need repeated approval.

| Symptom                               | Next action                                                                                                                                               |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `file-forge` not on PATH              | Check `~/.local/bin/file-forge`; inspect active path/version before downloading again.                                                                    |
| Unsupported Node / FFmpeg unavailable | Follow readiness; GUI PATH may differ from the terminal. Configure actual absolute paths.                                                                 |
| Plugin listed but tools absent        | Verify enabled state and marketplace source, then reconnect/start a fresh chat. Keep CLI and chat verification distinct.                                  |
| `PATH_OUTSIDE_ROOT`                   | Inspect resolved input/output against `file_forge_info.root`; use authorized CLI paths or a scoped copy/root change.                                      |
| Old release asks for width and height | Do not invent dimensions or reinstate 512. Find a compatible release or explain source-build requirements.                                                |
| Folder command/tool absent            | Check installed help/version and matching release contents. Downloading the newest named tag alone does not prove feature support.                        |
| Rename command/tool absent            | Explain the version gap, propose a compatible update and ask before installing or switching tools. Do not invent an in-place compression flag.            |
| Naming collision                      | Report mapped names; obtain a naming decision. No overwrite or source renaming workaround.                                                                |
| Partial result                        | Read per-file error codes, preserve successful outputs and sources; propose retrying only identified failures once the cause is addressed, and ask first. |
| Unknown job after reconnect           | Inspect prior output directory/manifest before any resubmission.                                                                                          |
| Output is larger                      | Report actual increase. Do not repeatedly lower quality or resize without the user's requested tradeoff.                                                  |
| No-size video cannot encode           | Original dimensions may be incompatible with H.264/yuv420p. Explain; do not silently alter dimensions.                                                    |

After a failed install/repair, inspect the actual error and existing state. Explain the diagnosed cause and recommended fix; ask before repair or retry. Retry only after the user’s decision and a relevant change in conditions. Preserve previous builds/configuration and stop with a concrete blocker rather than looping installations.

FileForge does not currently expose S3 upload, persistent jobs, arbitrary FFmpeg filters, a HyperFrames renderer, lossy GLB optimization, general audio editing or automatic self-update through its CLI/MCP. Existing lower-level media-library functions are not necessarily CLI features. Verify future versions through live schemas/help before expanding this list. External tools may be orchestrated for an explicitly requested workflow, but label them separately.

Language commands are `file-forge config get language`, `file-forge config set language en|zh-CN`, and one-shot `--language en|zh-CN`. Prefer a one-shot override for a single task. Machine JSON keys, error codes and tool schemas remain English.

For lossless audio/model tools, see [audio/music](audio.md) or [3D models](models-3d.md). `FFPROBE_FAILED` requires an available matching FFprobe path; `AUDIO_VERIFICATION_FAILED` means no candidate was delivered because exact sample/property preservation could not be established. Diagnose and ask before retrying or changing routes. `original-retained` is successful with zero savings, not a tool failure.
