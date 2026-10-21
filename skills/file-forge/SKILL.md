---
name: file-forge
description: Set up FileForge and its Codex plugin, check media-tool prerequisites, and use FileForge to inspect, compress, resize or convert local images, videos and folders, losslessly optimize audio/music and GLB models, render six-angle GLB posters, rename explicitly selected source folders, generate favicons, and export delivery manifests. Use for FileForge installation, upgrades, troubleshooting, and local media requests, including custom Sharp/FFmpeg processing beyond built-in workflows.
---

# FileForge

This skill is maintained only in the FileForge repository at `skills/file-forge`. Project installations are complete copies: a copy request creates or replaces the entire target from that source, without merging consumer edits. Update the canonical skill and affected docs whenever FileForge code changes.

Use this as the entry map. Read only the references needed for the current request; do not load the whole directory.

## Start here

1. Identify the desired operation. For setup or upgrade requests, identify the installation or skill copy; media files are not required. For processing, identify the files and output location. Reuse established choices.
2. Choose the route from the user's need: prefer a built-in workflow when it meets the requested result; otherwise use [custom processing](references/custom-processing.md) with direct Sharp or FFmpeg. Honor an explicitly requested route. Announce the choice; do not ask permission merely to select a suitable route for a clear request.
3. Read [readiness](references/readiness.md) for the chosen route. Reuse verified checks; custom Sharp/FFmpeg work does not require installing or connecting FileForge. Missing required dependencies, essential ambiguity and actual failures still follow **Stop and ask** below. Use installation/setup references only when needed.
4. For built-in work prefer connected FileForge tools. If that selected route needs a new chat, explain and ask whether to reconnect or use the CLI; do not silently switch after a failure. A feature absent from built-in workflows can use the custom route initially without a failed attempt.
5. Follow [execution and results](references/execution.md) through completion, including per-file failures, actual output paths and byte savings.

## Stop and ask

This rule governs every reference. A request to process files does not by itself authorize installing missing software or choosing a repair workaround.

- First use existing context and safe, read-only checks to identify the actual blocker. Do not ask the user for information the environment already provides.
- Pause dependent work when a required tool/plugin is missing or incompatible; installation, connection or processing fails; the selected files, operation or essential parameters are ambiguous; a naming collision occurs; or the next step would change scope or the requested result.
- Explain **what is missing or failed**, **how it blocks this task**, and **the recommended solution**. Include the concrete package/command, path change, version choice or missing information when known. Give a relevant alternative if useful.
- Ask one focused question or a small set of choices, and wait for the user's answer before the installation, repair, retry, fallback, scope change or dependent processing. Read-only diagnosis may continue; silence is not approval.
- Reuse an explicit answer already given for the same action and unchanged conditions. Do not ask again for settled choices. A new failure or materially different fix needs a new question.
- Preserve completed output on partial failure. Report it, then ask how to handle the failed items rather than rerunning the whole batch.
- Omitted optional values are not missing essential information: no width/height means original size for image/video resizing (3D posters have their own canvas defaults), and macOS output defaults to Downloads when compatible with the selected route and authorized root. Do not ask for dimensions just because they were omitted.

Example: “FFmpeg is not installed, so FileForge cannot start. I recommend installing it with your existing Homebrew setup (`brew install ffmpeg`), then rerunning the check. Shall I install it, or will you provide an existing FFmpeg path?”

Example: “The plugin is installed but its tools are unavailable in this chat. I recommend reconnecting in a fresh chat. Would you prefer that, or should I use the FileForge CLI for this task?”

Example: “I found two folders named assets. Which should I process: the project folder or the Downloads folder?”

## Operation map

| User intent                                              | Read                                                                                                                      | Route                                          |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| Check prerequisites, version, supported features         | [Readiness](references/readiness.md)                                                                                      | CLI help/version; `file_forge_info`            |
| Upgrade FileForge runtime/plugin or refresh this skill   | [Upgrade workflow](references/upgrade.md)                                                                                 | Check, update and verify the selected artifact |
| Download, install or roll back FileForge                 | [Runtime installation](references/runtime-installation.md)                                                                | Verified matching release assets               |
| Install/enable Codex plugin; tools are missing           | [Codex plugin](references/codex-plugin.md)                                                                                | Local marketplace and connection checks        |
| Inspect metadata without processing                      | [Images](references/images.md)                                                                                            | `inspect_files` / `inspect`                    |
| Compress, resize or convert images                       | [Images](references/images.md)                                                                                            | `compress_images` or `process_images`          |
| Compress video; create first-frame cover                 | [Video](references/video.md)                                                                                              | `compress_video`                               |
| Process an entire directory into a new delivery folder   | [Folders](references/folders.md)                                                                                          | `compress_folder`                              |
| Rename original root/subfolders as requested             | [Source-folder renaming](references/source-folder-renaming.md)                                                            | `rename_folders` / `folder rename`             |
| Generate ICO/PNG/traced-SVG favicon set                  | [Favicons and manifests](references/favicons-manifests.md)                                                                | `generate_favicons`                            |
| Export/re-export manifest and report                     | [Favicons and manifests](references/favicons-manifests.md)                                                                | `export_manifest`                              |
| Poll/cancel jobs, compare size, explain partial failures | [Execution and results](references/execution.md)                                                                          | `job_status`, `job_cancel`; output validation  |
| Custom media operations beyond built-in presets          | [Custom processing](references/custom-processing.md), then [Sharp](references/sharp.md) or [FFmpeg](references/ffmpeg.md) | Direct Node/terminal execution                 |
| Errors, old versions, unavailable workflow               | [Troubleshooting](references/troubleshooting.md)                                                                          | Diagnose before retrying                       |

For audio/music compression, read [audio and music](references/audio.md) and use `compress_audio`. For 3D model compression or six-angle posters, read [3D models](references/3d-models.md) and use `compress_model` or `generate_model_posters`. Both support corresponding CLI commands; quality preservation takes priority over size reduction for original audio/model data. GLB processing also automatically generates six default 16:9 quality-80 WebP posters; check rendering prerequisites and partial results.

## Shared behavior

- Built-in compression defaults below do not override an explicit custom crop, resize, canvas, format or editing request. Custom work follows its own quality-first validation and delivery rules.
- For existing image/video resizing, no width and no height means **skip resizing and retain original dimensions**. There is no 512 × 512 fallback. One supplied axis leaves the other automatic; two supplied axes are maximum bounds, not a crop or stretch request.
- Media processing preserves sources and writes a new delivery folder, defaulting to Downloads on macOS. Explicit source-folder renaming is a separate opt-in operation: apply only the authorized directory mapping and preserve file contents. MCP writes need an explicit receipt/output parent inside the configured root.
- Scope work to the selected files or folder. Compression naming rules apply to output copies. Change source folder names only through the explicitly requested rename workflow; do not rename source files.
- Installed capabilities take precedence over examples here. Folder processing and no-size compression were validated in source on 2026-10-21; do not assume an older release includes them. Propose a verified compatible release or the source-build option, then ask before changing the installation.
- This skill is a setup and workflow layer; it is not the FileForge runtime or plugin. Keep the repo skill and installed plugin separate. Do not adopt another media skill's destructive processing or implicit resize defaults.
